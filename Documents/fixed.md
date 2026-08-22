# 🔧 PharmaChain — Blockchain Developer Fix List
### Issues in current `pharmacc` + `pharma-backend` that block integration

> **Scope**: Main architecture only — manufacture, sale, status query, recall.
> Intake flow and SMS are out of scope for now.
> Fix these before any other service tries to call `pharma-backend`.

---

## Summary of Issues

| # | Issue | Severity | Blocks |
|---|---|---|---|
| F-01 | Hardcoded `/home/jarvis/...` path in `FabricConfig.java` | 🔴 Critical | Docker deployment |
| F-02 | `PEER_ENDPOINT` hardcoded to `localhost:7051` | 🔴 Critical | Docker deployment |
| F-03 | No agreed hash-key convention for multi-event packs | 🔴 Critical | All event writes |
| F-04 | No batch-level recall function in chaincode | 🔴 Critical | Recall feature |
| F-05 | No `getPackStatus` function — status requires 3 separate calls | 🟡 High | Consumer verify, shopkeeper sale check |
| F-06 | `pharma-backend` has no authentication | 🟡 High | Security — internal network only won't be enough |
| F-07 | All errors return HTTP 500 (no distinction between 404 and 500) | 🟡 High | `pharma-core` can't parse error type cleanly |
| F-08 | No bulk registration — 1000 packs = 1000 individual chaincode calls | 🟠 Medium | Batch mint performance |

---

## F-01 🔴 — Hardcoded Path in `FabricConfig.java`

**Current code (broken in Docker):**
```java
private static final Path CERT_PATH = Path.of(
    "/home/jarvis/fabric-samples/test-network/organizations/...");
private static final Path KEY_DIR = Path.of(
    "/home/jarvis/fabric-samples/test-network/organizations/...");
private static final Path TLS_CERT_PATH = Path.of(
    "/home/jarvis/fabric-samples/test-network/organizations/...");
```

**Fix — read from environment variables:**
```java
private static final Path CERT_PATH     = Path.of(System.getenv("FABRIC_CERT_PATH"));
private static final Path KEY_DIR       = Path.of(System.getenv("FABRIC_KEY_DIR"));
private static final Path TLS_CERT_PATH = Path.of(System.getenv("FABRIC_TLS_CERT_PATH"));
```

**Add to `application.properties` (or Docker env):**
```
FABRIC_CERT_PATH=/crypto/users/User1@org1.example.com/msp/signcerts/cert.pem
FABRIC_KEY_DIR=/crypto/users/User1@org1.example.com/msp/keystore
FABRIC_TLS_CERT_PATH=/crypto/peers/peer0.org1.example.com/tls/ca.crt
```

The crypto-config folder will be **mounted as a Docker volume** at `/crypto/` — the Node.js services will pass the path via env.

---

## F-02 🔴 — `PEER_ENDPOINT` Hardcoded to `localhost:7051`

**Current code (broken in Docker):**
```java
private static final String PEER_ENDPOINT   = "localhost:7051";
private static final String OVERRIDE_AUTH   = "peer0.org1.example.com";
```

`localhost:7051` works on your WSL machine but will not resolve inside a Docker container. Docker containers reach the Fabric peer via the Docker network hostname.

**Fix — read from environment variable:**
```java
private static final String PEER_ENDPOINT = System.getenv().getOrDefault(
    "PEER_ENDPOINT", "peer0.org1.example.com:7051");
private static final String OVERRIDE_AUTH = System.getenv().getOrDefault(
    "PEER_OVERRIDE_AUTH", "peer0.org1.example.com");
```

**Docker Compose env for `pharma-backend`:**
```yaml
environment:
  PEER_ENDPOINT: peer0.org1.example.com:7051
  PEER_OVERRIDE_AUTH: peer0.org1.example.com
  FABRIC_CERT_PATH: /crypto/users/User1@org1.example.com/msp/signcerts/cert.pem
  FABRIC_KEY_DIR: /crypto/users/User1@org1.example.com/msp/keystore
  FABRIC_TLS_CERT_PATH: /crypto/peers/peer0.org1.example.com/tls/ca.crt
```

