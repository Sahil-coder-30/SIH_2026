# 🛠️ PharmaChain — Implementation Plan
### Kubernetes (K8s) & Skaffold Microservices | NGINX Ingress | Hyperledger Fabric | SIH 2026

---

## Architecture — Kubernetes & NGINX Ingress Topology

```
═══════════════════════════════════════════════════════════════════
                    PUBLIC CLIENT INGRESS ROUTING
═══════════════════════════════════════════════════════════════════

  Manufacturer Web App      Shopkeeper Mobile App       Consumer Mobile App
  (React / Port 5173)       (React Native / Port 5174)  (React Native)
           │                             │                           │
           └─────────────────────────────┼───────────────────────────┘
                                         │ HTTPS / REST
                                         ▼
                      ┌────────────────────────────────────┐
                      │    Shared NGINX Ingress Gateway    │
                      │         (k8s/ingress.yml)          │
                      └──────────────────┬─────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │ /api/manufacturer              │ /api/shopkeeper                │ /api/consumer
        ▼                                ▼                                ▼
  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
  │  manufacturer-service   │  │   shopkeeper-service    │  │    consumer-service     │
  │  ClusterIP :80 (Port 3001)│  │  ClusterIP :80 (Port 3002)│  │  ClusterIP :80 (Port 3003)│
  │  [own Postgres DB]      │  │  [own Postgres DB]      │  │  [Stateless]            │
  └────────────┬────────────┘  └────────────┬────────────┘  └────────────┬────────────┘
               │                            │                            │
               └────────────────────────────┼────────────────────────────┘
                                            │ http://pharma-core-service:80
                                            ▼
                           ┌─────────────────────────────────┐
                           │       pharma-core-service       │
                           │  ClusterIP :80 (TargetPort 4000)│
                           │  ─────────────────────────────  │
                           │  • ZERO Ingress Exposure        │
                           │  • Holds private key vault      │
                           │  • Generates pack hashes        │
                           │  • Signs ES256/RS256 JWT tokens │
                           │  • Hosts /.well-known/jwks.json │
                           └────────────────┬────────────────┘
                                            │ http://pharma-backend-service:80
                                            │ (Authorization: Bearer <JWT>)
                                            ▼
                           ┌─────────────────────────────────┐
                           │      pharma-backend-service     │
                           │  ClusterIP :80 (TargetPort 8080)│
                           │  ─────────────────────────────  │
                           │  • Spring Boot 4.1.0 Gateway    │
                           │  • Fabric Gateway SDK 1.5.1     │
                           │  • Validates JWKS from Core     │
                           └────────────────┬────────────────┘
                                            │ gRPC / mTLS
                                            ▼
                           ┌─────────────────────────────────┐
                           │       Hyperledger Fabric        │
                           │       pharmacc chaincode        │
                           │       ✅ DONE                   │
                           └─────────────────────────────────┘

═══════════════════════════════════════════════════════════════════
```

### Architectural Safeguards

| Concern | How it's solved in Kubernetes |
|---|---|
| Private keys never exposed to internet | `pharma-core-service` is an internal `ClusterIP` omitted from `ingress.yml` |
| Blockchain certs never on internet-facing services | Only `pharma-backend-service` mounts crypto material via `k8s/secrets.yml` |
| Path-based routing & single ingress | Single `k8s/ingress.yml` proxies `/api/manufacturer`, `/api/shopkeeper`, `/api/consumer` |
| Inter-service cluster networking | All services expose standard cluster-internal `port: 80` (targetPort maps to app port) |
| Local hot-reload development | Single `skaffold.yml` manages fast live code sync (`src/**`) with `tagPolicy: sha256: {}` |

---

## ✅ What the Blockchain Actually Has (from `flow.md`)

> **Read this before writing any `pharma-core` code.**

The blockchain engineer has built a **complete, working system**.

### The `Transition` Object (stored on-chain)

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

**Key = `hash` field.** Every transition is a separate record on the ledger — it is an **event log**, not a mutable status row.

### Chaincode Functions (confirm names before writing anything)

