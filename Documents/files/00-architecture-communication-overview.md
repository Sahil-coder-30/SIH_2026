# PharmaChain — Architecture & Communication Overview
### Index to the 7 implementation plans in this folder

---

## 1. How to Read This Folder

| File | Covers |
|---|---|
| `01-pharma-core-implementation-plan.md` | Crypto/JWKS/Fabric engine — the trust root |
| `02-manufacturer-service-implementation-plan.md` | Batch creation & minting backend |
| `03-shopkeeper-service-implementation-plan.md` | Intake/sale scanning backend |
| `04-consumer-service-implementation-plan.md` | Public verify & report backend — **the MVP** |
| `05-manufacturer-dashboard-implementation-plan.md` | Web app for factory staff |
| `06-shopkeeper-mobile-app-implementation-plan.md` | Mobile app for chemists |
| `07-consumer-mobile-app-implementation-plan.md` | Public scan-and-verify web/PWA for patients |

Each file has its own MVP Priority Ranking section. This file is the cross-cutting view: how the pieces talk to each other, and which pieces matter most **across the whole system**, not just within one service.

---

## 2. Full Communication Map

```
                              INGRESS (80/443, NGINX)
                                       │
        ┌────────────────┬────────────┼────────────────┐
        ▼                ▼            ▼                ▼
  manufacturer-      shopkeeper-   consumer-      /core/*, /.well-known/*
  service (3001)     service       service        pharma-core (4000)
        │             (3002)        (3003)               ▲
        │                │            │                  │
        └──── X-Service-Token + RS256 Bearer ─────────────┘
                (all three call pharma-core for
                 signing / verification / ledger ops)

  Direct business-to-business call (bypasses pharma-core, no crypto involved):
  consumer-service ──GET /api/manufacturer/batch/public/:batchId──▶ manufacturer-service
```

**Rule of thumb for the whole codebase:** only `pharma-core` ever touches key material or Hyperledger Fabric directly. `manufacturer-service`, `shopkeeper-service`, and `consumer-service` never sign anything or write to the ledger themselves — they always go through `pharma-core`. The one exception is metadata lookups (medicine name, expiry for display) between `consumer-service` and `manufacturer-service`, which is plain business data, not crypto.

### Client apps → backend services
```
Manufacturer Dashboard   ──▶  manufacturer-service (3001)   only
Shopkeeper Mobile App    ──▶  shopkeeper-service (3002)     only
Consumer Web/PWA         ──▶  consumer-service (3003)       only
```
No client app talks to `pharma-core` directly, and no client app talks to a backend service other than its own — this keeps the trust boundary clean and matches the k8s ingress path-based routing already set up (`/api/manufacturer/*`, `/api/shopkeeper/*`, `/api/consumer/*`, `/core/*`).

---

## 3. End-to-End Lifecycle of One Pack

1. **Mint & QR Export** — Manufacturer Dashboard → `manufacturer-service` creates a batch → mint triggers `manufacturer-service` → `pharma-core` (sign + `MINTED` ledger state). Manufacturer exports CSV with dual-mode QR URLs: `https://pharmachain.gov.in/verify/:packHash?token=:signedToken`.
2. **Intake** — Shopkeeper App scans a box/strip QR URL → `shopkeeper-service` → `pharma-core` (verify + `AT_SHOP` ledger state), duplicate-guard checked locally.
3. **Sale** — Shopkeeper App scans a strip QR URL at checkout → `shopkeeper-service` → `pharma-core` (verify current state is `AT_SHOP`, then `SOLD` ledger state).
4. **Verify** — Consumer scans strip with Phone Camera or App → `consumer-service` extracts `:packHash` from path and `token` from query → `pharma-core` (verify signature + read ledger state) + `manufacturer-service` (display details) → one of 7 states shown instantly.
5. **Recall** (exception path) — Manufacturer Dashboard → `manufacturer-service` → `pharma-core` flips every pack in a batch to `RECALLED` in one transaction; the next `consumer-service` verify or `shopkeeper-service` sale attempt on any of those packs will see the new state immediately.

---

## 4. System-Wide MVP Priority Stack

Your note about focusing on the anti-fake-medicine mission over general CRUD convenience is the right instinct — here's how that plays out across the whole system, ranked:

**Tier 1 — the mission-critical path (build and demo this first, end to end):**
1. `pharma-core`: sign + verify + ledger transitions
2. `manufacturer-service`: minimal batch creation + mint
3. `shopkeeper-service`: intake + sale scan with duplicate/state guards
4. `consumer-service`: verify endpoint with correct 7-state mapping
5. The three client apps' scanning/verify screens specifically (not their full CRUD surface)

Once this full loop works — mint a batch, intake it, sell one pack, verify it as `SOLD`, verify a never-minted token as `COUNTERFEIT` — you have a demoable proof of the entire pitch.

**Tier 2 — strengthens the story, build once Tier 1 works:**
- Recall flow (all services)
- Counterfeit reporting (`consumer-service` + its client)
- Inventory tracking (`shopkeeper-service` + its client) — supports the "shopkeeper adoption" side benefit from your original notes

**Tier 3 — genuinely nice CRUD, explicitly lowest priority per your framing:**
- Manufacturer dashboard analytics, multi-user roles, editable batch metadata after creation
- Shopkeeper inventory dashboard polish, sales history/export
- Consumer accounts, scan history, saved medicines

Each individual service file has its own version of this ranking for that service specifically — this section is here so the priority is visible at the whole-system level too, since it's easy for "give every service a full CRUD surface" to quietly eat the time that should go to the Tier 1 loop.
