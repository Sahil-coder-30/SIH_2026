# PharmaChain — API Contract

**Status:** FROZEN for the demo · **Version:** 1.0 · **Owner:** backend team

> This document is the single source of truth for every interface between the three
> repositories. It was produced by reading every `router.*` definition in the backend
> and every HTTP call site in all three frontends.
>
> **If code and this document disagree, the code is wrong.**
> If this document is wrong, edit it first, announce the change, then change code.
> The absence of this discipline is what allowed 22 of 24 frontend call sites to drift
> onto endpoints that do not exist.

---

## Governing rules

| # | Rule |
|---|---|
| **R1** | **Feature freeze until the demo ships.** No new endpoints, no new screens, no redesigns, no library additions. Bug fixes and wiring only. |
| **R2** | This document is the source of truth. Contract change = edit doc → announce → change code. |
| **R3** | **Existing endpoints are frozen; new ones are added only from the build register in §8.** No endpoint gets built because a frontend happens to call it. It gets built because §8 says Tier 1. Frontend migrates onto every path that already exists. |
| **R4** | **Never fail open.** A verification verdict is a business outcome, not an HTTP error. Every `switch` on a state needs a `default` that renders *suspect*, never *authentic*. |
| **R5** | **No fabricated data.** A `catch` block may never invent a success response. |
| **R6** | Sections marked POST-DEMO are fenced. Do not start them. |

---

## 1. Service map

| Service | Port | Base path | Reachable from | Datastore |
|---|---|---|---|---|
| `manufacturer` | **3001** | `/api/manufacturer` | browser (dashboard) | MongoDB |
| `shopkeeper` | **3002** | `/api/shopkeeper` | mobile app | MongoDB |
| `consumer` | **3003** | `/api/consumer` | mobile app | none (stateless) |
| `pharma-core` | **4000** | `/core` | **internal only** | JSON keystore file |
| `pharma-backend` (Spring) | **8080** | `/api/transition` | pharma-core only | none (Fabric gateway) |
| Fabric peer + CouchDB | — | — | pharma-backend only | world state |

**No browser or mobile client ever calls `pharma-core` or `pharma-backend` directly.**

### Local dev environment

`PHARMA_CORE_URL` defaults to `http://pharma-core-service:80` — a Kubernetes service name. For local runs it **must** be overridden:

```bash
PHARMA_CORE_URL=http://localhost:4000
```

Every service also needs `SERVICE_TOKEN` set to the *same* value, or all internal calls fail. Note `SERVICE_TOKEN` is read at module scope in the core clients, so it is captured once at import — it cannot be changed at runtime.

---

## 2. Auth contract

Two transports, both already supported by the middleware. Do not add a third.

| Client | Transport | Detail |
|---|---|---|
| Manufacture-DashBoard | **Cookie** | `mfr_token`, HttpOnly, `sameSite:'strict'`, 7d. Set by `POST /api/manufacturer/auth/login`. Requires `withCredentials: true` on axios (already set). |
| shopkeeper-mobile | **Bearer** | `Authorization: Bearer <token>`. The login response body contains `token`; the middleware prefers the header over the cookie, so this works today. |
| customer-mobile | **none** | Consumer endpoints are public by design. |
| service → `pharma-core` | **`Authorization: Bearer <service token>`** | Per-service identity. See §2.1. |

**Do not verify JWTs client-side.** All three apps correctly avoid this today. Keep it that way — the signing keys are server-side and a client-side check is worthless.

---

## 2.1 Service-to-service identity and authorization

### The problem with what we have

Today every service presents the **same** `X-Service-Token`. That means `pharma-core` cannot tell *which* service is calling, so it cannot refuse anything to anyone.

`consumer` is the internet-facing service with no user authentication — the most likely component to be compromised. It currently holds a credential that also opens `POST /core/keys/generate` and `POST /core/batch/mint`. **Compromising the most exposed service yields the ability to mint signed pharmaceutical packs.** That is the defect. It is not that the secret is weak; it is that possession of it grants everything.

Three secondary problems: no expiry, so a leak is permanent; rotation requires restarting all four services at once; and `SERVICE_TOKEN` is read at **module scope**, so it cannot be rotated at runtime even in principle.

### The authorization matrix — this is the important artifact

**Transport-independent.** Whichever mechanism carries the identity, this table is what `pharma-core` enforces. Write it down first; it is worth more than the transport choice.

