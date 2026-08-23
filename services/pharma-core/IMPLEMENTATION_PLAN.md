# pharma-core — Implementation Plan

**Port:** `4000` · **Base path:** `/core` · **Datastore:** encrypted JSON keystore file — **no database**
**Reachable from:** the three edge services only. **Never** a browser or a phone.
**Contract:** `Documents/API_CONTRACT.md §5.4`

---

## 1. Purpose

The cryptographic root of trust. It is the only component that can:

- **create** a manufacturer's ECDSA P-256 signing keypair,
- **sign** a pack's authenticity token,
- **verify** one,
- **assert its own machine identity** to the Spring gateway over RS256,
- **publish** its public keys as JWKS.

It holds **no business data.** No accounts, no batches, no inventory, no scans. That is deliberate: compromising any edge service yields a database, not the ability to sign a pack.

**It is also the only stateful single point of failure**, because the keystore file is the one thing in the system that cannot be regenerated. Lose it and every printed QR in the field becomes permanently unverifiable. Treat the file as the crown jewels — that framing matters more than any individual task below.

---

## 2. Data owned

One file. No collections.

**The encrypted keystore** — `config/keystore.js`, an in-memory cache in front of a JSON file, with writes serialised through an in-process promise chain.

```
{
  "MFR_CIPLA_001": {
    "publicKey":  "<PEM, P-256, plaintext>",
    "privateKey": "<AES-256-GCM ciphertext>",
    "iv":         "<hex>",
    "authTag":    "<hex>",
    "keyId":      "<kid, published in JWKS>",
    "createdAt":  "<ISO>"
  }
}
```

**Envelope encryption** (`services/crypto.service.js`):

| Step | Detail |
|---|---|
| KEK derivation | `scrypt(MASTER_SECRET, salt = manufacturerId, N = 16384)` |
| Sealing | AES-256-GCM, random IV per key, auth tag stored |
| Isolation | `manufacturerId` **as the salt** → a distinct KEK per manufacturer, so one compromise does not weaken another |

Also held, in `config/keys.js`: the service's own **RSA-4096** keypair for RS256 machine identity, kept separate from pack signing.

**Why two key types.** ES256/P-256 for packs, because signatures must be small enough to fit in a QR alongside the payload. RS256/RSA-4096 for machine identity, because that is what Spring's `NimbusJwtDecoder` and the JWKS/OIDC ecosystem expect. Two different problems, two appropriate primitives — say this if a judge asks why not one.

---

## 3. API surface

| Method | Path | Scope required *(task 6)* | Status |
|---|---|---|---|
| POST | `/core/keys/generate` | `keys:generate` — **mfr only** | ✅ `409` if a key exists — **safe to retry** |
| GET | `/core/keys/public/:mfrId` | `keys:read` — all three | ✅ |
| POST | `/core/batch/mint` | `batch:mint` — **mfr only** | ✅ |
| POST | `/core/hash/verify` | `hash:verify` — all three | 🔧 **task 1** — returns 400 for a counterfeit |
| GET | `/core/hash/status/:hash?batchId=` | `hash:status` — all three | ✅ |
| POST | `/core/chain/intake` · `/sale` | `chain:intake` · `chain:sale` — **shop only** | 🔧 **task 2** |
| POST | `/core/chain/recall` | `chain:recall` — **mfr only** | 🔧 **task 2** — recall shape 500s |
| GET | `/.well-known/jwks.json` *(+3 aliases)* | public | ✅ consumed by Spring |
| GET | `/core/health` · `/healthz` · `/readyz` | public | ⚠️ the latter two are static 200s |
| GET | `/core/export/:batchId` | **NONE** → `export:read`, mfr only | 🔴 **task 3** |
| GET | `/core/export/:batchId/preview` | **NONE** → `export:read`, mfr only | 🔴 **task 3** |

Today every one of those rows is guarded by the *same* `X-Service-Token`, so the "mfr only" and "shop only" annotations are the intent, not the behaviour. Task 6 makes them real. Full matrix and rationale: `API_CONTRACT.md §2.1`.

### `POST /core/batch/mint` — the pipeline worth understanding

`crypto.service.js:437` `mintAndUploadBatch` → `mintPacksBatch:327` → S3 → ledger.