| Function | Type | Args | Error thrown |
|---|---|---|---|
| `recordTransition` | Write | `hash, fromId, toId, sellingDate, sellingTime, sellerId` | `TRANSITION_ALREADY_EXISTS` if hash exists |
| `getTransitionByHash` | Read | `hash` | `TRANSITION_NOT_FOUND` if missing |
| `TransitionExists` | Read | `hash` | — |
| `queryTransition` | Read | `fromId, toId, hash` (all optional, pass `""` to skip) | — |
| `GetAllTransitions` | Read | none | — |

### pharma-backend REST API (already running on :8080)

```
POST  /api/transition          → calls recordTransition on-chain
GET   /api/transition/{hash}   → calls getTransitionByHash
GET   /api/transition?fromId=&toId=&hash=   → calls queryTransition
```

### How Pack Events Map to Transitions

The chain stores **one Transition per event** (append-only). A pack's full history is a sequence of Transitions:

```
Manufacture:  { hash: packHash+":MFG",    fromId: "MINTED",   toId: mfrId,      sellerId: mfrOperator }
Intake:       { hash: packHash+":INTAKE", fromId: mfrId,      toId: shopId,     sellerId: shopkeeperOp }
Sale:         { hash: packHash+":SALE",   fromId: shopId,     toId: "CONSUMER", sellerId: shopkeeperOp }
Recall:       { hash: batchId+":RECALL",  fromId: mfrId,      toId: "RECALLED", sellerId: mfrOperator }
```

> ⚠️ **Confirm the hash-naming convention with the blockchain engineer before Day 1.**
> Since `recordTransition` rejects duplicate hashes, each event needs a distinct hash key.
> The `:MFG` / `:INTAKE` / `:SALE` suffix pattern above is the suggested approach — confirm it.

### "What is this pack's current status?" Query Pattern

Since there's no mutable status field, determine status by checking which transitions exist:

```typescript
// pharma-core: determine pack status
async function getPackStatus(packHash: string): Promise<PackStatus> {
  // Check for SALE event first (most common query)
  const saleRes = await fetch(`http://pharma-backend:8080/api/transition/${packHash}:SALE`);
  if (saleRes.ok) return { status: 'Sold', ...(await saleRes.json()) };

  // Check for RECALL on the batch
  const batchId = await getBatchIdForPack(packHash);  // from your own DB
  const recallRes = await fetch(`http://pharma-backend:8080/api/transition/${batchId}:RECALL`);
  if (recallRes.ok) return { status: 'Recalled', ...(await recallRes.json()) };

  // Check for INTAKE
  const intakeRes = await fetch(`http://pharma-backend:8080/api/transition/${packHash}:INTAKE`);
  if (intakeRes.ok) return { status: 'AtShop', ...(await intakeRes.json()) };

  // Check manufacture registration
  const mfgRes = await fetch(`http://pharma-backend:8080/api/transition/${packHash}:MFG`);
  if (mfgRes.ok) return { status: 'Packaged' };

  return { status: 'NOT_FOUND' };  // hash not on chain at all
}
```

---

## Services & Ports

| Service | Port | Exposed? | DB | Secrets it holds |
|---|---|---|---|---|
| `manufacturer-svc` | 3001 | ✅ Public | Postgres | JWT (user auth only) |
| `shopkeeper-svc` | 3002 | ✅ Public | Postgres | JWT (user auth only) |
| `consumer-svc` | 3003 | ✅ Public | None | JWT (user auth only) |
| **`pharma-core`** | **4000** | **❌ Internal only** | None | **Private keys, Fabric TLS certs, `SERVICE_SECRET`** |
| `manufacturer-db` | 5432 | ❌ Internal | — | — |
| `shopkeeper-db` | 5433 | ❌ Internal | — | — |
| Fabric peers/orderer | 7050–9054 | ❌ Internal | — | — |

---

## Docker Compose

```yaml
version: '3.9'

networks:
  internal:        # pharma-core + fabric — never exposed
    internal: true
  public:          # app services — nginx proxies these