| Endpoint | `manufacturer` | `shopkeeper` | `consumer` |
|---|---|---|---|
| `POST /core/keys/generate` | ✅ | ✗ | ✗ |
| `GET /core/keys/public/:mfrId` | ✅ | ✅ | ✅ |
| `POST /core/batch/mint` | ✅ | ✗ | ✗ |
| `POST /core/hash/verify` | ✅ | ✅ | ✅ |
| `GET /core/hash/status/:hash` | ✅ | ✅ | ✅ |
| `POST /core/chain/intake` | ✗ | ✅ | ✗ |
| `POST /core/chain/sale` | ✗ | ✅ | ✗ |
| `POST /core/chain/recall` | ✅ | ✗ | ✗ |
| `GET /core/export/:batchId` | ✅ | ✗ | ✗ |
| `GET /core/export/:batchId/preview` | ✅ | ✗ | ✗ |

**Read the `consumer` column.** Read-only verification, nothing else. It cannot generate a key, cannot mint, cannot write a custody event. That is the whole point: the blast radius of compromising the public service shrinks to "can verify packs", which is what it does anyway.

Note this **supersedes** the "authenticate the export routes" task — under the matrix they become `manufacturer`-only, which is strictly stronger than merely authenticated.

### Phase 1 — per-service secrets · **P1, ~30 minutes, do this tonight if the P0s are clear**

Replace the one shared secret with one secret per caller, and enforce the matrix.

```bash
# pharma-core knows all three
SERVICE_TOKEN_MANUFACTURER=<random 32 bytes>
SERVICE_TOKEN_SHOPKEEPER=<random 32 bytes>
SERVICE_TOKEN_CONSUMER=<random 32 bytes>
```

```js
// pharma-core/middleware/requireServiceToken.middleware.js
const SERVICE_REGISTRY = new Map([
    [requireEnv('SERVICE_TOKEN_MANUFACTURER'), 'manufacturer'],
    [requireEnv('SERVICE_TOKEN_SHOPKEEPER'),   'shopkeeper'],
    [requireEnv('SERVICE_TOKEN_CONSUMER'),     'consumer'],
]);   // requireEnv throws at startup — never a literal default

const SCOPES = {
    manufacturer: ['keys:generate', 'keys:read', 'batch:mint', 'hash:verify',
                   'hash:status', 'chain:recall', 'export:read'],
    shopkeeper:   ['keys:read', 'hash:verify', 'hash:status',
                   'chain:intake', 'chain:sale'],
    consumer:     ['keys:read', 'hash:verify', 'hash:status'],
};

export const requireScope = (scope) => (req, res, next) => {
    const presented = (req.headers.authorization || '').replace(/^Bearer /, '')
                      || req.headers['x-service-token'];        // transitional
    const caller = SERVICE_REGISTRY.get(presented);
    if (!caller) return res.status(401).json({ status: 'error', code: 'UNKNOWN_SERVICE' });
    if (!SCOPES[caller].includes(scope))
        return res.status(403).json({ status: 'error', code: 'SCOPE_DENIED', caller, scope });
    req.callerService = caller;                                  // now log this everywhere
    next();
};
```

**Use a constant-time comparison** for the lookup if you have time (`crypto.timingSafeEqual`), though a `Map` lookup on a 32-byte random value is not a realistic timing target.

**Accept both headers during the migration.** Read `Authorization: Bearer` first, fall back to `X-Service-Token`, so the three edge services can be updated one at a time instead of in a flag-day cutover. Remove the fallback once all three are moved.

**Why this is the right choice for tonight:** it closes the actual hole — unauthenticated-service-can-mint — with a `Map` and an array check. No token endpoint, no cache, no expiry, no clock skew, and **no new failure mode that can take down all four services at once.** It gets roughly 90% of the security benefit for roughly 10% of the work.

Setting `req.callerService` also gives you per-caller audit logging immediately, which is worth having on stage: you can show a log line proving `consumer` was refused a mint.

### Phase 2 — client-credentials bearer tokens · **Designed, POST-DEMO**

The end state, and the right long-term answer. **Do not build this tonight.**

```
edge service                                      pharma-core
     │  POST /core/auth/token                          │
     │  { clientId: 'consumer',                        │
     │    clientSecret: '<per-service>' }              │
     │ ───────────────────────────────────────────────►│  verify against registry
     │                                                 │  signCoreJwt({
     │  ◄───────────────────────────────────────────────    sub:   'consumer',
     │  { access_token, token_type:'Bearer',            │      scope: ['hash:verify', …],
     │    expires_in: 900 }                             │      aud:   'pharma-core',
     │                                                 │      iss:   'https://pharma-core',
     │  cache in memory, reuse until expiry-60s        │      exp:   +15min }, RS256)
     │                                                 │
     │  Authorization: Bearer <access_token>            │
     │ ───────────────────────────────────────────────►│  verifyCoreJwt → check scope
```

**Why this is architecturally right rather than just fashionable:** `pharma-core` already has every piece. `signCoreJwt` (`crypto.service.js:197`), `verifyCoreJwt` (`:219`), `buildJwks` (`:248`), and an RSA-4096 keypair in `config/keys.js`. The Spring gateway **already** validates pharma-core's RS256 tokens against the published JWKS with issuer *and* audience checks. Phase 2 makes the internal mesh use the same identity mechanism that already works between core and Spring — one model for the whole system, OIDC-compatible, keys published at a standard endpoint.