---

## F-03 🔴 — No Hash-Key Convention for Multi-Event Packs

**The problem:**

`recordTransition` rejects any duplicate `hash` with `TRANSITION_ALREADY_EXISTS`. But the same physical pack needs **multiple** events on-chain (manufacture registration, sale). Both events can't use the same `hash` as the key.

**Current chaincode has no solution for this** — it will reject the second event for a pack.

**Agreed convention (implement this now):**

Each event uses a **composite key** = `packHash + event suffix`:

| Event | `hash` field value | `fromId` | `toId` |
|---|---|---|---|
| Pack registered at manufacture | `<packHash>:MFG` | `"MINTED"` | `<manufacturerId>` |
| Pack sold to consumer | `<packHash>:SALE` | `<shopId>` | `"CONSUMER"` |
| Batch recalled | `<batchId>:RECALL` | `<manufacturerId>` | `"RECALLED"` |

**Example:**
```
Pack hash: "e3b0c44298fc1c149afb"

Manufacture event key: "e3b0c44298fc1c149afb:MFG"
Sale event key:        "e3b0c44298fc1c149afb:SALE"
Recall event key:      "BATCH-MFR001-001:RECALL"
```

> ⚠️ This convention must be agreed and frozen. Every service (pharma-core, manufacturer-svc, shopkeeper-svc, consumer-svc) will use this same suffix scheme. Do not change it after services are built against it.

**No chaincode change needed for F-03** — this is just an agreement on key naming that `pharma-core` enforces. The current `recordTransition` function already works correctly with these composite keys.

---

## F-04 🔴 — No Batch-Level Recall Function

**The problem:**

The current chaincode has `recordTransition` which records one event at a time. There is no way to recall an entire batch (e.g., 1,000 packs) in one call. Calling `recordTransition` 1,000 times for a recall is impractical.

**Fix — add `recallBatch` to `PharmaContract.java`:**

```java
@Transaction(intent = Transaction.TYPE.SUBMIT)
public String recallBatch(final Context ctx, final String batchId,
                           final String fromId, final String reason,
                           final String recallDate, final String recallTime) {

    String key = batchId + ":RECALL";

    if (TransitionExists(ctx, key)) {
        String errorMessage = String.format("Batch %s already recalled", batchId);
        throw new ChaincodeException(errorMessage, "BATCH_ALREADY_RECALLED");
    }

    // Re-use the Transition model with reason in the sellerId field,
    // or extend Transition to add a `reason` field (preferred)
    Transition recall = new Transition(key, fromId, "RECALLED",
                                        recallDate, recallTime, reason);
    String sortedJson = genson.serialize(recall);
    ctx.getStub().putStringState(key, sortedJson);

    return sortedJson;
}
```

**Add to `TransitionController.java`:**

```java
@PostMapping("/recall")
public String recallBatch(@RequestBody RecallRequest req) throws Exception {
    byte[] result = getContract().submitTransaction(
        "recallBatch",
        req.batchId, req.fromId, req.reason,
        req.recallDate, req.recallTime
    );
    return new String(result);
}
```

**Add `RecallRequest.java` DTO:**

```java
public class RecallRequest {
    public String batchId;
    public String fromId;     // manufacturerId
    public String reason;
    public String recallDate; // ddmmyyyy
    public String recallTime; // hh:mm:ss
}
```

**New endpoint:**
```
POST /api/transition/recall
Body: { "batchId": "BATCH-MFR001-001", "fromId": "MFR-CIPLA",
        "reason": "Contamination", "recallDate": "20082026", "recallTime": "14:00:00" }
```

---

## F-05 🟡 — No `getPackStatus` Chaincode Function

**The problem:**

`pharma-core` needs to answer "what is this pack's current status?" — but there is no single chaincode function that does this. Currently, `pharma-core` would need to make **3 separate HTTP calls** to `pharma-backend` to check `:SALE`, `:RECALL`, `:MFG` in sequence.

