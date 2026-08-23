# Backend Master Plan

**Audience:** you (backend owner) · **Repo:** `~/Desktop/SIH_2026`
**Contract:** `Documents/API_CONTRACT.md` — frozen except for the four Tier-1 additions in §7
**Per-service detail:** `services/{pharma-core,manufacturer,shopkeeper,consumer}/IMPLEMENTATION_PLAN.md`

---

## Rules

| # | Rule |
|---|---|
| **R1** | Bug fixes, wiring, and the four Tier-1 endpoints. Nothing else. |
| **R2** | `API_CONTRACT.md` is the source of truth. Edit doc → announce → change code. |
| **R3** | **Build from the register, not from call sites.** An endpoint gets built because §7 says Tier 1. Not because a screen calls it, and not because it seems natural to have. |
| **R4** | **Never fail open.** A verdict is a business outcome, not an HTTP error. Verdicts are 200. |
| **R6** | POST-DEMO sections are fenced. |

**Run everything locally.** Do not attempt Kubernetes: the pharma-core pod cannot schedule (no PVC manifest exists) and `skaffold` references 4 files that are not in the repo.

---

## 1. Architecture

```
                    ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────┐
   CLIENTS          │ Manufacture-     │  │ shopkeeper-mobile │  │ customer-mobile  │
                    │ DashBoard (web)  │  │ (Expo RN)         │  │ (Expo RN)        │
                    └────────┬─────────┘  └─────────┬─────────┘  └────────┬─────────┘
                     cookie  │             Bearer   │            no auth   │
                    mfr_token│                      │                      │
   ┌────────────────────────┼──────────────────────┼──────────────────────┼──────────┐
   │  PUBLIC EDGE           ▼                      ▼                      ▼          │
   │              ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────┐  │
   │              │ manufacturer     │  │ shopkeeper        │  │ consumer         │  │
   │              │ :3001            │  │ :3002             │  │ :3003            │  │
   │              │ MongoDB          │  │ MongoDB           │  │ NO DATABASE      │  │
   │              └────────┬─────────┘  └─────────┬─────────┘  └────────┬─────────┘  │
   └───────────────────────┼──────────────────────┼──────────────────────┼───────────┘
                           │   Authorization: Bearer <per-service secret>  │
                           │   scope-checked per endpoint — see §2.1       │
   ┌───────────────────────┼──────────────────────┼──────────────────────┼───────────┐
   │  INTERNAL             └──────────────┬───────┴──────────────────────┘           │
   │                                      ▼                                          │
   │                          ┌──────────────────────────┐                           │
   │                          │ pharma-core  :4000       │  ← never reachable from   │
   │                          │ ECDSA P-256 pack signing │    a browser or a phone   │
   │                          │ RSA-4096 machine identity│                           │
   │                          │ AES-256-GCM keystore     │                           │
   │                          │ NO business data         │                           │
   │                          └────┬──────────────┬──────┘                           │
   └───────────────────────────────┼──────────────┼──────────────────────────────────┘
                          RS256 JWT │              │ presigned PUT
                    (+ JWKS pull) ↕ │              ▼
                        ┌───────────┴───────┐  ┌─────────┐
                        │ pharma-backend    │  │  AWS S3 │ ← pack CSV
                        │ Spring Boot :8080 │  └─────────┘   (local-disk fallback)
                        └─────────┬─────────┘
                        gRPC mTLS │ fabric-gateway
                                  ▼
                        ┌───────────────────┐
                        │ Fabric peer +     │  ← custody truth
                        │ CouchDB world st. │
                        └───────────────────┘
```

**Two things to notice, because they are the design.**

`pharma-core` sits behind a trust boundary and holds **no business data at all** — only keys. Compromising a public-edge service gets you a database; it does not get you the ability to sign a pack.

`consumer` has **no database**. Verification is a pure function of the QR plus the keystore plus the ledger. There is nothing to leak and no account to create, which is why anyone can verify any pack without signing up.

---

## 2. Data ownership

**The rule: custody truth lives only on the ledger.** Mongo may cache a projection of it, but the ledger is authoritative. Never resolve a verification verdict from Mongo.