services:

  # ── App Services (internet-facing) ──────────────────────────────

  manufacturer-svc:
    build: ./services/manufacturer
    ports: ["3001:3001"]
    networks: [public, internal]
    environment:
      DATABASE_URL: postgres://pharma:pharma@manufacturer-db:5432/manufacturer
      PHARMA_CORE_URL: http://pharma-core:4000
      SERVICE_TOKEN: ${SERVICE_TOKEN}           # shared secret for internal calls
      JWT_SECRET: ${MANUFACTURER_JWT_SECRET}

  shopkeeper-svc:
    build: ./services/shopkeeper
    ports: ["3002:3002"]
    networks: [public, internal]
    environment:
      DATABASE_URL: postgres://pharma:pharma@shopkeeper-db:5432/shopkeeper
      PHARMA_CORE_URL: http://pharma-core:4000
      SERVICE_TOKEN: ${SERVICE_TOKEN}
      JWT_SECRET: ${SHOPKEEPER_JWT_SECRET}

  consumer-svc:
    build: ./services/consumer
    ports: ["3003:3003"]
    networks: [public, internal]
    environment:
      PHARMA_CORE_URL: http://pharma-core:4000
      SERVICE_TOKEN: ${SERVICE_TOKEN}

  # ── Core (internal only) ─────────────────────────────────────────

  pharma-core:
    build: ./services/pharma-core
    networks: [internal]          # ← NO port mapping to host
    environment:
      SERVICE_SECRET: ${SERVICE_SECRET}         # verifies incoming X-Service-Token
      KEY_ENCRYPTION_SECRET: ${KEY_ENC_SECRET}  # encrypts manufacturer private keys at rest
      PEER_ENDPOINT: peer0.org1.example.com:7051
      FABRIC_MSP_ID: Org1MSP
      # Fabric TLS cert paths (mounted volume)
    volumes:
      - ./crypto-config:/crypto-config:ro

  # ── Databases ────────────────────────────────────────────────────

  manufacturer-db:
    image: postgres:16
    networks: [internal]
    environment: { POSTGRES_USER: pharma, POSTGRES_PASSWORD: pharma, POSTGRES_DB: manufacturer }

  shopkeeper-db:
    image: postgres:16
    networks: [internal]
    environment: { POSTGRES_USER: pharma, POSTGRES_PASSWORD: pharma, POSTGRES_DB: shopkeeper }
```

---

## pharma-core — Full Spec

This is the most critical service. Build this first.

### Internal Auth — Service Token

Every request to `pharma-core` must include:
```
X-Service-Token: <SERVICE_TOKEN value from env>
```

`pharma-core` middleware:
```typescript
// services/pharma-core/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';

export function requireServiceToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-service-token'];
  if (!token || token !== process.env.SERVICE_SECRET) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid service token' });
  }
  next();
}
```

Apply to all routes: `app.use(requireServiceToken)`.

### pharma-core API Endpoints

```
POST  /core/keys/generate          Generate ES256 key pair for a manufacturer
GET   /core/keys/public/:mfrId     Return public key PEM (safe to share with apps)

POST  /core/batch/mint             Generate all signed tokens + hashes for a batch
                                   → returns JSON array (see below)

POST  /core/hash/verify            Verify a JWT token: Tier-1 signature check only
GET   /core/hash/status/:hash      Query blockchain for pack status (Tier-2)

POST  /core/chain/intake           Write AtShop event to blockchain
POST  /core/chain/sale             Write Sold event to blockchain
POST  /core/chain/recall           Write Recall to blockchain

GET   /core/health                 Internal health check (no auth needed)
```

### Core Data Flow — Batch Minting

```
manufacturer-svc                    pharma-core
     │                                   │
     │  POST /core/batch/mint            │
     │  X-Service-Token: <secret>        │
     │  { batchId, manufacturerId,       │
     │    medicineName, expiryDate,      │
     │    quantity }                     │
     │ ─────────────────────────────────►│
     │                                   ├─ Fetch encrypted private key for mfrId
     │                                   ├─ Decrypt private key in memory
     │                                   ├─ For each serial 1..quantity:
     │                                   │   payload = { batchId, serial, expiryDate, manufacturerId }
     │                                   │   signedJWT = ES256.sign(payload, privKey)
     │                                   │   packHash  = SHA256(signedJWT)
     │                                   ├─ Build Merkle root of all packHashes
     │                                   ├─ Write all hashes to Fabric (pharmacc)
     │                                   └─ Return JSON array
     │ ◄─────────────────────────────────│
     │
     │  Response:
     │  {
     │    batchId: "BATCH-001",
     │    merkleRoot: "abc123...",
     │    packs: [
     │      { serial: "00001", packHash: "e3b0...", signedToken: "eyJ..." },
     │      { serial: "00002", packHash: "5891...", signedToken: "eyJ..." },
     │      ...
     │    ]
     │  }
     │
     ├─ Save packs to local DB (packs table)
     ├─ Generate QR images from signedToken
     └─ Package as downloadable CSV