Specification, so it is not reinvented:

| Concern | Decision |
|---|---|
| Algorithm | RS256, signed with the **existing** core RSA-4096 key |
| Lifetime | 15 minutes |
| Claims | `iss`, `sub` (service name), `aud: 'pharma-core'`, `scope[]`, `iat`, `exp`, `jti` |
| **`aud` discipline** | edge→core tokens use `aud: 'pharma-core'`; core→Spring tokens use `aud: 'pharma-backend'`. **Two distinct audiences on one signing key** — verify `aud` on both sides or a core→Spring token would be replayable against core. |
| Caching | in-memory per service, refresh at `expires_in − 60s`, and on any `401` retry **once** |
| Bootstrap | `clientSecret` per service, from env, no literal default |
| Rotation | per-service, independent; the 15-minute window bounds a leak |
| Revocation | drop the client from the registry — takes effect within one token lifetime |

**Be honest about what this does not solve.** The bootstrap credential is still a shared secret; Phase 2 converts a permanent all-access secret into a short-lived scoped one, which is a real improvement, but it is not certificate-bound identity. Say that plainly rather than describing Phase 2 as "zero trust".

**Three failure modes to design for before building it** — and the reason this is not a tonight job:

1. The token endpoint becomes a **hard dependency of all three edge services**. If it is down, nothing works. Phase 1 has no such coupling.
2. **Clock skew** between containers breaks `exp` validation. Needs a leeway window.
3. A **refresh storm** — three services all refreshing on a cold start — needs jitter.

### Phase 3 — mTLS · Designed, requires a service mesh

Identity bound to a certificate rather than a bearer token, so there is no credential to steal or replay. In Kubernetes this should come from a mesh (Istio, Linkerd) with automatic cert rotation, **not** hand-rolled. This is the correct final answer and the right thing to name if a judge asks how far the model goes.

### Rejected: an unauthenticated identity header

`X-Service-Id: consumer` alongside the shared secret. **Do not do this.** The identity claim is unauthenticated, so a compromised `consumer` simply claims to be `manufacturer`. It looks like authorization and provides none — worse than the honest shared secret because it invites false confidence.


### The KYC gate

`POST /api/manufacturer/auth/login` returns **403** unless `kycStatus === 'APPROVED'`. The same gate exists on the shopkeeper side. Registration creates accounts as `PENDING` and **nothing in the codebase can currently move an account to `APPROVED`** — which is why `POST /auth/kyc/approve` is Tier 1 in §7 and the first task in `BACKEND_MASTER_PLAN.md`. Until it lands, no real login succeeds anywhere.

---

## 3. The pack QR code

Minting writes one CSV row per pack. The QR encodes `verifyUrl`:

```
https://pharmachain.gov.in/verify/{packHash}?token={signedToken}
```

| Field | Meaning |
|---|---|
| `packHash` | `SHA256(rawSignedJWT)` — 64 hex chars. The pack's ledger identity. |
| `signedToken` | ES256 JWT signed by the manufacturer's P-256 key. Contains the authenticity proof. |

**JWT payload — exactly these 6 claims:**

```json
{ "batchId": "PC-BATCH-…", "serial": "…", "expiryDate": "2028-01-14",
  "manufacturerId": "MFR_…", "nonce": "…", "ts": 1234567890 }
```

⚠️ **`medicineName` is NOT in the payload.** Any code destructuring `medicineName` from a verified pack payload gets `undefined`. This is the root cause of the shopkeeper inventory failure. Medicine name must come from a batch lookup, not the token.

### Clients send the raw scanned string — no parsing required

Both `consumer` and `shopkeeper` already contain `extractTokenAndHashFromQrData`, which accepts **all three** forms:

1. Full URL with token — `https://…/verify/{hash}?token={jwt}`
2. Path-only URL — `https://…/verify/{hash}`
3. Bare JWT — `eyJhbGciOiJFUzI1Ni…`

**Frontend action: pass whatever the camera returned, verbatim.** Do not parse, split, or regex it on the client.

---

## 4. Verification contract — the most important section

### 4.1 The seven states (FROZEN — do not add, rename, or reorder)

The field is named **`uiState`**. These seven values are the complete set.

