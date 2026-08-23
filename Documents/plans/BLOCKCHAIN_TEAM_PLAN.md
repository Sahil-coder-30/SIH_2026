# Blockchain Team Plan

**Audience:** blockchain team · **Repo:** `~/Desktop/BlockChain/SIH_2026`
**Components:** `chaincode/` (Java, fabric-chaincode-shim 2.5) · `backend/` (Spring Boot 4.1 gateway, `:8080`)
**Contract:** `API_CONTRACT.md §5.5`

---

## Rules

| # | Rule |
|---|---|
| **R1** | **Bug fixes only — no new ledger endpoints.** The backend is building four small endpoints tonight (`API_CONTRACT.md §7` Tier 1); **none of them touch the ledger.** Your four tasks below are the complete scope. |
| **R2** | `API_CONTRACT.md` is the source of truth for the pharma-core ↔ gateway interface. |
| **R4** | **Never fail open.** An unrecognised state must never resolve to a healthy one. |
| **R6** | The POST-DEMO section is fenced. Do not start it. |

**File paths below are relative to** `chaincode/src/main/java/org/hyperledger/fabric/samples/assettransfer/` **and** `backend/src/main/java/…/`.

---

## Summary

The Fabric layer is architecturally sound and the Spring Security configuration is the best-implemented component in the entire project. But **the ledger currently misreports pack state**, and two of the four endpoints pharma-core calls fail 100% of the time. Four fixes, three of them one-liners.

The reason this was not caught earlier: **there are zero tests across all 10 Java files.** Task 1 includes the one test that would have caught the highest-severity defect on the day it was introduced.

---

## Task 1 · P0 · S — The `:` vs `~` world-state key split

**This is the single highest-value fix in the project. Do it first.**

`PharmaContract.java` **writes** composite keys with `:` and **reads** them with `~`.

| Writes (`:`) | Reads (`~`) |
|---|---|
| `:91` `packId + ":" + normalizedEventType` | `:242` `packHash + "~CURRENT"` |
| `:92` `packId + ":CURRENT"` | `:281` `packHash + "~CURRENT"` |
| `:163-165` `":" + eventType` · `":CURRENT"` · `":BATCH"` | `:295` `packHash + "~CURRENT"` |
| `:215-216` `":RECALLED"` · `":RECALL"` | |

Introduced by commit **`b26d393`**, which changed every write site and missed all three reads.

### Why a sold pack reports `AtShop`

The mechanism is worth understanding, because the fallback chain at `:257-270` hides the failure instead of surfacing it.

`getPackStatus` tries, in order:

| Line | Reads | Against a **sold** pack |
|---|---|---|
| `:242` | `packHash~CURRENT` | ❌ miss — the write was `:CURRENT` |
| `:258` | `packHash:SALE` | ❌ miss — the write was `:SOLD`, not `:SALE` |
| `:263` | `packHash:INTAKE` | ✅ **HIT** — still present from the earlier intake event |
| `:268` | `packHash:MFG` | not reached |

So the function returns **`AtShop`** for a pack that has been sold. **The double-sale guard cannot fire from ledger data** — the one control that makes this whole system work against pack cloning is silently disabled.

A freshly minted pack misses all four (`:MINTED` ≠ `:MFG`) and correctly returns `NOT_FOUND` — so newly minted packs also fail verification.

### Fix

1. Change `~CURRENT` → `:CURRENT` at `:242`, `:281`, `:295`.
2. Fix the stale fallback keys at `:258` and `:268`: they read `:SALE` and `:MFG`, but the writer normalises to `SOLD` and `MINTED`. Either align them or — better — **delete the fallback chain entirely** once `:CURRENT` resolves. It exists for a key format nothing writes any more, and it is what converted a hard miss into a plausible wrong answer.
3. **Redeploy the chaincode.** Packs written before the fix keep their old keys; either re-mint the demo batch or accept that pre-fix packs stay unresolvable.

### The test that would have caught this

`chaincode/` has **no test source set**. Add one test:

```java
@Test
void writtenKeyIsReadableByGetPackStatus() {
    contract.recordTransition(ctx, PACK, "MINTED", /* … */);
    String result = contract.getPackStatus(ctx, PACK, BATCH);
    assertTrue(result.contains("\"status\":\"Packaged\""));   // fails today
}

@Test
void soldPackDoesNotReportAtShop() {
    contract.recordTransition(ctx, PACK, "MINTED", /* … */);
    contract.recordTransition(ctx, PACK, "INTAKE", /* … */);
    contract.recordTransition(ctx, PACK, "SOLD",   /* … */);
    assertTrue(contract.getPackStatus(ctx, PACK, BATCH).contains("\"status\":\"Sold\""));
}
```

A write-then-read round trip is the minimum viable test for any key-value contract. These two are worth more than the rest of the test suite you will eventually write.

---

## Task 2 · P0 · S — Remove the fail-open default

`:246` — `String status = "Packaged";`

This initialiser is also the fallback. Any `eventType` the `if/else` chain at `:246-253` does not recognise leaves `status` as `"Packaged"`, which the consumer app maps to **`GENUINE`**.

**An unrecognised ledger state currently renders as a genuine medicine.**