```
1. decryptPrivateKey(manufacturerId)      ← ONE scrypt call, ~100-150ms   :333
2. for each of N packs:                                                   :367
     jwt.sign(payload, pem, ES256)        ← synchronous EC sign, no I/O,
                                             no scrypt re-derivation
     packHash = SHA256(rawSignedJWT)
3. build CSV
4. uploadCsvToS3()                        ← lib-storage streaming Upload
     └─ falls back to ./data/exports/{batchId}.csv when S3 is absent
5. generatePresignedUrl()                 ← 7-day GET
6. submitTransitionBatchChunked(…, 250)   ← chunked ledger write   backendClient:95
```

**The design decision that makes this viable:** the key is derived **once** and reused for all N in-memory signs. `:393` logs exactly that — `(1 scrypt + N EC signs)`. Deriving per pack would mean 100 000 × ~150 ms ≈ **4.1 hours**; this way it is one derivation plus N cheap EC signs. Do not refactor this into a per-pack helper that re-derives.

**The response is a ~200-byte presigned URL, not the packs.** A 100 000-element pack array is roughly 50 MB of JSON.

---

## 4. Communication

**Inbound** — `manufacturer`, `shopkeeper`, `consumer`. **One shared `X-Service-Token` today, so core cannot tell them apart** — the defect task 6 fixes.

**Outbound**

| Target | Transport | Purpose |
|---|---|---|
| `pharma-backend` `:8080` | HTTPS + **RS256 JWT** signed by `signCoreJwt:197` | ledger reads and writes |
| AWS S3 | SDK v3 + `lib-storage` | pack CSV upload, presigned URLs |
| local disk | `./data/exports/` | S3 fallback — keeps the demo alive without AWS |

**The JWKS handshake, which is genuinely well done.** `buildJwks:248` publishes the RSA public key at `/.well-known/jwks.json`; Spring's `SecurityConfig` pulls it and validates **issuer and audience**, not just the signature. That is a complete OIDC-style machine-identity flow, and it is the healthiest link in the whole architecture. Do not break it.

---

## 5. Defects

| # | P | Location | Defect |
|---|---|---|---|
| 1 | P0 | `controllers/hash.controller.js:17` | Returns **400** for an invalid signature. No client sets `validateStatus`, so axios throws and every `COUNTERFEIT` branch upstream is dead code. **A forged QR yields 500.** |
| 2 | P0 | `services/backendClient.service.js` | `submitTransitionBatch` posts a bare array; Spring wants `{batchId, transitions}`. `submitRecall` sends `batchId`/`fromId`; Spring wants `systemBatchId`/`actorId`. **Both 500 on every call.** |
| 3 | P0 | `app/app.js:95`, `:102` | Both `/core/export/**` routes registered **directly on `app` with no middleware**, returning every `signedToken` in the batch. |
| 4 | P1 | `controllers/export.controller.js:186` | `s3FileKey` read unvalidated from query/body → `GetObjectCommand.Key` at `:66-69`. Arbitrary bucket read, on an unauthenticated route. |
| 5 | P1 | `middleware/requireAuth.middleware.js:16-17` | Falls back to literal `'mfr-super-secret-jwt-key'` / `'shop-super-secret-jwt-key'`. `k8s/pharma-core.deployment.yml` injects neither env var, so **the repo-visible literals are the production secrets.** |
| 5b | P1 | `middleware/requireServiceToken.middleware.js` | **One shared secret for all callers, so core cannot identify or restrict any of them.** `consumer` — internet-facing, no user auth — holds a credential that opens `/core/keys/generate` and `/core/batch/mint`. The §1 claim that compromising an edge service does not yield signing ability **is not enforced.** Task 6. |
| 6 | P2 | `app/app.js:50` | `keystoreReady = true` hardcoded; the `catch` at `:51` is unreachable. |
| 7 | P2 | `app/app.js:66`, `:70` | `/healthz` and `/readyz` are static 200s — they cannot report an unready keystore. |
| 8 | P2 | `services/crypto.service.js:18` | `GCM_IV_LENGTH = 16`. GCM's standard is **12**; 16 forces extra GHASH derivation. Works, non-standard. **Changing it breaks every existing key** — post-demo with a migration. |
| 9 | P2 | `controllers/export.controller.js:14-44` | Hand-rolled `parseCsv` toggles `inQuotes` on every `"`; no `""` escape handling. Any quoted field with an embedded quote misparses. |
| 10 | P2 | `controllers/export.controller.js:58` | `new S3Client` per request — no connection reuse. |

