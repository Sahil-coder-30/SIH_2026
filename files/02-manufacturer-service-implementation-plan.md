# `manufacturer-service` — Implementation Plan
### Batch Management & Factory Portal Backend — Port `3001`

---

## 1. Role in the System

The business-logic layer for pharmaceutical manufacturers: onboarding, product/batch cataloging, and the minting workflow that turns "1 lakh packs of Augmentin 625" into 1 lakh individually signed, ledger-tracked items. It owns the manufacturer-facing MongoDB data and delegates all cryptography and ledger writes to `pharma-core`.

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js + Express |
| DB | MongoDB (`manufacturers`, `batches`, `packs`) |
| Auth | JWT (cookie or bearer) for manufacturer users; KYC-approval gate before batch creation is allowed |
| Background work | A worker (in-process queue or BullMQ/Redis if you want it durable) for the async 1-lakh mint job |
| Service-to-service | `X-Service-Token` + short-lived RS256 bearer when calling `pharma-core` |

---

## 3. Data Model

### `manufacturers`
`manufacturerId, companyName, cdscoLicenseNo, gstin, kycStatus (PENDING/APPROVED/REJECTED), kycDocs[], createdAt`

### `batches` (two-tier: keep QR-tier fields separate from rich metadata mentally, even if stored in one document)
- **Tier 1 (goes in the QR JWT via pharma-core):** `systemBatchId`, `manufacturerId`, `expiryDate`
- **Tier 2 (DB-only, 30+ fields):** `medicineName, genericName, brandName, schedule, composition, dosage, strength, form, route, mfgDate, productionSite, licenseNo, lineId, cdscoApprovalNo, gstin, hsn, coaReferenceNo, microbialTestStatus, assayResult, packSize, storageConditions, temperatureRange, manufacturerBatchNumber, shiftCode, ...`
- `mintStatus: MINTING | COMPLETE | FAILED`, `mintedPacksCount`, `totalPacks`

### `packs`
`packId, systemBatchId, serial, packToken (JWT from pharma-core), packHash, status (mirrors ledger for fast local reads)`

---

## 4. Dual Batch Identifier Logic

- `systemBatchId` — generate as `PC-BATCH-{MFR4}-{YYYYMMDD}-{6HEX}`, guaranteed unique (unique index in Mongo + collision retry loop).
- `manufacturerBatchNumber` — free text from the factory's own ERP, stored as-is, indexed so it's searchable but never used as the ledger key.
- Search endpoint must accept **either** ID and resolve to the same batch document.

---

## 5. Core API Surface

### Public-facing (manufacturer users, JWT-protected unless noted)
| Method | Route | Notes |
|---|---|---|
| `POST` | `/api/manufacturer/register` | Creates account + KYC doc upload, `kycStatus: PENDING`. Triggers `pharma-core` key provisioning **only after** KYC approval. |
| `POST` | `/api/manufacturer/login` | Issues JWT |
| `POST` | `/api/manufacturer/batch` | Create a batch record with all Tier 2 metadata. Requires `kycStatus: APPROVED`. |
| `POST` | `/api/manufacturer/batch/:batchId/mint` | Kicks off minting. **Responds immediately `202 Accepted`** with `mintStatus: MINTING`; does the actual signing in the background worker. |
| `GET` | `/api/manufacturer/batch/:batchId` | Get batch metadata and live mint progress status |
| `GET` | `/api/manufacturer/batch/:batchId/export/csv` | **Download QR CSV for factory printing**: Supports `?type=packs` (default), `?type=boxes`, `?type=cartons`. Embeds dual-mode verify URLs. |
| `GET` | `/api/manufacturer/batch?search=` | Search by either batch ID (`systemBatchId` or `manufacturerBatchNumber`) |
| `POST` | `/api/manufacturer/batch/:batchId/recall` | Emergency recall — calls `pharma-core` recall endpoint |

### QR Code URL Format in CSV Export:
- **Packs (Primary)**: `https://pharmachain.gov.in/verify/:packHash?token=:signedToken`
  *(Native phone camera opens verification URL directly; mobile app extracts `:packHash` from path param).*
- **Boxes (Secondary)**: `https://pharmachain.gov.in/verify/box/:boxId`
- **Cartons (Tertiary)**: `https://pharmachain.gov.in/verify/carton/:cartonId`

### Public, unauthenticated (consumed by other apps, not manufacturer users)
| Method | Route | Notes |
|---|---|---|
| `GET` | `/api/manufacturer/batch/public/:batchId` | Returns only consumer-safe fields (medicine name, mfg date, expiry, manufacturer name) — **must explicitly exclude** internal factory notes, supervisor IDs, line/shift codes |

---

## 6. Inter-Service Communication

```
manufacturer-service  ──X-Service-Token + RS256 Bearer──▶  pharma-core
```

| Trigger | Call to pharma-core |
|---|---|
| KYC approved | `POST /core/keys/manufacturer` — provision EC keypair |
| `POST /batch/:id/mint` fires | `POST /core/mint/batch` — sign N packs (chunked in the worker, e.g. 1,000 packs/chunk against `Pack.insertMany`) |
| After each mint chunk | `POST /core/ledger/transition/batch` — commit `MINTED` state for that chunk |
| Recall action | `POST /core/ledger/recall/:batchId` |

The worker should be resilient to partial failure: if the process restarts mid-mint, `mintStatus` and `mintedPacksCount` must let it resume from the last completed chunk rather than re-signing packs that already exist.

---

## 7. MVP Priority Ranking

1. **Critical:** register/login + a *minimal* KYC gate (even a manual "admin approves" toggle is fine for a hackathon — don't build a full document-verification pipeline for the demo).
2. **Critical:** batch creation with the core fields (medicine identity, composition, expiry, dual batch IDs) — you can trim the 30+ field form down to the dozen fields that actually matter for the counterfeit-detection story; the rest can be "additional metadata" added later.
3. **Critical:** mint endpoint + async worker + progress polling — this is the step that actually produces the QR codes everything downstream depends on.
4. **Important:** public batch-lookup endpoint — `consumer-service` and `shopkeeper-service` need this to show medicine details on scan.
5. **Nice-to-have CRUD (defer if time-constrained):** rich manufacturer profile management, multi-user roles inside one manufacturer org, analytics on sell-through per batch, bulk CSV import for batch metadata. These make the product feel enterprise-grade but don't move the "detect fake medicine" needle — build them only after the scan-verify loop is demoable end-to-end.
6. **Important but can trail:** recall endpoint — build once mint + intake + sale are working, since recall's whole point is reacting to a batch that's already out in the field.

---

## 8. Open Risks

- The 202-Accepted async mint pattern means the client (manufacturer dashboard) needs a polling or websocket strategy — decide early which one, since it shapes the dashboard's mint-progress screen.
- `manufacturerBatchNumber` is free text from an external ERP — don't trust it for uniqueness or as a lookup key on the blockchain side, only `systemBatchId` should ever hit the ledger.