```

### Core Data Flow — Scan Verify (Shopkeeper / Consumer)

```
shopkeeper-svc / consumer-svc           pharma-core
     │                                       │
     │  POST /core/hash/verify               │
     │  { signedToken }                      │
     │ ─────────────────────────────────────►│
     │                                       ├─ Decode JWT → get manufacturerId
     │                                       ├─ Fetch public key for mfrId
     │                                       ├─ Verify ES256 signature
     │                                       ├─ Extract { batchId, serial, expiryDate }
     │ ◄─────────────────────────────────────│
     │  { valid: true, payload: { ... } }    │
     │                                       │
     │  GET /core/hash/status/:hash ─────────►
     │                                       ├─ Call pharmacc.evaluateTransaction('GetStatus', hash)
     │ ◄─────────────────────────────────────│
     │  { status: 'Sold', soldAt, soldBy }   │
```

### pharma-core — Key Storage

Private keys are stored **encrypted at rest** in a simple key store (JSON file or Redis — not a full DB, since pharma-core is stateless for everything else):

```typescript
// services/pharma-core/src/lib/keystore.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import fs from 'fs';

const KEY_STORE_PATH = '/data/keystore.json';  // mounted volume

type KeyStore = Record<string, { encryptedPrivKey: string; publicKeyPem: string }>;

export function storeKeyPair(mfrId: string, privKeyPem: string, pubKeyPem: string): void {
  const store: KeyStore = readStore();
  const iv = randomBytes(16);
  const masterKey = scryptSync(process.env.KEY_ENCRYPTION_SECRET!, mfrId, 32);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(privKeyPem), cipher.final()]);
  const authTag = cipher.getAuthTag();
  store[mfrId] = {
    encryptedPrivKey: `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`,
    publicKeyPem: pubKeyPem,
  };
  fs.writeFileSync(KEY_STORE_PATH, JSON.stringify(store));
}

export function getPrivateKey(mfrId: string): string {
  const store: KeyStore = readStore();
  const entry = store[mfrId];
  if (!entry) throw new Error(`No key for manufacturer ${mfrId}`);
  const [ivHex, authTagHex, encHex] = entry.encryptedPrivKey.split(':');
  const masterKey = scryptSync(process.env.KEY_ENCRYPTION_SECRET!, mfrId, 32);
  const decipher = createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
}

export function getPublicKey(mfrId: string): string {
  const store: KeyStore = readStore();
  return store[mfrId]?.publicKeyPem ?? null;
}

function readStore(): KeyStore {
  if (!fs.existsSync(KEY_STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(KEY_STORE_PATH, 'utf8'));
}
```

---

## Manufacturer Service — QR CSV Generation

After `pharma-core` returns the JSON array of packs, manufacturer-svc generates QR codes and packages them as a downloadable file:

```typescript
// services/manufacturer/src/lib/qr-export.ts
import QRCode from 'qrcode';
import { createObjectCsvWriter } from 'csv-writer';
import archiver from 'archiver';
import path from 'path';
import fs from 'fs';

interface PackData {
  serial: string;
  packHash: string;
  signedToken: string;
}

// Option A: CSV with hash strings (lightweight, frontend renders QRs)
export async function generateCSV(batchId: string, packs: PackData[]): Promise<string> {
  const filePath = `/tmp/batch-${batchId}.csv`;
  const writer = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'serial',      title: 'Serial' },
      { id: 'packHash',    title: 'Hash' },
      { id: 'signedToken', title: 'QR_Data' },  // the string to encode into QR
    ],
  });
  await writer.writeRecords(packs);
  return filePath;
}

