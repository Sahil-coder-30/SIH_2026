# 🛠️ PharmaChain — Implementation Plan
### Kubernetes (K8s) & Skaffold Microservices | NGINX Ingress | Hyperledger Fabric | SIH 2026

> **Purpose:** This document is the implementation source of truth for the current PharmaChain architecture.
>
> **Important:** Older architecture decisions have been removed where they conflict with the current design. Offline verification/queueing is **not part of the current V1 architecture**.

---

# 1. Current Architecture

## 1.1 Kubernetes + NGINX Ingress Topology

```text
═══════════════════════════════════════════════════════════════════
                    PUBLIC CLIENT INGRESS ROUTING
═══════════════════════════════════════════════════════════════════

  Manufacturer Web App      Shopkeeper Mobile App       Consumer Mobile App
  React / Vite              React Native                 React Native
           │                       │                          │
           └───────────────────────┼──────────────────────────┘
                                   │ HTTPS / REST
                                   ▼
                  ┌─────────────────────────────────────┐
                  │     Shared NGINX Ingress Gateway    │
                  │          k8s/ingress.yml             │
                  └──────────────────┬──────────────────┘
                                     │
       ┌─────────────────────────────┼─────────────────────────────┐
       │ /api/manufacturer           │ /api/shopkeeper             │ /api/consumer
       ▼                             ▼                             ▼
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ manufacturer-service │   │ shopkeeper-service   │   │ consumer-service     │
│ ClusterIP :80        │   │ ClusterIP :80        │   │ ClusterIP :80        │
│ TargetPort :3001     │   │ TargetPort :3002     │   │ TargetPort :3003     │
│ Own PostgreSQL       │   │ Own PostgreSQL       │   │ Stateless             │
└──────────┬───────────┘   └──────────┬───────────┘   └──────────┬───────────┘
           │                          │                          │
           └──────────────────────────┼──────────────────────────┘
                                      │
                                      │ Internal HTTP
                                      │ (X-Service-Token)
                                      ▼
                    ┌──────────────────────────────────┐
                    │       pharma-core-service        │
                    │       ClusterIP :80              │
                    │       TargetPort :4000            │
                    │                                  │
                    │  • ZERO public ingress           │
                    │  • Private-key vault (AES-256)   │
                    │  • ES256 signing                 │
                    │  • JWT verification              │
                    │  • SHA-256 pack hashing          │
                    │  • Public JWKS server            │
                    └────────────────┬─────────────────┘
                                     │
                                     │ Internal HTTP REST
                                     │ POST /api/transition
                                     │ Authorization: Bearer <JWT>
                                     ▼
                    ┌──────────────────────────────────┐
                    │     pharma-backend-service       │
                    │     ClusterIP :80                │
                    │     TargetPort :8080             │
                    │                                  │
                    │  • ZERO public ingress           │
                    │  • Spring Boot 4.1.0 Gateway     │
                    │  • Fabric Gateway SDK 1.5.1      │
                    │  • OAuth2 Resource Server        │
                    │  • Fabric TLS crypto material    │
                    └────────────────┬─────────────────┘
                                     │
                                     │ gRPC / mTLS
                                     ▼
                    ┌──────────────────────────────────┐
                    │       Hyperledger Fabric         │
                    │          pharmacc chaincode      │
                    │             ✅ DONE              │
                    └──────────────────────────────────┘
```

### Architectural Rule

**Domain microservices never call Hyperledger Fabric or `pharma-backend-service` directly.**

1. **Client Edge**: All external traffic flows through **NGINX Ingress** (`k8s/ingress.yml`) to public domain services (`manufacturer-service`, `shopkeeper-service`, `consumer-service`).
2. **Security Vault Layer (`pharma-core`)**: Domain services invoke `pharma-core` (port 4000) for all key management, ES256 signing, SHA-256 hashing, and token verification.
3. **Blockchain Gateway Layer (`pharma-backend-service`)**: `pharma-core` forwards blockchain transition requests (`POST /api/transition`, `GET /api/transition/{hash}`) to `pharma-backend-service` (Spring Boot port 8080).
4. **Hyperledger Fabric Layer (`pharmacc`)**: `pharma-backend-service` manages the Fabric Gateway SDK, Netty gRPC mTLS connections, and invokes smart contract functions on `pharmacc`.

