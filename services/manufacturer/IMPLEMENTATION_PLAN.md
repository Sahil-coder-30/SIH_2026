# manufacturer — Implementation Plan

**Port:** `3001` · **Base path:** `/api/manufacturer` · **Datastore:** MongoDB
**Client:** Manufacture-DashBoard (React + Vite), cookie auth
**Contract:** `Documents/API_CONTRACT.md §5.1`

---

## 1. Purpose

The manufacturer's control plane: register, get approved, create a batch with full regulatory metadata, mint per-pack cryptographic identities, export the QR set, and recall.

It owns the **richest data model in the system** and never touches a key. All cryptography is delegated to `pharma-core`.

---

## 2. Data owned

### `Manufacturer` — `models/manufacturer.model.js`

```js
manufacturerId: { type: String, required: true, unique: true },  // MFR_CIPLA_001_A3F — the blockchain identity
companyName:    { type: String, required: true },
licenseNumber:  { type: String, required: true, unique: true },
email:          { type: String, required: true, unique: true, lowercase: true },
passwordHash:   { type: String, required: true },                // bcrypt, 12 rounds
kycStatus:      { type: String, enum: KYC_STATUS, default: 'PENDING' },
publicKeyPem:   { type: String, default: null },                 // ← mirrored from pharma-core
```

**`publicKeyPem` is the field to notice.** It already exists and is always `null`, because nothing has ever generated a key. Task 1 should populate it — that gives you a cheap local answer to *"can this manufacturer mint?"* without a round trip to core, and it is a useful signal for the dashboard.

### `Batch` — `models/batch.model.js`

Two identifiers, deliberately separate:

| Field | Meaning |
|---|---|
| `systemBatchId` | `PC-BATCH-{MFR6}-{YYYYMMDD}-{6HEX}` — ours, the ledger key |
| `manufacturerBatchNumber` | theirs, from their existing ERP or MES |

Never conflate them. A pharma company already has batch numbering it is legally required to keep; forcing ours on them would make this unadoptable. Accepting both is a real-world design decision worth mentioning in the pitch.

Lifecycle: `mintStatus` · `mintedPacksCount` · `mintError` · `s3FileKey`.

**Plus roughly 45 optional regulatory fields** — and these are a genuine competitive asset. `drugSchedule` (G/H/H1/X/OTC) · `pharmacopoeiaStandard` (IP/BP/USP/EP) · `cdscoApprovalNo` · `composition` · `dosage` · `storageConditions` · `coldChainRequired` · `controlledSubstance` · `gstin` · `hsn` · `qaOfficerId` · `coaReferenceNo` · `microbialTestStatus` · `dissolutionTestStatus`.

This is what a real CDSCO filing needs, and most competing entries will model a batch as `{name, quantity, expiry}`. **Show this schema during the demo.** It signals domain research more strongly than any architecture diagram.

**Does not own:** pack-level state, custody events, or keys.

---

## 3. API surface

| Method | Path | Auth | Status |
|---|---|---|---|
| POST | `/auth/register` | — | ✅ |
| POST | `/auth/login` | — | 🔧 403 until task 1 |
| POST | `/auth/kyc/approve` | `X-Admin-Token` | 🆕 **task 1** |
| POST | `/auth/logout` | cookie | 🆕 task 5 |
| POST | `/batch` | cookie | ✅ |
| GET | `/batch` | cookie | ✅ `{status, tag, search, limit=20, page=1}` |
| GET | `/batch/:batchId` | cookie | ✅ — poll target for mint |
| GET | `/batch/:batchId/packs` | cookie | ✅ |
| GET | `/batch/:batchId/preview` | cookie | ✅ |
| GET | `/batch/:batchId/export/csv` | cookie | ✅ `400 BATCH_NOT_MINTED` if unminted |
| POST | `/batch/:batchId/mint` | cookie | 🔧 needs task 1 · returns **202** |
| POST | `/batch/:batchId/recall` | cookie | 🔧 needs Fabric recall shape |
| GET | `/batch/pack/lookup/:identifier` | cookie | ✅ |
| GET | `/batch/public/:batchId` | **public** | ✅ — **the shopkeeper service uses this for `medicineName`** |

