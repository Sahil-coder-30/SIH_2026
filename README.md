# PharmaChain — Backend Microservices

> **SIH 2026** | Blockchain-powered pharmaceutical supply chain verification platform

---

## Architecture Overview

```
Public Internet / External Clients
      │
      ▼
┌─────────────────┐
│  NGINX Ingress  │  (pharma-ingress)
└────────┬────────┘
         │  routes by path prefix
    ┌────┼──────────────────────────────┐
    │    │                │             │  /.well-known (JWKS)
    ▼    ▼                ▼             ▼
manufacturer        shopkeeper      consumer
 :3001               :3002           :3003
    │                    │             │
    └────────────────────┴─────────────┘
                         │  X-Service-Token (internal ClusterIP)
                         ▼
                  pharma-core :4000
               (Crypto Vault & JWKS Server)
                         │
                         │  RS256 Bearer JWT (RSA-4096)
                         ▼
        ┌───────────────────────────────────┐
        │   Standalone Blockchain Backend   │  (External / Out-of-Cluster)
        │   Java Spring Boot + HL Fabric    │  (Port 8080)
        └───────────────────────────────────┘
```

---

## Services

| Service | Port | DB / Storage | Location | Purpose |
|---|---|---|---|---|
| `pharma-core` | 4000 | JSON Keystore | Kubernetes Pod | ECDSA keygen, AES-256-GCM vault, ES256 signer, RS256 token issuer, JWKS server |
| `manufacturer` | 3001 | MongoDB `manufacturer` | Kubernetes Pod | Manufacturer auth (KYC), batch creation, pack minting, recall |
| `shopkeeper` | 3002 | MongoDB `shopkeeper` | Kubernetes Pod | Shopkeeper auth (KYC), intake/sale scan, inventory tracking |
| `consumer` | 3003 | None (stateless) | Kubernetes Pod | Public QR verification proxy, counterfeit reporting |
| `pharma-backend` | 8080 | Hyperledger Fabric | **External (Outside K8s)** | Blockchain chaincode transactions, Fabric state machine |

---

## Quick Start (Local Dev)

### Prerequisites
- Node.js 20+
- Docker Desktop
- MongoDB (local) **or** run via Docker:
  ```bash
  docker run -d -p 27017:27017 --name pharma-mongo mongo:7.0
  ```

### 1 — Copy environment files
Each service ships with a `.env` file pre-configured for local development.  
For production, fill in the real values and inject via Kubernetes secrets.

```bash
# Nothing to copy — .env files are pre-configured for local dev
# ⚠️  Change all secrets before deploying to production
```

### 2 — Install dependencies
```bash
cd services/pharma-core   && npm install
cd services/manufacturer  && npm install
cd services/shopkeeper    && npm install
cd services/consumer      && npm install
```

### 3 — Run all services (separate terminals)
```bash
cd services/pharma-core   && npm run dev   # :4000
cd services/manufacturer  && npm run dev   # :3001
cd services/shopkeeper    && npm run dev   # :3002
cd services/consumer      && npm run dev   # :3003
```

### 4 — Kubernetes / Skaffold (cluster dev)
```bash
# From repo root — builds images, applies all K8s manifests, hot-reloads
skaffold dev
```

---

## Authentication Flow

### Domain services → pharma-core
Every internal call includes:
```
X-Service-Token: <SERVICE_TOKEN>
```

### Manufacturer / Shopkeeper user sessions
1. `POST /api/manufacturer/auth/register` — creates account, KYC = PENDING
2. Admin sets KYC = APPROVED (direct DB update until admin portal is built)
3. `POST /api/manufacturer/auth/login` — validates KYC, issues **HS256 JWT**
4. All protected routes require: `Authorization: Bearer <token>` (or `mfr_token` / `shop_token` HttpOnly cookie)

### Consumer (public)
No user auth. `POST /api/consumer/verify` is open to all.

---

## API Reference (Auth Endpoints)

