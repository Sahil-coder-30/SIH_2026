# `pharma-core` — Implementation Plan
### The Cryptographic & Auth Engine — Port `4000`

---

## 1. Role in the System

`pharma-core` is the **trust root** for all of PharmaChain. It owns every private key, signs every pack, verifies every scan, and is the only service that talks to Hyperledger Fabric. No other service is allowed to touch key material or the ledger directly — they all go through `pharma-core`.

If this service is wrong, every downstream guarantee (genuine vs. counterfeit) collapses. Build and test this **first**, and treat it as the highest-rigor part of the codebase even though it has the fewest user-facing screens.

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js + Express (or Fastify if you want stricter typing) |
| Signing | `jose` or `jsonwebtoken` for JWT; native `crypto` for ECDSA P-256 (packs) and RSA-4096 (core identity) |
| Symmetric encryption | AES-256-GCM (Node `crypto`) for the keystore at rest |
| Blockchain client | Hyperledger Fabric Node SDK (`fabric-network` / `fabric-gateway`) |
| Storage | `keystore.json` (encrypted) + PEM files on a persistent volume — **no general-purpose DB here** |

Keeping `pharma-core` stateless-ish (no Mongo) is intentional: it's a narrow-purpose crypto/ledger gateway, not a business-logic service. Resist the urge to let it grow business fields.

---

## 3. Data Owned by This Service

- `keystore.json` — AES-256-GCM encrypted, one entry per manufacturer: `{ manufacturerId, kid, encryptedPrivateKey (EC P-256), publicKey, createdAt }`
- Core RSA-4096 keypair (`pharma-core-rs256`) — service identity, used to sign the RS256 bearer tokens other services present to each other
- No pack/batch data lives here — it only ever *signs* what another service sends it and *returns* the signed token

---

## 4. Core Capabilities to Implement

### 4.1 Manufacturer key lifecycle
- `generateManufacturerKey(manufacturerId)` → EC P-256 keypair, private key encrypted with AES-256-GCM, written through the keystore mutex
- `decryptManufacturerKey(manufacturerId)` → in-memory only, never logged, never returned over the wire

### 4.2 Pack signing (the hot path)
- `mintPack(manufacturerId, packClaims)` → single ES256 JWT: `{ batchId, serial, expiryDate, manufacturerId, nonce, ts }`
- `mintPacksBatch(manufacturerId, N, batchMeta)` → the optimized path:
  1. Decrypt manufacturer EC key **once** (~150ms)
  2. Loop N times in memory, each iteration: 8-hex CSPRNG `nonce` (`crypto.randomBytes(4)`), nanosecond `ts` (`process.hrtime.bigint()`), sign
  3. Return array of signed pack tokens + hashes
  - Target: ~0.1ms/pack once the key is warm; 1 lakh packs in ~10–12s

### 4.3 Verification
- `verifyPackToken(token)` → checks ES256 signature against the manufacturer's public key (from keystore or JWKS cache), checks expiry, returns decoded claims or a typed error (`INVALID_SIGNATURE`, `EXPIRED`, `MALFORMED`)
- This is called by `shopkeeper-service` (intake/sale) and `consumer-service` (public verify) on **every single scan** — it needs to be fast and side-effect-free (no writes here; ledger state is looked up separately)

### 4.4 Fabric ledger bridge
- `submitTransition(packId, fromState, toState, actor)` → single transition
- `submitTransitionBatchChunked(transitions[])` → splits into 250-item chunks to stay under Fabric block-size limits, submits sequentially, retries per chunk (idempotent — replaying a chunk must not double-apply)
- `getPackState(packId)` → read current ledger status (`MINTED / IN_TRANSIT / AT_SHOP / SOLD / RECALLED`)
- `submitRecall(batchId)` → one on-chain transaction that flips every pack in the batch to `RECALLED`

### 4.5 Public discovery
- `GET /.well-known/jwks.json` — combined EC (per-manufacturer) + RSA (core) public keys
- `GET /.well-known/openid-configuration` — so any client can self-configure verification without a hardcoded key
- `GET /core/health`, `/healthz`, `/readyz` — must report `rsaKeyReady` and `keystoreReady` flags, since k8s liveness probes depend on this

---

## 5. Internal API Surface (called only by other PharmaChain services)

All routes below require `X-Service-Token` **and** a short-lived RS256 bearer JWT (`iss: pharma-core`, `aud: pharma-backend`) — no service-to-service call should ever be accepted on `X-Service-Token` alone.

| Method | Route | Called by | Purpose |
|---|---|---|---|
| `POST` | `/core/keys/manufacturer` | manufacturer-service | Provision a new EC keypair at manufacturer onboarding |
| `POST` | `/core/mint/batch` | manufacturer-service | Sign N packs for a batch, return tokens + hashes |
| `POST` | `/core/verify` | shopkeeper-service, consumer-service | Verify a scanned pack token's signature + expiry |
| `GET` | `/core/ledger/pack/:packId` | shopkeeper-service, consumer-service | Read current chain-of-custody state |
| `POST` | `/core/ledger/transition` | shopkeeper-service | Submit INTAKE / SOLD transition |
| `POST` | `/core/ledger/transition/batch` | manufacturer-service | Chunked MINTED transitions after a mint |
| `POST` | `/core/ledger/recall/:batchId` | manufacturer-service | Emergency recall |

Public (no service token):
| `GET` | `/.well-known/jwks.json` |
| `GET` | `/.well-known/openid-configuration` |
| `GET` | `/core/health`, `/healthz`, `/readyz` |

---

## 6. MVP Priority Ranking

This service has almost no "nice-to-have CRUD" surface — it's nearly all critical path. Build in this order:

1. **Critical (build first):** key generation, single-pack signing, verify, JWKS endpoint. Without these, nothing else can even be smoke-tested.
2. **Critical:** batch signing + chunked ledger transitions — this is what makes the manufacturer minting flow usable at real scale (1 lakh packs).
3. **Critical:** intake/sale transition submission + pack-state read — this is the actual chain-of-custody enforcement that stops a fake pack from being marked `SOLD` twice.
4. **Important, not launch-blocking:** recall endpoint — needed for the demo narrative ("we can pull a batch instantly") but can be built after the scan-verify loop works end to end.
5. **Hardening (post-MVP):** key rotation, HSM/KMS instead of a flat encrypted JSON file, structured audit logging of every sign/verify call, rate limiting on `/core/verify` (it's the one endpoint that will get hit by literally every scan in the country).

---

## 7. Open Risks to Flag in the Demo / Report

- `keystore.json` on a plain persistent volume is a hackathon-grade solution — call this out explicitly as "production would use a KMS/HSM" rather than pretending it's production-ready.
- Fabric chunk retries need an idempotency key per chunk (e.g. hash of the pack-ID list) so a network retry doesn't double-submit a transition.
- `/core/verify` has no per-caller rate limit yet — since `consumer-service` is public and zero-auth, a scripted attacker could hammer this endpoint to fingerprint valid batch IDs. Worth at least a basic IP/token bucket before the public demo.