---

## 6. Tasks

### 1 · P0 · S — Verdicts return 200

`hash.controller.js:17` → **200** with `{ status:'success', valid:false, reason:'INVALID_SIGNATURE' }`.
Keep the 400 at `:11` for a *missing* `signedToken` — that is genuinely a malformed request.

Then add `validateStatus: s => s < 500` to the `axios.create` in all three edge core-clients. Belt and braces: the status fix alone is enough today, but `validateStatus` means the next non-2xx verdict anyone adds still reaches the mapping code instead of a catch block.

**Verify the `!result.valid` branch actually executes.** It never has.

### 2 · P0 · S — Fix the two Fabric shapes

*Coordinate with the blockchain team before editing — this is a paired change.*

- `submitTransitionBatch` → wrap: `{ batchId, transitions: [...] }`
- `submitRecall` → `{ systemBatchId, actorId, reason, recallDate, recallTime }`

Keep `submitTransitionBatchChunked`'s 250-item chunking as-is.

Also: the gateway does not return `recordedHashes` yet, so **stop logging `0/N recorded` as though it were a failure** — right now a successful mint and a broken one look identical in the logs, which is how defect 2 stayed hidden.

### 3 · P0 · S — Authenticate the export routes

Add `requireServiceToken` to `app.js:95` and `:102`. **The single most serious finding in this repo**: unauthenticated, these two hand out complete QR-forgery material for an entire production run.

### 4 · P1 · S — Derive `s3FileKey`, do not accept it

Delete the query/body override at `export.controller.js:186`. Build the key from `batchId`, which is already regex-validated at `:191`. The validation you need is five lines below the hole.

### 5 · P1 · S — Fail fast on missing secrets

Replace the `||` fallbacks at `requireAuth.middleware.js:16-17` with a startup assertion. **A service that refuses to boot beats one that boots with a published secret.**

Note `MASTER_SECRET` for the keystore KEK: confirm it has no literal fallback either. If it does, that is worse than the JWT secrets — it decrypts every private key.

### 6 · P1 · S — Per-service identity and a scope check

**Specification: `API_CONTRACT.md §2.1`. Build phase 1 only** — per-service secrets plus a scope check. Not the token endpoint, not the caching, not mTLS.

Rewrite `middleware/requireServiceToken.middleware.js` around a registry:

```js
const SERVICE_REGISTRY = new Map([
    [requireEnv('SERVICE_TOKEN_MANUFACTURER'), 'manufacturer'],
    [requireEnv('SERVICE_TOKEN_SHOPKEEPER'),   'shopkeeper'],
    [requireEnv('SERVICE_TOKEN_CONSUMER'),     'consumer'],
]);
```

plus the `SCOPES` map and `requireScope(scope)` from §2.1, then swap each route's middleware for `requireScope('…')` per the table in §3 above.

**Read `Authorization: Bearer` first, fall back to `X-Service-Token`.** That is what lets you land the core side and verify it, then move `manufacturer`, `shopkeeper`, `consumer` one at a time. Without the fallback this is a four-service flag-day cutover on demo eve, which is not a trade worth making.

Set `req.callerService` and log it. Beyond audit value, it gives you something demonstrable: a log line showing `consumer` refused a mint with `403 SCOPE_DENIED`.

**This is the service where the change lives**, so read the whole of §2.1 before starting — including the rejected design (an unauthenticated `X-Service-Id` header, which looks like authorization and provides none) and the three failure modes that keep phase 2 out of tonight.

**Do task 3 first.** Task 3 closes the export hole with a plain token check; this task then tightens those two routes to `manufacturer`-only. In that order the hole is shut even if the evening runs out here.

⚠️ **Deploy order matters.** Core must accept both header forms *before* any client switches. If you deploy a core that only accepts the new form, all three edge services break at once.

---

## Do not touch before the demo