| `uiState` | Meaning | Client treatment |
|---|---|---|
| `GENUINE` | Valid signature, not expired, ledger says `Packaged` | ✅ safe |
| `AT_SHOP` | Valid signature, ledger says `AtShop` | ✅ safe — authentic stock at a registered pharmacy |
| `ALREADY_SOLD` | Valid signature, ledger says `Sold` | ⚠️ possible reuse |
| `RECALLED` | Valid signature, batch recalled | 🛑 do not consume |
| `EXPIRED` | Valid signature, `expiryDate` in the past | 🛑 do not consume |
| `COUNTERFEIT` | **Signature invalid** | 🛑 do not consume, offer report |
| `NOT_FOUND` | Valid signature but no ledger record | ⚠️ treat as suspect |

`NOT_FOUND` is also the **safe default** for any unrecognised ledger state. That is deliberate and correct — it fails closed.

### 4.2 HTTP status rules

| Situation | Status | Rationale |
|---|---|---|
| Any verdict, including `COUNTERFEIT` | **200** | A counterfeit is a successful verification with a bad outcome. |
| Missing/empty `qrData` | 400 | Malformed request. |
| pharma-core or ledger unreachable | 500 | Genuine infrastructure fault. |

**This rule is currently violated in two places and both are P0 bug fixes:**

- `pharma-core` `POST /core/hash/verify` returns **400** for an invalid signature. No axios client in `services/` sets `validateStatus` (grep: zero occurrences), so axios *throws*, the correctly-written `COUNTERFEIT` branch in the consumer controller is never reached, and a forged QR surfaces as `500 {status:'error'}`. **A forged pack currently produces a server error, not a counterfeit warning.**
- `shopkeeper` `POST /api/shopkeeper/scan/{intake,sale}` return **400** for an invalid signature, unlike `consumer` which correctly returns 200. Align shopkeeper to 200.

### 4.3 `POST /api/consumer/verify`

**Request** — one field, any of three accepted names:

```json
{ "qrData": "<raw scanned string>" }
```
Also accepted: `token`, `signedToken`, or `?token=` / `?qrData=` in the query string.

**Response `200`** — this envelope is frozen:

```json
{
  "status": "success",
  "uiState": "GENUINE",
  "message": "100% Genuine Medicine — Registered & Safe",
  "valid": true,
  "payload": { "batchId": "…", "serial": "…", "expiryDate": "…",
               "manufacturerId": "…", "nonce": "…", "ts": 0 },
  "packHash": "<64 hex>",
  "blockchainStatus": "Packaged",
  "detail": null
}
```

Shape varies slightly by state — clients must tolerate absent fields:

| `uiState` | `valid` | `payload` | `packHash` | `blockchainStatus` |
|---|---|---|---|---|
| `COUNTERFEIT` | `false` | ✗ absent | ✗ (`scannedHash` instead, may be `null`) | ✗ absent |
| `EXPIRED` | `true` | ✓ | ✗ absent | ✗ absent |
| all others | `true` | ✓ | ✓ | ✓ |

**Client rule:** switch on `uiState`. Never on `blockchainStatus`, never on HTTP status, never on `valid` alone.

```ts
switch (res.uiState) {
  case 'GENUINE': case 'AT_SHOP':                     return safe(res);
  case 'ALREADY_SOLD': case 'NOT_FOUND':              return suspect(res);
  case 'RECALLED': case 'EXPIRED': case 'COUNTERFEIT': return danger(res);
  default:                                            return suspect(res); // ← never `safe`
}
```

### 4.4 `POST /api/consumer/report` — public, no auth

**Request:** `{ "qrToken": "<required>", "location": null, "notes": null, "photoUrl": null }`
**Response `201`:** `{ "status":"success", "message":"…", "reportId":"RPT-…" }`

Accepted even when the token is completely invalid — that is the point of the endpoint. Currently logs to stdout only; no persistence. Do not build persistence before the demo.

---

## 5. Endpoint reference

Legend — **✅ works** · **🔧 works after a listed bug fix** · **🆕 Tier 1, to be built tonight (§7)** · **🚫 does not exist, do not call**

### 5.1 `manufacturer` — `:3001`

| Method | Path | Auth | Status |
|---|---|---|---|
| POST | `/api/manufacturer/auth/register` | — | ✅ |
| POST | `/api/manufacturer/auth/login` | — | 🔧 403 until KYC approval exists |
| POST | `/api/manufacturer/auth/kyc/approve` | `X-Admin-Token` | 🆕 **Tier 1 — unblocks everything** |
| POST | `/api/manufacturer/auth/logout` | cookie | 🆕 Tier 1 |
| POST | `/api/manufacturer/batch` | cookie | ✅ |
| GET | `/api/manufacturer/batch` | cookie | ✅ |
| GET | `/api/manufacturer/batch/:batchId` | cookie | ✅ |
| GET | `/api/manufacturer/batch/:batchId/packs` | cookie | ✅ |
| GET | `/api/manufacturer/batch/:batchId/preview` | cookie | ✅ |
| GET | `/api/manufacturer/batch/:batchId/export/csv` | cookie | ✅ |
| POST | `/api/manufacturer/batch/:batchId/mint` | cookie | 🔧 needs signing key wired |
| POST | `/api/manufacturer/batch/:batchId/recall` | cookie | 🔧 needs Fabric recall shape fixed |
| GET | `/api/manufacturer/batch/pack/lookup/:identifier` | cookie | ✅ |
| GET | `/api/manufacturer/batch/public/:batchId` | **public** | ✅ |