// Option B: ZIP of QR PNGs (heavier but print-ready)
export async function generateQRZip(batchId: string, packs: PackData[], medicineName: string): Promise<string> {
  const zipPath = `/tmp/batch-${batchId}-qr.zip`;
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip');
  archive.pipe(output);

  for (const pack of packs) {
    // signedToken is what gets encoded into the QR
    const qrBuffer = await QRCode.toBuffer(pack.signedToken, { width: 300, margin: 1 });
    archive.append(qrBuffer, { name: `${medicineName}-${pack.serial}.png` });
  }

  await archive.finalize();
  return zipPath;
}
```

**Endpoint:**

```typescript
// GET /api/batch/:id/download?format=csv|zip
router.get('/api/batch/:id/download', async (req, res) => {
  const packs = await db.query('SELECT serial, pack_hash, signed_token FROM packs WHERE batch_id = $1', [req.params.id]);
  const format = req.query.format ?? 'csv';

  if (format === 'csv') {
    const filePath = await generateCSV(req.params.id, packs.rows);
    res.download(filePath, `batch-${req.params.id}.csv`);
  } else {
    const zipPath = await generateQRZip(req.params.id, packs.rows, packs.rows[0]?.medicine_name);
    res.download(zipPath, `batch-${req.params.id}-qr.zip`);
  }
});
```

---

## Each Application Service — What They Own

### manufacturer-svc (3001)

```
Owns:
  - Manufacturer registration + KYC
  - Batch creation (calls pharma-core to mint)
  - QR/CSV download
  - Shipment dispatch (calls pharma-core to record)
  - Recall trigger (calls pharma-core)
  - View incoming shopkeeper orders
  - Own Postgres: manufacturers, batches, packs, orders, shipments

Does NOT own:
  - Any private keys (pharma-core holds these)
  - Any blockchain calls (pharma-core does these)
  - Signing logic (pharma-core does this)
```

### shopkeeper-svc (3002)

```
Owns:
  - Shopkeeper registration + KYC
  - Intake scan → calls pharma-core /core/hash/verify + /core/chain/intake
  - Sale scan   → calls pharma-core /core/hash/verify + /core/chain/sale
  - Stock dashboard (queries own DB — pack_events table)
  - Place orders to manufacturers
  - Own Postgres: shopkeepers, pack_events, orders

Does NOT own:
  - Signature verification (asks pharma-core)
  - Any blockchain writes (asks pharma-core)
```

### consumer-svc (3003)

```
Owns:
  - Scan verify → calls pharma-core /core/hash/verify + /core/hash/status/:hash
  - Submit suspicious report (writes to shared or own lightweight store)
  - No database (fully stateless)

Does NOT own:
  - Anything crypto or chain-related
```

### pharma-core (4000 — internal)

```
Owns:
  - ALL private keys (encrypted at rest)
  - ALL Fabric TLS certificates
  - ALL Fabric Gateway connections
  - Hash generation (SHA256 of signedJWT)
  - JWT signing (ES256)
  - JWT verification
  - All chaincode calls (read + write)
  - Public key distribution

Exposes:
  - HTTP API, internal network only
  - Every request must carry X-Service-Token
```

---

## Build Order

### Day 1 — pharma-core first (blocks everything else)

```
[ ] Project skeleton: monorepo, Docker Compose up with all containers
[ ] pharma-core: service token middleware
[ ] pharma-core: POST /core/keys/generate
[ ] pharma-core: GET /core/keys/public/:mfrId
[ ] pharma-core: POST /core/hash/verify (JWT verify, Tier-1 only — no chain yet)
[ ] pharma-core: GET /core/health
[ ] Test all above with curl/Postman from another container
```

### Day 1 PM — Connect pharma-core to Fabric

```
[ ] pharma-core: Fabric gateway client setup (fabric-network Node SDK)
    Confirm chaincode function names with blockchain eng (see table below)
[ ] pharma-core: GET /core/hash/status/:hash
[ ] pharma-core: POST /core/chain/intake
[ ] pharma-core: POST /core/chain/sale
[ ] pharma-core: POST /core/chain/recall
[ ] pharma-core: POST /core/batch/mint (sign all tokens + register on chain)
[ ] Test end-to-end: mint 5 packs → check status on chain
```

### Day 2 — manufacturer-svc

```
[ ] Auth (register, login, JWT)
[ ] POST /api/batch → calls pharma-core /core/batch/mint → saves packs to DB
[ ] GET /api/batch/:id/download?format=csv → returns CSV with hash + QR data strings
[ ] POST /api/batch/:id/recall → calls pharma-core /core/chain/recall
[ ] GET /api/keys/:mfrId → proxies pharma-core /core/keys/public/:mfrId (public, no service token)
```

### Day 2 PM — shopkeeper-svc

```
[ ] Auth (register, login, JWT)
[ ] POST /api/scan/intake → pharma-core verify + chain write + local DB insert
[ ] POST /api/scan/sale   → pharma-core verify + chain write + local DB insert
    Handle all error codes: ALREADY_SOLD, RECALLED, PACK_NOT_AT_SHOP, EXPIRED
