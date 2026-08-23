# consumer — Implementation Plan

**Port:** `3003` · **Base path:** `/api/consumer` · **Datastore:** **none — stateless by design**
**Client:** customer-mobile (Expo RN), no auth
**Contract:** `Documents/API_CONTRACT.md §4, §5.3`

---

## 1. Purpose

The public verification endpoint. A patient scans the QR on a medicine pack and learns whether it is genuine.

**This is the service the whole product exists for.** Everything else — key management, minting, custody tracking, the ledger — is infrastructure that exists so this one endpoint can answer honestly.

It has **no database and no accounts, deliberately.** Anyone can verify any pack without signing up. Nothing to leak, nothing to breach, no friction between a worried patient and an answer. Present that as a design decision, not a gap: a verification tool that demands registration is a verification tool nobody uses.

It is also the **smallest** service, and the closest to correct. Most of the work here is *not breaking it.*

---

## 2. Data owned

**Nothing.** No models, no collections, no cache.

Verification is a pure function of `(scanned QR, keystore public key, ledger state)`. That is why this service can scale horizontally without limit and why it is the safest component to expose publicly.

Reports currently log to stdout and are not persisted (`controllers/report.controller.js`). **Leave it that way tonight.** Adding persistence means adding a datastore to the one service that does not have one — a real architectural change, not a bug fix.

---

## 3. API surface

| Method | Path | Auth | Status |
|---|---|---|---|
| POST | `/api/consumer/verify` | public | 🔧 **task 1** |
| POST | `/api/consumer/report` | public | ✅ works today |

### `POST /verify`

**Request** — one field, accepted under several names:
```json
{ "qrData": "<raw scanned string>" }
```
Also `token`, `signedToken`, or `?token=` / `?qrData=` in the query string.

`extractTokenAndHashFromQrData` handles all three QR forms — full URL with `?token=`, path-only URL, bare JWT. **The client sends the camera output verbatim and parses nothing.**

**Response `200`** — envelope frozen in contract §4.3. Field presence varies by state:

| `uiState` | `valid` | `payload` | `packHash` | `blockchainStatus` |
|---|---|---|---|---|
| `COUNTERFEIT` | `false` | ✗ | ✗ (`scannedHash`, may be `null`) | ✗ |
| `EXPIRED` | `true` | ✓ | ✗ | ✗ |
| all others | `true` | ✓ | ✓ | ✓ |

### The seven states — FROZEN

`controllers/verify.controller.js` defines the canonical enum. Do not add, rename, or reorder:

```js
const UI_STATE = Object.freeze({
    GENUINE: 'GENUINE', ALREADY_SOLD: 'ALREADY_SOLD', RECALLED: 'RECALLED',
    EXPIRED: 'EXPIRED', AT_SHOP: 'AT_SHOP', COUNTERFEIT: 'COUNTERFEIT',
    NOT_FOUND: 'NOT_FOUND',
});
```

And the mapper, which is **already correct**:

```js
switch (blockchainStatus) {
    case 'Recalled':  return UI_STATE.RECALLED;
    case 'Sold':      return UI_STATE.ALREADY_SOLD;
    case 'AtShop':    return UI_STATE.AT_SHOP;
    case 'Packaged':  return UI_STATE.GENUINE;
    case 'NOT_FOUND': return UI_STATE.NOT_FOUND;
    default:          return UI_STATE.NOT_FOUND;   // ← fails CLOSED. Leave it.
}
```

**That `default` is the single most important line in this service.** An unrecognised ledger state resolves to `NOT_FOUND`, which the client renders as *suspect*. If it resolved to `GENUINE`, a chaincode bug would silently bless counterfeit medicine — which is precisely what the fail-open initialiser in the chaincode does today (Blockchain task 2). This mapper is what stops that from reaching a patient.

**Do not "improve" this switch.** An earlier draft of the plan proposed a richer `verdict` + `severity` envelope; it was dropped because it is a contract change requiring coordinated edits in three frontends. It is recorded in contract §POST-DEMO.

### `POST /report` — works, leave it alone