**`POST /auth/register`** → `201`
`{ companyName, licenseNumber, email, password }` — password ≥ 8 chars.
Errors: `400` missing/short · `409` email already registered.
Returns the account with `kycStatus: "PENDING"`. **Does not set a cookie** — the client must log in separately.

**`POST /auth/login`** → `200`, sets `mfr_token` cookie
`{ email, password }`
Errors: `400` missing · `401` invalid credentials · **`403` `kycStatus !== 'APPROVED'`**.

**🆕 `POST /auth/kyc/approve`** → `200` — *Tier 1, build tonight*
Header: `X-Admin-Token: <ADMIN_TOKEN from env>`. **Fail closed with `500` if `ADMIN_TOKEN` is unset** — never default it to a literal.
Body: `{ manufacturerId }` *or* `{ email }`.
Sets `kycStatus: 'APPROVED'` **and** calls `generateKeyForManufacturer` so the account can mint. The core's `POST /core/keys/generate` already returns `409` when a key exists, so this is safe to call twice.
Response: `{ status:'success', manufacturerId, kycStatus:'APPROVED', keyGenerated: true|false }`
Errors: `401` bad admin token · `404` no such manufacturer · `409` already approved *(idempotent — still ensures the key exists)*.

**🆕 `POST /auth/logout`** → `204` — *Tier 1*
Clears `mfr_token` with the same cookie options used at login (`httpOnly`, `sameSite:'strict'`, matching `path`) — a mismatch leaves the cookie in place. No body. Safe to call unauthenticated.

**`POST /batch`** → `201`
Required: `{ medicineName, manufacturingDate, expiryDate, totalQuantity }` (1 – 100 000).
The manufacturer's own batch number is accepted under **six** aliases — `manufacturerBatchNumber`, `mfrBatchNumber`, `legacyBatchId`, `batchNumber`, `customBatchId`, `batchId` — so whatever the dashboard already sends will bind.
Plus ~45 optional regulatory fields (CDSCO approval no., pharmacopoeia standard, drug schedule, composition, dosage, storage, CoA reference, cold-chain flags…). See `services/manufacturer/models/batch.model.js`.
Creates the batch with `mintStatus: 'PENDING'`. **Creating a batch mints nothing.**
Errors: `400 MISSING_FIELDS` · `400 INVALID_QUANTITY` · `409 BATCH_ID_EXISTS`.

**`POST /batch/:batchId/mint`** → **`202`** with a `pollUrl`
Asynchronous. Poll `GET /batch/:batchId` and read `mintStatus` + `mintedPacksCount`.
Errors: `404 BATCH_NOT_FOUND` · `409 INVALID_MINT_STATE` · `409 MINT_ALREADY_RUNNING`.
⚠️ The dashboard does not call this endpoint at all today — `CreateBatchWizard` fakes the whole mint with a 4.3 s `setTimeout` chain and an invented `txHash`.

**`GET /batch`** → `200` · query `{ status, tag, search, limit=20, page=1 }`
**`GET /batch/:batchId/export/csv`** → query `{ type='packs' }` · `400 BATCH_NOT_MINTED` if unminted
**`POST /batch/:batchId/recall`** → `{ reason }` required · `409 ALREADY_RECALLED` · `400 INVALID_RECALL_STATE`

### 5.2 `shopkeeper` — `:3002`

| Method | Path | Auth | Status |
|---|---|---|---|
| POST | `/api/shopkeeper/auth/register` | — | ✅ |
| POST | `/api/shopkeeper/auth/login` | — | 🔧 403 until KYC approval exists |
| POST | `/api/shopkeeper/auth/kyc/approve` | `X-Admin-Token` | 🆕 Tier 1 |
| GET | `/api/shopkeeper/auth/verification-status` | Bearer | 🆕 Tier 1 |
| POST | `/api/shopkeeper/auth/logout` | Bearer | 🆕 Tier 1 |
| GET | `/api/shopkeeper/inventory` | Bearer | 🆕 **Tier 1 — makes intake visible** |
| POST | `/api/shopkeeper/scan/intake` | Bearer | 🔧 fails on first scan per batch |
| POST | `/api/shopkeeper/scan/sale` | Bearer | 🔧 — note **`/sale`**, not `/sell` |

Both scan endpoints take `{ signedToken }` — or `qrData` / `token`; the raw scanned string is fine.