[ ] GET /api/stock → aggregate from pack_events
[ ] GET /api/stock/expiry-alerts
```

### Day 3 — consumer-svc + frontends

```
[ ] POST /api/verify → pharma-core verify + status → map to 7 UI states
[ ] POST /api/report → store report
[ ] Web frontend: manufacturer batch creation + CSV download
[ ] Mobile: shopkeeper intake + sale scan
[ ] Mobile: consumer scan + result display
```

---

## Chaincode Functions — Confirm With Blockchain Eng

> You cannot write the pharma-core Fabric client until these are confirmed.

| Operation | Expected function name | Args | Returns |
|---|---|---|---|
| Register pack at mint | `RegisterMedicine` | `(hash, batchId, mfrId, expiryDate)` | — |
| Record intake at shop | `RecordIntake` | `(hash, shopId)` | — |
| Record sale | `SellMedicine` | `(hash, shopId, timestamp)` | — |
| Recall batch | `RecallBatch` | `(batchId, reason)` | — |
| Query pack status | `GetMedicineStatus` | `(hash)` | `{ status, soldAt, soldBy, batchId }` |

**Bulk mint**: ask if `pharmacc` supports registering an array of hashes in one transaction — critical for batches of 1000+ packs (avoids 1000 individual Fabric invocations).

---

## API Error Contract (all services)

```typescript
// All errors returned as:
{ code: string, message: string, data?: any }

// Codes:
'INVALID_SIGNATURE'    // pharma-core: JWT verify failed
'ALREADY_SOLD'         // chain: pack already sold — { soldAt, soldBy } in data
'PACK_NOT_AT_SHOP'     // shopkeeper: no AtShop event for this pack at this shop
'RECALLED'             // chain: batch recalled — { reason } in data
'EXPIRED'              // expiryDate < today
'DUPLICATE_INTAKE'     // this pack already scanned AtShop at this shop
'NOT_FOUND'            // hash not on chain = genuine unsold stock (not an error for consumer)
'UNAUTHORIZED'         // missing user JWT (public-facing) or service token (internal)
'KYC_PENDING'          // manufacturer/shopkeeper not yet approved
'CHAIN_ERROR'          // Fabric call failed — log internally, return 502 to caller
```

---

## .env Template

```env
# ── Shared ──
SERVICE_TOKEN=pharmachain-internal-token-change-in-prod

# ── pharma-core only ──
SERVICE_SECRET=pharmachain-internal-token-change-in-prod   # same value as SERVICE_TOKEN
KEY_ENCRYPTION_SECRET=64-char-hex-string
PEER_ENDPOINT=peer0.org1.example.com:7051
FABRIC_MSP_ID=Org1MSP

# ── manufacturer-svc ──
DATABASE_URL=postgres://pharma:pharma@manufacturer-db:5432/manufacturer
PHARMA_CORE_URL=http://pharma-core:4000
JWT_SECRET=manufacturer-jwt-secret

# ── shopkeeper-svc ──
DATABASE_URL=postgres://pharma:pharma@shopkeeper-db:5432/shopkeeper
PHARMA_CORE_URL=http://pharma-core:4000
JWT_SECRET=shopkeeper-jwt-secret

# ── consumer-svc ──
PHARMA_CORE_URL=http://pharma-core:4000
```

---

## Out of Scope — V1

- ❌ SMS / USSD
- ❌ Merkle shipment-level verification
- ❌ Distributor layer
- ❌ Regulator dashboard (partial heatmap only)
- ❌ ML anomaly models (rule-based flags only, if time)
- ❌ Offline shopkeeper queue

---

*Last updated: 2026-08-20 | Team PharmaChain | SIH 2026*
