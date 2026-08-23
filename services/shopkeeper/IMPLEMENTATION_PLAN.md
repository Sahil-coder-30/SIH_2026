# shopkeeper — Implementation Plan

**Port:** `3002` · **Base path:** `/api/shopkeeper` · **Datastore:** MongoDB
**Client:** shopkeeper-mobile (Expo RN), Bearer auth
**Contract:** `Documents/API_CONTRACT.md §5.2`

---

## 1. Purpose

The pharmacy's custody terminal. Two operations, and the difference between them matters more than anything else in this service:

- **intake** — the pharmacy takes possession of a pack
- **sale** — the pack leaves for a patient, and **the sale is the point at which a cloned pack is caught**

`sale` is the enforcement point of the entire anti-counterfeiting model. A photocopied QR is not detectable at intake; it is detectable when someone tries to sell the same pack twice. Every guard in this service exists to protect that moment.

It also maintains local stock so the pharmacy gets something useful out of participating — which is what makes adoption plausible.

---

## 2. Data owned

### `Shopkeeper` — `models/shopkeeper.model.js`

```js
shopkeeperId:  { type: String, required: true, unique: true },
pharmacyName:  { type: String, required: true },
ownerName:     { type: String, required: true },
email:         { type: String, required: true, unique: true, lowercase: true },
passwordHash:  { type: String, required: true },       // bcrypt, 12 rounds
drugLicenseNo: { type: String, required: true, unique: true },
kycStatus:     { type: String, enum: KYC_STATUS, default: 'PENDING' },
address:       { type: String, required: true },
```

⚠️ **Six required fields at registration**, not four like the manufacturer: `pharmacyName`, `ownerName`, `email`, `password`, `drugLicenseNo`, `address` (`controllers/auth.controller.js:19`). If the mobile register screen collects fewer, **every submission 400s**. Tell the frontend owner directly — this is easy to miss.

### `PackEvent` — the immutable local audit trail

```js
shopkeeperId: { required: true, index: true },
packHash:     { required: true },
batchId:      { required: true },
eventType:    { enum: ['INTAKE', 'SOLD', 'SALE'], required: true },
operatorId:   { default: null },
```
Compound unique: `{shopkeeperId, packHash, eventType}` — one INTAKE and one SALE per pack per shop.

⚠️ **The enum contains both `SOLD` and `SALE`.** Two spellings for one event. Pick one in code and use it consistently or the unique index will not prevent what you think it prevents — writing `SOLD` once and `SALE` once creates **two** rows for the same real event. Leave the enum alone tonight; just be disciplined about which value you write.

### `Inventory` — aggregated stock

```js
shopkeeperId: { required: true, index: true },
batchId:      { required: true },
medicineName: { type: String, required: true },   // ← NOT in the pack JWT
expiryDate:   { type: Date,   required: true },   // ← IS in the pack JWT
currentStock: { type: Number, default: 0, min: 0 },
```
Compound unique: `{shopkeeperId, batchId}`.

**There is no `packCount` field, and no recall flag.** Both matter below.

**Does not own:** authenticity, or the authoritative custody state. Mongo here is a local cache and a convenience for the pharmacy. **The ledger is the truth.** Never resolve a sale decision from Mongo.

---

## 3. API surface

| Method | Path | Auth | Status |
|---|---|---|---|
| POST | `/auth/register` | — | ✅ **six required fields** |
| POST | `/auth/login` | — | 🔧 403 until task 1 · sets cookie **and** returns body `token` |
| POST | `/auth/kyc/approve` | `X-Admin-Token` | 🆕 task 1 |
| GET | `/auth/verification-status` | Bearer | 🆕 task 4 |
| POST | `/auth/logout` | Bearer | 🆕 task 4 |
| GET | `/inventory` | Bearer | 🆕 **task 3** |
| POST | `/scan/intake` | Bearer | 🔧 **task 2 — throws on first scan per batch** |
| POST | `/scan/sale` | Bearer | 🔧 — note **`/sale`**, not `/sell` |

Both scan endpoints accept the raw scanned string as `signedToken`, `qrData`, or `token`. `extractTokenAndHashFromQrData` already handles all three QR forms — **the client does not parse anything.**

**Status codes are verdicts, not failures.** `/scan/sale` returns `409` already-sold, `409` recalled, `400` expired. The mobile client must set `validateStatus: s => s < 500` or a correctly-blocked sale looks like a crash.

`POST /auth/login` sets a `shop_token` cookie **and** returns `token` in the body (`:108`, `:115`). The mobile app should use the body token; both work.

---

## 4. Communication

