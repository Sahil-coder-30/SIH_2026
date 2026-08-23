# PharmaChain — Demo Day Runbook

**Read this first. It is the only document everyone needs.**
Deep detail lives in `API_CONTRACT.md` and the three team plans.

---

## The six rules

| # | Rule |
|---|---|
| **R1** | **Scope discipline.** Bug fixes, wiring, and the four Tier-1 endpoints. No new screens, no redesigns, no new libraries. If it is not on your list below, it is out of scope — **even if it is obviously broken.** |
| **R2** | `API_CONTRACT.md` is the source of truth. Contract change = edit doc → announce in the group → change code. |
| **R3** | **We build what the demo needs — and only that.** Four new endpoints are authorised (`API_CONTRACT.md §7` Tier 1). Everything else the frontends call stays mocked. An endpoint gets built because §7 says Tier 1, **not because a screen calls it.** |
| **R4** | **Never fail open.** Verdicts return HTTP 200. Every `switch` needs a `default` that renders *suspect*, never *authentic*. |
| **R5** | **No fabricated data.** A `catch` may never invent a success. If a call fails, the UI shows a failure. |
| **R6** | POST-DEMO sections are fenced. Do not start them. |

**Why R3 is worded that way.** The frontends call **12 endpoints that never existed**. Four of them are genuinely essential and small, so we are building them tonight — that is Tier 1. The other eight need email delivery, a TOTP store, or data models we do not have (`Alert`, `Order`, a return flow in the ledger state machine). Left untriaged, that list reads like a to-do list and burns the entire night. The triage is in `API_CONTRACT.md §7`; it is the difference between shipping and not.

### The four Tier-1 endpoints

| Endpoint | Why |
|---|---|
| `POST /api/{mfr,shop}/auth/kyc/approve` | **Nothing works without it.** Login 403s and mint 404s until an account can be approved. Also generates the manufacturer's signing key. |
| `GET /api/shopkeeper/inventory` | Otherwise the intake scan has no visible effect on stage. |
| `GET /api/shopkeeper/auth/verification-status` | How the app leaves its "pending" screen. Three lines. |
| `POST /api/{mfr,shop}/auth/logout` | Both apps call it; there is currently no way to log out. Three lines. |

---

## Where we actually stand

An audit of all three repositories found:

- **2 of 24** frontend API call sites resolve to an endpoint that exists.
- **No manufacturer can log in.** Nothing in the codebase can set `kycStatus` to `APPROVED`, and the function that creates a manufacturer's signing key is never called from anywhere. Fixed by Tier-1 endpoint 1.
- **A forged QR produces HTTP 500**, not a counterfeit warning.
- **The ledger silently misreports.** Chaincode writes keys with `:` and reads them with `~`, so minted packs read as `NOT_FOUND` and **sold packs read as `AtShop`**.
- **Recall is entirely non-functional** — the request shape 500s unconditionally.
- **All three frontends are hardcoded prototypes.** Both scanners discard the scanned QR and render a fixed "verified" result.

The cryptography, the JWKS/OIDC handshake, and the S3 mint pipeline are genuinely solid. The wiring around them is not.

---

## Task board

Effort: **S** < 30 min · **M** 1–2 h · **L** half day
Full detail and file:line for every item is in each team's plan.

### Backend — owner: ______
Dependency-ordered. **Task 1 blocks everything.**

- [ ] **1 · P0 · M — Make a manufacturer usable.** Build `POST /auth/kyc/approve` (both services) and wire key generation into it. *Until this lands there is no real QR to scan and both Level A and Level B are unreachable.*
- [ ] **2 · P0 · S — Stop returning 400 for a counterfeit.** Return 200 + verdict; add `validateStatus` to the three core clients.
- [ ] **3 · P0 · S — Fix the two Fabric request shapes.** *Coordinated pair with Blockchain 3.*
- [ ] **4 · P0 · M — Fix shopkeeper inventory.** First intake per batch currently throws a ValidationError.
- [ ] **5 · P0 · S — Build `GET /api/shopkeeper/inventory`.** Depends on 4. Without it the intake scan is invisible on stage.
- [ ] **6 · P1 · S — Build `verification-status` + the two `logout` endpoints.** Six lines each; unblocks 8 frontend screens.
- [ ] **7 · P1 · S — Authenticate the two export routes.** They leak every `signedToken` in a batch.
- [ ] **8 · P1 · S — Validate `s3FileKey`.** Derive it from `batchId` instead.
- [ ] **9 · P1 · S — Remove the hardcoded HS256 fallback secrets.** Fail fast instead.
- [ ] **10 · P1 · S — Per-service identity + scope check on core.** *Contract §2.1, phase 1 only.* Replaces one shared secret with one per service. **Closes the finding where compromising the public `consumer` service yields the ability to mint packs.** Do task 7 first; skip this entirely if the P0s are not done.
- [ ] **11 · P2 · S — Align the shopkeeper 400-on-bad-signature to 200.**