Both `pharma-core-service` and `pharma-backend-service` are **internal ClusterIP services only** and are strictly **omitted from public ingress**.

---

# 2. Architectural Safeguards

| Concern | Current solution |
|---|---|
| Private keys exposed to internet | `pharma-core-service` is internal `ClusterIP:80` (targetPort 4000) and omitted from ingress |
| Fabric TLS material exposed | Fabric MSP certificates are mounted only into `pharma-backend-service` |
| Blockchain calls from application services | Forbidden; application services call `pharma-core`, which calls `pharma-backend` |
| Single public entry point | One NGINX Ingress Gateway (`k8s/ingress.yml`) |
| Path-based routing | `/api/manufacturer`, `/api/shopkeeper`, `/api/consumer` |
| Internal networking | Kubernetes `ClusterIP` services on standard port 80 |
| Local development | Skaffold manages container builds and source syncing (`src/**`) |
| Service-to-core authentication | `X-Service-Token` header validation |
| Core-to-backend authentication | `Authorization: Bearer <JWT>` validated against `pharma-core`'s JWKS endpoint |
| User authentication | Each public domain service owns its own JWT authentication |
| Blockchain transport | gRPC + mTLS between `pharma-backend-service` and Fabric peer/orderer nodes |

---

# 3. Blockchain System — Current Reality

> **Read this before implementing `pharma-core`.**

The blockchain engineer has already built a working Hyperledger Fabric system.

## 3.1 Transition Object

The ledger stores transitions as append-only event records:

```json
{
  "docType": "transition",
  "hash": "MED-12345",
  "fromId": "MANUFACTURER_CIPLA",
  "toId": "DISTRIBUTOR_APOLLO",
  "sellingDate": "20082026",
  "sellingTime": "19:30:00",
  "sellerId": "SELLER_456"
}
```

### Important

`hash` is the ledger key.

Therefore, a pack event must use a unique hash.

Suggested convention:

```text
packHash:MFG
packHash:INTAKE
packHash:SALE
batchId:RECALL
```

**Confirm the exact convention with the blockchain engineer before integration.**

---

# 4. Existing Chaincode Functions

Confirm the exact deployed names/signatures before writing the Fabric client.

| Function | Type | Arguments | Purpose |
|---|---|---|---|
| `recordTransition` | Write | `hash, fromId, toId, sellingDate, sellingTime, sellerId` | Append transition |
| `getTransitionByHash` | Read | `hash` | Read one transition |
| `TransitionExists` | Read | `hash` | Existence check |
| `queryTransition` | Read | `fromId, toId, hash` | Filter transitions |
| `GetAllTransitions` | Read | none | Read all transitions |

Existing Spring Boot API:

```text
POST /api/transition
GET  /api/transition/{hash}
GET  /api/transition?fromId=&toId=&hash=
```

---

# 5. Pack Lifecycle on Fabric

A pack's history is represented as multiple immutable transitions:

```text
Manufacture
packHash:MFG
MINTED → manufacturer


Intake
packHash:INTAKE
manufacturer → shop


Sale
packHash:SALE
shop → CONSUMER


Recall
batchId:RECALL
manufacturer → RECALLED
```

This means Fabric is an **append-only event ledger**, not a mutable `status` table.

## 5.1 Current Status Resolution

Status is derived by checking the relevant transition records.

Priority:

```text
1. SALE
2. RECALL
3. INTAKE
4. MFG
5. NOT_FOUND
```

Conceptually:

```typescript
async function getPackStatus(packHash: string) {
  if (await exists(`${packHash}:SALE`)) {
    return { status: "Sold" };
  }

  const batchId = await getBatchIdForPack(packHash);

  if (await exists(`${batchId}:RECALL`)) {
    return { status: "Recalled" };
  }

  if (await exists(`${packHash}:INTAKE`)) {
    return { status: "AtShop" };
  }

  if (await exists(`${packHash}:MFG`)) {
    return { status: "Packaged" };
  }

  return { status: "NOT_FOUND" };
}
```

---

# 6. Services & Responsibilities

| Service | Port | Public | Database | Primary responsibility |
|---|---:|:---:|---|---|
| `manufacturer-service` | 3001 | ✅ | PostgreSQL | Manufacturer domain (KYC, Batches, QR CSV Export, Orders) |
| `shopkeeper-service` | 3002 | ✅ | PostgreSQL | Pharmacy/POS domain (Sales, Stock Inventory, B2B Orders) |
| `consumer-service` | 3003 | ✅ | None | Stateless consumer verification router & fraud reporting |
| `pharma-core` | 4000 | ❌ | Encrypted key store | Crypto vault, ES256 signing, SHA-256 hashing, JWKS server |
| `pharma-backend-service` | 8080 | ❌ | None | Spring Boot Fabric Gateway (gRPC mTLS, MSP, `pharmacc`) |
| Fabric peers/orderer | 7050–9054 | ❌ | Fabric storage | Hyperledger Fabric immutable event ledger |

---

# 7. pharma-core — Critical Internal Service

## 7.1 Responsibilities

`pharma-core` owns:

```text
✓ Manufacturer private keys
✓ Encrypted key storage (AES-256-GCM)
✓ ES256 key generation
✓ JWT signing
✓ JWT verification
✓ SHA-256 pack hashing
✓ Public JWKS endpoint (/.well-known/jwks.json)
✓ Internal service authentication (X-Service-Token)
✓ Calling pharma-backend-service REST API (POST /api/transition)
```

`pharma-core` does **not** manage Fabric gRPC connections or MSP certificates directly; it delegates blockchain transitions to `pharma-backend-service`. It does **not** expose a public ingress route.

---

# 8. Internal Authentication

Every request from a domain service to `pharma-core` must contain:

```http
X-Service-Token: <SERVICE_TOKEN>
```

Middleware:

```typescript
export function requireServiceToken(req, res, next) {
  const token = req.headers["x-service-token"];

  if (!token || token !== process.env.SERVICE_SECRET) {
    return res.status(401).json({
      code: "UNAUTHORIZED",
      message: "Invalid service token"
    });
  }

  next();
}
```

Apply this middleware to every protected core route.

Health endpoint may remain unauthenticated for Kubernetes health checks.

---

# 9. pharma-core API

```text
POST /core/keys/generate
GET  /core/keys/public/:mfrId
GET  /.well-known/jwks.json

POST /core/batch/mint

POST /core/hash/verify
GET  /core/hash/status/:hash

POST /core/chain/intake
POST /core/chain/sale
POST /core/chain/recall

GET  /core/health
```

### API ownership & downstream calls

| Endpoint | Responsibility | Downstream Action |
|---|---|---|
| `/keys/*` | Manufacturer key management | Internal AES-256 Keystore |
| `/.well-known/jwks.json` | Public JWKS key set | Exposes public keys for Spring Boot OAuth2 verification |
| `/batch/mint` | Token signing + hash generation + mint registration | Calls `pharma-backend` `POST /api/transition` (`packHash:MFG`) |
| `/hash/verify` | JWT authenticity & expiry check | In-memory ES256 signature verification |
| `/hash/status/:hash` | Derive pack status from Fabric | Calls `pharma-backend` `GET /api/transition/{hash}` |
| `/chain/intake` | Record intake event | Calls `pharma-backend` `POST /api/transition` (`packHash:INTAKE`) |
| `/chain/sale` | Record sale event | Calls `pharma-backend` `POST /api/transition` (`packHash:SALE`) |
| `/chain/recall` | Record batch recall | Calls `pharma-backend` `POST /api/transition` (`batchId:RECALL`) |
| `/health` | Internal health | Internal status check |