**`POST /auth/register`** → `201` — ⚠️ **six required fields, more than the manufacturer's four:**
`{ pharmacyName, ownerName, email, password, drugLicenseNo, address }` — password ≥ 8 chars.
Errors: `400` missing/short · `409` email already registered. Returns `kycStatus: "PENDING"`.
The shopkeeper-mobile register screen must collect all six or every submission 400s.

**`POST /auth/login`** → `200`
Sets a `shop_token` cookie **and** returns `token` in the body, so cookie and Bearer both work. The mobile app should use the body token. `403` when `kycStatus !== 'APPROVED'`.

**`/scan/intake`** → `200` · `400` invalid signature *(should be 200 — see §4.2)* · `409` already in this shop's inventory
⚠️ **Known-broken:** the upsert `$inc`s `packCount`, a field absent from the schema, and `$setOnInsert`s only `shopkeeperId` + `batchId` — while `medicineName` and `expiryDate` are `required: true`. Since `medicineName` is not in the JWT payload (§3), **the first intake of any batch throws a Mongoose ValidationError.** Sales then decrement a *different* field, `currentStock`.
⚠️ Intake does not check recall status, so recalled stock can be accepted onto a shelf.

**`/scan/sale`** → `200` · `409` already sold · `409` recalled · `400` expired
⚠️ Expiry is destructured but never compared, so the `400` is unreachable.
The duplicate-intake guard is scoped per shop, so the same pack can be taken in by two different shops.

**🆕 `GET /api/shopkeeper/inventory`** → `200` — *Tier 1, build tonight*
Query: `{ search?, expiringInDays?, limit=50, page=1 }`. Scoped to the authenticated shop — **always filter by `shopkeeperId` from the token, never from a query param.**

```json
{ "status": "success", "total": 3, "page": 1,
  "items": [ { "batchId": "PC-BATCH-…", "medicineName": "Paracetamol 500mg",
               "expiryDate": "2028-01-14", "currentStock": 42,
               "updatedAt": "2026-08-23T10:04:00.000Z" } ] }
```

Reads the existing `Inventory` collection — no new model. `Inventory` carries no recall flag, so **do not invent an `isRecalled` field**; a recall badge needs a batch lookup and is Tier 2.

**🆕 `GET /api/shopkeeper/auth/verification-status`** → `200` — *Tier 1*
`{ status:'success', kycStatus:'PENDING'|'APPROVED'|'REJECTED', shopkeeperId }`
The one endpoint that lets the app leave its "verification pending" screen. Return the enum verbatim from the model — do not remap to the app's `verified`/`unverified` vocabulary; the client maps.

**🆕 `POST /api/shopkeeper/auth/kyc/approve`** → `200` · **🆕 `POST /api/shopkeeper/auth/logout`** → `204`
Same shape and same `X-Admin-Token` rule as the manufacturer equivalents in §5.1. The shopkeeper has **no signing key**, so approval here only flips `kycStatus` — no key generation.


### 5.3 `consumer` — `:3003`

| Method | Path | Auth | Status |
|---|---|---|---|
| POST | `/api/consumer/verify` | public | 🔧 needs `validateStatus` (§4.2) |
| POST | `/api/consumer/report` | public | ✅ |

There is **no `GET /api/consumer/verify/:packHash`.** A printed QR opened as a plain URL will not resolve. It is **Tier 2** (§7) — and note that without the `?token=` it cannot check a signature, so it could never return `GENUINE`. For the demo the app scans and POSTs.

`consumer` has **no database and no accounts, by design.** Anyone can verify any pack without signing up. Treat that as a feature in the pitch, not a missing login screen — consumer auth is Tier 3.

### 5.4 `pharma-core` — `:4000` · internal only

| Method | Path | Purpose |
|---|---|---|
| POST | `/core/keys/generate` | Create a manufacturer P-256 keypair. `409` if one exists — safe to retry. |
| GET | `/core/keys/public/:mfrId` | Public key |
| POST | `/core/batch/mint` | Sign N packs → CSV → S3 → ledger. Returns a ~200-byte URL, not the packs. |
| POST | `/core/hash/verify` | Tier 1 — verify ES256, derive `packHash` |
| GET | `/core/hash/status/:hash?batchId=` | Tier 2 — ledger state |
| POST | `/core/chain/intake` · `/sale` · `/recall` | Custody events |
| GET | `/.well-known/jwks.json` | JWKS (+ 3 aliases) — consumed by Spring Security |
| GET | `/core/health` · `/healthz` · `/readyz` | Probes |
| GET | `/core/export/:batchId` | CSV download — **UNAUTHENTICATED** |
| GET | `/core/export/:batchId/preview` | Paginated CSV — **UNAUTHENTICATED** |