**Do not touch:** the try-every-secret loop · the *user-level* authorization model (shop A can act on shop B) · phases 2–3 of contract §2.1 (cached bearer tokens, mTLS) · `GCM_IV_LENGTH` · the 100k signing loop · keystore atomicity/KMS · the missing PVC manifest · skaffold's 4 missing manifests · `keystoreReady` hardcoded `true` · static `/healthz` + `/readyz` · rate limiting · helmet · CORS · **every Tier 2 and Tier 3 endpoint in `API_CONTRACT.md §7`.**
**Run locally. Do not attempt Kubernetes** — the pharma-core pod cannot schedule (no PVC manifest exists) and `skaffold` fails on 4 missing files.

### Blockchain — owner: ______

- [ ] **1 · P0 · S — The `:` vs `~` key split.** 3 read sites in `PharmaContract.java`. **Redeploy chaincode.** *This is the single highest-value fix in the entire project.*
- [ ] **2 · P0 · S — Remove the fail-open default.** Unknown `eventType` currently reports `Packaged` → renders GENUINE.
- [ ] **3 · P0 · M — Fix the two request shapes that 500 unconditionally.** *Coordinated pair with Backend 3.*
- [ ] **4 · P1 · S — Require auth on `GET /api/transition/**`.** Currently `permitAll()`.

**Do not touch:** typed DTOs · `InTransit` / distributor leg · CouchDB indexes · explicit idempotency · the `""` batchId at `TransitionController.java:67` · the state-machine gap in the batch write path.
**Do not regress:** `SecurityConfig`'s JWKS + issuer + audience validation is correct and is the healthiest component in the system.

### Frontend — owner: ______
Three tasks per app. **No visual changes.**

- [ ] **1 · P0 · M — Build the mock layer once, properly.** `*.mock.ts` siblings with identical signatures, selected by one env var. Fixtures cover **all 7 `uiState` values**.
- [ ] **2 · P0 · M — Delete every lie.** 12 `catch` blocks that fabricate success, plus the plaintext demo passwords and the pre-authenticated boot.
- [ ] **3 · P0 · M — Make the scanners use what they scanned.** All three currently ignore the scanned payload.
- [ ] **4 · P1 · S — Migrate the path strings** per `API_CONTRACT.md §6`. Confined to the API-layer modules.

**Do not start:** the UI improvements appendix · `react-router` · a QR library · any screen restructuring · any new screen · **any UI for a Tier 2 / Tier 3 endpoint** — those screens stay on mocks.

---

## Fallback ladder

**Pick a level by the clock, not by optimism. Set the cutoff now and honour it.**

| Level | What you show | Needs | Cutoff |
|---|---|---|---|
| **A — Full slice** | Real scan → real signature check → real ledger verdict | Blockchain 1–3 · Backend 1–5 | decide by ______ |
| **B — Offline authenticity** | Real scan → real signature verdict; ledger shown honestly as *pending* | Backend 1–2 only | decide by ______ |
| **C — Split demo** | Mocked frontends for the UX walkthrough; backend shown via Postman/curl | nothing | always available |

**Level B is not a consolation prize.** Tier-1 verification works with no network, no ledger, and no server — a pharmacist in a village with no signal can still confirm a pack was signed by a licensed manufacturer. That is the strongest thing this project does and most competing entries cannot do it. Presenting Level B deliberately, and explaining *why* it degrades gracefully, is more convincing than a Level A demo that stalls on stage.

Have Level C ready regardless. A recorded screen capture of the working path costs 10 minutes and removes all live-demo risk.

---

## Demo script

**Setup before you present**
1. All four Node services up locally. `PHARMA_CORE_URL=http://localhost:4000`, and the same `SERVICE_TOKEN` exported for every service. *(If backend task 10 landed, also export `SERVICE_TOKEN_MANUFACTURER` / `_SHOPKEEPER` / `_CONSUMER` on core and the matching one on each edge service — core still accepts the old header during the migration, so a half-finished task 10 does not break setup.)*
2. Fabric network up, chaincode redeployed **after** Blockchain task 1.
3. One manufacturer and one shopkeeper registered, then approved via `POST /auth/kyc/approve` with `X-Admin-Token`. Verify the manufacturer's key exists: `GET /core/keys/public/:mfrId` returns a key. **`ADMIN_TOKEN` must be exported or approval fails closed.**
4. One batch created and minted. Keep the CSV open — you need two QRs from it.
5. Print or display: **one genuine QR**, and **one forged QR** (take a genuine token and change a single character in the signature segment).
6. `GET /core/health` returns `200` with `rsaKeyReady: true`.

**The 5-minute run**

| # | Action | What to say |
|---|---|---|
| 1 | Dashboard → create batch | "Full regulatory metadata — CDSCO approval, pharmacopoeia standard, drug schedule, certificate of analysis. This is what a real filing needs." |
| 2 | Mint | "Each pack gets an individually signed cryptographic identity. 100 000 packs in about 20 seconds, because we derive the key once and sign in memory — the naive per-pack approach takes over four hours." |
| 3 | Shopkeeper app → intake scan | "The pharmacy takes custody. That transfer is now on the ledger — no single party can rewrite it." |
| 4 | Shopkeeper app → sell scan | "Sold. If anyone tries to sell this same pack again, anywhere in the country, the ledger refuses it." |
| 5 | Customer app → scan the genuine QR | "Verified. Signature checked, custody chain confirmed." |
| 6 | Customer app → **scan the forged QR** | "This is the one that matters." — show the counterfeit warning. |
| 7 | Dashboard → recall the batch · rescan | "Recall propagates to every unsold pack instantly." |

