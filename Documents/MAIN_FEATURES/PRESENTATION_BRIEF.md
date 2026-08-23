# PharmaChain — Presentation Brief

**For:** the presentation team · **Companion docs:** `API_CONTRACT.md`, `DEMO_DAY_RUNBOOK.md`

---

## How to use this document

Every technical claim below carries a status marker. **Use them.**

| Marker | Meaning | How to say it |
|---|---|---|
| **`Implemented`** | Running code you can demonstrate | State it plainly |
| **`Partial`** | Works in part; a specific gap is known | "X works; Y is in progress" |
| **`Designed`** | Specified, not built | "Our design for this is…" — never "we have" |

**Judges probe hard, and they probe exactly where you sound most confident.** Being caught overclaiming costs more than any single feature is worth. A team that says *"that part is designed but not built, and here is why we sequenced it that way"* reads as competent. A team caught calling a `Designed` item `Implemented` loses credibility on everything else it said.

Read `DEMO_DAY_RUNBOOK.md § Hostile questions` before you present. It has prepared answers for the eight questions most likely to come.

---

## 1. The problem

Counterfeit medicine kills people, and the supply chain has no way for the person swallowing the pill to check whether it is real.

> **Prevalence statistic:** `[cite: CDSCO / WHO — verify the exact figure and year before use]`
> Do **not** present a number from memory. Find the primary source, quote it exactly, name it on the slide. A challenged statistic you cannot source damages the whole pitch.

Three structural failures, and the third is the one most solutions miss:

1. **A patient cannot verify anything.** Holographic stickers and scratch codes are copyable and unverifiable at the point of consumption.
2. **Custody is invisible.** No participant can see the full chain, so a diverted or recalled batch is untraceable in practice.
3. **Nobody agrees who should own the database.** Manufacturers, distributors, pharmacies and the regulator will not all trust one another's server. This is a *governance* failure, not a technology gap — and it is why "just use Postgres" has not solved it.

---

## 2. The solution — lead with this

**Every individual pack carries its own cryptographic signature, verifiable offline by anyone, with no network and no database.**

That is the sentence to open with. Not "we use blockchain."

### Two-tier verification — the core innovation · `Implemented` (Tier 1) · `Partial` (Tier 2)

```
   ┌─────────────── TIER 1 · AUTHENTICITY ────────────────┐
   │  ECDSA P-256 signature check                          │
   │  Needs: the manufacturer's PUBLIC key. Nothing else.  │
   │  No network. No ledger. No database. No account.      │
   │  Answers: "did this manufacturer really sign this?"   │
   │  Cost: one EC verify — microseconds                   │
   └───────────────────────────────────────────────────────┘
                            │
                            ▼  only if Tier 1 passes
   ┌─────────────── TIER 2 · CUSTODY ──────────────────────┐
   │  Hyperledger Fabric world-state lookup                │
   │  Needs: network + ledger                              │
   │  Answers: "where has this pack been, and is it        │
   │            already sold, or recalled?"                │
   └───────────────────────────────────────────────────────┘
```

**Why this separation is the differentiator.** Most entries in this problem space conflate the two and end up with a system that cannot answer anything without connectivity — which is precisely the condition of a rural Indian pharmacy. Our authenticity check is *mathematically self-contained*. The signature either verifies against the public key or it does not. A counterfeiter cannot forge one without the manufacturer's private key, which never leaves our core service.

**And note the direction of dependency:** Tier 1 gates Tier 2. A pack that fails the signature check is counterfeit, and we do not ask the ledger about it. That ordering is deliberate and it is in the code.

**Be honest about Tier 2.** Ledger writes work; one read-path key-mismatch bug is being fixed for the demo (`DEMO_DAY_RUNBOOK.md`, Blockchain task 1). If Tier 2 is not solid on the day, present Tier 1 deliberately as the offline story — that is a *stronger* demo than a shaky end-to-end one, because offline verification is the genuinely novel capability.

### What is on the pack

A QR encoding a signed JWT:

```
https://<verify-host>/<packHash>?token=<signedJWT>
```

- **`signedJWT`** — the pack's identity, signed **ES256 / ECDSA P-256**. `Implemented`
- **`packHash`** — `SHA-256` of the raw signed token; the ledger key. `Implemented`

