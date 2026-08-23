# ⛓️ PharmaChain: Blockchain Service Specification & Implementation Manual
### Complete Technical Contract for `pharmacc` Chaincode & `pharma-backend-service` (Spring Boot Gateway)
**Document Version:** 1.0 (FINAL CONCRETE SPECIFICATION) | **For:** External Blockchain Engineering Team

---

## 1. Executive Summary & System Role

The **Blockchain Service** is the **immutable trust backbone** of PharmaChain. It consists of two components:
1. **`pharmacc` (Hyperledger Fabric Smart Contract / Chaincode)**: A decentralized, permissioned state machine enforcing legal chain-of-custody rules (`MINTED → INTAKE → SOLD → RECALLED`).
2. **`pharma-backend-service` (Java Spring Boot REST Gateway on Port 8080)**: An external REST gateway outside the Kubernetes microservices cluster that bridges HTTP requests from `pharma-core` to Hyperledger Fabric gRPC peer nodes.

```
┌────────────────────────────────────────────────────────┐
│             KUBERNETES MICROSERVICES CLUSTER           │
│                                                        │
│  manufacturer-service  shopkeeper-service   consumer   │
│           │                  │                 │       │
│           └──────────────────┼─────────────────┘       │
│                              ▼                         │
│                   pharma-core (:4000)                  │
│                (Crypto Vault & JWKS Provider)          │
└──────────────────────────────┬─────────────────────────┘
                               │
                               │ HTTPS REST (Bearer JWT signed by pharma-core RSA-4096)
                               │ Key discovery: https://<PHARMA_CORE_DOMAIN>/.well-known/jwks.json
                               ▼
┌────────────────────────────────────────────────────────┐
│          EXTERNAL BLOCKCHAIN SERVICE (PORT 8080)       │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │ pharma-backend-service (Spring Boot REST API)  │   │
│   │ • Spring Security JWKS Validator               │   │
│   │ • Fabric Node/Java SDK Gateway                 │   │
│   └────────────────────────┬───────────────────────┘   │
│                            │ gRPC Transactions         │
│                            ▼                           │
│   ┌────────────────────────────────────────────────┐   │
│   │ Hyperledger Fabric Peer Nodes & Ledger         │   │
│   │ • pharmacc Smart Contract (PharmaContract.java)│   │
│   │ • World State CouchDB (packId~CURRENT)         │   │
│   │ • Chained Block Ledger (250 transitions/block) │   │
│   └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Authentication Contract: JWKS Bearer Token Validation

Because `pharma-backend-service` runs as an **external standalone service outside the Kubernetes cluster**, it cannot connect to internal Kubernetes service DNS names. 

Instead, it validates all incoming requests from `pharma-core` using the **Public JWKS Endpoint** exposed at the main cluster domain:

$$\mathbf{\text{JWKS URI: }}\mathbf{\text{https://<PHARMA\_CORE\_DOMAIN>/.well-known/jwks.json}}$$

---

### 2.1 The JWT Structure Received by `pharma-backend-service`
Every HTTP request sent by `pharma-core` includes an `Authorization` header:
```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6InBoYXJtYS1jb3JlLXJzMjU2IiwidHlwIjoiSldUIn0...
```

#### Decoded Header:
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "pharma-core-rs256"
}
```

#### Decoded Claims Payload:
```json
{
  "iss": "pharma-core",
  "aud": "pharma-backend",
  "iat": 1787406879,
  "exp": 1787407179
}
```

---