**Inbound:** mobile app, `Authorization: Bearer`. The middleware prefers the header over the cookie, so this already works.

**Outbound**

| Target | Purpose |
|---|---|
| `pharma-core` `POST /core/hash/verify` | Tier 1 — signature check |
| `pharma-core` `POST /core/chain/intake` · `/sale` | ledger custody write |
| `pharma-core` `GET /core/hash/status/:hash` | current ledger state — the double-sale guard |
| `manufacturer` `GET /batch/public/:batchId` | **`medicineName`** — task 2 depends on this |

**Scopes** (`API_CONTRACT.md §2.1`): `keys:read`, `hash:verify`, `hash:status`, `chain:intake`, `chain:sale`. Note what is absent — this service **cannot mint and cannot recall.** A pharmacy writes custody events; it does not create pack identities or withdraw a batch from the market. When `pharma-core` task 6 lands, switch the core client to `SERVICE_TOKEN_SHOPKEEPER` sent as `Authorization: Bearer`.

**The flow that matters:**

```
scan → core /hash/verify           → invalid?  COUNTERFEIT, stop
     → core /hash/status/:hash     → Sold?     409  ← the anti-clone guard
                                     Recalled? 409
     → core /chain/sale            → ledger write
     → Mongo PackEvent + Inventory
```

⚠️ **The `Sold` check reads from the ledger, and the ledger currently reports `AtShop` for sold packs** (chaincode `:` / `~` key split — Blockchain task 1). So **the double-sale guard cannot fire today**, no matter what this service does. Your code may already be correct; it is being fed a wrong answer. Do not "fix" it here.

---

## 5. Defects

| # | P | Location | Defect |
|---|---|---|---|
| 1 | P0 | `controllers/scan.controller.js` intake upsert | `$inc`s **`packCount`** — a field that does not exist in `InventorySchema` — and `$setOnInsert`s only `shopkeeperId` + `batchId`, while `medicineName` and `expiryDate` are `required: true`. **The first intake of any batch throws a Mongoose `ValidationError`.** |
| 2 | P0 | same | Sales decrement **`currentStock`**; intake increments **`packCount`**. Different fields. Even past the validation error the arithmetic never balances. |
| 3 | P0 | `controllers/scan.controller.js:58` | Destructures `medicineName` from the verified JWT payload. **It is not in the payload** (contract §3) → always `undefined` → the root cause of defect 1. |
| 4 | P1 | `controllers/scan.controller.js:49`, `:128` | Returns **400** for an invalid signature; `consumer` correctly returns 200. Inconsistent. |
| 5 | P1 | intake path | **Intake does not check recall status**, so recalled stock can be accepted onto a shelf. |
| 6 | P1 | sale path | `expiryDate` is destructured but **never compared**, so the documented `400` expired is unreachable. |
| 7 | P2 | `models/inventory.model.js:4` | `EVENT_TYPE` contains both `SOLD` and `SALE`. |
| 8 | P2 | intake path | The duplicate-intake guard is scoped **per shop**, so two shops can each take in the same pack. |
| 9 | P2 | `auth.controller.js` | No `logout`, no `verification-status`. |

---

## 6. Tasks

### 1 · P0 · S — `POST /auth/kyc/approve` *(Tier 1)*

Same shape and the same `X-Admin-Token` rule as the manufacturer's (see `manufacturer/IMPLEMENTATION_PLAN.md` task 1). **Simpler here: no key generation.** A shopkeeper does not sign anything, so approval only flips `kycStatus`.

Read `ADMIN_TOKEN` from env with **no literal default**; throw at startup if unset.

### 2 · P0 · M — Fix the `Inventory` field split

Three coupled bugs; fix them together.

**Get `medicineName` from a batch lookup, not the token.** `GET /api/manufacturer/batch/public/:batchId` is public and exists for exactly this. `expiryDate` *is* in the JWT, so only the name needs fetching.

Then make the upsert consistent:

```js
// intake
{ $inc: { currentStock: 1 },
  $setOnInsert: { shopkeeperId, batchId, medicineName, expiryDate } }   // both required fields
// sale
{ $inc: { currentStock: -1 } }
```

**Test the case that is broken: the very first intake of a batch this shop has never seen.** That is the path that throws today, and it is the only path a demo will exercise.

Handle a failed batch lookup explicitly. If the manufacturer service is down you cannot populate a required field — **fail the scan with a clear error rather than writing a partial row.** Do not default `medicineName` to `'Unknown'`; a placeholder in a pharmacy inventory is worse than a refused scan.

### 3 · P0 · S — `GET /inventory` *(Tier 1)*