| Owner | Owns | Does **not** own |
|---|---|---|
| `manufacturer` | `Manufacturer` (credentials, `licenseNumber`, `kycStatus`) · `Batch` (all ~45 regulatory fields, `mintStatus`, `mintedPacksCount`, `s3FileKey`) | pack-level state · custody events · keys |
| `shopkeeper` | `Shopkeeper` (credentials, `kycStatus`) · `Inventory` (per shop+batch stock) · `PackEvent` (local scan audit trail) | authenticity · the authoritative custody state |
| `consumer` | **nothing — stateless** | everything |
| `pharma-core` | the encrypted keystore, and nothing else | any business record |
| Fabric world state | **the authoritative custody state of every pack** | drug data — only hashes go on-chain |

**Why no drug data on-chain.** The ledger stores `packHash` and custody transitions only. Nothing on-chain identifies the medicine or the patient, so the per-pack on-chain footprint is fixed and small, and there is no privacy exposure from a shared ledger. Say this if asked about GDPR/DPDP.

**The one field that causes real bugs:** `medicineName` is **not** in the pack JWT (§3 of the contract). `shopkeeper` needs it for `Inventory` and must get it from a batch lookup. Destructuring it from a verified payload yields `undefined` — that is the root cause of task 4.

---

## 3. The five journeys

**A · Onboarding** — *Tier 1, task 1. Nothing else works until this does.*
```
Dashboard → POST /api/manufacturer/auth/register        → 201, kycStatus PENDING, no cookie
Admin     → POST /api/manufacturer/auth/kyc/approve     → X-Admin-Token
                    ├─ set kycStatus = APPROVED
                    └─ pharma-core POST /core/keys/generate  → P-256 keypair, AES-GCM sealed
                                                              (409 if exists → treat as success)
Dashboard → POST /api/manufacturer/auth/login           → 200 + mfr_token cookie
```

**B · Batch creation** — no crypto, no ledger, no core call.
```
Dashboard → POST /api/manufacturer/batch → Mongo insert, mintStatus PENDING
```
Creating a batch mints nothing. `systemBatchId` = `PC-BATCH-{MFR6}-{YYYYMMDD}-{6HEX}`, kept separate from the manufacturer's own `manufacturerBatchNumber`.

**C · Mint** — the expensive path, and the one worth explaining on stage.
```
Dashboard → POST /api/manufacturer/batch/:id/mint → 202 + pollUrl   (async, returns immediately)
             └→ pharma-core POST /core/batch/mint
                  1. decrypt the manufacturer key      ← ONE scrypt, N=16384
                  2. sign N packs in memory            ← ES256, no re-derivation
                  3. packHash = SHA256(rawSignedJWT)
                  4. stream CSV → S3 (lib-storage Upload)  ← local disk if S3 absent
                  5. presign a 7-day GET URL
                  6. POST /api/transition/batch → Fabric   ← chunked
             └→ Mongo: mintStatus, mintedPacksCount, s3FileKey
Dashboard polls GET /api/manufacturer/batch/:id
```
The response is a **~200-byte URL**, not the packs. Returning a 100 000-element array would be ~50 MB.

**D · Custody** — two hops, both through core.
```
Shopkeeper app → POST /api/shopkeeper/scan/intake
                  ├→ core POST /core/hash/verify   (Tier 1 — signature)
                  ├→ core POST /core/chain/intake  (ledger write)
                  └→ Mongo: PackEvent + Inventory upsert
                → POST /api/shopkeeper/scan/sale   — same shape, blocks on 409 sold / 409 recalled
```

**E · Verification** — the two tiers, and the whole product.
```
Customer app → POST /api/consumer/verify { qrData: <raw scan> }
                ├→ TIER 1  core POST /core/hash/verify
                │           ES256 signature + expiry.  Needs only the public key.
                │           Invalid → uiState COUNTERFEIT, HTTP 200, stop here.
                └→ TIER 2  core GET /core/hash/status/:hash?batchId=
                            ledger custody state → uiState
```
**Tier 1 is independent of the ledger, the network, and the database.** That separation is the product's core claim; keep it clean in the code, because it is what makes the offline story true rather than aspirational.

---

## 4. Trust boundaries

