# `consumer-service` — Implementation Plan
### Public Verification & Counterfeit Reporting — Port `3003`

---

## 1. Role in the System — **This Is the MVP**

Every other service exists to make this one meaningful. `consumer-service` is the zero-auth, zero-friction endpoint a patient hits when they scan a strip with an ordinary phone camera. If this endpoint is fast, clear, and trustworthy, the project delivers on "eliminate fake medicines from the market" — everything else (dashboards, inventory CRUD, KYC forms) is supporting infrastructure. Treat this service's UX and correctness as the top priority in the whole system, not just "one of four backend services."

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js + Express |
| DB | MongoDB (`reports` collection only) |
| Auth | **None** — public by design, this is the whole point |
| Service-to-service | `X-Service-Token` to `pharma-core` for verify + ledger-state read |

Keep this service as thin and fast as possible. No user accounts, no session state — a scan should resolve in one round trip.

---

## 3. Data Model

### `reports`
`reportId, scannedToken, deviceTimestamp, geolocation {lat, lng}, resultAtScanTime, createdAt` — logged whenever a user files a counterfeit report, for state drug regulatory authorities to act on.

No table is needed for verification itself — that's a stateless read through to `pharma-core`/Fabric on every request.

---

## 4. The 7 Verification States (must be exactly this taxonomy)

| State | Meaning | UI Treatment |
|---|---|---|
| `GENUINE` | Valid signature, active expiry, on-chain and not yet sold | ✅ Green |
| `AT_SHOP` | Verified in inventory at a licensed pharmacy | ✅ Green (informational: "in stock at a registered shop") |
| `ALREADY_SOLD` | Valid signature, but ledger already shows `SOLD` | ⚠️ Red — likely a cloned QR reused after the real sale |
| `RECALLED` | Valid signature, manufacturer triggered a recall | 🚨 Red — block-consumption messaging |
| `EXPIRED` | Past expiry date | ⚠️ Red/Amber — block-consumption messaging |
| `COUNTERFEIT` | Signature invalid | 🚨 Red — this pack was never signed by a real manufacturer key |
| `NOT_FOUND` | Well-formed token, but no genesis record on-chain | 🚨 Red — no manufacturing record exists for this ID |

---

## 5. Core API Surface & Dual-Mode QR URL Structure

### QR Code URL Format:
$$\mathbf{\text{https://pharmachain.gov.in/verify/}}\underbrace{\mathbf{:packHash}}_{\text{Path Param}}\mathbf{?token=}\underbrace{\mathbf{:signedToken}}_{\text{Query Param}}$$

* **Mode 1 (Native Camera / Google Lens)**: The phone recognizes the HTTPS URL and opens the web verification page directly, passing the full URL into the verification gateway.
* **Mode 2 (PharmaChain Mobile App)**: The in-app scanner extracts `:packHash` directly from the URL path (`/verify/:packHash`), instantly querying on-chain status.

| Method | Route | Notes |
|---|---|---|
| `GET` or `POST` | `/api/consumer/verify` | Accepts `qrData`, `token`, or `signedToken`. Intelligently extracts `:packHash` from URL path and `token` from query params. Calls `pharma-core` to verify signature + ledger state, maps to 7 states, and enriches with medicine details from `manufacturer-service`. |
| `POST` | `/api/consumer/report` | Logs a counterfeit incident: `{ scannedToken, geolocation, deviceTimestamp }`. Works even if the verify result was `COUNTERFEIT` or `ALREADY_SOLD`. |
| `GET` | `/healthz` | Standard k8s probe |

---

## 6. Inter-Service Communication

```
consumer-service  ──X-Service-Token──▶  pharma-core        (signature + ledger state)
consumer-service  ──public GET──▶       manufacturer-service /api/manufacturer/batch/public/:batchId
                                          (medicine display details)
```

Two calls per verify: one to `pharma-core` for the security-critical answer, one to `manufacturer-service` for the human-readable label. If either call is slow, the security answer (`pharma-core`) should still render even if the display details are momentarily unavailable — never let a metadata-fetch failure block a genuine/counterfeit verdict from showing.

---

## 7. MVP Priority Ranking

1. **Critical, build first — this is the whole product:** `/api/consumer/verify`, correctly mapping all 7 states, rendering in under ~1 second on a low-end phone.
2. **Critical:** the counterfeit report endpoint — this is what turns individual scans into a regulatory signal, which is the actual "eliminate fake medicines" mechanism, not just a nice display.
3. **Important, second wave:** camera-free fallback for feature phones (see the SMS-based verification idea from earlier project notes — a human-typable short code printed on the strip, texted to a service number, replies with the same 7-state result). This matters a lot for the pitch's public-health framing but can follow once the primary scan flow works.
4. **Nice-to-have (explicitly lower priority per your own framing):** consumer accounts, scan history, saved medicines, loyalty-style features. These are pleasant CRUD additions but not what wins on "did we stop fake medicines" — don't let them compete for build time against the verify/report flow.

---

## 8. Open Risks

- Public, zero-auth `verify` endpoint is also the easiest one to abuse (scripted scraping of batch IDs) — coordinate with `pharma-core`'s rate-limiting plan rather than adding auth here, since adding auth would defeat the "any phone camera, no app" MVP goal.
- `NOT_FOUND` vs `COUNTERFEIT` are easy to conflate in code — they must stay distinct (one means "well-signed but never minted," which shouldn't normally happen and may indicate a key compromise; the other means "bad signature," the expected counterfeit case) since regulators will want to know which failure mode they're looking at.