**`POST /batch` accepts the manufacturer's batch number under six aliases** (`controllers/batch.controller.js:160-165`): `manufacturerBatchNumber`, `mfrBatchNumber`, `legacyBatchId`, `batchNumber`, `customBatchId`, `batchId`. Whatever the dashboard already sends will bind. Leave it — it is why the one dashboard call that works, works.

**`POST /batch/:batchId/mint` returns `202`, not `200`.** It is asynchronous. The dashboard must poll `GET /batch/:batchId` for `mintStatus` and `mintedPacksCount`. Any client treating `202` as failure will show a broken mint that actually succeeded.

---

## 4. Communication

**Inbound:** dashboard over `mfr_token` HttpOnly cookie (`sameSite:'strict'`, 7 d, HS256). `withCredentials: true` is already correctly set on the dashboard's axios instance.

**Outbound — `pharma-core` only**, via `services/coreClient.service.js`:

| Function | Line | Calls | Called from |
|---|---|---|---|
| `generateKeyForManufacturer` | `:38` | `POST /core/keys/generate` | 🔴 **nowhere — zero call sites** |
| `mintBatchViaPharmaCore` | `:70` | `POST /core/batch/mint` | mint controller |
| `recallBatchViaPharmaCore` | `:90` | `POST /core/chain/recall` | recall controller |
| `fetchBatchPreviewViaPharmaCore` | `:119` | `GET /core/export/:id/preview` | preview controller |

**Downstream consumer:** the `shopkeeper` service calls `GET /batch/public/:batchId` to resolve `medicineName`, because it is not in the pack JWT. That public route is load-bearing — do not remove or authenticate it without telling the shopkeeper owner.

**This service holds the widest authority of the three edge services**, and necessarily so: `keys:generate`, `batch:mint`, `chain:recall`, `export:read` (`API_CONTRACT.md §2.1`). It is the only service that may create a signing key or mint a pack. When `pharma-core` task 6 lands, switch the core client to `SERVICE_TOKEN_MANUFACTURER` sent as `Authorization: Bearer`.

Because this service carries the mint and key-generation scopes, **it is the one whose compromise is worth the most to an attacker.** Two consequences worth stating in the pitch: the credential lives only here and not in the public-facing service, and the export routes — which hand out complete QR-forgery material — become reachable from this service alone (core tasks 3 and 6).

---

## 5. Defects

| # | P | Location | Defect |
|---|---|---|---|
| 1 | P0 | `services/coreClient.service.js:38` | **`generateKeyForManufacturer` has zero call sites.** Verified: the only occurrence of the identifier in the repo is its own definition. No manufacturer has ever had a signing key. |
| 2 | P0 | `controllers/auth.controller.js:91-92` | Login returns 403 unless `kycStatus === 'APPROVED'`, and **nothing in the codebase can set that.** Combined with 1: **no manufacturer can log in, and none could mint if they did.** |
| 3 | P0 | `controllers/batch.controller.js` (recall) | Passes `batchId`/`fromId`; Spring's `RecallRequest` wants `systemBatchId`/`actorId`. NPE → 500. **Recall has never worked.** |
| 4 | P1 | — | No `logout` endpoint; the dashboard calls one. |
| 5 | P2 | `controllers/auth.controller.js` register | Returns `201` **without setting a cookie**, so the client must log in separately. Correct given the KYC gate — just make sure the dashboard does not assume auto-login. |

---

## 6. Tasks

### 1 · P0 · M — `POST /auth/kyc/approve` *(Tier 1 — blocks the entire demo)*

```
POST /api/manufacturer/auth/kyc/approve
Header: X-Admin-Token: <process.env.ADMIN_TOKEN>
Body:   { manufacturerId } | { email }
```

Steps, in this order:

1. Verify `X-Admin-Token`. **Read `ADMIN_TOKEN` from env with no literal default — throw at startup if unset.** This endpoint grants the ability to sign pharmaceutical packs; it must never work by accident.
2. Find the manufacturer → `404` if absent.
3. Set `kycStatus = 'APPROVED'`.
4. Call `generateKeyForManufacturer(manufacturerId)` — **the first call site this function will ever have.**
5. **Treat `409` from core as success** — a key already exists. This is what makes the endpoint safely retryable.
6. Store the returned public key on `publicKeyPem`.
7. Respond `{ status, manufacturerId, kycStatus:'APPROVED', keyGenerated: true|false }`.

**If step 4 fails, do not roll back step 3.** Return `keyGenerated: false` and let a retry finish the job. Rolling back means a transient core outage undoes the approval and you start over — the wrong trade when the demo is hours away.

**Why the key is created at approval, not registration:** otherwise anyone who can register gets a pack-signing key. The key must be a consequence of approval. That is also the honest answer to *"who approves manufacturers?"* — see the runbook Q&A.

### 2 · P0 · S — Fix the recall shape

*Paired with the blockchain team.* Send `{ systemBatchId, actorId, reason, recallDate, recallTime }`. Do not change field names unilaterally — agree first, then both sides change.

### 3 · P0 · S — `validateStatus` on the core client

Add `validateStatus: s => s < 500` to the `axios.create` in `coreClient.service.js`, so a non-2xx verdict from core reaches the mapping code instead of the catch block.

### 4 · P1 · S — Verify the mint path end to end

No code change expected — this is the step that proves task 1 worked. Create → mint → poll until `mintStatus: 'MINTED'`. If you see `404 KEY_NOT_FOUND`, task 1 is incomplete.

### 5 · P1 · S — `POST /auth/logout` *(Tier 1)*

Clear `mfr_token` → `204`. **Use the same cookie options as login** (`httpOnly`, `sameSite:'strict'`, matching `path`) — a mismatch leaves the cookie in place and logout silently does nothing. Safe to call unauthenticated.

---

## Do not touch before the demo

- The **six batch-number aliases.** They are why the dashboard's `POST /batch` already works.
- The **~45 optional regulatory fields.** Do not prune them — they are a presentation asset.
- The **`systemBatchId` / `manufacturerBatchNumber` split.**
- **Register not setting a cookie.** Correct behaviour under the KYC gate.
- `MAX_QUANTITY = 100_000`.
- Role separation (Admin / Production / QA) — the model carries `qaOfficerId` and `supervisorId` but nothing enforces roles. Post-demo.

## Do not regress

- **bcrypt at 12 rounds.**
- The **`202` + poll** contract for mint. Do not make it synchronous — a 100 k mint blocks for ~20–30 s and any proxy in front would time out.
- `GET /batch/public/:batchId` staying **public** — the shopkeeper service depends on it.
- The 409 handling in task 1, once written. It is what makes approval idempotent.

---

## Verification

1. `POST /auth/register` → `201`, `kycStatus: "PENDING"`, no cookie
2. `POST /auth/login` → **`403`** *(expected — proves the gate works)*
3. `POST /auth/kyc/approve` **without** `X-Admin-Token` → `401` **(task 1)**
4. `POST /auth/kyc/approve` with the token → `200`, `keyGenerated: true` **(task 1)**
5. **Call it again → `200` or `409`, never a 500** *(idempotency)* **(task 1)**
6. `GET /core/keys/public/:mfrId` on core → a P-256 PEM **(task 1)**
7. `POST /auth/login` → `200` + `mfr_token` cookie **(task 1)**
8. `POST /batch` with the four required fields → `201`, `mintStatus: "PENDING"`
9. `POST /batch/:id/mint` → **`202`** with a `pollUrl`
10. Poll `GET /batch/:id` → `mintStatus: "MINTED"`, `mintedPacksCount` matches **(task 4)**
11. `GET /batch/:id/export/csv` → rows with `verifyUrl` and `signedToken`. **Keep this file — the demo QRs come from it.**
12. `POST /batch/:id/recall` with `{reason}` → `200`, not 500 *(task 2 + Blockchain 3)*
13. `POST /auth/logout` → `204`, and the next authenticated call → `401` **(task 5)**

**Step 7 is the gate for the whole evening.** Until login returns a cookie, nothing downstream can be tested by anyone on any team.