**Why P-256 and not RSA for packs:** the signature has to fit in a QR alongside the payload and still scan reliably from a crumpled foil strip. An RSA-4096 signature is 512 bytes; a P-256 signature is 64. Same security level, an eighth of the QR density. **This is an engineering decision with a reason — say the reason.** `Implemented`

---

## 3. Architecture

### Whole system

```
 ┌──────────────────── CLIENTS ─────────────────────────────────────────┐
 │  Manufacturer Dashboard      Pharmacy App          Patient App        │
 │  React + Vite + TS           Expo / React Native   Expo / React Native│
 │  HttpOnly cookie             Bearer token          no auth — public   │
 └───────────┬─────────────────────────┬──────────────────────┬──────────┘
             │                         │                      │
 ┌───────────▼─────────────────────────▼──────────────────────▼──────────┐
 │  PUBLIC EDGE — Node 20 / Express 5 / ESM                              │
 │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
 │  │  manufacturer    │  │  shopkeeper      │  │  consumer            │ │
 │  │  :3001           │  │  :3002           │  │  :3003               │ │
 │  │  accounts, KYC   │  │  accounts, KYC   │  │  verification only   │ │
 │  │  batches (~45    │  │  inventory,      │  │                      │ │
 │  │  regulatory      │  │  custody events  │  │  STATELESS —         │ │
 │  │  fields), mint,  │  │                  │  │  NO DATABASE         │ │
 │  │  recall, export  │  │                  │  │                      │ │
 │  │  MongoDB         │  │  MongoDB         │  │                      │ │
 │  └────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘ │
 └───────────┼─────────────────────┼───────────────────────┼─────────────┘
             │   Authorization: Bearer <per-service credential>          │
             │   scope-checked per endpoint — least privilege            │
 ┌───────────▼─────────────────────▼───────────────────────▼─────────────┐
 │  INTERNAL — never reachable from a browser or a phone                 │
 │                    ┌──────────────────────────┐                       │
 │                    │  pharma-core  :4000      │                       │
 │                    │  ROOT OF TRUST           │                       │
 │                    │  · ECDSA P-256 pack keys │                       │
 │                    │  · RSA-4096 machine ID   │                       │
 │                    │  · AES-256-GCM keystore  │                       │
 │                    │  · signs / verifies      │                       │
 │                    │  NO BUSINESS DATA        │                       │
 │                    └────┬──────────────┬──────┘                       │
 │              RS256 JWT  │              │  IAM + presigned URLs        │
 │              + JWKS     │              │                              │
 │                    ┌────▼─────────┐  ┌─▼──────────┐                   │
 │                    │ Spring Boot  │  │  AWS S3    │                   │
 │                    │ gateway :8080│  │  pack CSV  │                   │
 │                    └────┬─────────┘  │  + local   │                   │
 │                         │  gRPC/mTLS │  fallback  │                   │
 │                    ┌────▼─────────┐  └────────────┘                   │
 │                    │ Hyperledger  │                                   │
 │                    │ Fabric       │                                   │
 │                    │ + CouchDB    │                                   │
 │                    └──────────────┘                                   │
 └───────────────────────────────────────────────────────────────────────┘
```

### The architectural decision worth presenting

**`pharma-core` holds keys and no business data. The edge services hold business data and no keys.**

Follow the consequence: **compromising any public-facing service yields a database, not the ability to sign a pack.** An attacker who owns the patient-facing service gets the ability to verify medicines — which is what that service does anyway.

This is a real security property that most microservice architectures assert and do not enforce. Ours enforces it two ways: the key material physically never leaves `pharma-core`, and each edge service holds a credential scoped to only the operations it needs.

| | generate keys | mint packs | write custody | verify |
|---|---|---|---|---|
| `manufacturer` | ✅ | ✅ | recall only | ✅ |
| `shopkeeper` | ✗ | ✗ | intake, sale | ✅ |
| **`consumer`** *(public)* | **✗** | **✗** | **✗** | **✅** |

**Read the bottom row aloud if asked about microservice security.** The internet-facing service cannot mint. `Partial` — the matrix is specified in `API_CONTRACT.md §2.1`; per-service enforcement is a demo-eve task, and short-lived scoped bearer tokens plus mTLS are the designed next phases. **Check with the backend owner which phase actually landed before you claim it.**

---

## 4. Per-service breakdown

### `pharma-core` — the root of trust

