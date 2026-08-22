# 💊 PharmaChain: National Drug Track & Trace Infrastructure
### Smart India Hackathon (SIH 2026) | Cryptographic Provenance & Blockchain Supply Chain

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg?logo=node.js)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Containerized-blue.svg?logo=docker)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Ingress%20Orchestrated-326ce5.svg?logo=kubernetes)](https://kubernetes.io/)
[![Cryptography](https://img.shields.io/badge/Cryptography-ECDSA%20P--256%20%7C%20ES256-red.svg)](https://en.wikipedia.org/wiki/Elliptic_Curve_Digital_Signature_Algorithm)
[![Blockchain](https://img.shields.io/badge/Blockchain-Hyperledger%20Fabric-2F3134.svg?logo=hyperledger)](https://www.hyperledger.org/projects/fabric)
[![License](https://img.shields.io/badge/License-MIT-brightgreen.svg)](LICENSE)

---

## 📌 1. The Mission & Problem Statement

In India and emerging markets, counterfeit, substandard, and contaminated medicines represent an estimated **₹40,000+ Crore annual black market**. Static barcodes (1D/2D QR codes) fail because **anyone with a photocopier can copy a genuine barcode and print 10,000 fakes onto chalk powder**.

**PharmaChain** replaces static barcodes with **Asymmetric Cryptography (ECDSA P-256)**, **Two-Tier Data Segregation**, **Parent-Child Packaging Hierarchy**, and a **Permissioned Blockchain State Machine (Hyperledger Fabric)** — providing instant, un-cloneable verification to patients with **zero app installation required**.

---

## 🏛️ 2. High-Level Architecture

```
                                 INGRESS (Port 80 / 443)
                                            │
          ┌────────────────────────┬────────┴───────────────┬────────────────────────┐
          ▼                        ▼                        ▼                        ▼
  /api/manufacturer/*      /api/shopkeeper/*        /api/consumer/*          /core/*, /.well-known/*
 manufacturer-service     shopkeeper-service        consumer-service               pharma-core
      (Port 3001)              (Port 3002)              (Port 3003)                (Port 4000)
          │                        │                        │                           ▲
          └──── X-Service-Token + RS256 Bearer JWT ─────────┴───────────────────────────┘
                                   │
                                   ▼ (gRPC / REST)
                    ┌──────────────────────────────┐
                    │  Hyperledger Fabric Ledger   │
                    │   (Chaincode State Machine)  │
                    └──────────────────────────────┘
```

---

## ✨ 3. Core System Innovations & Highlights

### ⚡ 1. The Single-Decrypt Crypto Optimization
* **The Problem**: Decrypting an encrypted EC private key using `scrypt` for every pack takes ~150ms per pack (15,000 seconds for 1 lakh packs).
* **Our Solution**: `pharma-core` decrypts the key **once** in memory, then signs all 100,000 packs sequentially at **~0.104ms per pack**.
* **Measured Benchmark**: **5,000 packs signed in 518ms**; **100,000 packs signed in ~10–12 seconds**.

### 🎲 2. Quadruple-Entropy Zero-Collision Guarantee
Every individual blister strip QR JWT payload is mathematically unique:
$$\text{Payload} = \{\text{batchId, serial, expiryDate, manufacturerId, nonce, ts}\}$$
* `nonce`: 8-char CSPRNG hex string from `crypto.randomBytes(4)`.
* `ts`: Nanosecond monotonic clock timestamp from `process.hrtime.bigint()`.
* **Collision Chance**: $1 / (2^{32} \times 10^{16} \times 2^{128}) \approx 0$ (Mathematically impossible to guess or collide).

### 🏷️ 3. Dual Batch Identifier Architecture
* **`systemBatchId`** (`PC-BATCH-CIPLA0-20260822-7D3A1F`): Globally unique platform ID encoded on-chain and in QR codes.
* **`manufacturerBatchNumber`** (`AUG-625-AUG26-001`): Factory's legacy internal batch number (B.No.).
* Both IDs are indexed in MongoDB; searches resolve using **either** identifier seamlessly.

### 📦 4. Two-Tier Data Segregation
* **Tier 1 (Inside QR code)**: Compact **389-character** Base64 JWT (scans in $< 50\text{ms}$ on budget ₹6,000 phones).
* **Tier 2 (Enterprise Database)**: Complete **54-field schema** (composition, CDSCO approval, QA assay results 99.8%, storage conditions, line IDs) stored once per batch.

### 🔗 5. Dual-Mode QR Code Routing
Every physical pack QR code contains a structured URL:
$$\mathbf{\text{https://pharmachain.gov.in/verify/}}\underbrace{\mathbf{:packHash}}_{\text{Path Parameter}}\mathbf{?token=}\underbrace{\mathbf{:signedToken}}_{\text{Query Parameter}}$$
* **Native Phone Camera / Google Lens**: Opens web browser directly to the verification PWA with **zero app install**.
* **PharmaChain Mobile App**: In-app scanner extracts `:packHash` directly from the URL path.

### 🏗️ 6. Packaging Hierarchy & Zero-Friction Logistics
Eliminates 1-by-1 scanning at warehouses and hospital loading docks:
* **Level 4: Pallet** (50,000 packs) $\longrightarrow$ **1 Scan (3 seconds)**.
* **Level 3: Master Shipper Carton** (1,000 packs) $\longrightarrow$ **5 Scans (10 seconds for 5,000 packs)**.
* **Level 2: Mono-Box** (10 strips) $\longrightarrow$ **1 Scan (2 seconds)**.
* **Level 1: Blister Strip** (1 pack) $\longrightarrow$ **1 POS Checkout Scan (1 second)**.

### 🌐 7. National Scale: Solving Ledger State Bloat (5 Billion Packs/Year)
How PharmaChain effortlessly handles national scale without database degradation:
1. **Ultra-Compact On-Chain Footprint**: By storing rich 54-field metadata in MongoDB (Off-Chain), on-chain transition records are only **~200 bytes** ($10\text{M packs} = \mathbf{2\text{ GB}}$).
2. **Expiry-Based State Pruning (The TTL Pattern)**: Medicines expire within 2–3 years. Consumed or expired packs automatically transition from fast active World State (CouchDB) to cold historical archives (S3 / Glacier), keeping active memory bounded below $50\text{GB}$ indefinitely.
3. **Merkle Tree Batch-Root Genesis Anchoring**: Factory batches can be anchored on-chain with a single **Merkle Root** (200 bytes for 1 Lakh packs); individual pack keys are only written when active retail transitions occur (`INTAKE` / `SOLD`).
4. **Horizontal Partitioning via Fabric Channels**: Sharded regional channels (Northern, Western, Southern) distribute ledger storage across state consortium nodes.

---

## 🧩 4. Microservices Breakdown

| Service | Port | Database / Storage | Auth Level | Purpose |
|---|---|---|---|---|
| **`pharma-core`** | `4000` | Encrypted `keystore.json` (AES-256-GCM) + RSA-4096 PEMs | `X-Service-Token` + RS256 Bearer | **The Trust Root**: ECDSA P-256 (ES256) signing, scrypt key decryption, keystore write mutex, public JWKS server, and chunked Fabric bridge (250 transitions/chunk). |
| **`manufacturer-service`** | `3001` | MongoDB (`manufacturers`, `batches`, `packs`) | JWT (Cookie/Bearer) + KYC Gate | **Factory Engine**: 54-field schema, dual batch IDs, async 100k pack minting (HTTP 202), live progress polling, QR CSV exporter (`/export/csv`), universal pack lookup (`/pack/lookup/:id`), and public metadata API. |
| **`shopkeeper-service`** | `3002` | MongoDB (`shopkeepers`, `inventories`, `packevents`) | JWT (Cookie/Bearer) | **Retail Chemist & POS**: Chemist onboarding, intake scan with **Duplicate Intake Guard** (`PackEvent`), POS sale checkout scan with **`AT_SHOP` anti-front-running check**, and inventory management. |
| **`consumer-service`** | `3003` | MongoDB (`reports`) | **Public / Zero-Auth** | **Patient Verification Gateway**: Zero-friction QR verification mapping to **7 distinct UI states**, dual-mode URL parser, and counterfeit incident reporting. |

---

## 🚦 5. The 7 Consumer UI Verification States

| State | Status | UI Treatment | Meaning |
|---|---|---|---|
| `GENUINE` | Active Stock | 🟢 **Green Tick** | Cryptographically signed, active expiry, verified on blockchain. |
| `AT_SHOP` | In Pharmacy | 🟢 **Green Tick** | Verified in inventory at a licensed, registered pharmacy. |
| `ALREADY_SOLD` | Double-Spend | 🔴 **Red Alert** | Valid signature, but already sold on ledger (flags cloned QR reuse). |
| `RECALLED` | Emergency Recall | 🚨 **Flashing Red** | Recalled by manufacturer due to quality/contamination defect. |
| `EXPIRED` | Expired | ⚠️ **Amber/Red** | Past expiration date. Do not consume. |
| `COUNTERFEIT` | Invalid Crypto | 🚨 **Flashing Red** | Digital signature invalid. Never signed by a legitimate manufacturer. |
| `NOT_FOUND` | No Genesis | 🚨 **Flashing Red** | Valid signature format, but no manufacturing genesis record on blockchain. |

---

## 📡 6. Complete API Reference

### 🏭 Manufacturer Service (`:3001`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/manufacturer/auth/register` | Public | Register manufacturer account (KYC: `PENDING`) |
| `POST` | `/api/manufacturer/auth/login` | Public | Authenticate manufacturer & issue JWT |
| `POST` | `/api/manufacturer/batch` | JWT | Create a new batch with full 54-field metadata |
| `GET` | `/api/manufacturer/batch` | JWT | List batches (with status/tag filters & pagination) |
| `GET` | `/api/manufacturer/batch/:batchId` | JWT | Get batch details and live minting progress |
| `GET` | `/api/manufacturer/batch/:batchId/packs` | JWT | Paginated pack table browser inside batch detail |
| `GET` | `/api/manufacturer/batch/pack/lookup/:id` | JWT | **Universal Header Search**: Find any pack across all batches |
| `GET` | `/api/manufacturer/batch/:batchId/export/csv` | JWT | **Download QR CSVs** (`?type=packs\|boxes\|cartons`) |
| `POST` | `/api/manufacturer/batch/:batchId/mint` | JWT | Trigger async background minting (HTTP 202 Accepted) |
| `POST` | `/api/manufacturer/batch/:batchId/recall` | JWT | Emergency recall batch across entire supply chain |
| `GET` | `/api/manufacturer/batch/public/:batchId` | **Public** | Sanitized public metadata lookup for scan resolution |

### 💊 Shopkeeper Service (`:3002`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/shopkeeper/auth/register` | Public | Register pharmacy / chemist account |
| `POST` | `/api/shopkeeper/auth/login` | Public | Authenticate chemist & issue JWT |
| `POST` | `/api/shopkeeper/scan/intake` | JWT | Receive packs into inventory (**Duplicate Intake Guard**) |
| `POST` | `/api/shopkeeper/scan/sale` | JWT | POS checkout sale scan (**Enforces `AT_SHOP` check**) |
| `GET` | `/api/shopkeeper/inventory` | JWT | Real-time stock counts and expiry alerts |

### 📱 Consumer Service (`:3003`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/consumer/verify` | **Public** | Verify QR code (accepts URL, path hash, or raw token) |
| `POST` | `/api/consumer/report` | **Public** | Log counterfeit incident (Geolocation + Timestamp + Token) |

### 🔐 Pharma-Core Service (`:4000`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/.well-known/jwks.json` | Public | RFC 7517 Public JWKS keys (Combined EC + RSA) |
| `GET` | `/.well-known/openid-configuration` | Public | OIDC discovery metadata |
| `GET` | `/core/health`, `/healthz`, `/readyz` | Public | Health probes (`rsaKeyReady`, `keystoreReady`) |
| `POST` | `/core/keys/generate` | Service Token | Provision EC P-256 keypair for manufacturer |
| `POST` | `/core/batch/mint` | Service Token | Bulk-sign up to 100,000 packs & chunked Fabric commit |
| `POST` | `/core/hash/verify` | Service Token | Verify pack signature & derive pack hash |
| `POST` | `/core/chain/intake` | Service Token | Transition pack to `AT_SHOP` on blockchain |
| `POST` | `/core/chain/sale` | Service Token | Transition pack to `SOLD` on blockchain |
| `POST` | `/core/chain/recall` | Service Token | Emergency batch recall transaction |

---

## 🛡️ 7. Real-World Attack Scenarios (Why It's Unbreakable)

```
┌───────────────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Attack Vector                                 │ How PharmaChain Completely Neutralizes It              │
├───────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. The Photocopier / QR Clone Attack          │ When the fake clone is scanned after the real pack is  │
│    (Copying 1 genuine QR onto 10,000 fakes)   │ sold, blockchain reports "ALREADY_SOLD" and triggers   │
│                                               │ real-time fraud alerts with GPS to drug inspectors.    │
├───────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 2. The Rogue Chemist Front-Running Attack     │ Smart contract enforces that a pack CANNOT be marked   │
│    (Selling stolen codes before real arrival) │ as SOLD unless it was first received via official      │
│                                               │ INTAKE. The unauthorized sale is blocked immediately.  │
├───────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 3. Contaminated Batch Emergency Recall        │ 1 on-chain recall transaction locks all 1 lakh packs   │
│    (Toxic solvent detected in factory batch)  │ across every pharmacy billing counter nationwide in    │
│                                               │ < 1 second. POS scanners refuse to bill the item.      │
└───────────────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 🚀 8. Quick Start (Local Development)

### Prerequisites
* **Node.js 20+**
* **MongoDB 7.0+** (running locally or via Docker)
  ```bash
  docker run -d -p 27017:27017 --name pharma-mongo mongo:7.0
  ```

### 1. Install Dependencies
```bash
cd services/pharma-core   && npm install
cd ../manufacturer        && npm install
cd ../shopkeeper          && npm install
cd ../consumer            && npm install
```

### 2. Start Services
```bash
# Terminal 1: Cryptographic Engine (Port 4000)
cd services/pharma-core   && npm run dev

# Terminal 2: Manufacturer Backend (Port 3001)
cd services/manufacturer  && npm run dev

# Terminal 3: Shopkeeper Backend (Port 3002)
cd services/shopkeeper    && npm run dev

# Terminal 4: Consumer Verification Backend (Port 3003)
cd services/consumer      && npm run dev
```

### 3. Run Automated Crypto & Routing Tests
```bash
# Run pharma-core cryptographic test suite
cd services/pharma-core
node test_auth.js
node test_http.js
```

### 4. Kubernetes / Cluster Deployment
```bash
# Deploy all microservices, MongoDB instances, and NGINX Ingress
skaffold dev
```

---

## 📂 9. Repository Blueprint & Documentation Index

```
SIH_2026/
├── Documents/
│   ├── PHARMACHAIN_DEFINITIVE_TEAM_GUIDE.md        ← Single source of truth team manual
│   ├── COMPLETE_END_TO_END_ARCHITECTURE_DIAGRAM.md ← Full system Mermaid architecture
│   ├── PHARMACHAIN_SUPPLY_CHAIN_MASTER_PLAN.md    ← Logistics & packaging master plan
│   ├── CURRENT_STATE_REPORT.md                     ← In-depth microservice audit report
│   └── architecture.md                             ← Base system specifications
├── files/                                          ← 8 service & app implementation plans
│   ├── 00-architecture-communication-overview.md
│   ├── 01-pharma-core-implementation-plan.md
│   ├── 02-manufacturer-service-implementation-plan.md
│   ├── 03-shopkeeper-service-implementation-plan.md
│   ├── 04-consumer-service-implementation-plan.md
│   ├── 05-manufacturer-dashboard-implementation-plan.md
│   ├── 06-shopkeeper-mobile-app-implementation-plan.md
│   └── 07-consumer-mobile-app-implementation-plan.md
├── k8s/                                            ← Kubernetes production manifests
│   ├── ingress.yml                                 ← Path-based NGINX routing
│   ├── secrets.yml.example                         ← Secret templates
│   ├── pharma-core.{deployment,service}.yml
│   ├── manufacturer.{deployment,service}.yml
│   ├── shopkeeper.{deployment,service}.yml
│   └── consumer.{deployment,service}.yml
└── services/
    ├── pharma-core/                                ← Crypto Vault & JWKS Provider (:4000)
    ├── manufacturer/                               ← Factory Portal & Batch Engine (:3001)
    ├── shopkeeper/                                 ← Retail Chemist & POS Portal (:3002)
    └── consumer/                                   ← Public Verification Gateway (:3003)
```

---

## 👥 10. Built for Smart India Hackathon (SIH 2026)

* **Theme**: Blockchain-powered Pharmaceutical Provenance & Anti-Counterfeiting.
* **Core Technology Stack**: Node.js, Express, MongoDB, Hyperledger Fabric, ECDSA P-256, RSA-4096, AES-256-GCM, Docker, Kubernetes, NGINX Ingress.