---

# 10. Cryptography

## 10.1 Manufacturer Key Pair

Each manufacturer receives:

```text
Private key → encrypted + stored only in pharma-core
Public key  → safe to distribute for verification / exposed via JWKS
```

Algorithm:

```text
ES256 / ECDSA P-256
```

## 10.2 QR Payload

The QR contains a signed JWT:

```json
{
  "batchId": "BATCH-MFR001-2026-001",
  "serial": "00042",
  "expiryDate": "2028-01-14",
  "manufacturerId": "MFR-001"
}
```

The signed payload contains only the fields necessary for authenticity.

Rich metadata such as medicine name and formulation is resolved from the application's database.

## 10.3 Pack Hash

```text
packHash = SHA256(signedJWT)
```

The hash is used as the basis for ledger event identifiers.

---

# 11. Key Storage

Private keys are encrypted at rest.

```text
/data/keystore.json
```

Conceptual structure:

```typescript
type KeyStore = Record<string, {
  encryptedPrivKey: string;
  publicKeyPem: string;
}>;
```

Encryption:

```text
AES-256-GCM
+
manufacturer-specific derived key
+
random IV
+
authentication tag
```

The raw private key exists in memory only while required for cryptographic operations.

---

# 12. Batch Minting Flow

```text
Manufacturer
     │
     │ POST /api/manufacturer/batch
     ▼
manufacturer-service
     │
     │ POST /core/batch/mint
     │ X-Service-Token
     ▼
pharma-core
     │
     ├── Load encrypted manufacturer private key
     ├── Decrypt key in memory
     ├── Generate signed JWT per pack
     ├── SHA-256 hash each JWT
     │
     │ POST /api/transition (hash: packHash:MFG)
     │ Bearer JWT Auth
     ▼
pharma-backend-service
     │
     │ submitTransaction("recordTransition", ...)
     │ gRPC / mTLS
     ▼
Hyperledger Fabric (pharmacc)
     │
     ▼
pharma-core
     │
     └── Return pack data { serial, packHash, signedToken }
     │
     ▼
manufacturer-service
     │
     ├── Save batch metadata in Postgres
     ├── Save pack records in Postgres
     ├── Generate QR export (CSV / ZIP)
     └── Return download
```

Response:

```json
{
  "batchId": "BATCH-001",
  "packs": [
    {
      "serial": "00001",
      "packHash": "e3b0...",
      "signedToken": "eyJ..."
    }
  ]
}
```

---

# 13. Manufacturer Service

## Owns

```text
✓ Manufacturer registration
✓ KYC state
✓ Batch creation
✓ Batch metadata
✓ Pack metadata
✓ QR/CSV generation
✓ Incoming shopkeeper orders
✓ Shipment metadata
✓ Recall initiation
```

Database:

```text
manufacturers
batches
packs
orders
shipments
```

## Does NOT own

```text
✗ Private keys
✗ JWT signing
✗ JWT verification
✗ Direct Fabric connection
✗ Direct Fabric transaction submission
```

---

# 14. Shopkeeper Service

## Owns

```text
✓ Shopkeeper registration
✓ KYC state
✓ Intake scanning
✓ Sale scanning
✓ Inventory
✓ Stock dashboard
✓ Expiry alerts
✓ Orders
✓ Local event records
```

Database:

```text
shopkeepers
pack_events
orders
```

## Intake Flow

```text
Shopkeeper scans QR
        │
        ▼
shopkeeper-service
        │
        ├── /core/hash/verify
        │
        └── /core/chain/intake
                 │
                 │ POST /api/transition
                 ▼
        pharma-backend-service
                 │
                 │ gRPC / mTLS
                 ▼
        Hyperledger Fabric
```

## Sale Flow