### Manufacturer
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/manufacturer/auth/register` | Public | Register manufacturer |
| `POST` | `/api/manufacturer/auth/login` | Public | Login → JWT |
| `POST` | `/api/manufacturer/batch` | JWT | Create batch |
| `POST` | `/api/manufacturer/batch/:id/mint` | JWT | Mint packs via pharma-core |
| `POST` | `/api/manufacturer/batch/:id/recall` | JWT | Recall batch |

### Shopkeeper
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/shopkeeper/auth/register` | Public | Register shopkeeper |
| `POST` | `/api/shopkeeper/auth/login` | Public | Login → JWT |
| `POST` | `/api/shopkeeper/scan/intake` | JWT | Receive pack into inventory |
| `POST` | `/api/shopkeeper/scan/sale` | JWT | Sell pack to consumer |

### Consumer
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/consumer/verify` | Public | Verify QR code (7 UI states) |
| `POST` | `/api/consumer/report` | Public | Report suspicious activity |

### Health Probes (all services)
```
GET /healthz   →  { status: 'ok' }
GET /readyz    →  { status: 'ok' }
```

---

## Environment Variables

### pharma-core (`.env`)
| Variable | Description |
|---|---|
| `PORT` | Service port (default: 4000) |
| `SERVICE_SECRET` | X-Service-Token gate secret |
| `KEY_ENCRYPTION_SECRET` | 64-char hex master key for AES-256-GCM |
| `KEYSTORE_PATH` | Path to JSON keystore file |

### manufacturer / shopkeeper (`.env`)
| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | HS256 signing secret |
| `SERVICE_TOKEN` | Must match pharma-core's `SERVICE_SECRET` |
| `PHARMA_CORE_URL` | Internal URL to pharma-core |

---

## Secrets Management

- **Local dev**: `.env` files (gitignored, pre-filled with dev values)
- **K8s**: [`k8s/secrets.yml`](k8s/secrets.yml.example) (gitignored — use `secrets.yml.example` as template)
- **⚠️ Never commit** real `.env` or `k8s/secrets.yml` to git

---

## Folder Structure

```
SIH_2026/
├── .gitignore
├── skaffold.yml                  ← Skaffold v4beta2 build orchestrator
├── k8s/
│   ├── secrets.yml.example       ← Template (safe to commit)
│   ├── secrets.yml               ← Real secrets (gitignored)
│   ├── ingress.yml
│   ├── pharma-core.{deployment,service}.yml
│   ├── manufacturer.{deployment,service}.yml
│   ├── manufacturer-db.{deployment,service}.yml
│   ├── shopkeeper.{deployment,service}.yml
│   ├── shopkeeper-db.{deployment,service}.yml
│   └── consumer.{deployment,service}.yml
└── services/
    ├── pharma-core/
    │   ├── server.js             ← Entry point
    │   ├── app/app.js            ← Express factory
    │   ├── config/keystore.js    ← JSON keystore R/W
    │   ├── middleware/           ← requireServiceToken
    │   ├── routes/               ← keys, batch, hash, chain, jwks
    │   ├── controllers/
    │   └── services/             ← crypto.service, backendClient.service
    ├── manufacturer/
    │   ├── server.js
    │   ├── app/app.js
    │   ├── config/db.js          ← Mongoose connect
    │   ├── middleware/           ← identifyUser (HS256 JWT)
    │   ├── models/               ← Manufacturer, Batch, Pack schemas
    │   ├── routes/               ← auth, batch
    │   ├── controllers/          ← auth, batch
    │   └── services/             ← coreClient (X-Service-Token)
    ├── shopkeeper/               ← mirrors manufacturer structure
    │   └── models/               ← Shopkeeper, PackEvent, Inventory schemas
    └── consumer/                 ← stateless, no DB
```

---

## TODO (Phase 2)

- [ ] **pharma-core internal signing key** — `signCoreJwt()` to authenticate pharma-core → pharma-backend (marked with `// TODO: Phase 2` in chain & batch controllers)
- [ ] **Admin KYC portal** — approve/reject manufacturers and shopkeepers
- [ ] **Order management** — shopkeeper order requests to manufacturer
- [ ] **QR code generation** — pack `signedToken` → QR image export

---

*Built for Smart India Hackathon 2026*