Initialise to `"UNKNOWN"` and let it propagate. pharma-core's mapper already defaults unknown states to `NOT_FOUND`, which the client treats as *suspect* — so once this is fixed, the whole chain fails closed correctly. Do not add `UNKNOWN` to the client-facing enum; `API_CONTRACT.md §4.1` is frozen at seven states and unknown → `NOT_FOUND` is the intended path.

---

## Task 3 · P0 · M — The two request shapes that 500 unconditionally

**Coordinated with Backend task 3.** Agree the shape in the group chat before either side changes code, then change both.

### `POST /api/transition/batch`

`BatchTransitionRequest.java:6-7` declares `{ batchId, transitions }`.
pharma-core posts a **bare JSON array**.
→ `HttpMessageNotReadableException` → **500 on every call.**

Every `MINTED` transition from every mint has failed. Nothing from any mint has ever reached the ledger — which is the second reason verification returns `NOT_FOUND`, independent of Task 1.

**Agreed shape:** `{ "batchId": "...", "transitions": [ … ] }` — pharma-core wraps the array. Backend owns that change.

**Your side:**
- Return **400** with a readable message on bind failure, not 500. A malformed body is a client error, and the current 500 sent the backend team hunting for a server fault for a schema mismatch.
- **Return `recordedHashes` in the response.** `:197-200` returns only `totalProcessed` / `committedCount` / `failedCount`. pharma-core looks for `recordedHashes`, finds nothing, and logs `0/N recorded` on every mint **including successful ones** — so a working mint is indistinguishable from a broken one in the logs.

### `POST /api/transition/recall`

`RecallRequest.java:4-8` declares `{ systemBatchId, actorId, reason, recallDate, recallTime }`.
pharma-core sends `batchId` and `fromId`.
→ two `null` fields → NPE → **500 on every call.**

**Recall is entirely non-functional today.** It is also the single most safety-critical operation in a pharmaceutical traceability system, so it belongs in the demo.

**Agreed shape:** keep the Java field names; backend renames on the sender side.

Note the *read* path already works — `getPackStatus` checks `batchId + ":RECALLED"` at `:233-238` as its first priority, matching the write at `:215-216`, and correctly overrides `Sold`. Only the write endpoint is broken.

---

## Task 4 · P1 · S — Require auth on ledger reads

`SecurityConfig.java:43`

```java
.requestMatchers(HttpMethod.GET, "/api/transition/**").permitAll()
```

Every ledger read is public: full custody history for any pack, and `queryTransitions` accepts arbitrary `fromId` / `toId` / `hash` filters. Anyone who can reach the service can enumerate the supply chain — which distributor shipped what, to which pharmacy, when, in what volume. That is commercially sensitive even ignoring the security implications.

Only pharma-core calls these endpoints, and it already authenticates with RS256. Remove the `permitAll()` and let the existing JWT chain handle GETs.

---

## Do not touch before the demo

Real issues, all deferred:

- Typed DTOs (handlers return raw `String`; `getPackStatus` hand-builds JSON at `:238`, `:254`, `:260`, `:265`, `:270`, `:273`)
- Proper HTTP codes — `404` for `NOT_FOUND`, `409` for `ALREADY_SOLD`
- `TransitionController.java:67` passes `""` as `batchId`
- The batch write path (`:152-202`) bypasses the entire custody state machine at `:105-138`, and defaults a missing `eventType` to `MINTED` and a missing `fromId` to `GENESIS`
- `InTransit` event type and the distributor leg
- Collision-based soft idempotency at `:170-175` → make explicit
- CouchDB indexes — `queryTransitions` currently does full scans

## Do not regress

`SecurityConfig.java:36-62` — `NimbusJwtDecoder` with the JWKS URI plus issuer *and* audience validators. This is correct, complete, and the healthiest component in the entire system across all three repositories. It is also what makes the RS256 machine-identity story credible in the presentation. Leave it alone apart from Task 4.

---

# POST-DEMO — do not start before the demo ships

1. **CouchDB selector injection.** `:331-339` builds the rich-query selector by concatenating `fromId`, `toId`, and `hash` **unescaped** into a JSON string. A crafted value can alter the selector. Not demo-blocking because only pharma-core calls it, but it is a genuine injection vector and should be parameterised or strictly validated.
2. **State machine on the batch path.** Port the validation at `:105-138` into `:152-202` so bulk writes are validated like single ones. Today a batch write can create custody transitions the single-write path would reject.
3. **Typed responses end to end** — Genson `@DataType` for outputs, DTOs in the gateway, real status codes. Removes the hand-built JSON entirely.
4. **`InTransit` + distributor leg.** Requires coordinated changes across the chaincode state machine, pharma-core's mapper, and all three frontends. Contract change — `API_CONTRACT.md` first.
5. **Explicit idempotency.** Return which hashes were newly written versus already present, rather than inferring from key collision.
6. **CouchDB indexes** for `docType`, `fromId`, `toId`, `hash`. Required before any realistic data volume.
7. **A real test suite.** Ten Java files, zero tests. Start from the two round-trip tests in Task 1 and grow outward — the state machine transitions are the next most valuable target.
8. **Multi-org endorsement policy.** Currently a single-org network, which materially weakens the "no single party can rewrite history" claim. If a judge asks whether this is really decentralised, the honest answer today is *"the architecture supports multi-org; the demo network runs one org."* Worth fixing before any real pilot, and worth phrasing carefully in the presentation.