| Boundary | Mechanism | State |
|---|---|---|
| browser → `manufacturer` | `mfr_token` HttpOnly cookie, `sameSite:'strict'`, 7 d, HS256 | ✅ |
| mobile → `shopkeeper` | `Authorization: Bearer`, HS256 | ✅ |
| mobile → `consumer` | none — public by design | ✅ |
| edge → `pharma-core` | **per-service secret + scope check** (`Authorization: Bearer`) | 🆕 **task 10** — replaces one shared secret. Contract §2.1 |
| admin → `kyc/approve` | `X-Admin-Token` from env, **fail closed if unset** | 🆕 task 1 |
| `pharma-core` → Spring | RS256 JWT, verified against JWKS with issuer **and** audience checks | ✅ the strongest link in the system |
| Spring → Fabric peer | gRPC over mTLS, fabric-gateway 1.5.1 | ✅ |
| `pharma-core` → S3 | IAM + presigned URLs | ✅ |

**Two boundaries are currently open and both are tasks below:** the two `/core/export/**` routes are registered directly on `app` with no middleware and return every `signedToken` in a batch (task 7), and `requireAuth` falls back to repo-visible literal secrets (task 9).

### 4.1 The edge → core boundary is the one worth getting right

All four services currently present the **same** `X-Service-Token`. `pharma-core` therefore cannot tell *which* service is calling, and cannot refuse anything to anyone.

Follow that through. `consumer` is the internet-facing service with no user authentication — the most likely component to be compromised. It holds a credential that also opens `POST /core/keys/generate` and `POST /core/batch/mint`. **Compromising the most exposed service yields the ability to mint signed pharmaceutical packs.**

The boundary drawn in §1 — *"compromising an edge service gets you a database, not the ability to sign a pack"* — **is not actually enforced today.** It is the correct architecture described accurately and implemented incompletely. Task 10 is what makes the sentence true.

The fix is an **authorization matrix**, specified in full in `API_CONTRACT.md §2.1`. Summary of the column that matters:

| | can generate keys | can mint | can write custody | can verify |
|---|---|---|---|---|
| `manufacturer` | ✅ | ✅ | recall only | ✅ |
| `shopkeeper` | ✗ | ✗ | intake, sale | ✅ |
| **`consumer`** | **✗** | **✗** | **✗** | **✅** |

Three phases, and **only phase 1 is demo-eve work**: per-service secrets with a scope check tonight (~30 min); OAuth2-style cached bearer JWTs post-demo, reusing `signCoreJwt`/`verifyCoreJwt`/JWKS which `pharma-core` already has and already uses against Spring; mTLS via a service mesh as the end state. Read §2.1 before touching this — it also records the one design that looks right and is not (an unauthenticated `X-Service-Id` header).

---

## 5. Task list

Dependency-ordered. `S` < 30 min · `M` 1–2 h.

| # | P | Effort | Task | Service | Blocks |
|---|---|---|---|---|---|
| **1** | P0 | M | **`POST /auth/kyc/approve` + wire key generation** | mfr, shop | **everything** |
| **2** | P0 | S | Verdicts return 200, not 400; add `validateStatus` | core, all 3 clients | E2E verify |
| **3** | P0 | S | Fix the two Fabric request shapes *(pairs with Blockchain 3)* | core | ledger writes |
| **4** | P0 | M | Fix the `Inventory` field split — first intake throws today | shop | 5 |
| **5** | P0 | S | **Build `GET /api/shopkeeper/inventory`** | shop | demo step 3 |
| **6** | P1 | S | **Build `verification-status` + both `logout`** | mfr, shop | 8 frontend screens |
| **7** | P1 | S | Authenticate the two `/core/export/**` routes | core | — |
| **8** | P1 | S | Derive `s3FileKey` from `batchId`; stop trusting the query | core | — |
| **9** | P1 | S | Remove the hardcoded HS256 fallback secrets — fail fast | core | — |
| **10** | P1 | S | **Per-service identity + scope check on core** *(contract §2.1)* | core, all 3 clients | — |
| **11** | P2 | S | Align shopkeeper's 400-on-bad-signature to 200 | shop | — |

### 1 · P0 · M — Make an account usable *(Tier 1)*

Two facts, and together they mean **the system has never once worked end to end**:

