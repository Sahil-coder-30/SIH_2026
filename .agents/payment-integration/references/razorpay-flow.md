# Razorpay Payment Aggregator Integration Flow

## Overview
This reference specifies the industry-standard architecture for integrating payment aggregators like **Razorpay** in an AI SaaS.

---

## 1. Sequence Diagram: Complete Payment Lifecycle

```
[User / Frontend]        [Backend API]          [Razorpay API]        [Database / Redis]
       │                       │                      │                       │
       │─── 1. Click Buy ─────►│                      │                       │
       │    Credits            │─── 2. Create Order ─►│                       │
       │                       │    (Amount, INR/USD) │                       │
       │                       │◄── 3. Order ID ──────│                       │
       │◄── 4. Open Checkout ──│                      │                       │
       │    Modal (Order ID)   │                      │                       │
       │                       │                      │                       │
       │─── 5. Pay via UPI/Card ─────────────────────►│                       │
       │                       │                      │                       │
       │◄── 6. Payment Success ───────────────────────│                       │
       │    (payment_id, sig)  │                      │                       │
       │                       │◄── 7. Async Webhook ─│                       │
       │                       │    (payment.captured)│                       │
       │                       │                      │─── 8. Verify Sig & ──►│
       │                       │                      │    Idempotency Lock   │
       │                       │                      │─── 9. Credit Top-up ─►│
```

---

## 2. Order Creation Endpoint (Backend)

```javascript
import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create Razorpay Order
 * Route: POST /api/payments/create-order
 */
export async function createOrderController(req, res) {
  try {
    const { packageId, amount, currency = 'INR' } = req.body;
    const userId = req.user.id;

    const options = {
      amount: Math.round(amount * 100), // Amount in paise (1 INR = 100 paise)
      currency,
      receipt: `rcpt_${userId.slice(-6)}_${Date.now()}`,
      notes: {
        userId,
        packageId,
      },
    };

    const order = await razorpay.orders.create(options);

    return res.status(201).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('[Razorpay Order Creation Error]', error);
    return res.status(500).json({ success: false, message: 'Failed to initiate payment order' });
  }
}
```

---

## 3. Frontend Checkout Integration (Client SDK)

```javascript
export function openRazorpayCheckout({ orderId, amount, currency, key, userDetails, onSuccess, onFailure }) {
  const options = {
    key: key,
    amount: amount,
    currency: currency,
    name: 'AI Coding SaaS',
    description: 'AI Credit Top-Up Pack',
    order_id: orderId,
    prefill: {
      name: userDetails.name,
      email: userDetails.email,
    },
    theme: {
      color: '#0F172A', // Dark theme slate-900
    },
    handler: function (response) {
      // Synchronous client callback
      onSuccess({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
      });
    },
    modal: {
      ondismiss: function () {
        if (onFailure) onFailure({ reason: 'Checkout modal dismissed by user' });
      },
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.open();
}
```

---

## 4. Webhook Event Handler & Signature Verification (Backend)

```javascript
/**
 * Razorpay Webhook Handler
 * Route: POST /api/payments/webhook
 * Note: Body MUST be raw buffer or raw text to verify signature properly
 */
export async function razorpayWebhookController(req, res) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  // 1. Verify HMAC-SHA256 Signature
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const isSignatureValid = crypto.timingSafeEqual(
    Buffer.from(signature || '', 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );

  if (!isSignatureValid) {
    console.error('[Webhook Signature Invalid] Potential tampering attack detected');
    return res.status(400).json({ status: 'error', message: 'Invalid signature' });
  }

  const event = req.body;

  // 2. Process specific payment events
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const payment = event.payload.payment.entity;
    const orderId = payment.order_id;
    const paymentId = payment.id;
    const userId = payment.notes.userId;
    const packageId = payment.notes.packageId;

    // Trigger Idempotent Credit Allocation (See idempotency-and-ledger.md)
    await allocateCreditsIdempotently({
      userId,
      orderId,
      paymentId,
      amountPaidCents: payment.amount,
      packageId,
    });
  }

  // Always respond with HTTP 200 to Razorpay within 2 seconds
  return res.status(200).json({ status: 'ok' });
}
```