`{ qrToken, location?, notes?, photoUrl? }` → `201 { status, message, reportId: 'RPT-…' }`

**Accepted even when the token is completely invalid** — that is the entire point. Someone holding a fake pack must be able to report it. Do not add validation that rejects bad tokens here.

---

## 4. Communication

**Inbound:** customer-mobile, public, no auth.

**Outbound:** `pharma-core` only, via `services/coreClient.service.js`.

**This service has the narrowest authority in the system, and that is deliberate.** Under the authorization matrix (`API_CONTRACT.md §2.1`) `consumer` gets exactly three scopes — `keys:read`, `hash:verify`, `hash:status` — and nothing else. It cannot generate a key, cannot mint, cannot write a custody event.

That is not an arbitrary restriction; it follows from what this service *is*. It is the only component exposed to the open internet with no user authentication, so it is the most likely thing to be compromised. Today it shares one `X-Service-Token` with every other service, which means **compromising it yields the ability to mint signed pharmaceutical packs.** Core task 6 closes that. When it lands, this service's core client switches to `SERVICE_TOKEN_CONSUMER` and a `403 SCOPE_DENIED` on a mint attempt becomes the demonstrable proof of the boundary.

```
POST /api/consumer/verify
   │
   ├─ TIER 1 ── core POST /core/hash/verify
   │            ES256 signature + expiry check.
   │            Needs ONLY the manufacturer's public key.
   │            Invalid → uiState COUNTERFEIT, HTTP 200, STOP. No ledger call.
   │
   └─ TIER 2 ── core GET /core/hash/status/:hash?batchId=
                ledger custody state → mapStatusToUiState → uiState
```

**The two-tier split is the product's core claim, and this controller is where it is expressed.** Tier 1 needs no ledger, no network beyond the public key, and no database. Keep the two tiers textually separate in the code — do not merge them into one helper — because the clarity of that boundary is what makes the offline story true rather than aspirational.

**Short-circuiting on an invalid signature is correct.** A pack that fails Tier 1 is counterfeit; asking the ledger about it wastes a round trip and could only produce a confusing second opinion.

---

## 5. Defects

| # | P | Location | Defect |
|---|---|---|---|
| 1 | P0 | `services/coreClient.service.js` | **No `validateStatus` on the axios instance.** pharma-core returns 400 for an invalid signature, so axios **throws**, the outer `catch` runs, and the correctly-written `COUNTERFEIT` branch is **unreachable dead code**. **A forged QR returns `500 {status:'error'}` instead of a counterfeit warning.** |
| 2 | P2 | `controllers/report.controller.js` | Reports log to stdout only; no persistence. Documented as Phase 3. |
| 3 | P2 | — | No `GET /verify/:packHash`, so a QR opened as a plain URL does not resolve. Tier 2 in the register — and without `?token=` it could never check a signature, so it could never return `GENUINE`. |

**Defect 1 is the highest-impact single-line bug in the Node repo.** The code that tells a patient their medicine is fake has never executed.

---

## 6. Tasks

Two tasks. Both small. Then stop.

### 1 · P0 · S — Make the `COUNTERFEIT` path reachable

Add to `services/coreClient.service.js`:

```js
const coreClient = axios.create({
    baseURL: PHARMA_CORE_URL,
    headers: { 'X-Service-Token': SERVICE_TOKEN, 'Content-Type': 'application/json' },
    timeout: 10000,
    validateStatus: s => s < 500,        // ← 4xx verdicts reach the mapper, not the catch
});
```

Paired with `pharma-core` task 1, which changes that 400 to a 200. **Do both** — the status fix alone is sufficient today, but `validateStatus` means the next non-2xx verdict anyone introduces still reaches the mapping code.

⚠️ **`validateStatus: s => s < 500` also means a `403 SCOPE_DENIED` from core task 6 no longer throws.** Make sure the verdict mapper does not treat an authorization failure as a *pack* verdict — a 403 is an infrastructure fault and must surface as an error, never as `GENUINE` or `COUNTERFEIT`. Check `res.data.status === 'error'` before mapping.