- `manufacturer/services/coreClient.service.js:38` — `generateKeyForManufacturer` has **zero call sites.** Verified: the only occurrence of that identifier in the repo is its own definition. No manufacturer has ever had a signing key created through the application.
- Nothing anywhere sets `kycStatus` to `APPROVED`, and `auth.controller.js:91-92` returns **403** unless it is.

So login 403s forever, and if you bypassed that, mint would `404 KEY_NOT_FOUND`. The keystore holds only `MFR_TEST_*` residue from manual testing.

**Build:** `POST /api/manufacturer/auth/kyc/approve` and `POST /api/shopkeeper/auth/kyc/approve`, guarded by `X-Admin-Token` read from env with **no literal default — throw at startup if unset.** The manufacturer version sets `kycStatus` *and* calls `generateKeyForManufacturer`; the shopkeeper version only sets `kycStatus` (shopkeepers have no signing key).

**Do it in that order — approve, then generate key — and make the endpoint idempotent.** `generateKeyController` already returns `409` when a key exists, so a retry is safe; treat `409` as success. If key generation fails after the status flip, return a partial-success body with `keyGenerated: false` rather than rolling back, so a retry finishes the job instead of starting over.

**Why not generate the key at registration instead?** Because then anyone who can register gets a pack-signing key. The key must be a consequence of approval. That is also the honest answer to "who approves manufacturers" — see the runbook's Q&A.

### 2 · P0 · S — A counterfeit is not an HTTP error

`pharma-core/controllers/hash.controller.js:17` returns **400** when `!result.valid`.

None of the three core clients set `validateStatus` — grep across `services/` returns zero occurrences. So axios **throws** on that 400, the outer `catch` runs, and the carefully-written `COUNTERFEIT` branch in `consumer/controllers/verify.controller.js` is **unreachable dead code**.

**A forged QR currently produces `500 {status:'error'}`.** The single most important thing this product does — telling someone their medicine is fake — cannot happen.

Fix both sides:
1. `hash.controller.js:17` → **200** with `{ status:'success', valid:false, reason:'INVALID_SIGNATURE' }`. Keep 400 for a *missing* `signedToken` at `:11` — that genuinely is a malformed request.
2. Add `validateStatus: s => s < 500` to all three `axios.create` calls (`consumer`, `shopkeeper`, `manufacturer` core clients). Defence in depth: a future non-2xx verdict then still reaches the mapping code instead of the catch block.

Then check the `!result.valid` branch actually runs — it has never executed in production.

### 3 · P0 · S — The sender side of the two Fabric shapes

**Coordinate with Blockchain 3 before touching code.** Agreed:

- `POST /api/transition/batch` — wrap the array: `{ batchId, transitions: [...] }`. Currently posts a bare array → `HttpMessageNotReadableException` → 500. **Every mint's ledger write has always failed.**
- `POST /api/transition/recall` — rename to `{ systemBatchId, actorId, reason, recallDate, recallTime }`. Currently sends `batchId`/`fromId` → two nulls → NPE → 500. **Recall has never worked.**

Also stop logging `0/N recorded` on success: the gateway does not return `recordedHashes` today. Blockchain 3 adds it; until then, do not treat its absence as failure.

### 4 · P0 · M — The `Inventory` field split

Verified against `shopkeeper/models/inventory.model.js:24-33`. `InventorySchema` has `medicineName` **required**, `expiryDate` **required**, `currentStock` default 0. There is **no `packCount` field.**

The intake upsert `$inc`s `packCount` and `$setOnInsert`s only `shopkeeperId` + `batchId`. So:
- `packCount` is silently added as an off-schema field (strict mode drops it), and
- the two required fields are never populated → **the first intake of any batch throws a Mongoose `ValidationError`.**

Sales then decrement `currentStock` — a *different* field from the one intake incremented. Even past the validation error, the arithmetic never balances.

Fix: `$inc: { currentStock: 1 }` on intake, and `$setOnInsert` the required fields. Get `medicineName` and `expiryDate` from a **batch lookup** — `GET /api/manufacturer/batch/public/:batchId` is public and exists precisely for this. `expiryDate` *is* in the JWT; `medicineName` is not.

### 5 · P0 · S — `GET /api/shopkeeper/inventory` *(Tier 1)*

A `find` plus a `sort` over the collection task 4 just fixed. **Always scope by `shopkeeperId` from the token, never from a query param** — otherwise any shop can read any other shop's stock. Response shape in `API_CONTRACT.md §5.2`.

