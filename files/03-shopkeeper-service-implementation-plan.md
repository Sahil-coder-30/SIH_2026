# `shopkeeper-service` — Implementation Plan
### Retail Chemist & Inventory Portal Backend — Port `3002`

---

## 1. Role in the System

This is the **chain-of-custody enforcement point** at retail: it's the service that proves a pack actually passed through a licensed pharmacy before being sold, and it's the last checkpoint before a medicine reaches a patient. Intake and Sale scans here are what make `SOLD` mean something on the ledger.

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js + Express |
| DB | MongoDB (`shopkeepers`, `inventories`, `packevents`) |
| Auth | JWT (cookie/bearer) for shopkeeper accounts, gated on a license-verification step |
| Service-to-service | `X-Service-Token` to `pharma-core` for verify + ledger transitions |

---

## 3. Data Model

### `shopkeepers`
`shopId, shopName, licenseNo, gstin, ownerName, verificationStatus, createdAt`

### `inventories`
`shopId, systemBatchId, packCount, lastUpdated` — an upserted running count per batch per shop, not a per-pack ledger (per-pack detail lives in `packevents` / on-chain).

### `packevents`
`packId, shopId, eventType (INTAKE/SALE), timestamp, actor` — this is the **duplicate guard**: before recording an `INTAKE`, check whether a `packevents` row already exists for this `packId` at any shop, and reject if so.

---

## 4. Core Flows

### 4.1 Intake Scan — `POST /api/shopkeeper/scan/intake`
1. Accepts `signedToken` or full QR `verifyUrl` (`https://pharmachain.gov.in/verify/:packHash?token=...`) — automatically extracts token and hash.
2. Verify pack signature via `pharma-core` (`POST /core/verify`)
3. Check expiry date against current timestamp — reject expired stock
4. **Duplicate Intake Guard**: query `packevents` for an existing `INTAKE` on this `packId` — reject if found (this is what stops the same physical-looking clone from being "received" at two shops)
5. Record `INTAKE` transition to Fabric via `pharma-core` (`POST /core/ledger/transition`)
6. Upsert `inventories` count for `(shopId, systemBatchId)`

### 4.2 Sale Scan — `POST /api/shopkeeper/scan/sale`
1. Accepts `signedToken` or full QR `verifyUrl` — automatically extracts token and hash.
2. Verify pack signature via `pharma-core`
3. Check current ledger state is `AT_SHOP` (i.e. this shop actually has it in stock, not some other shop) — reject otherwise, this is the "front-running" defense from the master plan
4. Mark `SOLD` on Fabric via `pharma-core`
5. Decrement `inventories` count, record the billing transaction locally

### 4.3 Inventory Dashboard — `GET /api/shopkeeper/inventory`
Real-time stock by batch, with expiry-approaching and low-stock alerts computed server-side so the mobile client stays thin.

---

## 5. Inter-Service Communication

```
shopkeeper-service  ──X-Service-Token──▶  pharma-core
```
| Trigger | Call |
|---|---|
| Any scan (intake or sale) | `POST /core/verify` — signature + expiry check |
| Intake accepted | `POST /core/ledger/transition` (`→ AT_SHOP`) |
| Sale accepted | `POST /core/ledger/transition` (`→ SOLD`) |
| Need to show medicine name/details on scan UI | `GET /api/manufacturer/batch/public/:batchId` on **manufacturer-service** directly (this is the one cross-business-service call that isn't routed through pharma-core, since it's not crypto/ledger data) |

---

## 6. MVP Priority Ranking

1. **Critical, build first:** intake scan (with duplicate guard) and sale scan. These two endpoints *are* the product — everything else in this service is support tooling around them.
2. **Critical:** the `AT_SHOP` state check before allowing a sale — without it, a shop could "sell" a pack it never actually received, which breaks the whole custody chain the hackathon PS is judged on.
3. **Important:** inventory upsert on intake/sale, since the shopkeeper adoption hook (stock received vs. sold, per the earlier project notes) depends on this data existing.
4. **Nice-to-have CRUD (defer):** rich inventory dashboard with charts, low-stock notifications, multi-staff accounts per shop, sales history export. These are good "ease of use" features to mention in the pitch but shouldn't consume build time before intake/sale scanning is rock solid.
5. **Should-have, not launch blocking:** offline scan queueing — retail counters often have flaky connectivity. A simple local queue that syncs when back online is worth doing if time allows, since a POS that hard-fails on no signal is a real adoption blocker; but the online-first path should be built and demoed first.

---

## 7. Open Risks

- Decide early whether "duplicate intake" and "AT_SHOP before sale" checks are enforced against the **local `packevents`/`inventories` cache** or against a **live Fabric read** on every scan. Local cache is faster (matters at POS speed) but can drift from ledger truth if a write fails silently — worth documenting which one is authoritative and reconciling periodically.
- Recalled packs: sale scan must also reject if `pharma-core` reports the pack's batch as `RECALLED`, not just check `AT_SHOP` — make sure this check isn't accidentally skipped.