```text
Shopkeeper scans QR
        │
        ▼
shopkeeper-service
        │
        ├── Verify JWT (/core/hash/verify)
        ├── Check expiry
        ├── Check current pack state (/core/hash/status/:hash)
        └── /core/chain/sale
                 │
                 │ POST /api/transition (packHash:SALE)
                 ▼
        pharma-backend-service
                 │
                 │ gRPC / mTLS
                 ▼
        Hyperledger Fabric
```

Expected failures:

```text
INVALID_SIGNATURE
PACK_NOT_AT_SHOP
ALREADY_SOLD
RECALLED
EXPIRED
DUPLICATE_INTAKE
```

---

# 15. Consumer Service

The consumer service remains intentionally lightweight.

## Owns

```text
✓ Consumer QR verification endpoint
✓ Result mapping
✓ Suspicious report submission
```

## Does NOT own

```text
✗ Cryptography
✗ Private keys
✗ Direct Fabric connection
✗ Direct Blockchain queries
```

Verification:

```text
Consumer scans QR
      │
      ▼
consumer-service
      │
      ├── pharma-core /core/hash/verify
      │
      └── pharma-core /core/hash/status/:hash
                  │
                  │ GET /api/transition/{hash}
                  ▼
         pharma-backend-service
                  │
                  │ gRPC / mTLS
                  ▼
         Hyperledger Fabric
```

Possible UI states:

```text
Genuine / Verified
Already Sold
Recalled
Expired
At Shop
Invalid / Counterfeit
Not Found
```

---

# 16. QR Export

`manufacturer-service` is responsible for packaging the signed tokens returned by `pharma-core`.

Supported outputs:

```text
CSV
ZIP containing QR PNGs
```

CSV:

```text
serial,packHash,signedToken
00001,e3b0...,eyJ...
00002,5891...,eyJ...
```

QR content:

```text
signedToken
```

The QR itself does not contain an unsigned display object.

---

# 17. Kubernetes Structure

```text
SIH_2026/
│
├── skaffold.yml
│
├── k8s/
│   ├── ingress.yml
│   ├── secrets.yml
│   ├── manufacturer.deployment.yml
│   ├── manufacturer.service.yml
│   ├── shopkeeper.deployment.yml
│   ├── shopkeeper.service.yml
│   ├── consumer.deployment.yml
│   ├── consumer.service.yml
│   ├── pharma-core.deployment.yml
│   ├── pharma-core.service.yml
│   ├── pharma-backend.deployment.yml
│   └── pharma-backend.service.yml
│
├── services/
│   ├── manufacturer/
│   ├── shopkeeper/
│   ├── consumer/
│   └── pharma-core/
│
├── Backend/
│   └── Spring Boot Fabric integration (pharma-backend)
│
└── chaincode/
    └── pharmacc
```

---

# 18. NGINX Ingress

Public routes:

```text
/api/manufacturer → manufacturer-service:80
/api/shopkeeper   → shopkeeper-service:80
/api/consumer     → consumer-service:80
```

Never expose:

```text
pharma-core-service
pharma-backend-service
Fabric peers
Fabric orderer
PostgreSQL
```

---

# 19. Docker Compose Development Topology

For local development, the same trust boundaries must be preserved.

```text
PUBLIC NETWORK
├── manufacturer-service
├── shopkeeper-service
└── consumer-service

INTERNAL NETWORK
├── pharma-core
├── pharma-backend
├── manufacturer-db
├── shopkeeper-db
└── Fabric
```

`pharma-core` and `pharma-backend` must not have host port mappings exposed to public interfaces.

Example:

```yaml
pharma-core:
  build: ./services/pharma-core
  networks:
    - internal
  # No public ports:

pharma-backend:
  build: ./Backend
  networks:
    - internal
  # No public ports:
```

---

# 20. Service-to-Service Communication