Without this the intake scan has no visible effect on stage, which makes demo step 3 pointless.

### 6 · P1 · S — `verification-status` and `logout` *(Tier 1)*

`GET /api/shopkeeper/auth/verification-status` → `{ kycStatus }` straight from the model, enum verbatim. Do not remap to the app's vocabulary. Unblocks eight `(auth)` screens.

`POST /api/{manufacturer,shopkeeper}/auth/logout` → `204`. **Clear the cookie with the same options it was set with** (`httpOnly`, `sameSite:'strict'`, matching `path`) — a mismatch leaves it in place and logout silently does nothing.

### 7 · P1 · S — Authenticate the export routes

`pharma-core/app/app.js:95` and `:102` register `GET /core/export/:batchId` and `.../preview` **directly on `app`, with no middleware.** They return every `signedToken` in the batch — **complete QR-forgery material for an entire production run**, unauthenticated. This is the most serious finding in the Node repo. Add `requireServiceToken`.

### 8 · P1 · S — Stop trusting `s3FileKey`

`pharma-core/controllers/export.controller.js:186` reads `s3FileKey` from the query string or body with **no validation**, and it flows into `GetObjectCommand({ Key: s3FileKey })` at `:66-69` — on the route task 7 just closed. Arbitrary object read from the bucket.

Derive the key from `batchId` instead. `batchId` is already regex-validated five lines later at `:191`, so the validation you need is already there — just stop accepting the override.

### 9 · P1 · S — Remove the fallback secrets

`pharma-core/middleware/requireAuth.middleware.js:16-17`:

```js
const manufacturerSecret = process.env.MANUFACTURER_JWT_SECRET || process.env.JWT_SECRET || 'mfr-super-secret-jwt-key';
const shopkeeperSecret   = process.env.SHOPKEEPER_JWT_SECRET   || process.env.JWT_SECRET || 'shop-super-secret-jwt-key';
```

`k8s/pharma-core.deployment.yml` never injects either env var, so **these repo-visible literals are the production signing secrets.** Anyone with the repo can mint a valid session token for any manufacturer.

Throw at startup when the env vars are missing. A service that will not boot is strictly better than one that boots with a published secret.

### 10 · P1 · S — Per-service identity and a scope check

**Full specification in `API_CONTRACT.md §2.1`. Build phase 1 only.**

Replace the single `X-Service-Token` with one secret per caller and enforce the authorization matrix in `pharma-core/middleware/requireServiceToken.middleware.js`:

```bash
SERVICE_TOKEN_MANUFACTURER=…   SERVICE_TOKEN_SHOPKEEPER=…   SERVICE_TOKEN_CONSUMER=…
```

Then per route, `requireScope('batch:mint')` instead of a bare token check, and set `req.callerService` so every log line names the caller.

**Read `Authorization: Bearer` first and fall back to `X-Service-Token`.** That fallback is what lets you migrate the three edge services one at a time instead of a flag-day cutover on demo eve — do the core side, verify nothing broke, then move each client. Delete the fallback after all three are moved.

**Two things this task subsumes:**

- **Task 7 becomes stronger.** The `/core/export/**` routes go from *unauthenticated* to *`manufacturer`-only*, not merely *authenticated*. Do task 7 first with a plain token check so the hole is closed even if you run out of evening, then tighten it here.
- **The naming confusion resolves itself.** `requireServiceToken` and `requireAuth` are currently the same function under two names, which is on the do-not-touch list. Rewriting `requireServiceToken` around the registry separates them naturally — a rename you get for free rather than a refactor you schedule.

**Ordering.** This is P1, below every P0. If the P0 list is not finished by your cutoff, skip it and say honestly on stage that per-service scoping is specified and next. **Do not start this at 2am** — it touches all four services, and a mistake in the registry map takes the whole mesh down rather than one endpoint.

**Why do it at all tonight, then?** Two reasons. It closes the one finding where compromising the public service yields pack-minting authority. And "each service has its own identity with per-endpoint scopes — here is the matrix" is a materially better answer than "we use a shared secret" to a question judges reliably ask about microservice architectures. Thirty minutes, and `req.callerService` in the logs lets you *show* `consumer` being refused a mint.

