# Idempotency, Double-Credit Prevention & Ledger Architecture

## 1. Why Idempotency is Critical in Payment Systems
Payment webhooks can be retried by Razorpay 5-10 times if your server responds slowly or experiences temporary network timeouts.
Without **Idempotence**, a single $20 payment could credit the user's account 5 times ($100 worth of credits).

---

## 2. Double-Credit Prevention via Redis Distributed Locks

Before processing any credit top-up, acquire an atomic distributed lock on `payment_id` or `order_id`:

```javascript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

export async function allocateCreditsIdempotently({ userId, orderId, paymentId, amountPaidCents, packageId }) {
  const lockKey = `lock:payment:${paymentId}`;
  
  // Try to acquire lock for 30 seconds (NX = Only if key does not exist)
  const acquired = await redis.set(lockKey, 'LOCKED', 'EX', 30, 'NX');
  
  if (!acquired) {
    console.log(`[Duplicate Webhook Ignored] Payment ID ${paymentId} is currently being processed or completed.`);
    return { status: 'duplicate_ignored' };
  }

  try {
    // Check Database transaction log if payment was ALREADY processed
    const existingTransaction = await Transaction.findOne({ paymentId });
    if (existingTransaction) {
      console.log(`[Already Processed] Payment ID ${paymentId} already credited.`);
      return { status: 'already_credited' };
    }

    // Determine credits granted for packageId
    const creditsToGrant = getCreditsForPackage(packageId);

    // Execute atomic DB update (Mongoose / MongoDB session transaction)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Credit balance update
      await Credit.updateOne(
        { userId },
        {
          $inc: { 'billing.creditsBalance': creditsToGrant, 'billing.lifetimeCents': amountPaidCents },
          $set: { updatedAt: new Date() }
        },
        { session, upsert: true }
      );

      // 2. Audit Ledger insertion
      await Transaction.create([
        {
          userId,
          orderId,
          paymentId,
          type: 'CREDIT_PURCHASE',
          amountCents: amountPaidCents,
          creditsGranted: creditsToGrant,
          status: 'SUCCESS',
          aggregator: 'RAZORPAY',
          metadata: { packageId },
          createdAt: new Date(),
        }
      ], { session });

      await session.commitTransaction();
      session.endSession();

      console.log(`[Credit Allocation Successful] User ${userId} granted ${creditsToGrant} credits for Payment ${paymentId}`);
      return { status: 'success', creditsGranted: creditsToGrant };
    } catch (dbErr) {
      await session.abortTransaction();
      session.endSession();
      throw dbErr;
    }
  } finally {
    // Release Redis lock
    await redis.del(lockKey);
  }
}
```

---

## 3. Data Schema Standards: Double-Entry Credit Ledger

Never store credits as a single volatile integer without an immutable **Ledger Audit Log**.

### Transaction Schema (MongoDB Mongoose Example)

```javascript
import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  orderId: { type: String, required: true, index: true },
  paymentId: { type: String, required: true, unique: true }, // Unique constraint prevents duplicate inserts
  type: {
    type: String,
    enum: ['CREDIT_PURCHASE', 'SUBSCRIPTION_RENEWAL', 'MANUAL_REFUND', 'PROMO_GRANT', 'USAGE_DEDUCTION'],
    required: true,
  },
  amountCents: { type: Number, required: true }, // Raw currency amount in cents/paise
  currency: { type: String, default: 'INR' },
  creditsGranted: { type: Number, required: true },
  status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'], required: true },
  aggregator: { type: String, enum: ['RAZORPAY', 'STRIPE', 'INTERNAL'], default: 'RAZORPAY' },
  metadata: { type: Object },
}, { timestamps: true });

export default mongoose.model('Transaction', TransactionSchema);
```