```text
Client
  │
  │ HTTPS
  ▼
NGINX Ingress Gateway
  │
  ├── manufacturer-service
  ├── shopkeeper-service
  └── consumer-service
          │
          │ X-Service-Token
          ▼
     pharma-core-service (:4000)
          │
          │ HTTP REST (POST /api/transition)
          │ Authorization: Bearer <JWT>
          ▼
     pharma-backend-service (:8080)
          │
          │ Fabric Gateway SDK (gRPC / mTLS)
          ▼
     Hyperledger Fabric (pharmacc)
```

No frontend receives:

```text
SERVICE_TOKEN
SERVICE_SECRET
private keys
Fabric certificates
Fabric credentials
```

---

# 21. Build Order

## Day 1 — pharma-core & pharma-backend

```text
[ ] Monorepo + Docker Compose / Skaffold
[ ] pharma-core skeleton
[ ] Service-token middleware (X-Service-Token)
[ ] /core/health
[ ] ES256 key generation
[ ] Encrypted key store (AES-256-GCM)
[ ] Public-key retrieval (/.well-known/jwks.json)
[ ] JWT verification
[ ] SHA-256 hashing
[ ] Connect pharma-core to pharma-backend-service REST API
```

## Day 1 PM — Fabric integration via pharma-backend

```text
[ ] Confirm deployed chaincode function names on pharmacc
[ ] Confirm transition hash convention (:MFG, :INTAKE, :SALE, :RECALL)
[ ] Verify Spring Boot OAuth2 Resource Server validates pharma-core JWKS
[ ] Implement transition read in pharma-core via pharma-backend
[ ] Implement intake write in pharma-core via pharma-backend
[ ] Implement sale write in pharma-core via pharma-backend
[ ] Implement recall write in pharma-core via pharma-backend
[ ] Implement batch registration in pharma-core via pharma-backend
[ ] End-to-end test with 5 packs
```

## Day 2 — manufacturer-service

```text
[ ] Registration
[ ] Login
[ ] KYC state
[ ] Batch creation
[ ] Call /core/batch/mint
[ ] Save batch + packs in Postgres
[ ] CSV export
[ ] QR ZIP export
[ ] Recall endpoint
[ ] Order management
```

## Day 2 PM — shopkeeper-service

```text
[ ] Registration
[ ] Login
[ ] KYC state
[ ] Intake scan
[ ] Sale scan
[ ] Error handling
[ ] Inventory events in Postgres
[ ] Stock dashboard
[ ] Expiry alerts
[ ] Order placement
```

## Day 3 — consumer + frontend

```text
[ ] Consumer verification
[ ] Status mapping
[ ] Suspicious report
[ ] Manufacturer dashboard
[ ] Shopkeeper scan UI
[ ] Consumer scan UI
[ ] Recall demonstration
```

---

# 22. API Error Contract

All services return:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "data": {}
}
```

Standard codes:

```text
INVALID_SIGNATURE
ALREADY_SOLD
PACK_NOT_AT_SHOP
RECALLED
EXPIRED
DUPLICATE_INTAKE
NOT_FOUND
UNAUTHORIZED
KYC_PENDING
CHAIN_ERROR
```

`NOT_FOUND` during consumer verification is a meaningful result, not necessarily a server failure.

---

# 23. Environment Variables

```env
# Internal service authentication
SERVICE_TOKEN=change-me
SERVICE_SECRET=change-me

# pharma-core
KEY_ENCRYPTION_SECRET=64-char-secret
PHARMA_BACKEND_URL=http://pharma-backend-service:80

# Fabric (inside pharma-backend-service)
PEER_ENDPOINT=peer0.org1.example.com:7051
FABRIC_MSP_ID=Org1MSP

# Manufacturer
MANUFACTURER_DATABASE_URL=postgres://pharma:pharma@manufacturer-db:5432/manufacturer
MANUFACTURER_JWT_SECRET=change-me

# Shopkeeper
SHOPKEEPER_DATABASE_URL=postgres://pharma:pharma@shopkeeper-db:5432/shopkeeper
SHOPKEEPER_JWT_SECRET=change-me