### 11 · P2 · S — Align shopkeeper to 200

`shopkeeper/controllers/scan.controller.js:49` and `:128` return 400 for an invalid signature; `consumer` correctly returns 200. Align to 200 with a verdict body. Cosmetic once the frontend sets `validateStatus`, so it is last.

---

## Do not touch before the demo

Every item is real. None is worth tonight.

`requireServiceToken === requireAuth` (the same function under two names — but see task 10, which separates them as a side effect) · the try-every-secret loop · the *user-level* authorization model (a valid token for shop A can act on shop B — task 10 fixes service-level authorization, not this) · phases 2 and 3 of `API_CONTRACT.md §2.1` (cached bearer tokens, mTLS) · `GCM_IV_LENGTH = 16` → 12 · the event-loop-blocking 100 k signing loop · keystore write atomicity and the KMS migration · the missing PVC manifest · skaffold's 4 missing manifests · `keystoreReady = true` hardcoded at `app.js:50` (the `catch` at `:51` is unreachable) · the static `/healthz` and `/readyz` at `:66` and `:70` · the hand-rolled `parseCsv` at `export.controller.js:14-44` (toggles `inQuotes` on every `"`, no `""` escape handling) · a fresh `new S3Client` per request at `:58` · rate limiting · helmet · CORS · **every Tier 2 and Tier 3 endpoint in `API_CONTRACT.md §7`.**

## Do not regress

- The **one-scrypt / N-in-memory-signs** mint. Re-deriving per pack would take hours instead of seconds.
- Returning an **S3 URL instead of a pack array**.
- `generateKeyController`'s **409 idempotency guard** — task 1 depends on it.
- The **ES256-for-packs / RS256-for-machines** split. Two key types for two different trust problems; not accidental.
- `batchId` **regex validation** on both export routes.
- **AES-256-GCM** envelope encryption with a **per-manufacturer scrypt salt** — one manufacturer's compromise does not weaken another's.

---

## Verification

Run in order. Each step gates the next.

```bash
# 0 · env — all four services need the SAME SERVICE_TOKEN
export PHARMA_CORE_URL=http://localhost:4000
export SERVICE_TOKEN=dev-shared-secret
export ADMIN_TOKEN=dev-admin-secret
export MANUFACTURER_JWT_SECRET=dev-mfr-secret
export SHOPKEEPER_JWT_SECRET=dev-shop-secret
```

1. `GET :4000/core/health` → `200`, `rsaKeyReady: true`
2. Register a manufacturer → `201`, `kycStatus: "PENDING"`
3. **Approve** with `X-Admin-Token` → `200`, `keyGenerated: true` · then `GET /core/keys/public/:mfrId` → a key **(task 1)**
4. Login → `200` + `mfr_token` cookie. *A 403 here means task 1 is incomplete.*
5. Create a batch → `201`, `mintStatus: "PENDING"`
6. Mint → `202`; poll until `mintStatus: "MINTED"` and `mintedPacksCount` matches
7. Export CSV **without auth** → expect `401` **(task 7)**; with `?s3FileKey=../other` → rejected **(task 8)**
8. `POST /api/consumer/verify` with a genuine token → `200`, `uiState: "GENUINE"`
9. **`POST /api/consumer/verify` with one character changed in the signature → `200`, `uiState: "COUNTERFEIT"`.** *This is the demo. A 500 here means task 2 is incomplete.* **(task 2)**
10. Shopkeeper intake, **first ever scan of that batch** → `200`, no ValidationError **(task 4)**
11. `GET /api/shopkeeper/inventory` → the batch, `currentStock: 1` **(task 5)**
12. Sell it → `200`; verify again → `uiState: "ALREADY_SOLD"` *(needs Blockchain 1)*
13. Sell the same pack again → `409` **(needs Blockchain 1 — the guard reads from the ledger)**
14. Recall the batch → verify → `uiState: "RECALLED"` *(needs Blockchain 3 + task 3)*
15. Unset `MANUFACTURER_JWT_SECRET` → pharma-core refuses to start **(task 9)**

**Steps 9 and 13 are the two that matter.** Step 9 is the counterfeit detection the whole pitch rests on; step 13 is the double-sale guard. Both are currently broken, in different repos, for unrelated reasons.
