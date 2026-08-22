---
name: payment-integration
description: "Industry-standard Credit Payments & Subscription System for AI SaaS using payment aggregators like Razorpay. Covers payment order creation, client checkout flow, HMAC-SHA256 webhook signature verification, transaction idempotency, credit balance management, refund/failure handling, and production payment security standards. Actions: integrate payment aggregator, setup razorpay webhook, implement credit topup, create payment order, verify payment signature, build idempotency lock."
argument-hint: "[aggregator-name] [package-details] [environment]"
license: MIT
metadata:
  author: capstone-team
  version: "1.0.0"
---

# AI SaaS Credit Payments & Aggregator Integration System

Design, build, and audit industry-standard payment processing for AI SaaS applications using payment aggregators like **Razorpay**. Integrates secure order generation, HMAC-SHA256 signature verification, idempotent credit allocation, immutable ledger logging, and failure recovery.

---

## When to Activate This Skill

| Trigger / User Goal | Recommended Action |
|---|---|
| "Integrate payment aggregator like Razorpay" | Setup Order creation API & Razorpay Client Checkout modal |
| "Process webhooks safely" | Implement raw body HMAC-SHA256 signature verification |
| "Prevent double-crediting on webhook retries" | Apply Redis distributed locking & DB transaction ledger |
| "Add credit top-up purchase options" | Implement package creation & credit ledger allocation |
| "Handle payment failures or dropped browser tabs" | Deploy webhook-first architecture & reconciliation cron |

---

## Standard Workflow

### Step 1 — Order Generation API
- Create a backend endpoint (`POST /api/payments/create-order`).
- Instantiate Razorpay Node.js SDK with API key and secret.
- Calculate exact payment amount in minimum currency units (e.g., paise for INR: `amount * 100`).
- Attach metadata (`userId`, `packageId`) into order `notes` (`references/razorpay-flow.md`).

### Step 2 — Client-Side Checkout Modal
- Render payment package options in frontend UI.
- Trigger Razorpay Checkout modal using order details returned from server.
- Bind failure / modal close handlers (`references/razorpay-flow.md`).

### Step 3 — Secure Webhook Endpoint & Signature Verification
- Mount a dedicated webhook route (`POST /api/payments/webhook`).
- **CRITICAL**: Use raw request body to compute HMAC-SHA256 signature using `x-razorpay-signature`.
- Use `crypto.timingSafeEqual` to prevent timing attack vulnerabilities.

### Step 4 — Idempotent Credit Allocation & Ledger Audit
- Acquire Redis distributed lock on `payment_id` (`references/idempotency-and-ledger.md`).
- Check `Transaction` log table to verify `paymentId` has not already been processed.
- In an atomic database transaction:
  - Increment user credit balance (`billing.creditsBalance`).
  - Write immutable transaction audit entry.

### Step 5 — Production QA & Reconciliation
- Execute pre-flight QA checklist (`references/error-recovery-and-qa.md`).
- Setup background reconciliation task to resolve pending orders older than 15 minutes.

---

## Hard Rules (Never Violate)

1. **Never credit users directly from frontend JS callbacks**: Always require verified server-side Webhook signals (`payment.captured` or `order.paid`).
2. **Always verify HMAC-SHA256 webhook signatures**: Reject any unverified request to prevent unauthorized credit inflation attacks.
3. **Always enforce payment idempotency**: Lock processing on `payment_id` using Redis to prevent duplicate credit top-ups during webhook retries.
4. **Never store API secret keys in client code**: Keep `RAZORPAY_KEY_SECRET` strictly in server `.env` variables.
5. **Always log immutable transaction ledgers**: Never mutate single balance integers without maintaining a full financial audit log.

---

## Reference Documents

| File | Content Summary |
|---|---|
| `references/razorpay-flow.md` | Sequence diagram, Order API, Razorpay Checkout SDK & Webhook handler code |
| `references/idempotency-and-ledger.md` | Redis distributed lock code, Mongo transaction session, Transaction schema |
| `references/error-recovery-and-qa.md` | Failure recovery scenarios, reconciliation cron, Pre-flight QA checklist |