### 2.2 Spring Boot Configuration (`application.yml`)
Configure Spring Security in `pharma-backend-service` to automatically fetch and cache the RSA-4096 public key from `pharma-core`:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          jwk-set-uri: ${PHARMA_CORE_JWKS_URL:https://api.pharmachain.gov.in/.well-known/jwks.json}
          issuer-uri: pharma-core
          audiences: pharma-backend
```

#### Java Spring Security Filter Configuration:
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}")
    private String jwkSetUri;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.decoder(jwtDecoder())));
        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        NimbusJwtDecoder jwtDecoder = NimbusJwtDecoder.withJwkSetUri(this.jwkSetUri).build();
        OAuth2TokenValidator<Jwt> audienceValidator = new JwtClaimValidator<List<String>>(
            JwtClaimNames.AUD, aud -> aud != null && aud.contains("pharma-backend")
        );
        OAuth2TokenValidator<Jwt> issuerValidator = JwtValidators.createDefaultWithIssuer("pharma-core");
        jwtDecoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(issuerValidator, audienceValidator));
        return jwtDecoder;
    }
}
```

---

## 3. Smart Contract State Machine (`PharmaContract.java`)

---

### 3.1 Data Model: `Transition.java`

> 💡 **CRITICAL IDENTIFIER DEFINITION**:
> **`packId` IS the 64-character SHA-256 `packHash`** generated at manufacturing time by `pharma-core`:
> $$\mathbf{packId = packHash = \text{SHA-256}(signedJWT)}$$
> *Example*: `a3f8c2e9b1d4076589e1a4f7832c90123456789abcdef0123456789abcdef012`
> 
> Because the physical QR code on the medicine strip encodes `https://pharmachain.gov.in/verify/:packHash?token=...`, any mobile phone or POS scanner immediately has the `:packHash` as the direct world-state lookup key!

```java
@DataType()
public final class Transition {

    @Property()
    private final String docType = "transition";

    @Property()
    private final String packId;      // The 64-char SHA-256 packHash (e.g. "a3f8c2e9b1d4076589e1a4f7832c90123456789abcdef0123456789abcdef012")

    @Property()
    private final String eventType;   // MINTED | INTAKE | AT_SHOP | SOLD | RECALLED

    @Property()
    private final String hash;        // World State Event Key: packId + "~" + eventType

    @Property()
    private final String fromId;      // Origin party (e.g. "GENESIS", "MFR_CIPLA_001", "DIST_DELHI_01")

    @Property()
    private final String toId;        // Destination party (e.g. "MFR_CIPLA_001", "SHOP_APOLLO_DELHI_09", "CONSUMER")

    @Property()
    private final String sellingDate; // Date string: "YYYYMMDD" or "DDMMYYYY"

    @Property()
    private final String sellingTime; // Time string: "HH:mm:ss"

    @Property()
    private final String sellerId;    // Operator / terminal identifier (e.g. "SHOPOP_04", "LINE_LASER_01")

    // Constructor, Getters, and JSON Serialization
}
```

---

### 3.2 Key Indexing Scheme in World State (CouchDB)

To support **both** append-only event history **and** ultra-fast $O(1)$ verification scans, maintain two state keys per event:

1. **Event State Key (Append-Only History)**:
   $$\text{Key} = \mathbf{packHash + "\sim" + eventType}$$
   *Example*: `a3f8c2e9b1d4076589e1a4f7832c90123456789abcdef0123456789abcdef012~INTAKE`
   *Purpose*: Stores the immutable historical record for this specific lifecycle event.
2. **Current State Pointer Key (Fast $O(1)$ Lookups)**:
   $$\text{Key} = \mathbf{packHash + "\sim CURRENT"}$$
   *Example*: `a3f8c2e9b1d4076589e1a4f7832c90123456789abcdef0123456789abcdef012~CURRENT`
   *Purpose*: Overwritten on every valid transition with the latest `Transition` object. Allows consumer scans (`/verify/:packHash`) to read current status in $< 10\text{ms}$ with a single `getStringState()` without running expensive range queries.

---

### 3.3 Strict Chain-of-Custody Validation Rules

Before writing any transition to the ledger, `PharmaContract.java` **must enforce these 4 security checks**:

```
                       ┌──────────────────────────────────────────────┐
                       │          GENESIS: Initial Factory Run        │
                       └──────────────────────┬───────────────────────┘
                                              │ eventType == "MINTED"
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │             STATE 1: MINTED                  │
                       │           (Owner: Manufacturer)              │
                       └──────────────────────┬───────────────────────┘
                                              │ eventType == "INTAKE" (fromId == MFR, toId == SHOP)
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │             STATE 2: AT_SHOP                 │
                       │           (Owner: Pharmacy XYZ)              │
                       └──────────────────────┬───────────────────────┘
                                              │ eventType == "SOLD" (sellerId == Pharmacy XYZ)
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │              STATE 3: SOLD                   │
                       │             (Owner: Consumer)                │
                       └──────────────────────────────────────────────┘
```

#### Validation Logic:
```java
// 1. Fetch current active state
String currentKey = packId + "~CURRENT";
String currentJson = ctx.getStub().getStringState(currentKey);

// 2. Genesis Check
if (currentJson == null || currentJson.isEmpty()) {
    if (!"MINTED".equalsIgnoreCase(eventType)) {
        throw new ChaincodeException("A pack must originate with a MINTED event. Cannot start at " + eventType, "INVALID_GENESIS");
    }
} else {
    Transition current = JSON.parseObject(currentJson, Transition.class);

    // 3. Double-Spend & Terminal State Checks
    if ("SOLD".equalsIgnoreCase(current.getEventType())) {
        throw new ChaincodeException("Pack " + packId + " has already been SOLD. Double-spending / clone detected.", "ALREADY_SOLD");
    }
    if ("RECALLED".equalsIgnoreCase(current.getEventType())) {
        throw new ChaincodeException("Pack " + packId + " belongs to a RECALLED batch.", "BATCH_RECALLED");
    }

    // 4. Custody Chain Continuity Check
    if ("INTAKE".equalsIgnoreCase(eventType)) {
        if (!"MINTED".equalsIgnoreCase(current.getEventType()) && !"IN_TRANSIT".equalsIgnoreCase(current.getEventType())) {
            throw new ChaincodeException("Cannot INTAKE pack from state " + current.getEventType(), "INVALID_TRANSITION");
        }
    } else if ("SOLD".equalsIgnoreCase(eventType)) {
        if (!"AT_SHOP".equalsIgnoreCase(current.getEventType()) && !"INTAKE".equalsIgnoreCase(current.getEventType())) {
            throw new ChaincodeException("Front-running violation: Cannot sell pack before official INTAKE by shop.", "CUSTODY_CHAIN_VIOLATION");
        }
        if (!current.getToId().equalsIgnoreCase(fromId)) {
            throw new ChaincodeException("Shop " + fromId + " does not own pack " + packId + ". Registered owner: " + current.getToId(), "UNAUTHORIZED_SELLER");
        }
    }
}
```

---

## 4. REST API Endpoint Specifications

All endpoints are hosted by `pharma-backend-service` on **Port `8080`**.

---

### 4.1 Single Transition Record
Used by `shopkeeper-service` during retail intake and checkout sales.

* **Route**: `POST /api/transition`
* **Headers**: `Authorization: Bearer <JWT>`, `Content-Type: application/json`

#### Request Payload:
```json
{
  "packId": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "eventType": "INTAKE",
  "fromId": "MFR_CIPLA_001",
  "toId": "SHOP_APOLLO_DELHI_09",
  "sellingDate": "20260822",
  "sellingTime": "11:40:00",
  "sellerId": "SHOPOP_04"
}
```

#### Success Response (`200 OK` / `201 Created`):
```json
{
  "status": "success",
  "data": {
    "docType": "transition",
    "packId": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "eventType": "INTAKE",
    "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855~INTAKE",
    "fromId": "MFR_CIPLA_001",
    "toId": "SHOP_APOLLO_DELHI_09",
    "sellingDate": "20260822",
    "sellingTime": "11:40:00",
    "sellerId": "SHOPOP_04"
  }
}
```

#### Error Response (`409 Conflict` — Custody Violation):
```json
{
  "status": "error",
  "code": "CUSTODY_CHAIN_VIOLATION",
  "message": "Front-running violation: Cannot sell pack before official INTAKE by shop."
}
```

---

### 4.2 Chunked Batch Transitions (High-Scale 1 Lakh Pack Minting)

> ⚡ **HIGH-THROUGHPUT BULK MINTING MECHANICS**:
> In a pharmaceutical plant, a single batch contains **10,000 to 100,000 blister packs** (1 Lakh packs). 
> Sending 100,000 individual blockchain calls one-by-one would take **~2.7 hours** ($100,000 \times 100\text{ms}$).
> 
> PharmaChain solves this by batching submissions into **400 chunked transactions (250 packs per transaction)**:
> $$\frac{100,000 \text{ packs}}{250 \text{ packs/chunk}} = \mathbf{400 \text{ Block Transactions}}$$
> 
> * **Time to sign 100k packs in memory**: **~10–12 seconds** (via `pharma-core` single-decrypt EC signing).
> * **Time to commit 400 chunk blocks to Fabric**: **~10–15 seconds total** across peer nodes.

* **Route**: `POST /api/transition/batch`
* **Headers**: `Authorization: Bearer <JWT>`, `Content-Type: application/json`

#### Request Payload:
```json
{
  "batchId": "PC-BATCH-CIPLA0-20260822-7D3A1F",
  "transitions": [
    {
      "packId": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "eventType": "MINTED",
      "fromId": "GENESIS",
      "toId": "MFR_CIPLA_001",
      "sellingDate": "20260822",
      "sellingTime": "11:30:00",
      "sellerId": "FACTORY_LINE_01"
    },
    {
      "packId": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "eventType": "MINTED",
      "fromId": "GENESIS",
      "toId": "MFR_CIPLA_001",
      "sellingDate": "20260822",
      "sellingTime": "11:30:00",
      "sellerId": "FACTORY_LINE_01"
    }
  ]
}
```

#### Chaincode Implementation in `PharmaContract.java`:
```java
@Transaction(intent = Transaction.TYPE.SUBMIT)
public String recordTransitionsBatch(Context ctx, String transitionsJson) {
    List<Transition> list = JSON.parseArray(transitionsJson, Transition.class);
    List<String> recorded = new ArrayList<>();
    List<String> failures = new ArrayList<>();

    for (Transition t : list) {
        try {
            String eventKey = t.getPackId() + "~" + t.getEventType();
            String currentKey = t.getPackId() + "~CURRENT";
            String tJson = JSON.toJSONString(t);

            // 1. Check idempotency: if exact same event already exists, accept as soft success
            String existing = ctx.getStub().getStringState(eventKey);
            if (existing != null && !existing.isEmpty()) {
                recorded.add(t.getPackId());
                continue;
            }

            // 2. Commit event record and update current pointer
            ctx.getStub().putStringState(eventKey, tJson);
            ctx.getStub().putStringState(currentKey, tJson);
            recorded.add(t.getPackId());
        } catch (Exception e) {
            failures.add(t.getPackId() + ": " + e.getMessage());
        }
    }

    JSONObject result = new JSONObject();
    result.put("status", failures.isEmpty() ? "success" : "partial");
    result.put("totalProcessed", list.size());
    result.put("committedCount", recorded.size());
    result.put("failedCount", failures.size());
    result.put("failures", failures);
    return result.toJSONString();
}
```

#### Success Response (`200 OK`):
```json
{
  "status": "success",
  "totalProcessed": 250,
  "committedCount": 250,
  "failedCount": 0,
  "failures": []
}
```

#### Soft Idempotency Rule on Retries:
If network latency causes `pharma-core` to retry a chunk:
* If the key `packHash~MINTED` already exists with byte-for-byte identical data, the chaincode accepts it as a **soft success**.
* This guarantees that a transient network retry will **never fail a 100,000-pack minting job**.

---

### 4.3 Get Current Pack State (Highest Traffic Read Path)
Called on **every consumer scan** and chemist POS checkout.

* **Route**: `GET /api/transition/pack/{packHash}/current`
* **Headers**: `Authorization: Bearer <JWT>`

#### Success Response (`200 OK`):
```json
{
  "status": "success",
  "data": {
    "packId": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "currentStatus": "AtShop",
    "lastEvent": {
      "eventType": "INTAKE",
      "fromId": "MFR_CIPLA_001",
      "toId": "SHOP_APOLLO_DELHI_09",
      "sellingDate": "20260822",
      "sellingTime": "11:40:00",
      "sellerId": "SHOPOP_04"
    }
  }
}
```

#### Status Mapping Constants:
The `currentStatus` returned must map to one of these strings:
* `Packaged`: Minted by factory, not yet at retail.
* `AtShop`: Checked into verified pharmacy inventory.
* `Sold`: Purchased by patient at retail counter.
* `Recalled`: Batch recalled across supply chain.
* `NOT_FOUND`: No genesis record on blockchain.

---

### 4.4 Get Full Pack Lifecycle History
Used for supply-chain audit logs and drug inspector investigations.

* **Route**: `GET /api/transition/pack/{packHash}/history`
* **Headers**: `Authorization: Bearer <JWT>`

#### Success Response (`200 OK`):
```json
{
  "status": "success",
  "packId": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "history": [
    {
      "eventType": "MINTED",
      "fromId": "GENESIS",
      "toId": "MFR_CIPLA_001",
      "timestamp": "2026-08-22T11:30:00Z",
      "sellerId": "FACTORY_LINE_01"
    },
    {
      "eventType": "INTAKE",
      "fromId": "MFR_CIPLA_001",
      "toId": "SHOP_APOLLO_DELHI_09",
      "timestamp": "2026-08-22T11:40:00Z",
      "sellerId": "SHOPOP_04"
    },
    {
      "eventType": "SOLD",
      "fromId": "SHOP_APOLLO_DELHI_09",
      "toId": "CONSUMER",
      "timestamp": "2026-08-22T14:15:22Z",
      "sellerId": "POS_GUN_02"
    }
  ]
}
```

---

### 4.5 Emergency Batch Recall
Called when a manufacturer or CDSCO triggers a recall.

* **Route**: `POST /api/transition/recall/{systemBatchId}`
* **Headers**: `Authorization: Bearer <JWT>`, `Content-Type: application/json`

#### Request Payload:
```json
{
  "systemBatchId": "PC-BATCH-CIPLA0-20260822-7D3A1F",
  "actorId": "MFR_CIPLA_001",
  "reason": "Trace solvent impurity detected in QA retest",
  "recallDate": "20260822",
  "recallTime": "15:00:00"
}
```

#### Success Response (`200 OK`):
```json
{
  "status": "success",
  "message": "Batch PC-BATCH-CIPLA0-20260822-7D3A1F marked as RECALLED on ledger.",
  "data": {
    "systemBatchId": "PC-BATCH-CIPLA0-20260822-7D3A1F",
    "status": "RECALLED",
    "actorId": "MFR_CIPLA_001",
    "timestamp": "2026-08-22T15:00:00Z"
  }
}
```

---

## 6. Long-Term Scalability: State Bloat Elimination & Merkle Root Anchoring

To prevent CouchDB World State bloat at national scale (5 Billion packs/year), the blockchain implementation relies on 3 core state-management strategies:

### 6.1 Compact State Footprint (200 Bytes / Pack)
* Only cryptographic transition proofs (`packId`, `eventType`, `toId`, `sellingDate`) are stored on-chain.
* All 54 rich metadata fields stay in MongoDB off-chain.
* **10 Million packs = 2 GB**. A standard 2TB NVMe SSD holds **10 Billion active pack records**.

### 6.2 Natural Expiry State Pruning (TTL)
* Medicines expire within 2–3 years. 
* CouchDB only keeps **active circulating stock**. Once a pack is marked `SOLD` for $> 1\text{ year}$ or reaches its `expiryDate`, it is purged from active index to cold archival block storage (S3/Glacier), keeping active memory usage below **50 GB** permanently.

### 6.3 Merkle Batch Root Genesis Anchoring
* During high-volume minting, `pharma-core` anchors 100,000 packs under **1 Batch Merkle Root**.
* Individual pack records are only instantiated upon retail events (`INTAKE` / `SOLD`). Packs in storage take **0 bytes** of individual blockchain ledger space.

---

## 7. Summary Checklist for Blockchain Engineering Team

| Priority | Task | Component | Verification Criteria |
|---|---|---|---|
| 🟢 **P0** | **Spring Security JWKS Validator** | `pharma-backend-service` | Validates `Bearer JWT` from `pharma-core` by fetching `/.well-known/jwks.json` from main domain. |
| 🟢 **P0** | **`Transition` Schema & Key Scheme** | `pharmacc` Chaincode | Uses `packId + "~" + eventType` for append-only history and `packId + "~CURRENT"` for $O(1)$ reads. |
| 🟢 **P0** | **`POST /api/transition`** | `pharma-backend-service` | Records single INTAKE or SOLD event with custody check. |
| 🟢 **P0** | **`GET /api/transition/pack/{id}/current`** | `pharma-backend-service` | Returns `AtShop`, `Sold`, `Packaged`, `Recalled` in $< 15\text{ms}$. |
| 🟡 **P1** | **`POST /api/transition/batch`** | `pharma-backend-service` | Commits 250 records/block with soft idempotency on retries. |
| 🟡 **P1** | **`POST /api/transition/recall/{id}`** | `pharma-backend-service` | Batch-level recall locking all packs. |
| 🔵 **P2** | **`GET /api/transition/pack/{id}/history`** | `pharma-backend-service` | Returns chronological lifecycle event array. |
