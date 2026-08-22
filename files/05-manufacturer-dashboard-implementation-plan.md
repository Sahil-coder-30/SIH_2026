# Manufacturer Dashboard — Implementation Plan
### Internal Web Portal for Factory / Pharma-Company Staff

---

## 1. Purpose

The manufacturer dashboard is where a pharma company's staff register, describe a batch, trigger minting of up to a lakh signed packs, monitor progress, and — if something goes wrong — recall a batch instantly. It's an internal enterprise tool, not a public-facing app, so it can afford more density and form complexity than the mobile apps.

---

## 2. Tech Stack

Aligns with your MERN focus:
- **React** (Vite) + **Tailwind** for styling
- React Router for the multi-page dashboard structure
- A data-fetching layer (React Query/TanStack Query) — genuinely useful here because the mint-progress screen needs polling
- JWT stored in an httpOnly cookie (matches `manufacturer-service`'s cookie/bearer auth) rather than localStorage

Talks only to `manufacturer-service` (`:3001`) — it should never call `pharma-core` or Fabric directly; all crypto/ledger operations are proxied through the business service.

---

## 3. Screens

### 3.1 Auth & Onboarding
- Register (company details + KYC doc upload) → shows a "pending approval" state until `kycStatus: APPROVED`
- Login

### 3.2 Batch Creation
- A form for the medicine/batch metadata. **Don't build all 30+ fields as one flat form** — group into a short wizard: Identity (name, composition, dosage) → Manufacturing (mfg date, site, license) → Regulatory/QA (CDSCO no., assay result) → Logistics (pack size, storage conditions). Fewer required fields up front, rest editable later, keeps the MVP demo fast.
- Shows both batch IDs once created: the system-generated `systemBatchId` and the user-entered `manufacturerBatchNumber`.

### 3.3 Mint Batch & QR Export
- "Mint" button on a batch detail page → calls the async mint endpoint (`POST /batch/:id/mint`), then switches to a **progress view**: poll `mintedPacksCount / totalPacks` every couple seconds until `mintStatus: MINTED`.
- On completion, surfaces **Download QR CSVs** for factory packaging printers:
  - **Download Strips CSV** (`/export/csv?type=packs`): individual pack serials, hashes, and dual-mode verify URLs (`/verify/:packHash?token=...`).
  - **Download Boxes CSV** (`/export/csv?type=boxes`): Mono-Box QR codes and serial ranges.
  - **Download Cartons CSV** (`/export/csv?type=cartons`): Master Shipper Carton QR codes and box ranges.

### 3.4 Batch Search & Detail
- Search by either batch ID (`systemBatchId` or `manufacturerBatchNumber`).
- Detail view: metadata, mint status, live sell-through if you want to surface `manufacturer-service`'s batch-level pack counts.

### 3.5 Recall
- A clearly separated, confirmation-gated "Recall Batch" action — this should feel deliberately heavier-weight in the UI than other buttons, since it's an irreversible, system-wide action.

---

## 4. API Integration Points

All calls go to `manufacturer-service`:
- `POST /api/manufacturer/register`, `POST /api/manufacturer/login`
- `POST /api/manufacturer/batch`
- `POST /api/manufacturer/batch/:batchId/mint`
- `GET /api/manufacturer/batch/:batchId` (metadata & mint progress)
- `GET /api/manufacturer/batch/:batchId/export/csv?type=packs|boxes|cartons` (QR download)
- `GET /api/manufacturer/batch?search=`
- `POST /api/manufacturer/batch/:batchId/recall`

---

## 5. MVP Priority Ranking

1. **Critical:** login + batch creation (trimmed field set) + mint action + progress polling. This is the entire "how do fresh, verifiable packs get created" story — without it, none of the other apps have anything real to scan.
2. **Critical:** recall action, since it's core to your security/anti-fraud narrative ("one transaction pulls 1 lakh packs").
3. **Nice-to-have CRUD (explicitly lower priority, per your framing):** batch search/filter UI polish, sell-through analytics/charts, multi-user roles within a manufacturer account, editing metadata after creation, exporting reports. These make the dashboard feel like a finished product but don't affect whether the system actually catches fake medicine — build them last, and only if time remains after the shopkeeper/consumer scan loop is demoable.

---

## 6. Build Order Suggestion

1. Login/register against a manually-approved KYC flag (skip building real document review for the hackathon)
2. Batch creation form → confirm it produces a valid batch doc in `manufacturer-service`
3. Mint button → progress bar → confirm packs actually appear in the shopkeeper/consumer verify flow
4. Recall button
5. Everything else, time permitting