🔴 **The two export routes are registered directly on `app` with no middleware and return every `signedToken` in the batch** — complete QR-forgery material for an entire production run. `s3FileKey` is read straight from the query string into `GetObjectCommand.Key` with no validation, allowing an arbitrary read from the bucket. Both are P0 in `pharma-core/IMPLEMENTATION_PLAN.md`.

### 5.5 `pharma-backend` (Spring) — `:8080` · called only by pharma-core

| Endpoint | Status |
|---|---|
| `POST /api/transition` | ✅ the only fully working ledger write path |
| `POST /api/transition/batch` | 🔴 **500 always** — expects `{batchId, transitions}`, receives a bare array |
| `POST /api/transition/recall` | 🔴 **500 always** — expects `{systemBatchId, actorId, reason, recallDate, recallTime}`, receives `batchId`/`fromId` → two nulls → NPE |
| `GET /api/transition/**` | ⚠️ `permitAll()` — the whole ledger is publicly enumerable |

**World-state key format — the P0 defect.** The chaincode **writes** keys as `packId + ":" + eventType` and **reads** them as `packHash + "~CURRENT"`. Commit `b26d393` changed the writes and missed all three reads. Consequence: a freshly minted pack reports `NOT_FOUND`, and **a sold pack reports `AtShop`** — so the double-sale guard cannot fire from ledger data. See `BLOCKCHAIN_TEAM_PLAN.md` task 1.

Ledger states returned: `Packaged` · `AtShop` · `Sold` · `Recalled` · `NOT_FOUND`. There is no `InTransit` — POST-DEMO.

---

## 6. Migration table — frontend → canonical

**22 of 24 call sites need a path change.** All of them live in the API-layer modules, so **no screen or component needs restructuring.**

### Manufacture-DashBoard — baseURL `/api/manufacturer` ✅ correct · 2 of 13 match
`src/features/auth/services/auth.api.ts` · `src/features/dashboard/service/dashboard.api.ts`

| Current | Action |
|---|---|
| `POST /login` | → `/auth/login` |
| `POST /register` | → `/auth/register` |
| `GET /batches` | → `/batch` *(singular)* |
| `POST /batch` | ✅ keep |
| `POST /batch/:id/recall` | ✅ keep |
| `GET /dashboard` | 🚫 **Tier 2** — derive from `GET /batch` for now |
| `POST /kyc/verify-simulation` | 🆕 → `POST /auth/kyc/approve` — **being built tonight** |
| *missing* | 🆕 add `POST /auth/logout` — being built tonight |
| `POST /forgot-password` · `/reset-password` · `/verify-2fa` · `/user/sync` · `POST /alert/:id/resolve` · `PATCH /order/:id/status` | 🚫 **Tier 3 — do not build** |
| *missing* | add `POST /batch/:batchId/mint` — replaces the faked 4.3 s mint |

### shopkeeper-mobile — baseURL `:8000` ❌ · 0 of 11 match
`src/services/api/{client,auth,scan,transactions}.ts`

| Current | Action |
|---|---|
| base `http://192.168.1.100:8000` | → `:3002` |
| `POST /api/shopkeeper/login` · `/register` | → `/api/shopkeeper/auth/…` |
| `POST /api/v1/transactions/receive` | → `/api/shopkeeper/scan/intake` |
| `POST /api/v1/transactions/sell` | → `/api/shopkeeper/scan/sale` |
| `POST /api/v1/scan/shopkeeper` | → fold into intake/sale; no separate scan endpoint exists |
| `POST /logout` | 🆕 → `/api/shopkeeper/auth/logout` — **being built tonight** |
| `GET /verification-status` | 🆕 → `/api/shopkeeper/auth/verification-status` — **being built tonight** |
| *missing* | 🆕 add `GET /api/shopkeeper/inventory` — being built tonight |
| `/refresh` · `/forgot-password` · `/reset-password` · `/transactions/return` | 🚫 **Tier 3 — do not build** |

### customer-mobile — baseURL `:8000/api/v1` ❌ · 0 wired
`src/services/api/client.ts`

| Current | Action |
|---|---|
| base `http://localhost:8000/api/v1` | → `http://<host>:3003` |
| no verify call in the API layer | add one → `POST /api/consumer/verify` with `{ qrData: <raw scan> }` |
| `app/(public)/verification.tsx` hardcodes `status:"AUTHENTIC"` after a 2 000 ms fake delay | replace with the real call |

---

## 7. Build register — what we add, what stays mocked

The frontends call **12 endpoints that have never existed**. That list is not a to-do list and it is not a do-not-build list either. It is triaged below.

**The rule:** an endpoint gets built because it appears in Tier 1, not because a screen calls it. If you think something should move tiers, say so in the group chat and edit this section — do not just build it.

### Tier 1 — BUILD before the demo · 4 endpoints, all small

Each one either unblocks the demo path or is under 15 lines. Nothing here needs a new model or a new dependency.