A `find` plus a `sort` over the collection task 2 just fixed.

```
GET /api/shopkeeper/inventory?search=&expiringInDays=&limit=50&page=1
→ { status, total, page, items: [{ batchId, medicineName, expiryDate, currentStock, updatedAt }] }
```

**Scope by `shopkeeperId` from the token — never from a query parameter.** Otherwise any pharmacy can read any other pharmacy's stock, which is commercially sensitive and trivially exploitable.

**Do not add an `isRecalled` field.** Inventory rows carry no recall state; faking one means fabricating data. A recall badge needs a batch-status lookup and is Tier 2.

Without this endpoint, demo step 3 — the intake scan — has no visible effect on screen.

### 4 · P1 · S — `verification-status` and `logout` *(Tier 1)*

`GET /auth/verification-status` → `{ status:'success', kycStatus, shopkeeperId }`. Return the enum **verbatim** — `PENDING` / `APPROVED` / `REJECTED`. Do not remap to the app's `verified`/`unverified` vocabulary; the client maps. This is the endpoint that lets the app leave its "verification pending" screen.

`POST /auth/logout` → `204`. Clear `shop_token` with the same options it was set with.

### 5 · P1 · S — Recall check on intake

One extra `GET /core/hash/status/:hash` comparison on the intake path, returning `409` when the batch is recalled. **A recalled pack should never make it onto a shelf** — and "our system stops recalled stock at the door" is a strong line in the demo.

*Depends on Blockchain task 1 to return a truthful state.*

### 6 · P1 · S — Actually compare the expiry

`expiryDate` is already destructured on the sale path. Compare it and return the `400` the contract documents. Two lines.

### 7 · P2 · S — Align the 400 to 200

`scan.controller.js:49` and `:128` → 200 with a verdict body, matching `consumer`. Cosmetic once the client sets `validateStatus`, so do it last.

---

## Do not touch before the demo

- The **`SOLD` / `SALE` enum duplication.** Changing the enum risks existing rows. Just be consistent about which you write.
- **Per-shop intake scoping.** Making it global needs a policy decision about legitimate pharmacy-to-pharmacy transfers.
- The **authorization model** — a valid token for shop A can currently act on shop B's data on some paths. Real, but a broader fix than tonight allows. *(Task 3 must not add a new instance of this: scope from the token.)*
- **Continuous carton-intake mode**, offline scan queue, transaction history — all post-demo.
- `GET /transactions` (Tier 2) — `PackEvent` already has the data, but no screen blocks on it.

## Do not regress

- **`/sale`, not `/sell`.** The frontend has this wrong; the backend is right. Do not "fix" it by renaming the route.
- **`extractTokenAndHashFromQrData`** handling all three QR forms. It is why the client sends the raw string.
- **Verify-before-write ordering:** signature → ledger status → ledger write → Mongo. Never write Mongo first.
- **bcrypt at 12 rounds.**
- The **`PackEvent` compound unique index.**

---

## Verification

Needs a minted batch from the manufacturer service first.

1. `POST /auth/register` with **all six fields** → `201`. Then try with five → `400` *(confirms the requirement)*
2. `POST /auth/login` → `403` *(expected before approval)*
3. `POST /auth/kyc/approve` with `X-Admin-Token` → `200` **(task 1)**
4. `POST /auth/login` → `200`, a `token` in the body **(task 1)**
5. `GET /auth/verification-status` → `{ kycStatus: 'APPROVED' }` **(task 4)**
6. **`POST /scan/intake` — the first ever scan of that batch → `200`, no ValidationError. This is the exact case that fails today.** **(task 2)**
7. `GET /inventory` → the batch, `currentStock: 1`, `medicineName` populated **(tasks 2, 3)**
8. Intake a second pack from the same batch → `currentStock: 2`
9. `GET /inventory` with another shop's token → **only that shop's rows** **(task 3)**
10. `POST /scan/sale` → `200`; `GET /inventory` → `currentStock: 1` **(task 2)**
11. **Sell the same pack again → `409`.** *(Needs Blockchain task 1 — the guard reads the ledger, which currently reports `AtShop` for sold packs.)*
12. Intake a pack from a recalled batch → `409` **(task 5, needs Blockchain 1)**
13. Scan a forged token → `200` with a counterfeit verdict **(task 7)**

**Steps 6 and 11 are the two that matter.** Step 6 is broken in this service and you can fix it tonight. Step 11 is broken in the chaincode and you cannot — it is the anti-cloning guard, and it is the reason Blockchain task 1 is the highest-priority item across all three repos.