**Option A (preferred — chaincode change):** Add a `getPackStatus` function:

```java
@Transaction(intent = Transaction.TYPE.EVALUATE)
public String getPackStatus(final Context ctx, final String packHash, final String batchId) {

    // Check in priority order: Recalled > Sold > AtShop > Packaged > NotFound

    // 1. Is the batch recalled?
    String recallKey = batchId + ":RECALL";
    String recallState = ctx.getStub().getStringState(recallKey);
    if (recallState != null && !recallState.isEmpty()) {
        return "{\"status\":\"Recalled\",\"detail\":" + recallState + "}";
    }

    // 2. Was the pack sold?
    String saleKey = packHash + ":SALE";
    String saleState = ctx.getStub().getStringState(saleKey);
    if (saleState != null && !saleState.isEmpty()) {
        return "{\"status\":\"Sold\",\"detail\":" + saleState + "}";
    }

    // 3. Was the pack registered at manufacture?
    String mfgKey = packHash + ":MFG";
    String mfgState = ctx.getStub().getStringState(mfgKey);
    if (mfgState != null && !mfgState.isEmpty()) {
        return "{\"status\":\"Packaged\",\"detail\":" + mfgState + "}";
    }

    // 4. Unknown — not on chain
    return "{\"status\":\"NOT_FOUND\"}";
}
```

**Add to `TransitionController.java`:**

```java
@GetMapping("/status")
public String getPackStatus(@RequestParam String packHash,
                             @RequestParam String batchId) throws Exception {
    byte[] result = getContract().evaluateTransaction("getPackStatus", packHash, batchId);
    return new String(result);
}
```

**New endpoint:**
```
GET /api/transition/status?packHash=<hash>&batchId=<batchId>
Response: { "status": "Sold" | "Recalled" | "Packaged" | "NOT_FOUND", "detail": { ...Transition } }
```

**Option B (no chaincode change):** `pharma-core` makes 3 sequential HTTP calls itself. Slower but requires no chaincode redeployment. Use this only if chaincode redeployment is risky right now.

---

## F-06 🟡 — Configure `pharma-backend` to Verify JWTs via `pharma-core`'s `/.well-known/jwks.json`