Then **confirm the branch actually runs.** Send a token with one character changed in the signature segment and check you get `200` with `uiState: 'COUNTERFEIT'`. This code has never executed successfully; reading it is not verification.

⚠️ Note `SERVICE_TOKEN` is read at **module scope**, so it is captured once at import. It cannot be changed at runtime — export it before starting the service. *(When core task 6 lands, this becomes `SERVICE_TOKEN_CONSUMER` sent as `Authorization: Bearer`. Module-scope capture is fine for phase 1; it is one of the reasons phase 2's rotating tokens need a mutable cache and are not a demo-eve change.)*

### 2 · P0 · S — Confirm the failure modes are honest

No code change expected. Verify three things behave as the contract says:

| Situation | Expected |
|---|---|
| Valid signature, ledger unreachable | must **not** return `GENUINE`. `NOT_FOUND` (suspect) is correct. |
| pharma-core unreachable | `500`. A genuine infrastructure fault — correct as an error. |
| Unknown `blockchainStatus` | `NOT_FOUND` via the `default` branch. |

**If any of these can produce `GENUINE`, stop and fix it before anything else.** A false negative is an inconvenience; a false positive on authenticity is the one failure mode that could put someone in hospital.

---

## Do not touch before the demo

- **The 7-value `uiState` enum.** Frozen. Three frontends switch on it.
- **The `default: → NOT_FOUND` mapper branch.** It fails closed. It is correct.
- **`extractTokenAndHashFromQrData`.** Already handles all three QR forms.
- **Report persistence.** Adding a datastore to the stateless service is an architectural change.
- **`GET /verify/:packHash`.** Tier 2. Also undemonstrable: the printed URL points at `pharmachain.gov.in`, which does not resolve.
- **Consumer accounts / login.** Tier 3. `customer-mobile` has `firebase` and `expo-auth-session` in its dependencies, which will make someone suggest this. Say no — statelessness is a feature here.
- **Rate limiting.** A real gap on a public endpoint, but not a demo concern.

## Do not regress

1. **Statelessness.** No database. No cache. No accounts.
2. **The Tier 1 / Tier 2 separation** as two visibly distinct steps in the controller.
3. **Short-circuit on invalid signature** — do not call the ledger for a pack that already failed.
4. **`COUNTERFEIT` returns HTTP 200.** It is a successful verification with a bad outcome.
5. **`/report` accepting invalid tokens.** That is the point of the endpoint.
6. **No client-side JWT verification.** The apps correctly avoid it; keep it that way.

---

## Verification

Needs a minted batch. Take two rows from the export CSV: one untouched, one with a single character changed in the signature segment.

1. `POST /verify` with a genuine token → `200`, `uiState: "GENUINE"`, `valid: true`, `payload` present
2. **`POST /verify` with the forged token → `200`, `uiState: "COUNTERFEIT"`, `valid: false`, no `payload`.** *A 500 means task 1 is incomplete.* **(task 1)**
3. `POST /verify` with `{}` → `400`
4. `POST /verify` with the **full `verifyUrl`** → same result as step 1 *(proves the parser)*
5. `POST /verify` with a **bare JWT** → same result as step 1 *(third QR form)*
6. After a shopkeeper intake → `uiState: "AT_SHOP"` *(needs Blockchain 1)*
7. After a sale → `uiState: "ALREADY_SOLD"` *(needs Blockchain 1)*
8. After a recall → `uiState: "RECALLED"` *(needs Blockchain 3 + core task 2)*
9. Expired pack → `uiState: "EXPIRED"`, no `packHash`
10. **Stop pharma-core → `500`, never `GENUINE`** **(task 2)**
11. `POST /report` with a deliberately invalid token → `201` with a `reportId` *(must succeed)*

**Step 2 is the demo.** It is the moment the counterfeit warning appears on stage, it is a two-line fix across two services, and it currently returns a server error. Rehearse it until it cannot fail — and make sure it is genuinely reaching the backend. A hardcoded green checkmark is the one failure mode that would be fatal in front of judges.