| Endpoint | Service | Why it is essential | Effort |
|---|---|---|---|
| `POST /api/manufacturer/auth/kyc/approve` <br> `POST /api/shopkeeper/auth/kyc/approve` | mfr, shop | **The demo does not exist without this.** Login returns `403` until `kycStatus === 'APPROVED'` and nothing in the codebase can set it. Also the natural home for the key-generation call. The dashboard already calls a `kyc/verify-simulation` endpoint — same purpose, canonical name. | S |
| `GET /api/shopkeeper/inventory` | shop | The `Inventory` model already exists and intake already writes to it. Without this, the intake scan has no visible effect and the inventory screen has nothing to show. A `find` plus a `sort`. | S |
| `GET /api/shopkeeper/auth/verification-status` | shop | Returns `{ kycStatus }`. Eight `(auth)` screens in shopkeeper-mobile depend on it, and it is how the app leaves the "pending" screen after approval. Three lines. | S |
| `POST /api/manufacturer/auth/logout` <br> `POST /api/shopkeeper/auth/logout` | mfr, shop | Clears the cookie, returns `204`. Both apps call it. Currently there is no way to log out. Three lines. | S |

**Guard the KYC approval endpoint.** It grants the ability to mint signed pharmaceutical packs. For the demo, require a shared `ADMIN_TOKEN` header read from env, and **fail closed if the env var is unset** — do not default it to a literal. It is a deliberate demo shortcut standing in for a real regulator review workflow; say exactly that if a judge asks, and see the note in `PRESENTATION_BRIEF.md`.

### Tier 2 — build only after every P0 in your plan passes

Real value, but the demo works without them. Do not start these while any P0 is open.

| Endpoint | Service | Note | Effort |
|---|---|---|---|
| `GET /api/manufacturer/dashboard` | mfr | Aggregate counts plus recent batches. **The frontend can derive all of it from `GET /batch` today** — do that first, and only build the endpoint if the derived version is visibly slow. | M |
| `GET /api/shopkeeper/transactions` | shop | Sales/intake history. `PackEvent` already records every scan, so this is a `find` — but no screen blocks on it. | S |
| `GET /api/consumer/verify/:packHash` | consumer | For a QR opened as a plain URL by a phone's native camera. Signature-free, so it is **Tier 2 only** and can never return `GENUINE` — at most `ledger says X, signature unverified`. Note the printed URL points at `pharmachain.gov.in`, which does not resolve, so this cannot be demoed live anyway. | M |

### Tier 3 — do not build before the demo

Not because they are worthless, but because each needs infrastructure or a data model we do not have, and none appears in the demo script.

| Endpoint | Why not |
|---|---|
| `POST /forgot-password` · `/reset-password` | Needs email delivery, token expiry, and a reset-token store. A day of work, zero demo value. |
| `POST /refresh` | Session tokens last 7 days. Nothing can expire during a demo. |
| `POST /verify-2fa` | Needs TOTP enrolment and a secret store. |
| `POST /user/sync` | Firebase-shaped identity bridge for an architecture we do not use. |
| `POST /alert/:id/resolve` | No `Alert` model exists. |
| `PATCH /order/:id/status` | No `Order` model exists — there is no ordering flow anywhere in the system. |
| `POST /transactions/return` | The chaincode custody state machine has no return transition. Adding one is a ledger contract change. |
| Consumer accounts / login | `consumer` is **deliberately stateless with no database**. Verification needs no account — that is a feature, not a gap, and it is worth saying so in the pitch. Adding auth here means adding a datastore to the one service that does not need one. |
| `GET /shopkeeper/sales` · `/alerts` · `/dashboard/stats` · medicine catalog · `InTransit` / distributor leg | Post-demo. The distributor leg in particular is a coordinated ledger + core + 3× frontend change. |

**Everything in Tier 2 and Tier 3 stays behind the mock flag.** The frontend plan is written so that is a zero-cost position: mocked and real implementations share a signature, so promoting an endpoint later is a one-line change.


---

## POST-DEMO — richer verification envelope

Not for now. Recorded so it is not reinvented.

The current `uiState` conflates two distinct facts: whether the *signature* verified, and what the *ledger* says. A later version should return them separately — `tier1{signatureValid, keyId, manufacturerId}` and `tier2{ledgerFound, custodyState, chainQueried}` — plus a `severity` field and a `history[]` custody trail. That split enables the genuinely valuable state the current enum cannot express: **signature valid, ledger unreachable** — i.e. offline authenticity, which is this system's strongest capability.

It also allows audience-specific treatment of the same fact: ledger `Sold` is a blocking `danger` for a shopkeeper about to sell, but merely `info` for a consumer verifying a pack they already bought.

Both require coordinated backend + 3× frontend changes. Post-demo only.