> **Reference**: [auth_security_architecture_plan.md](file:///Users/home/Desktop/SIH_2026/Documents/auth_security_architecture_plan.md)  
> **Topology**:
> - **`pharma-core` (Port 4000)** is the central security vault. It signs server-level RS256/ES256 JWTs and exposes `GET /.well-known/jwks.json`.
> - **`pharma-backend` (Port 8080)** is the blockchain gateway. It must **fetch and cache public keys from `http://pharma-core:4000/.well-known/jwks.json`** and verify the `Authorization: Bearer <JWT>` header on all incoming write requests from `pharma-core`.
> - Each frontend-backend pair (`manufacturer-svc`, `shopkeeper-svc`, `consumer-svc`) handles its own client authentication independently.

---

### How to Implement in Spring Boot 4.1.0 (`pharma-backend`)

#### 1. Add Spring Security OAuth2 Resource Server to `backend/build.gradle`:
```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-oauth2-resource-server'
    // existing fabric-gateway & grpc dependencies...
}
```

#### 2. Configure JWKS URI in `backend/src/main/resources/application.properties`:
```properties
# Point to pharma-core's JWKS endpoint
spring.security.oauth2.resourceserver.jwt.jwk-set-uri=${AUTH_JWKS_URI:http://pharma-core:4000/.well-known/jwks.json}
```

#### 3. Create `SecurityConfig.java` (`org.pharma.pharma_backend.SecurityConfig`):
```java
package org.pharma.pharma_backend;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                // Public read queries (consumers & clients verifying medicine status)
                .requestMatchers(HttpMethod.GET, "/api/transition/**").permitAll()
                
                // Protected write operations (only authenticated calls from pharma-core)
                .requestMatchers(HttpMethod.POST, "/api/transition/**").authenticated()
                
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()));

        return http.build();
    }
}
```

#### How it works seamlessly in Spring Boot:
1. `pharma-backend` starts up and fetches public keys from `http://pharma-core:4000/.well-known/jwks.json`.
2. It caches the public keys in memory (default 24h).
3. When `pharma-core` sends a write request (`POST /api/transition` or `POST /api/transition/recall`) with `Authorization: Bearer <JWT>`, Spring Security extracts `kid`, validates the RS256 signature against the cached public key, and verifies expiration.
4. If `pharma-core` rotates keys, Spring Security automatically refetches the JWKS on a cache miss.

---

## F-07 🟡 — All Errors Return HTTP 500

**The problem:**

Both `TRANSITION_NOT_FOUND` and `TRANSITION_ALREADY_EXISTS` currently cause Spring Boot to throw an unhandled exception → HTTP 500. `pharma-core` can't distinguish "pack not found" (valid — means unsold stock) from a real server error.

**Fix — add a global exception handler in Spring Boot:**

```java
// GlobalExceptionHandler.java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleFabricException(Exception ex) {
        String message = ex.getMessage() != null ? ex.getMessage() : "Unknown error";

        // Parse Fabric chaincode errors
        if (message.contains("TRANSITION_NOT_FOUND")) {
            return ResponseEntity.status(404)
                .body(Map.of("code", "TRANSITION_NOT_FOUND", "message", message));
        }
        if (message.contains("TRANSITION_ALREADY_EXISTS")) {
            return ResponseEntity.status(409)
                .body(Map.of("code", "TRANSITION_ALREADY_EXISTS", "message", message));
        }
        if (message.contains("BATCH_ALREADY_RECALLED")) {
            return ResponseEntity.status(409)
                .body(Map.of("code", "BATCH_ALREADY_RECALLED", "message", message));
        }

        // Real server error
        return ResponseEntity.status(500)
            .body(Map.of("code", "CHAIN_ERROR", "message", message));
    }
}
```

**After this fix, `pharma-backend` returns:**

| Situation | HTTP Code | `code` field |
|---|---|---|
| Hash not found | **404** | `TRANSITION_NOT_FOUND` |
| Duplicate hash | **409** | `TRANSITION_ALREADY_EXISTS` |
| Batch already recalled | **409** | `BATCH_ALREADY_RECALLED` |
| Real Fabric error | **500** | `CHAIN_ERROR` |

---

## F-08 🟠 — No Bulk Registration (1000 calls for 1000 packs)

**The problem:**

Registering a batch of 1,000 packs requires 1,000 individual `POST /api/transition` calls. Each call goes through the full Fabric endorsement → ordering → commit cycle. This is too slow for batch mint.

**Fix — add `recordTransitionBatch` to chaincode:**

```java
@Transaction(intent = Transaction.TYPE.SUBMIT)
public String recordTransitionBatch(final Context ctx, final String transitionsJson) {
    // transitionsJson = JSON array of transition objects
    List<Transition> transitions = genson.deserialize(transitionsJson,
        new GenericType<List<Transition>>() {});

    List<String> results = new ArrayList<>();
    for (Transition t : transitions) {
        if (TransitionExists(ctx, t.getHash())) {
            // Skip existing — don't throw, just skip (idempotent batch mint)
            continue;
        }
        String json = genson.serialize(t);
        ctx.getStub().putStringState(t.getHash(), json);
        results.add(t.getHash());
    }
    return genson.serialize(results);  // returns list of successfully written hashes
}
```

**Add to `TransitionController.java`:**

```java
@PostMapping("/batch")
public String recordBatch(@RequestBody List<TransitionRequest> reqs) throws Exception {
    // Convert to JSON for chaincode
    String json = objectMapper.writeValueAsString(reqs);
    byte[] result = getContract().submitTransaction("recordTransitionBatch", json);
    return new String(result);
}
```

**New endpoint:**
```
POST /api/transition/batch
Body: [ { hash, fromId, toId, sellingDate, sellingTime, sellerId }, ... ]
Response: ["hash1", "hash2", ...]  // successfully written hashes
```

> This is a medium-priority fix. For the demo, if batches are small (< 50 packs), individual calls are acceptable. But for production-realistic demos with 1,000 packs, this is needed.

---

## Fix Priority Order

```
Day 1 (before any other service can work):
  ✅ F-01 — Externalise CERT_PATH / KEY_DIR / TLS_CERT_PATH to env vars
  ✅ F-02 — Externalise PEER_ENDPOINT to env var
  ✅ F-03 — Agree and document hash-key convention (no code change needed)
  ✅ F-07 — Add GlobalExceptionHandler (30 min, no chaincode change)

Day 1-2 (before recall or status features work):
  ✅ F-04 — Add recallBatch chaincode function + endpoint
  ✅ F-05 — Add getPackStatus chaincode function + endpoint (or use 3-call fallback)
  ✅ F-06 — Add ServiceTokenFilter (30 min, no chaincode change)

Day 2-3 (performance, do last):
  ✅ F-08 — Add recordTransitionBatch chaincode function + endpoint
```

---

## Chaincode Redeployment (after any chaincode change)

Each time `PharmaContract.java` is changed, redeploy with a new sequence number:

```bash
cd ~/fabric-samples/test-network

# F-03 and F-06/F-07 don't need redeployment (no chaincode change)

# For F-04, F-05, F-08 (chaincode changes):
./network.sh deployCC -ccn pharmacc -ccp ../chaincode-pharma-java -ccl java \
  --ccsequence 2   # increment by 1 each time
```

If you've already deployed with sequence 1, next deployment is `--ccsequence 2`, then `3`, etc.

---

## What Does NOT Need Changing

- ✅ `recordTransition` function — works correctly as-is
- ✅ `getTransitionByHash` function — works correctly as-is
- ✅ `queryTransition` function — works correctly as-is
- ✅ Channel setup (`mychannel`) — no change needed
- ✅ Org setup (Org1MSP, Org2MSP) — no change needed
- ✅ Consensus (Raft orderer) — no change needed
- ✅ CouchDB (World State) — already using CouchDB, rich queries work
- ✅ Spring Boot version — no change needed

---

## Verification Checklist (after fixes)

```bash
# 1. Verify Docker env vars work (F-01, F-02)
docker run --rm -e PEER_ENDPOINT=peer0.org1.example.com:7051 \
  -e FABRIC_CERT_PATH=/crypto/... pharma-backend:latest

# 2. Verify error codes (F-07)
curl http://pharma-backend:8080/api/transition/NONEXISTENT_HASH
# Expected: 404 { "code": "TRANSITION_ALREADY_EXISTS" }  → actually 404 NOT_FOUND

curl -X POST http://pharma-backend:8080/api/transition \
  -d '{"hash":"test","fromId":"A","toId":"B",...}'
# Second POST of same hash → 409 { "code": "TRANSITION_ALREADY_EXISTS" }

# 3. Verify recall (F-04)
curl -X POST http://pharma-backend:8080/api/transition/recall \
  -d '{"batchId":"BATCH-001","fromId":"MFR-01","reason":"Test","recallDate":"20082026","recallTime":"10:00:00"}'
# Expected: 200 + transition JSON

# 4. Verify pack status (F-05)
curl "http://pharma-backend:8080/api/transition/status?packHash=abc123&batchId=BATCH-001"
# Expected: { "status": "NOT_FOUND" } before any events
# After MFG: { "status": "Packaged" }
# After SALE: { "status": "Sold", "detail": {...} }

# 5. Verify service token (F-06)
curl http://pharma-backend:8080/api/transition/abc123
# Expected: 401 Unauthorized (no token)
curl -H "X-Service-Token: correct-secret" http://pharma-backend:8080/api/transition/abc123
# Expected: 404 NOT_FOUND (correct token, hash doesn't exist)
```

---

*Prepared for blockchain engineer | Team PharmaChain | SIH 2026 | 2026-08-20*