- **`requireServiceToken` and `requireAuth` are the same function** under two names. Task 6 separates them as a side effect of rewriting the former; do not attempt a standalone rename across all call sites.
- **Phases 2 and 3 of contract §2.1** — the `/core/auth/token` endpoint with cached bearer JWTs, and mTLS. Both are specified; neither is tonight. Phase 2 makes the token endpoint a hard dependency of all three edge services, and a cold-start refresh storm or container clock skew would take the mesh down in ways phase 1 cannot.
- The **try-every-secret** verification loop — a token is accepted if it validates against *either* role's secret.
- **`GCM_IV_LENGTH` 16 → 12** — breaks every existing key without a migration.
- The **event-loop-blocking** 100 k signing loop. It blocks for ~20–30 s; correct fix is a worker thread. Do not attempt tonight.
- **Keystore write atomicity** — the write mutex is in-process only, so two replicas would corrupt the file. Mitigated for now by `replicas: 1`. Real fix is AWS KMS.
- The missing **PVC manifest** and skaffold's 4 missing files. **Run locally.**
- `keystoreReady`, the static probes, `parseCsv`, per-request `S3Client`.

## Do not regress

1. **One scrypt + N in-memory signs.** The difference between ~20 s and ~4 h.
2. **The presigned-URL response.** ~200 bytes instead of ~50 MB.
3. **`409` on duplicate key generation.** The manufacturer service's Tier-1 approval endpoint depends on this being idempotent.
4. **ES256 packs / RS256 machines.** Two primitives, two problems.
5. **`manufacturerId` as the scrypt salt.** Per-manufacturer key isolation.
6. **The S3 → local-disk fallback.** This is what lets the demo run with no AWS credentials.
7. **`batchId` regex validation** on both export routes.

---

## Verification

```bash
export SERVICE_TOKEN=dev-shared-secret            # transitional — still honoured
export SERVICE_TOKEN_MANUFACTURER=dev-mfr-svc     # task 6
export SERVICE_TOKEN_SHOPKEEPER=dev-shop-svc      # task 6
export SERVICE_TOKEN_CONSUMER=dev-consumer-svc    # task 6
export ADMIN_TOKEN=dev-admin-secret
export MANUFACTURER_JWT_SECRET=dev-mfr-secret
export SHOPKEEPER_JWT_SECRET=dev-shop-secret
```

**These are development values. Do not let them reach a deployment manifest** — that is exactly how the HS256 literals in defect 5 became production secrets.

1. `GET /core/health` → `200`, `rsaKeyReady: true`
2. `GET /.well-known/jwks.json` → a JWK with a `kid` and `"kty":"RSA"`
3. `POST /core/keys/generate` → `201`; **call it again** → `409` *(idempotency the approval endpoint relies on)*
4. `GET /core/keys/public/:mfrId` → a P-256 PEM
5. `POST /core/batch/mint` with `quantity: 50` → a presigned URL; note the wall time
6. `POST /core/hash/verify` with a genuine token → `200`, `valid: true`
7. **Flip one character in the signature segment → `200`, `valid: false`, `reason: 'INVALID_SIGNATURE'`.** A 400 means task 1 is incomplete. **(task 1)**
8. `GET /core/export/:batchId` with **no** `X-Service-Token` → `401` **(task 3)**
9. `GET /core/export/:batchId?s3FileKey=anything-else` → the parameter is ignored **(task 4)**
10. Unset `MANUFACTURER_JWT_SECRET` → the service refuses to start **(task 5)**
11. `POST /core/chain/recall` → `200` from the gateway, not 500 *(needs task 2 + Blockchain 3)*
12. **`POST /core/batch/mint` with `SERVICE_TOKEN_CONSUMER` → `403 SCOPE_DENIED`, and the log line names `consumer`.** **(task 6)**
13. `POST /core/batch/mint` with `SERVICE_TOKEN_MANUFACTURER` → works as before **(task 6)**
14. Any call with the old `X-Service-Token` → still works *(the migration fallback — this is what makes step 12 safe to deploy first)* **(task 6)**
15. Unset `SERVICE_TOKEN_CONSUMER` → the service refuses to start **(task 6)**

**Step 12 is the one to screenshot.** It is the proof that compromising the public-facing service does not yield the ability to mint — the §1 claim, demonstrated rather than asserted.

**Step 7 is the one that matters.** It is the exact code path behind the counterfeit warning that the entire pitch rests on, and it has never once executed successfully.