# Internal core URL (used by Domain Services)
PHARMA_CORE_URL=http://pharma-core-service:80
```

Secrets must be supplied through Kubernetes Secrets in deployment environments.

---

# 24. Current V1 Scope

## Build

```text
✓ Manufacturer registration
✓ Batch creation
✓ ES256 QR generation
✓ Pack hashing
✓ Fabric manufacturing records
✓ Shopkeeper intake
✓ Shopkeeper sale
✓ Consumer verification
✓ Recall
✓ PostgreSQL inventory records
✓ QR/CSV export
✓ Kubernetes deployment
✓ NGINX ingress
✓ Internal service authentication
```

## Out of Scope

```text
❌ SMS / USSD / IVR
❌ Offline consumer verification
❌ Offline shopkeeper queue
❌ Distributor layer
❌ Shipment-level Merkle verification
❌ Advanced ML anomaly models
❌ Full regulator dashboard
❌ Cold-chain IoT
❌ e-Prescription integration
❌ Image-based packaging CNN
```

---

# 25. Non-Negotiable Architectural Rules

1. **No public access to `pharma-core` or `pharma-backend`.**
2. **No domain microservice talks directly to Fabric.**
3. **Private manufacturer keys never leave `pharma-core`.**
4. **Fabric TLS credentials stay inside `pharma-backend-service`.**
5. **All core requests require service authentication (`X-Service-Token`).**
6. **Fabric remains the immutable event ledger; application databases hold domain data.**
7. **A pack event gets a unique ledger hash (`packHash:MFG`, `packHash:SALE`, `batchId:RECALL`).**
8. **Never invent chaincode function names — confirm the deployed `pharmacc` API first.**
9. **Do not build offline functionality in V1.**
10. **Do not claim blockchain proves medicine quality; it proves registered identity and recorded lifecycle events.**

---

# 26. Final Architecture in One View

```text
                         ┌──────────────────────┐
                         │   Manufacturer Web   │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Shopkeeper Mobile  │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │    Consumer Mobile   │
                         └──────────┬───────────┘
                                    │
                              HTTPS / REST
                                    │
                         ┌──────────▼───────────┐
                         │    NGINX Ingress     │
                         └──────────┬───────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             │                      │                      │
     ┌───────▼────────┐    ┌────────▼───────┐    ┌────────▼───────┐
     │ Manufacturer   │    │  Shopkeeper    │    │   Consumer     │
     │ Service :3001  │    │  Service :3002 │    │   Service :3003│
     └───────┬────────┘    └────────┬───────┘    └────────┬───────┘
             │                      │                      │
             └──────────────────────┼──────────────────────┘
                                    │
                             X-Service-Token
                                    │
                         ┌──────────▼───────────┐
                         │    pharma-core       │
                         │       :4000          │
                         │                      │
                         │  • Key Vault AES-256 │
                         │  • ES256 Signing     │
                         │  • SHA-256 Hashing   │
                         │  • Public JWKS Server│
                         └──────────┬───────────┘
                                    │
                               HTTP REST
                          POST /api/transition
                         Authorization: Bearer
                                    │
                         ┌──────────▼───────────┐
                         │ pharma-backend-svc   │
                         │   Spring Boot :8080  │
                         │                      │
                         │  • Fabric Gateway SDK│
                         │  • OAuth2 Resource   │
                         │  • MSP Crypto Certs  │
                         └──────────┬───────────┘
                                    │
                               gRPC / mTLS
                               Port :7051
                                    │
                         ┌──────────▼───────────┐
                         │  Hyperledger Fabric  │
                         │   pharmacc Chaincode │
                         │   Immutable Ledger   │
                         └──────────────────────┘
```

---

**Last updated: 2026-08-20 | Team PharmaChain | SIH 2026**

---

**Last updated: 2026-08-20 | Team PharmaChain | SIH 2026**