**Step 6 is the demo.** Everything before it is context. Rehearse it until it cannot fail, and make sure it is genuinely reaching the backend — a hardcoded green checkmark is the one failure mode that would be fatal in front of judges.

---

## Hostile questions — prepared answers

**"What if you lose the private keys?"**
Every printed QR becomes unverifiable, permanently. Today they live in a single encrypted JSON file — honest current state. Roadmap is AWS KMS or HSM-backed storage with rotation and a published key-history so old packs stay verifiable after a rotation. The JWKS endpoint and `keyId` claim already exist for exactly this, so the migration is additive.

**"Does this work without internet?"**
Yes, partially — and that is deliberate. Tier 1 verifies the manufacturer's signature entirely offline: the app needs only the public key, already cached. Tier 2 adds the custody chain and needs the ledger. Offline you learn "genuinely made by this licensed manufacturer" but not "not already sold" — and the app says exactly that rather than guessing.

**"What stops someone photocopying a real QR?"**
Nothing stops the copy; the ledger catches the *use*. The first scan-and-sell marks the pack `Sold`, and every subsequent scan of that pack anywhere reports `ALREADY_SOLD`. Cloning is detectable at the point of resale, which is where the harm happens.

**"What if the printer or factory operator is compromised?"**
An honest limit. Anyone holding the signing key can mint valid packs, so the trust anchor is manufacturer key custody — which is why keys are per-manufacturer, encrypted at rest, and never leave the core service. Detection comes from volume anomalies: more distinct packs in a batch than the batch was licensed for. Not built yet; it is on the roadmap.

**"How does a manufacturer actually get onboarded? Who approves them?"**
Today: a registration creates a `PENDING` account, and an admin-token-protected approval endpoint flips it to `APPROVED` and provisions the signing key. That approval endpoint is a deliberate stand-in for a real regulator workflow — in production it would be a CDSCO-side review of the licence number against the state drug-controller register, with the key issued only on approval. Say that plainly; it is a sensible seam, not a hole. The important part is already right: **an account cannot mint until it has been approved, and the key is created by the approval, not by the registration.**

**"How do your microservices authenticate to each other?"**
Judges ask this reliably about any microservice architecture, so have the real answer ready. **Each service has its own credential and a scoped set of permissions** — the matrix is in `API_CONTRACT.md §2.1`. The point to lead with is the `consumer` column: the public-facing service can verify packs and do nothing else. It cannot generate a key, cannot mint, cannot write a custody event. **Compromising our most exposed service does not give an attacker the ability to sign pharmaceutical packs** — and if backend task 10 landed, you can *show* that as a `403 SCOPE_DENIED` in the logs.

Then say where it goes: short-lived scoped bearer tokens issued by the core service, reusing the RS256 + JWKS machinery **already running** between core and the ledger gateway, and mTLS via a service mesh after that. If task 10 did not land, say the matrix is specified and the current implementation uses a single shared internal secret — do not describe phase 1 as done if it isn't. *(If pushed on "isn't the bootstrap still a shared secret?" — yes, and say so. Short-lived scoped credentials are a real improvement over a permanent all-access one, but they are not certificate-bound identity. That is what mTLS is for.)*

**"Cost per pack?"**
A signature is a few hundred bytes of compute — effectively free. Real cost is the QR print, which piggybacks on existing packaging print runs, plus ledger storage. We deliberately keep only the hash on-chain, never the drug data, so the per-pack on-chain footprint is fixed and small.

**"Why blockchain instead of a database?"**
Two different problems, and they are usually conflated. The *signature* gives authenticity — a database cannot prove a manufacturer signed something. The *ledger* solves governance: manufacturers, distributors, pharmacies, and the regulator do not agree on who should own the custody database. An append-only shared ledger means no participant can silently rewrite history, and no one has to be trusted to host it. If a single party could own the data, a database would genuinely be the better engineering choice — say that plainly if asked.

**"Is all of this working today?"**
Answer honestly and specifically. `PRESENTATION_BRIEF.md` marks every claim `Implemented` / `Partial` / `Designed`. Being caught overclaiming costs more than any single feature is worth — and a team that knows exactly what is and is not done reads as competent, not underprepared.

---

## Kill switches

If something breaks mid-prep, drop it and move on. None of these is worth the night:

- Kubernetes / skaffold → **run locally.**
- S3 → local-disk export fallback already exists.
- Fabric will not start → **Level B.**
- A frontend will not build → demo the other two, show that one via screenshots.
- Mint is slow → mint 50 packs, not 100 000. Cite the throughput number instead of demonstrating it.