| Property | Detail | Status |
|---|---|---|
| Pack signing | ECDSA P-256 / ES256 | `Implemented` |
| Machine identity | RSA-4096 / RS256, published as JWKS | `Implemented` |
| Key storage | AES-256-GCM envelope encryption | `Implemented` |
| KEK derivation | `scrypt(MASTER_SECRET, salt = manufacturerId, N = 16384)` | `Implemented` |
| Business data | **none — by design** | `Implemented` |

**Envelope encryption, and why the salt choice matters.** Each manufacturer's private key is sealed under a key-encryption key derived from the master secret **salted with that manufacturer's own ID**. So every manufacturer gets a cryptographically distinct KEK. Compromising one manufacturer's sealed key tells an attacker nothing about any other. That is per-tenant key isolation, and it is one line of design that a competing entry storing keys under a single KEK will not have. `Implemented`

**Two key types, two problems** — expect to be asked why not one:

- **ES256 / P-256 for packs** — signatures must fit in a QR (64 bytes vs RSA's 512).
- **RS256 / RSA-4096 for machine identity** — this is what the JWKS/OIDC ecosystem and Spring's `NimbusJwtDecoder` expect.

Using one primitive for both would mean either unscannable QRs or a non-standard identity layer. `Implemented`

**The machine-identity handshake is the healthiest component in the system.** `pharma-core` signs an RS256 JWT and publishes its public key at `/.well-known/jwks.json`. The Spring gateway fetches that JWKS and validates the **signature, the issuer, and the audience** — not just the signature. That is a complete OIDC-style service identity flow, standards-based, with no shared secret between core and the gateway. `Implemented`

**Honest limitation, and volunteer it rather than being caught:** the keystore is a single encrypted file with an in-process write lock, so `pharma-core` runs single-replica today. The designed fix is AWS KMS, which removes the file entirely and makes core horizontally scalable. Frame it correctly — **the crown-jewel property of this system is that the keystore cannot be regenerated.** Lose it and every printed QR in the field becomes permanently unverifiable. Treating it conservatively is the right call. `Designed`

### `manufacturer` — the control plane

**The regulatory data model is a competitive asset. Show the schema on screen.** Most entries will model a batch as `{name, quantity, expiry}`. Ours carries roughly **45 optional regulatory fields**: `Implemented`

`drugSchedule` (G/H/H1/X/OTC) · `pharmacopoeiaStandard` (IP/BP/USP/EP) · `cdscoApprovalNo` · `composition` · `dosage` · `storageConditions` · `coldChainRequired` · `controlledSubstance` · `gstin` · `hsn` · `qaOfficerId` · `coaReferenceNo` · `microbialTestStatus` · `dissolutionTestStatus`

This is what an actual CDSCO filing requires. **It signals domain research more strongly than any architecture diagram** — it is evidence we talked to the problem, not just to a whiteboard.

**Dual batch identifiers** — a small decision that shows product thinking: `Implemented`

| Field | Whose |
|---|---|
| `systemBatchId` — `PC-BATCH-{MFR6}-{YYYYMMDD}-{6HEX}` | ours; the ledger key |
| `manufacturerBatchNumber` | **theirs**, from their existing ERP/MES |

A pharma company already has batch numbering it is legally required to maintain. Forcing ours on them would make this unadoptable. **Accepting both is why a real manufacturer could deploy this without changing their existing systems** — say that; adoption realism is rare in student projects.

**Key provisioning is a consequence of approval, not registration.** An account registers as `PENDING` and cannot sign anything. An approval step provisions the signing key. So anyone who can sign up does *not* thereby get the ability to mint pharmaceutical packs. `Partial` — the approval endpoint is a demo-eve task and is a deliberate stand-in for a real CDSCO review of the licence number against the state drug-controller register.

### `shopkeeper` — the enforcement point

**This is where a cloned QR is caught, and it is worth explaining why it has to be here.**

A photocopied QR carries a *valid* signature — it is a real signature, just duplicated. Tier 1 cannot detect that, and no amount of cryptography can: the copy is bit-identical. What catches it is **state**. The ledger records that pack as already sold, and the second sale is refused.

```
scan → signature check       → invalid?   COUNTERFEIT, stop
     → ledger custody state  → Sold?      REFUSE  ← the anti-clone guard
                               Recalled?  REFUSE
     → ledger write
     → local inventory update
```

**Say this explicitly: the signature proves authenticity, the ledger prevents duplication.** Neither alone is sufficient, and that is the clearest possible answer to "why do you need a blockchain at all?" `Partial` — the guard is written and correct; it depends on the Tier-2 read fix.

The service also maintains local pharmacy stock. That is an adoption feature, not a technical one: **a pharmacy gets working inventory management out of participating**, which is what makes rollout plausible rather than compliance-driven. `Partial`

### `consumer` — the one that matters

Stateless. No database, no accounts, no login. `Implemented`

**Present statelessness as a design decision, because it is one:**

- Anyone can verify any pack with no signup — **a verification tool that demands registration is a verification tool nobody uses**
- Nothing to breach: no patient data exists to leak
- Scales horizontally without limit — no shared state to coordinate

**Fail-closed verdict mapping.** Seven verdicts (`GENUINE`, `AT_SHOP`, `ALREADY_SOLD`, `RECALLED`, `EXPIRED`, `COUNTERFEIT`, `NOT_FOUND`), and any unrecognised ledger state maps to *suspect*, never to *authentic*. `Implemented`

**That default is the most important line in the service, and it is a good answer to a safety question.** A bug anywhere downstream can cause a false *warning*; it cannot cause a false *reassurance*. In a system whose failure mode is someone taking counterfeit medicine, that asymmetry is the correct engineering choice — a false negative is an inconvenience, a false positive could put someone in hospital.

---

## 5. Scale

Use these numbers. **Every one is derived from the code, not estimated.** If asked how you got one, you can show the line.

### Minting: the optimisation worth presenting

Signing 100,000 packs requires the manufacturer's private key. That key is sealed, and unsealing costs one deliberately-expensive `scrypt` derivation (~100–150 ms — expensive *on purpose*, that is what makes it brute-force resistant).

The naive implementation unseals per pack:

| Approach | Cost | Result |
|---|---|---|
| Unseal per pack | 100,000 × ~150 ms | **≈ 4.1 hours** |
| **Unseal once, sign N times in memory** | 1 scrypt + 100,000 EC signs | **≈ 20–30 seconds** |

**Roughly a 500× difference from one architectural decision** — derive the key once and reuse it for the whole batch. `Implemented`

This is the single best "we thought about engineering" point in the deck, because the naive version is the obvious version, and it would have been unusable at production batch sizes.

### Response payload

A 100,000-pack response as JSON is roughly **50 MB**. We return a **~200-byte presigned S3 URL** instead, with the CSV streamed to object storage. `Implemented`

Not a micro-optimisation — a 50 MB JSON response is a system that falls over on the first real batch.

### Other measured properties

| Property | Value | Status |
|---|---|---|
| Ledger writes | chunked, 250 transitions per submission | `Implemented` |
| Mint API | asynchronous — returns `202`, client polls | `Implemented` |
| S3 upload | streaming (`lib-storage`), not buffered | `Implemented` |
| S3 unavailable | automatic local-disk fallback | `Implemented` |
| On-chain footprint | **hash only** — never drug or patient data | `Implemented` |

### The scale argument that actually matters

**The highest-volume operation in the entire system — a patient verifying a pack — requires no database query and no ledger write.**

Millions of patients scanning is millions of ECDSA verifications against a **cacheable public key**. No write contention, no shared state, no per-scan storage. The read path scales by adding stateless replicas.

Compare that to a conventional design where every scan is a database lookup against a central server. **We moved the expensive part to mint time, which is rare, and made the frequent part nearly free.** That is the right shape for this problem, and it follows directly from putting the signature on the pack rather than a lookup key.

**Honest counterweight, and volunteer it:** `pharma-core` is single-replica today because of the keystore file lock, so *minting* does not yet scale horizontally. Verification — the high-volume path — does. `Partial`

### Deployment

Kubernetes manifests and Skaffold configuration exist. `Partial` — currently single-replica and **not what we are demonstrating on**; the demo runs locally. If asked about deployment, say exactly that. Do not claim a running cluster.

---

## 6. Security summary

| Control | Mechanism | Status |
|---|---|---|
| Pack authenticity | ECDSA P-256 / ES256 | `Implemented` |
| Private keys at rest | AES-256-GCM envelope encryption | `Implemented` |
| Per-tenant key isolation | `manufacturerId` as scrypt salt → distinct KEK each | `Implemented` |
| Service identity | RSA-4096 / RS256 + JWKS, issuer **and** audience validated | `Implemented` |
| Ledger transport | gRPC over mTLS | `Implemented` |
| Passwords | bcrypt, 12 rounds | `Implemented` |
| Session tokens | HS256 JWT, HttpOnly cookie / Bearer | `Implemented` |
| Key provisioning gate | key issued on approval, never on registration | `Partial` |
| Service-to-service least privilege | per-service credential + per-endpoint scopes | `Partial` — see §3 |
| Short-lived scoped service tokens | client-credentials flow reusing the existing RS256/JWKS machinery | `Designed` |
| mTLS between internal services | via service mesh | `Designed` |

**No client-side key material, and no client-side signature verification.** All three apps correctly delegate verification to the backend. A client-side check would be worthless — an attacker controls the client. `Implemented`

---

## 7. Roadmap — all `Designed`

Presenting a credible roadmap signals you understand the problem is bigger than a hackathon. Presenting it as *built* destroys the pitch. **Everything here is `Designed`.**

- **Distributor / in-transit leg** — full chain of custody, not just manufacturer → pharmacy
- **AWS KMS keystore** — removes the single-replica constraint and the irreplaceable-file risk
- **Worker-thread minting** — the 100k signing loop currently blocks the event loop for ~20–30 s
- **Volume-anomaly detection** — catches a compromised printer or operator by flagging more distinct packs in a batch than it was licensed for. This is the honest answer to "what if the factory itself is corrupt?"
- **Offline scan queue** — pharmacies scan without connectivity, sync later. A natural extension of Tier 1.
- **Chain-of-custody timeline** on the patient verdict screen — makes the ledger's contribution visible to the person holding the pack
- **Counterfeit-scan geographic hotspots** — turns aggregate verification failures into regulator intelligence
- **Regulator dashboard** — recall reach and compliance reporting

---

## 8. Anticipated questions

Full answers in `DEMO_DAY_RUNBOOK.md § Hostile questions`. The three that decide the pitch:

**"Why blockchain instead of a database?"**
Two different problems, usually conflated. The **signature** gives authenticity — a database cannot prove a manufacturer signed something. The **ledger** solves governance: manufacturers, distributors, pharmacies and the regulator do not agree on who should host the custody database, and an append-only shared ledger means no participant can silently rewrite history. **If one party could own the data, a database would genuinely be the better engineering choice — say so.** Conceding that correctly is more persuasive than defending blockchain everywhere, and it shows you know which tool solves which half.

**"What if someone photocopies the QR?"**
The copy carries a valid signature and Tier 1 cannot detect it — no cryptography can, the copy is bit-identical. The **ledger** catches it: the pack is already recorded sold and the second sale is refused. This is the clearest demonstration of why both tiers exist.

**"What if the factory operator or printer is compromised?"**
An honest limit. Anyone holding the signing key can mint valid packs, so the trust anchor is manufacturer key custody — which is why keys are per-manufacturer, encrypted at rest, and never leave the core service. Detection comes from volume anomalies. `Designed`, not built. **Say that.** Judges respect a known limitation with a named mitigation far more than a deflection.

---

## 9. Slide order

1. **The problem** — a patient cannot check their own medicine `[sourced statistic]`
2. **The insight** — put the signature on the pack, not a lookup key in a server
3. **Two-tier verification** — the §2 diagram. **Spend your time here.**
4. **Live demo** — genuine scan, then counterfeit scan. *The counterfeit is the moment that lands.*
5. **Architecture** — the §3 diagram; keys and business data separated, and the `consumer` row of the privilege matrix
6. **Engineering depth** — 4.1 hours → 30 seconds; 50 MB → 200 bytes
7. **Domain depth** — the regulatory schema on screen; dual batch identifiers
8. **Roadmap** — marked `Designed`
9. **Honest status** — what is built, what is next

**Two things to get right on the day.** The counterfeit scan is the emotional centre of the demo — rehearse it until it cannot fail, and make sure it is genuinely reaching the backend, because a hardcoded green checkmark is the one failure a judge might catch. And lead with **offline verification**, not with blockchain. Everyone in the room will have heard blockchain forty times before you walk in. Almost nobody will have heard *"this works with no network at all, and here is the mathematics of why."*
