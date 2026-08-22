# Payment Failure Recovery, Reconciliation & Pre-Flight QA Checklist

## 1. Edge Case & Failure Recovery Handling

### Edge Case A: Client Browser Drops Before Hitting Success Callback
- **Problem**: User pays on Razorpay popup modal, but their browser tab crashes before calling frontend `onSuccess`.
- **Solution**: Rely **exclusively** on server-side Webhooks (`payment.captured`) as the single source of truth for credit top-ups. Never depend on frontend JS callbacks to grant credits!

### Edge Case B: Webhook Delivery Fails or Delays
- **Problem**: Temporary microservice outage causes missing webhook events.
- **Solution**: Implement a background **Payment Reconciliation Cron Job**:
  - Fetch all `PENDING` transactions older than 15 minutes.
  - Query Razorpay Order Status API (`/v1/orders/{order_id}`).
  - If status is `paid`, invoke `allocateCreditsIdempotently`.

### Edge Case C: Refunds & Chargebacks
- **Problem**: A customer disputes a payment or requests a refund via Razorpay Dashboard.
- **Solution**: Handle `refund.created` webhook event:
  - Deduct the corresponding credits from user balance (`$inc: { 'billing.creditsBalance': -refundedCredits }`).
  - Log a transaction entry of type `MANUAL_REFUND`.

---

## 2. Industry Standards Checklist for AI SaaS Payments

| Area | Requirement | Standard / Implementation |
|---|---|---|
| **Security** | Signature Verification | Mandatory HMAC-SHA256 verification using raw request body |
| **Security** | Secret Protection | Webhook secrets & API keys stored in `.env` (never committed) |
| **Data Integrity** | Idempotency | Redis distributed lock (`NX`) + DB Unique Index on `payment_id` |
| **UX** | Realtime Balance Refresh | Publish WebSocket or Server-Sent Event on credit top-up success |
| **Auditability** | Financial Ledger | Double-entry transaction log for all additions and subtractions |
| **Tax/Invoice** | Receipt & GST | Automatic invoice generation with tax breakdown on checkout |

---

## 3. Pre-Flight QA Checklist (Execute before Production Launch)

- [ ] **Webhook Signature Test**: Verify that sending invalid `x-razorpay-signature` returns HTTP 400.
- [ ] **Duplicate Webhook Test**: Fire the same `payment.captured` payload 5 times simultaneously; confirm user balance increments **only once**.
- [ ] **Modal Dismissal Test**: Close Razorpay modal without paying; ensure no pending credit allocation occurs.
- [ ] **Raw Body Parsing Test**: Ensure Express middleware does not mangle raw webhook payload bytes before HMAC checking.
- [ ] **Currency Matching Test**: Confirm Razorpay amounts (in paise/cents) match backend calculations.
