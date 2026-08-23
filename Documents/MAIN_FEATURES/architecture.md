# 🏛️ PharmaChain — Master Architecture & System Specification
### Microservices, Central Cryptographic Vault, Hyperledger Fabric v2.5, Kubernetes & Skaffold | SIH 2026

> **Status:** Final & Frozen Architectural Specification  
> **Target Environment:** Kubernetes (K8s) + Skaffold (v4beta2) | Spring Boot 4.1.0 | Hyperledger Fabric v2.5 | Node.js v20 (ES Modules)  
> **Source Documents Synthesized:** `yo.md`, `fixed.md`, `implementation.md`, `auth_security_architecture_plan.md`, `flow.md`, `k8s-skaffold-yaml-guide.md`

---

## 📑 Table of Contents

1. [Executive Summary & Core Objectives](#1-executive-summary--core-objectives)
2. [Global Architecture & Network Topology](#2-global-architecture--network-topology)
   - 2.1 [Kubernetes + NGINX Ingress Topology](#21-kubernetes--nginx-ingress-topology)
   - 2.2 [Kubernetes & Skaffold Development Topology](#22-kubernetes--skaffold-development-topology)
   - 2.3 [Strict Trust Boundaries & Architectural Safeguards](#23-strict-trust-boundaries--architectural-safeguards)
3. [Blockchain Layer Specification (`pharmacc` & `pharma-backend`)](#3-blockchain-layer-specification-pharmacc--pharma-backend)
   - 3.1 [Immutable Ledger Model & `Transition` Entity](#31-immutable-ledger-model--transition-entity)
   - 3.2 [Frozen Composite Key Naming Convention](#32-frozen-composite-key-naming-convention)
   - 3.3 [Chaincode Functions Reference (`PharmaContract.java`)](#33-chaincode-functions-reference-pharmacontractjava)
   - 3.4 [Blockchain Gateway REST API (`pharma-backend-service`)](#34-blockchain-gateway-rest-api-pharma-backend-service)
   - 3.5 [Resolved Blockchain Defects & Applied Fixes](#35-resolved-blockchain-defects--applied-fixes)
4. [Detailed Microservices Breakdown](#4-detailed-microservices-breakdown)
   - 4.1 [`pharma-core` (Port 4000 — Internal Security & Crypto Vault)](#41-pharma-core-port-4000--internal-security--crypto-vault)
   - 4.2 [`pharma-backend-service` (Port 8080 — Internal Spring Boot Gateway)](#42-pharma-backend-service-port-8080--internal-spring-boot-gateway)
   - 4.3 [`manufacturer-service` (Port 3001 — Public Domain Service)](#43-manufacturer-service-port-3001--public-domain-service)
   - 4.4 [`shopkeeper-service` (Port 3002 — Public Domain Service)](#44-shopkeeper-service-port-3002--public-domain-service)
   - 4.5 [`consumer-service` (Port 3003 — Public Stateless Service)](#45-consumer-service-port-3003--public-stateless-service)
5. [End-to-End Application Flows & Sequence Diagrams](#5-end-to-end-application-flows--sequence-diagrams)
   - 5.1 [Manufacturer Registration & ES256 Key Provisioning](#51-manufacturer-registration--es256-key-provisioning)
   - 5.2 [Batch Creation, Minting, Signing & QR Export Flow](#52-batch-creation-minting-signing--qr-export-flow)
   - 5.3 [Shopkeeper Inventory Intake Scan Flow](#53-shopkeeper-inventory-intake-scan-flow)
   - 5.4 [Point-of-Sale (POS) Sale Verification & State Transition](#54-point-of-sale-pos-sale-verification--state-transition)
   - 5.5 [Consumer QR Verification Flow & 7 UI States](#55-consumer-qr-verification-flow--7-ui-states)
   - 5.6 [Batch Recall Initiation & Cascading Enforcement Flow](#56-batch-recall-initiation--cascading-enforcement-flow)
   - 5.7 [Suspicious Activity & Counterfeit Reporting Flow](#57-suspicious-activity--counterfeit-reporting-flow)
6. [Data Models & Persistence Architecture](#6-data-models--persistence-architecture)
   - 6.1 [Manufacturer PostgreSQL Schema](#61-manufacturer-postgresql-schema)
   - 6.2 [Shopkeeper PostgreSQL Schema](#62-shopkeeper-postgresql-schema)
   - 6.3 [Encrypted Keystore Schema (`pharma-core`)](#63-encrypted-keystore-schema-pharma-core)
   - 6.4 [Hyperledger Fabric World State (CouchDB)](#64-hyperledger-fabric-world-state-couchdb)
7. [Cryptographic & Security Architecture](#7-cryptographic--security-architecture)
   - 7.1 [Manufacturer ES256 Key Lifecycle & Storage](#71-manufacturer-es256-key-lifecycle--storage)
   - 7.2 [Compact QR Code Signed JWT Structure](#72-compact-qr-code-signed-jwt-structure)
   - 7.3 [SHA-256 Pack Hash Derivation](#73-sha-256-pack-hash-derivation)
   - 7.4 [OAuth2 JWKS Token Validation Architecture](#74-oauth2-jwks-token-validation-architecture)
   - 7.5 [Service-to-Service Authentication (`X-Service-Token`)](#75-service-to-service-authentication-x-service-token)
8. [Unified Error Handling & HTTP Status Matrix](#8-unified-error-handling--http-status-matrix)
9. [Kubernetes Manifests & Skaffold Development Specification](#9-kubernetes-manifests--skaffold-development-specification)
   - 9.1 [Monorepo & Manifest Directory Layout](#91-monorepo--manifest-directory-layout)
   - 9.2 [Skaffold Master Configuration (`skaffold.yml`)](#92-skaffold-master-configuration-skaffoldyml)
   - 9.3 [Standard Lowercase `dockerfile` Pattern](#93-standard-lowercase-dockerfile-pattern)
   - 9.4 [Kubernetes Deployment Manifest Patterns](#94-kubernetes-deployment-manifest-patterns)
   - 9.5 [Kubernetes Service Manifest Patterns](#95-kubernetes-service-manifest-patterns)
   - 9.6 [Shared NGINX Ingress Manifest (`k8s/ingress.yml`)](#96-shared-nginx-ingress-manifest-k8singressyml)
   - 9.7 [Unified Secrets Configuration (`k8s/secrets.yml`)](#97-unified-secrets-configuration-k8ssecretsyml)
10. [Environment Variables Reference](#10-environment-variables-reference)
11. [Implementation Roadmap & Phased Build Plan](#11-implementation-roadmap--phased-build-plan)

---

# 1. Executive Summary & Core Objectives

**PharmaChain** is a distributed anti-counterfeiting and pharmaceutical provenance tracking platform designed for the Smart India Hackathon (SIH 2026). It guarantees end-to-end drug authenticity from manufacturing plants to individual consumers.

### Key Tenets
1. **Zero Trust Cryptographic Identity**: Every pharmaceutical packaging unit contains a manufacturer-signed asymmetric JWT (ECDSA P-256 / ES256) embedded inside a secure 2D QR code.
2. **Immutable Append-Only Event Ledger**: State transitions (Manufacture, Intake, Sale, Recall) are recorded on a permissioned Hyperledger Fabric v2.5 blockchain network using composite keys.
3. **Decoupled Security Vault**: Domain applications never touch raw cryptographic keys or blockchain transport certificates. All signing, hashing, and key vaults are isolated in `pharma-core`.
4. **Resilient Gateway Layer**: `pharma-backend-service` bridges standard HTTP/REST with gRPC/mTLS Netty channels connected to Fabric peer and orderer nodes.
5. **High-Performance Verification**: Two-tier verification decouples lightweight cryptographic signature checks (in-memory) from deep ledger queries (blockchain world state).
6. **Cloud-Native Kubernetes & Skaffold Workflow**: All microservices are natively containerized and continuously synchronized locally via `skaffold dev` with live file sync (`sync.infer`) into a local Kubernetes cluster (Minikube / Docker Desktop K8s / Kind).

---

# 2. Global Architecture & Network Topology

## 2.1 Kubernetes + NGINX Ingress Topology

```
═══════════════════════════════════════════════════════════════════════════════════
                           PUBLIC INTERNET / CLIENT TRAFFIC
═══════════════════════════════════════════════════════════════════════════════════

   Manufacturer Web App          Shopkeeper Mobile App          Consumer Mobile App
   (React / Vite :5173)          (React Native :5174)           (React Native)
            │                              │                             │
            └──────────────────────────────┼─────────────────────────────┘
                                           │ HTTPS / REST
                                           ▼
                        ┌─────────────────────────────────────┐
                        │    Shared NGINX Ingress Gateway     │
                        │          (k8s/ingress.yml)          │
                        └──────────────────┬──────────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         │ /api/manufacturer               │ /api/shopkeeper                 │ /api/consumer
         ▼                                 ▼                                 ▼
┌─────────────────────────┐       ┌─────────────────────────┐       ┌─────────────────────────┐
│  manufacturer-service   │       │   shopkeeper-service    │       │    consumer-service     │
│  ClusterIP :80          │       │   ClusterIP :80         │       │   ClusterIP :80         │
│  (TargetPort :3001)     │       │   (TargetPort :3002)    │       │   (TargetPort :3003)    │
│  Own PostgreSQL DB      │       │   Own PostgreSQL DB     │       │   Stateless             │
└────────────┬────────────┘       └────────────┬────────────┘       └────────────┬────────────┘
             │                                 │                                 │
             └─────────────────────────────────┼─────────────────────────────────┘
                                               │
                                               │ Internal HTTP (ClusterIP :80)
                                               │ Header: X-Service-Token
                                               ▼
                             ┌───────────────────────────────────┐
                             │        pharma-core-service        │
                             │        ClusterIP :80              │
                             │        (TargetPort :4000)         │
                             │ ───────────────────────────────── │
                             │  • ZERO Ingress Exposure          │
                             │  • AES-256 Encrypted Key Vault    │
                             │  • ES256 Token Signing & Verif    │
                             │  • SHA-256 Pack Hashing           │
                             │  • Public JWKS Server Endpoint    │
                             │  • Multi-transition Status Aggreg │
                             └─────────────────┬─────────────────┘
                                               │
                                               │ Internal HTTP REST (ClusterIP :80)
                                               │ Header: Authorization: Bearer <JWT>
                                               ▼
                             ┌───────────────────────────────────┐
                             │      pharma-backend-service       │
                             │      ClusterIP :80                │
                             │      (TargetPort :8080)           │
                             │ ───────────────────────────────── │
                             │  • ZERO Ingress Exposure          │
                             │  • Spring Boot 4.1.0 Gateway      │
                             │  • Fabric Gateway SDK 1.5.1       │
                             │  • OAuth2 Resource Server (JWKS)  │
                             │  • Holds Fabric MSP & TLS Certs   │
                             └─────────────────┬─────────────────┘
                                               │
                                               │ Netty gRPC / mTLS (Port 7051)
                                               ▼
                             ┌───────────────────────────────────┐
                             │        Hyperledger Fabric         │
                             │        Channel: 'mychannel'       │
                             │        Chaincode: 'pharmacc'      │
                             │        (CouchDB + Raft Consensus) │
                             └───────────────────────────────────┘
```

## 2.2 Kubernetes & Skaffold Development Topology

In our development workflow, **we do not use Docker Compose**. The entire application lifecycle, local development loop, hot-reloading, image building, and deployment are orchestrated natively via **Skaffold (v4beta2)** and **Kubernetes**.

```
Developer Workstation
 ├── Source Code (`services/**`, `Backend/**`, `k8s/**`)
 ├── `skaffold dev` (Continuous Watcher & Builder)
 │     ├── Directs Docker daemon using `tagPolicy: sha256: {}`
 │     ├── Live-syncs source files (`sync.infer`) directly into running Pods
 │     └── Applies raw manifests (`manifests.rawYaml`) to local Kubernetes
 │
 └── Local Kubernetes Cluster (Minikube / Docker Desktop / Kind)
       ├── Ingress Controller (`ingress-nginx`)
       │     └── Routes `/api/manufacturer`, `/api/shopkeeper`, `/api/consumer`
       ├── Pods (manufacturer, shopkeeper, consumer, pharma-core, pharma-backend, databases)
       ├── Services (All ClusterIP with internal `port: 80`)
       └── Secrets (`k8s/secrets.yml` multi-document with plain `stringData:`)
```

### Why Kubernetes + Skaffold (Over Docker Compose)?
1. **Zero Drift Between Dev and Prod**: The exact Kubernetes manifests (`Deployment`, `Service`, `Ingress`, `Secret`, `ConfigMap`, `PVC`) run in development, staging, and production.
2. **Instant Hot Reload (`sync.infer`)**: Source changes in `src/**` or `app/**` sync directly to active containers in milliseconds without triggering container restarts or Docker image rebuilds.
3. **Deterministic Tagging (`sha256: {}`)**: Guarantees consistent image hashes with `imagePullPolicy: IfNotPresent`.
4. **Native Cluster Networking**: Validates Kubernetes DNS resolution (`http://pharma-core-service:80`, `http://pharma-backend-service:80`) from day one.

---

## 2.3 Strict Trust Boundaries & Architectural Safeguards

| Security / Architecture Concern | Enforcement & Solution in Architecture |
|---|---|
| **Private Key Exposure Risk** | `pharma-core-service` is an internal `ClusterIP:80` (targetPort 4000). It is strictly **omitted from NGINX Ingress** and has zero public routing. Keys are encrypted at rest with AES-256-GCM. |
| **Fabric MSP & TLS Cert Leakage** | Fabric crypto materials and MSP identities are mounted **exclusively inside `pharma-backend-service`** via volume mounts. No other service has access. |
| **Direct Blockchain Invocation from App** | **Forbidden.** Public domain services (`manufacturer-svc`, `shopkeeper-svc`, `consumer-svc`) cannot reach Fabric or `pharma-backend`. They must call `pharma-core`. |
| **Edge Entry Point Standardization** | A single NGINX Ingress Gateway handles SSL termination and path routing (`/api/manufacturer`, `/api/shopkeeper`, `/api/consumer`). |
| **Internal Service Interconnect** | Inter-service traffic runs on standard Kubernetes `port: 80` mapped internally to respective container target ports. |
| **Service Authentication Gate** | Domain services must authenticate against `pharma-core` using `X-Service-Token: <SERVICE_SECRET>`. |
| **Backend Gateway Authentication** | `pharma-backend` runs Spring Security OAuth2 Resource Server, validating incoming `Bearer <JWT>` against `pharma-core`'s public `/.well-known/jwks.json`. |
| **Client Authentication Separation** | Each public domain microservice independently manages client JWT sessions (using HttpOnly cookies / memory). |
| **V1 Scope Containment** | Offline queues, SMS/USSD fallbacks, distributor hierarchies, and machine learning models are explicitly out of V1 scope. |

---

# 3. Blockchain Layer Specification (`pharmacc` & `pharma-backend`)

## 3.1 Immutable Ledger Model & `Transition` Entity

Hyperledger Fabric does not maintain mutable tables with a status column. It functions as an **append-only event ledger**. Every lifecycle event produces an immutable `Transition` asset.

### Ledger Transition Schema (JSON)
```json
{
  "docType": "transition",
  "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855:MFG",
  "fromId": "MINTED",
  "toId": "MFR_CIPLA_001",
  "sellingDate": "20082026",
  "sellingTime": "19:30:00",
  "sellerId": "OPERATOR_456"
}
```

- `docType`: Constant string `"transition"` used for CouchDB index filtering.
- `hash`: The **unique primary key** in World State.
- `fromId`: Origin identifier (`"MINTED"`, Manufacturer ID, or Shopkeeper ID).
- `toId`: Destination entity identifier (Manufacturer ID, Shopkeeper ID, `"CONSUMER"`, or `"RECALLED"`).
- `sellingDate`: Execution date formatted as `DDMMYYYY`.
- `sellingTime`: Execution time formatted as `HH:MM:SS`.
- `sellerId`: Operator / Actor initiating the transaction.

## 3.2 Frozen Composite Key Naming Convention

Because `recordTransition` rejects duplicate primary keys with `TRANSITION_ALREADY_EXISTS`, a single physical medicine pack produces distinct immutable event entries through a **composite key suffix scheme**:

| Event Type | Composite Primary Key (`hash`) | `fromId` | `toId` | Semantic Meaning |
|---|---|---|---|---|
| **Manufacture Mint** | `<packHash>:MFG` | `"MINTED"` | `<manufacturerId>` | Unit registered upon factory packaging |
| **Pharmacy Intake** | `<packHash>:INTAKE` | `<manufacturerId>` | `<shopkeeperId>` | Physical unit accepted into pharmacy stock |
| **Consumer Sale** | `<packHash>:SALE` | `<shopkeeperId>` | `"CONSUMER"` | Unit sold to patient / consumer at POS |
| **Batch Recall** | `<batchId>:RECALL` | `<manufacturerId>` | `"RECALLED"` | Entire batch declared recalled by manufacturer |

> ⚠️ **Immutable Agreement**: Every microservice and smart contract call strictly adheres to this suffix convention.

## 3.3 Chaincode Functions Reference (`PharmaContract.java`)

Deployed on channel `mychannel` under contract name `pharmacc`:

```java
package org.hyperledger.fabric.samples.assettransfer;

import java.util.ArrayList;
import java.util.List;
import org.hyperledger.fabric.contract.Context;
import org.hyperledger.fabric.contract.ContractInterface;
import org.hyperledger.fabric.contract.annotation.*;
import org.hyperledger.fabric.shim.ChaincodeException;
import com.owlike.genson.Genson;
import com.owlike.genson.GenericType;

@Contract(
    name = "pharmacc",
    info = @Info(
        title = "Pharma Supply Chain Contract",
        description = "SIH 2026 Pharma Transition Ledger",
        version = "2.0"
    )
)
@Default
public final class PharmaContract implements ContractInterface {

    private final Genson genson = new Genson();

    // ── Write Operations (Submit) ──────────────────────────────────────────

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Transition recordTransition(final Context ctx, final String hash,
                                        final String fromId, final String toId,
                                        final String sellingDate, final String sellingTime,
                                        final String sellerId) {
        if (TransitionExists(ctx, hash)) {
            throw new ChaincodeException(String.format("Transition %s already exists", hash), "TRANSITION_ALREADY_EXISTS");
        }
        Transition transition = new Transition(hash, fromId, toId, sellingDate, sellingTime, sellerId);
        String json = genson.serialize(transition);
        ctx.getStub().putStringState(hash, json);
        return transition;
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public String recallBatch(final Context ctx, final String batchId,
                               final String fromId, final String reason,
                               final String recallDate, final String recallTime) {
        String key = batchId + ":RECALL";
        if (TransitionExists(ctx, key)) {
            throw new ChaincodeException(String.format("Batch %s already recalled", batchId), "BATCH_ALREADY_RECALLED");
        }
        Transition recall = new Transition(key, fromId, "RECALLED", recallDate, recallTime, reason);
        String json = genson.serialize(recall);
        ctx.getStub().putStringState(key, json);
        return json;
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public String recordTransitionBatch(final Context ctx, final String transitionsJson) {
        List<Transition> transitions = genson.deserialize(transitionsJson, new GenericType<List<Transition>>() {});
        List<String> recordedHashes = new ArrayList<>();
        for (Transition t : transitions) {
            if (TransitionExists(ctx, t.getHash())) {
                continue; // Idempotent bulk insertion
            }
            String json = genson.serialize(t);
            ctx.getStub().putStringState(t.getHash(), json);
            recordedHashes.add(t.getHash());
        }
        return genson.serialize(recordedHashes);
    }

    // ── Read Operations (Evaluate) ─────────────────────────────────────────

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public Transition getTransitionByHash(final Context ctx, final String hash) {
        String json = ctx.getStub().getStringState(hash);
        if (json == null || json.isEmpty()) {
            throw new ChaincodeException(String.format("Transition %s does not exist", hash), "TRANSITION_NOT_FOUND");
        }
        return genson.deserialize(json, Transition.class);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public boolean TransitionExists(final Context ctx, final String hash) {
        String state = ctx.getStub().getStringState(hash);
        return state != null && !state.isEmpty();
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public String getPackStatus(final Context ctx, final String packHash, final String batchId) {
        // Priority 1: Batch Recall
        String recallState = ctx.getStub().getStringState(batchId + ":RECALL");
        if (recallState != null && !recallState.isEmpty()) {
            return "{\"status\":\"Recalled\",\"detail\":" + recallState + "}";
        }
        // Priority 2: Pack Sold
        String saleState = ctx.getStub().getStringState(packHash + ":SALE");
        if (saleState != null && !saleState.isEmpty()) {
            return "{\"status\":\"Sold\",\"detail\":" + saleState + "}";
        }
        // Priority 3: Pack at Shop (Intake)
        String intakeState = ctx.getStub().getStringState(packHash + ":INTAKE");
        if (intakeState != null && !intakeState.isEmpty()) {
            return "{\"status\":\"AtShop\",\"detail\":" + intakeState + "}";
        }
        // Priority 4: Pack Manufactured
        String mfgState = ctx.getStub().getStringState(packHash + ":MFG");
        if (mfgState != null && !mfgState.isEmpty()) {
            return "{\"status\":\"Packaged\",\"detail\":" + mfgState + "}";
        }
        return "{\"status\":\"NOT_FOUND\"}";
    }
}
```

## 3.4 Blockchain Gateway REST API (`pharma-backend-service`)

| HTTP Method | Route | Auth Required | Downstream Fabric Call | Purpose |
|---|---|---|---|---|
| `POST` | `/api/transition` | ✅ Bearer JWT | `recordTransition` | Appends a single transition (`:MFG`, `:INTAKE`, `:SALE`) |
| `POST` | `/api/transition/batch` | ✅ Bearer JWT | `recordTransitionBatch` | Bulk writes transitions in 1 transaction (1000+ packs) |
| `POST` | `/api/transition/recall` | ✅ Bearer JWT | `recallBatch` | Appends a batch recall transition (`:RECALL`) |
| `GET` | `/api/transition/{hash}` | ❌ Public (internal) | `getTransitionByHash` | Returns full JSON transition payload for given composite key |
| `GET` | `/api/transition/status` | ❌ Public (internal) | `getPackStatus` | Evaluates live status (`packHash` + `batchId` query params) |
| `GET` | `/api/transition?fromId=&toId=&hash=` | ❌ Public (internal) | `queryTransition` | CouchDB Mango query by participant or partial hash |

## 3.5 Resolved Blockchain Defects & Applied Fixes

1. **F-01 (Path Parameterization)**: Replaced hardcoded WSL paths (`/home/jarvis/...`) with dynamic environment variables (`FABRIC_CERT_PATH`, `FABRIC_KEY_DIR`, `FABRIC_TLS_CERT_PATH`).
2. **F-02 (Peer Endpoint Binding)**: Externalized `PEER_ENDPOINT` (`peer0.org1.example.com:7051`) and `PEER_OVERRIDE_AUTH` to enable container networking.
3. **F-03 (Composite Keys)**: Frozen suffix convention (`:MFG`, `:INTAKE`, `:SALE`, `:RECALL`) allowing multi-event tracking for identical hashes.
4. **F-04 (Batch Recall Engine)**: Created `recallBatch` chaincode transaction and `/api/transition/recall` endpoint.
5. **F-05 (Unified Status Resolution)**: Added `getPackStatus` chaincode evaluate transaction for single-roundtrip status queries.
6. **F-06 (OAuth2 JWKS Verification)**: Spring Boot Security configured as an OAuth2 Resource Server pulling public keys from `http://pharma-core-service:4000/.well-known/jwks.json`.
7. **F-07 (HTTP Status Mapping)**: Implemented `GlobalExceptionHandler` mapping Fabric errors cleanly:
   - `TRANSITION_NOT_FOUND` → HTTP 404
   - `TRANSITION_ALREADY_EXISTS` → HTTP 409
   - `BATCH_ALREADY_RECALLED` → HTTP 409
   - Fabric/gRPC transport failures → HTTP 500 (`CHAIN_ERROR`)
8. **F-08 (Bulk Minting Support)**: Implemented `recordTransitionBatch` accepting JSON arrays of transitions to prevent network bottlenecks during mass pack registration.

---

# 4. Detailed Microservices Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MICROSERVICES ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────┘

 Domain Layer (Public via Ingress)
 ├── manufacturer-service (:3001) ───► PostgreSQL (Batches, Packs, Orders, KYC)
 ├── shopkeeper-service   (:3002) ───► PostgreSQL (Inventory, Sales, Orders)
 └── consumer-service     (:3003) ───► Stateless Verification Router

 Core Security Layer (Internal ClusterIP Only)
 └── pharma-core-service  (:4000) ───► AES-256-GCM Keystore, ES256 Engine, JWKS

 Blockchain Gateway Layer (Internal ClusterIP Only)
 └── pharma-backend-svc   (:8080) ───► Spring Boot, Fabric Gateway SDK, Netty gRPC

 Distributed Ledger Layer
 └── Hyperledger Fabric   (:7051) ───► pharmacc Chaincode, CouchDB State, Raft Orderer
```

---

## 4.1 `pharma-core` (Port 4000 — Internal Security & Crypto Vault)

`pharma-core` is the central cryptographic engine of PharmaChain. It is completely isolated from public ingress.

### Core Responsibilities
- Manages manufacturer ECDSA P-256 / ES256 keypairs.
- Encrypts private keys at rest using AES-256-GCM with PBKDF2/scrypt key derivation.
- Signs compact JWT payloads for QR code generation.
- Derives SHA-256 pack hashes (`SHA256(signedJWT)`).
- Exposes standard JWKS (`GET /.well-known/jwks.json`) for public key discovery.
- Performs Tier-1 cryptographic signature verification.
- Authorizes incoming domain requests via `X-Service-Token` middleware.
- Issues asymmetric bearer JWTs to authorize write operations on `pharma-backend-service`.
- Resolves overall pack status from `pharma-backend-service`.

### What `pharma-core` Does NOT Do
- Does not expose public HTTP routes to the internet.
- Does not connect directly via gRPC to Hyperledger Fabric peers.
- Does not mount Fabric MSP certificates.
- Does not store business domain metadata (medicine formulations, shop inventories).

### API Specification (`pharma-core`)

All endpoints (except `/.well-known/jwks.json` and `/core/health`) require `X-Service-Token: <SERVICE_SECRET>`.

```
POST /core/keys/generate
Request:  { "manufacturerId": "MFR_CIPLA_001" }
Response: { "status": "success", "publicKeyPem": "-----BEGIN PUBLIC KEY...-----" }

GET /core/keys/public/:mfrId
Response: { "status": "success", "manufacturerId": "MFR_CIPLA_001", "publicKeyPem": "..." }

GET /.well-known/jwks.json (Publicly reachable inside cluster)
Response: { "keys": [ { "kty": "EC", "crv": "P-256", "kid": "mfr-key-1", "x": "...", "y": "..." } ] }

POST /core/batch/mint
Request:  { "batchId": "BATCH-001", "manufacturerId": "MFR_CIPLA_001", "expiryDate": "2028-01-14", "quantity": 100 }
Response: {
  "batchId": "BATCH-001",
  "packs": [
    { "serial": "00001", "packHash": "a8f4c...", "signedToken": "eyJhbGciOiJFUzI1Ni..." },
    ...
  ]
}

POST /core/hash/verify
Request:  { "signedToken": "eyJhbGciOiJFUzI1Ni..." }
Response: { "valid": true, "payload": { "batchId": "BATCH-001", "serial": "00001", "expiryDate": "2028-01-14", "manufacturerId": "MFR_001" }, "packHash": "a8f4c..." }

GET /core/hash/status/:hash?batchId=BATCH-001
Response: { "status": "Sold" | "Recalled" | "AtShop" | "Packaged" | "NOT_FOUND", "detail": { ... } }

POST /core/chain/intake
Request:  { "packHash": "a8f4c...", "shopId": "SHOP_APOLLO_01", "operatorId": "OP_123" }
Response: { "status": "success", "txId": "tx_89f02..." }

POST /core/chain/sale
Request:  { "packHash": "a8f4c...", "shopId": "SHOP_APOLLO_01", "operatorId": "OP_123" }
Response: { "status": "success", "txId": "tx_34b11..." }

POST /core/chain/recall
Request:  { "batchId": "BATCH-001", "manufacturerId": "MFR_001", "reason": "Packaging defect" }
Response: { "status": "success", "txId": "tx_99a77..." }

GET /core/health
Response: { "status": "ok", "service": "pharma-core" }
```

---

## 4.2 `pharma-backend-service` (Port 8080 — Internal Spring Boot Gateway)

### Core Responsibilities
- Maintains persistent Netty gRPC channels to Fabric peer nodes (`peer0.org1.example.com:7051`).
- Mounts X.509 certificates and private signing keys for `Org1MSP` (`User1@org1.example.com`).
- Enforces OAuth2 JWT validation on all state mutation endpoints (`POST /api/transition/**`) against `pharma-core`'s JWKS.
- Submits write transactions to the Fabric ordering service (`orderer.example.com:7050`) using Raft consensus.
- Evaluates read queries against local peer World State CouchDB.
- Translates chaincode errors into standardized JSON HTTP responses.

---

## 4.3 `manufacturer-service` (Port 3001 — Public Domain Service)

### Core Responsibilities
- User authentication and profile management for pharmaceutical manufacturers.
- KYC registration and verification workflows.
- Batch creation and lifecycle coordination.
- Requests batch token generation and blockchain minting from `pharma-core`.
- Stores batch metadata, formulations, and pack records in its PostgreSQL database.
- Generates downloadable QR code packages (CSV data exports and print-ready ZIP archives).
- Initiates batch-wide recalls via `pharma-core`.
- Manages B2B pharmacy order fulfillment and shipments.

---

## 4.4 `shopkeeper-service` (Port 3002 — Public Domain Service)

### Core Responsibilities
- Pharmacy / Chemist authentication and registration.
- **Intake Scan Module**: Scans incoming stock, validates cryptographic signature via `pharma-core`, records `AtShop` state on Fabric, and populates local inventory.
- **Point-of-Sale (POS) Scan Module**: Scans medicine pack before consumer hand-off, validates pack state via `pharma-core`, records `Sold` event on Fabric, and deducts local stock.
- Local stock management, real-time inventory counts, and expiry tracking alerts.
- B2B order placement to authorized manufacturers.

---

## 4.5 `consumer-service` (Port 3003 — Public Stateless Service)

### Core Responsibilities
- Fully stateless verification proxy for patient and consumer mobile applications.
- Receives scanned QR token string, sends it to `pharma-core` for Tier-1 cryptographic verification and Tier-2 blockchain state lookup.
- Maps raw responses into user-friendly UI verification states.
- Accepts and stores suspicious activity / counterfeit medicine reports.

---

# 5. End-to-End Application Flows & Sequence Diagrams

## 5.1 Manufacturer Registration & ES256 Key Provisioning

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Manufacturer Admin
    participant MFR as manufacturer-service (:3001)
    participant Core as pharma-core (:4000)
    participant DB as Manufacturer PostgreSQL

    Admin->>MFR: POST /api/manufacturer/register (Name, License, KYC Docs)
    MFR->>DB: Save Manufacturer Record (KYC: Pending)
    Note over MFR,Admin: Admin KYC Verification Process Completes
    MFR->>Core: POST /core/keys/generate (manufacturerId)<br/>Header: X-Service-Token
    Core->>Core: Generate EC P-256 Keypair
    Core->>Core: Encrypt Private Key (AES-256-GCM + Master Key)
    Core->>Core: Store in keystore.json (/data)
    Core-->>MFR: Return { publicKeyPem }
    MFR->>DB: Store publicKeyPem in manufacturers table
    MFR-->>Admin: Registration & Key Provisioning Complete
```

---

## 5.2 Batch Creation, Minting, Signing & QR Export Flow

```mermaid
sequenceDiagram
    autonumber
    actor MfrUser as Plant Manager
    participant MFR as manufacturer-service (:3001)
    participant Core as pharma-core (:4000)
    participant Backend as pharma-backend (:8080)
    participant Fabric as Hyperledger Fabric (pharmacc)
    participant DB as Manufacturer PostgreSQL

    MfrUser->>MFR: POST /api/manufacturer/batch (MedicineName, Expiry, Qty: 1000)
    MFR->>DB: Create Batch Record (Status: MINTING)
    MFR->>Core: POST /core/batch/mint { batchId, manufacturerId, expiryDate, quantity: 1000 }<br/>Header: X-Service-Token
    
    Core->>Core: Decrypt Manufacturer Private Key from Keystore
    loop For serial = 00001 to 01000
        Core->>Core: Sign JWT payload { batchId, serial, expiryDate, manufacturerId } (ES256)
        Core->>Core: Derive packHash = SHA256(signedJWT)
        Core->>Core: Construct Transition { hash: packHash+":MFG", fromId: "MINTED", toId: mfrId, ... }
    end
    
    Core->>Backend: POST /api/transition/batch [ Array of 1000 Transitions ]<br/>Header: Authorization: Bearer <CoreJWT>
    Backend->>Fabric: Submit recordTransitionBatch(transitionsJson) (gRPC mTLS)
    Fabric->>Fabric: Endorse Proposal (Peers) -> Commit Block (Raft Orderer)
    Fabric-->>Backend: Block Committed Successfully
    Backend-->>Core: HTTP 200 OK [ Recorded Hashes ]
    
    Core-->>MFR: Return { batchId, packs: [ { serial, packHash, signedToken }... ] }
    MFR->>DB: Bulk Insert 1000 packs into packs table (Status: Packaged)
    MFR->>DB: Update Batch Record (Status: MINTED)
    MFR-->>MfrUser: HTTP 201 Created { batchId, totalPacks: 1000 }
    
    opt QR Export Download
        MfrUser->>MFR: GET /api/manufacturer/batch/:id/download?format=zip
        MFR->>MFR: Generate QR PNGs from signedToken & Package ZIP
        MFR-->>MfrUser: Deliver batch-001-qr.zip
    end
```

---

## 5.3 Shopkeeper Inventory Intake Scan Flow

```mermaid
sequenceDiagram
    autonumber
    actor Shop as Pharmacy Chemist
    participant App as Shopkeeper Mobile App
    participant ShopSvc as shopkeeper-service (:3002)
    participant Core as pharma-core (:4000)
    participant Backend as pharma-backend (:8080)
    participant Fabric as Hyperledger Fabric (pharmacc)
    participant DB as Shopkeeper PostgreSQL

    Shop->>App: Scan Pack QR Code (signedToken)
    App->>ShopSvc: POST /api/shopkeeper/scan/intake { signedToken }<br/>Header: Authorization: Bearer <UserJWT>
    
    ShopSvc->>Core: POST /core/hash/verify { signedToken }<br/>Header: X-Service-Token
    Core->>Core: Resolve Public Key by kid -> Verify ES256 Signature
    Core-->>ShopSvc: Return { valid: true, payload: { batchId, serial, expiryDate, manufacturerId }, packHash }
    
    ShopSvc->>ShopSvc: Check Expiry Date (expiryDate >= today)
    ShopSvc->>DB: Check if packHash already in pack_events (DUPLICATE_INTAKE check)
    
    ShopSvc->>Core: POST /core/chain/intake { packHash, shopId, operatorId }<br/>Header: X-Service-Token
    Core->>Backend: POST /api/transition { hash: packHash+":INTAKE", fromId: mfrId, toId: shopId, ... }<br/>Header: Authorization: Bearer <CoreJWT>
    Backend->>Fabric: Submit recordTransition(hash, fromId, toId, date, time, sellerId)
    Fabric-->>Backend: Transaction Committed
    Backend-->>Core: HTTP 200 OK
    Core-->>ShopSvc: HTTP 200 OK
    
    ShopSvc->>DB: Insert into pack_events (packHash, event: 'INTAKE', timestamp)
    ShopSvc->>DB: Increment Pharmacy Inventory Count
    ShopSvc-->>App: HTTP 200 OK { status: "ACCEPTED", medicine: payload }
    App-->>Shop: Display "Stock Added Successfully ✅"
```

---

## 5.4 Point-of-Sale (POS) Sale Verification & State Transition

```mermaid
sequenceDiagram
    autonumber
    actor Shop as Pharmacy Chemist
    participant App as Shopkeeper Mobile App
    participant ShopSvc as shopkeeper-service (:3002)
    participant Core as pharma-core (:4000)
    participant Backend as pharma-backend (:8080)
    participant Fabric as Hyperledger Fabric (pharmacc)
    participant DB as Shopkeeper PostgreSQL

    Shop->>App: Scan Pack QR Code at Checkout (signedToken)
    App->>ShopSvc: POST /api/shopkeeper/scan/sale { signedToken }
    
    ShopSvc->>Core: POST /core/hash/verify { signedToken }<br/>Header: X-Service-Token
    Core-->>ShopSvc: Return { valid: true, payload, packHash }
    
    ShopSvc->>Core: GET /core/hash/status/:packHash?batchId=BATCH-001<br/>Header: X-Service-Token
    Core->>Backend: GET /api/transition/status?packHash=...&batchId=...
    Backend->>Fabric: Evaluate getPackStatus(packHash, batchId)
    Fabric-->>Backend: Return { status: "AtShop" }
    Backend-->>Core: Return { status: "AtShop" }
    Core-->>ShopSvc: Return { status: "AtShop" }
    
    alt Status != "AtShop"
        ShopSvc-->>App: HTTP 400 Error (ALREADY_SOLD / RECALLED / NOT_FOUND)
        App-->>Shop: Alert "Cannot Sell: Invalid Status ❌"
    else Status == "AtShop"
        ShopSvc->>Core: POST /core/chain/sale { packHash, shopId, operatorId }<br/>Header: X-Service-Token
        Core->>Backend: POST /api/transition { hash: packHash+":SALE", fromId: shopId, toId: "CONSUMER", ... }<br/>Header: Authorization: Bearer <CoreJWT>
        Backend->>Fabric: Submit recordTransition(...)
        Fabric-->>Backend: Transaction Committed
        Backend-->>Core: HTTP 200 OK
        Core-->>ShopSvc: HTTP 200 OK
        
        ShopSvc->>DB: Insert into pack_events (packHash, event: 'SALE')
        ShopSvc->>DB: Decrement Pharmacy Inventory Count
        ShopSvc-->>App: HTTP 200 OK { status: "SOLD", receiptData }
        App-->>Shop: Display "Sale Confirmed — Hand to Consumer 🛒"
    end
```

---

## 5.5 Consumer QR Verification Flow & 7 UI States

```mermaid
sequenceDiagram
    autonumber
    actor Consumer as Consumer / Patient
    participant App as Consumer Mobile App
    participant ConsSvc as consumer-service (:3003)
    participant Core as pharma-core (:4000)
    participant Backend as pharma-backend (:8080)
    participant Fabric as Hyperledger Fabric (pharmacc)

    Consumer->>App: Scan Pack QR Code
    App->>ConsSvc: POST /api/consumer/verify { qrData: signedToken }
    
    ConsSvc->>Core: POST /core/hash/verify { signedToken }<br/>Header: X-Service-Token
    
    alt Invalid Cryptographic Signature
        Core-->>ConsSvc: Return { valid: false, error: "INVALID_SIGNATURE" }
        ConsSvc-->>App: Return UI State: "INVALID_COUNTERFEIT" 🚫
    else Valid Cryptographic Signature
        Core-->>ConsSvc: Return { valid: true, payload, packHash }
        
        ConsSvc->>ConsSvc: Check Expiration Date
        alt Expired
            ConsSvc-->>App: Return UI State: "EXPIRED" ⚠️
        else Not Expired
            ConsSvc->>Core: GET /core/hash/status/:packHash?batchId=payload.batchId<br/>Header: X-Service-Token
            Core->>Backend: GET /api/transition/status?packHash=...&batchId=...
            Backend->>Fabric: Evaluate getPackStatus(packHash, batchId)
            Fabric-->>Backend: Return Status Result
            Backend-->>Core: Return Status Result
            Core-->>ConsSvc: Return { status: "Recalled" | "Sold" | "AtShop" | "Packaged" | "NOT_FOUND" }
            
            ConsSvc->>ConsSvc: Map to Consumer UI State
            ConsSvc-->>App: Return Verification Result & Metadata
            App-->>Consumer: Display Authenticity Card & Provenance Timeline
        end
    end
```

### The 7 Consumer UI Verification States

| UI State | Signature | Expiry | Blockchain Ledger Status | UI Card Styling & Message |
|---|---|---|---|---|
| **1. Genuine / Verified** | ✅ Valid | ✅ Valid | `AtShop` or `Packaged` | 🟢 **Green Card**: "100% Genuine Medicine — Registered & Safe" |
| **2. Already Sold** | ✅ Valid | ✅ Valid | `Sold` | 🟠 **Orange Alert**: "Warning: Pack already registered as sold on DD/MM/YYYY" |
| **3. Recalled** | ✅ Valid | Any | `Recalled` | 🔴 **Red Alert**: "CRITICAL: Batch recalled by manufacturer. Do not consume." |
| **4. Expired** | ✅ Valid | ❌ Expired | Any | 🔴 **Red Alert**: "EXPIRED: Medicine passed expiration date on DD/MM/YYYY" |
| **5. At Shop** | ✅ Valid | ✅ Valid | `AtShop` | 🟢 **Green Badge**: "Verified authentic inventory at registered pharmacy" |
| **6. Invalid / Counterfeit** | ❌ Invalid | Any | N/A | ⛔ **Pulsing Red**: "COUNTERFEIT WARNING: Invalid digital signature" |
| **7. Not Found** | ✅ Valid | ✅ Valid | `NOT_FOUND` | 🟡 **Yellow Notice**: "Valid manufacturer token, but no on-chain mint event found" |

---

## 5.6 Batch Recall Initiation & Cascading Enforcement Flow

```mermaid
sequenceDiagram
    autonumber
    actor Mfr as Manufacturer Quality Officer
    participant MFR as manufacturer-service (:3001)
    participant Core as pharma-core (:4000)
    participant Backend as pharma-backend (:8080)
    participant Fabric as Hyperledger Fabric (pharmacc)
    participant DB as Manufacturer PostgreSQL

    Mfr->>MFR: POST /api/manufacturer/batch/:batchId/recall { reason: "Contamination" }
    MFR->>DB: Update batch status to 'RECALLED'
    MFR->>Core: POST /core/chain/recall { batchId, manufacturerId, reason }<br/>Header: X-Service-Token
    
    Core->>Backend: POST /api/transition/recall { batchId, fromId: mfrId, reason, recallDate, recallTime }<br/>Header: Authorization: Bearer <CoreJWT>
    Backend->>Fabric: Submit recallBatch(batchId, fromId, reason, recallDate, recallTime)
    Fabric->>Fabric: Write State Key = "<batchId>:RECALL"<br/>Value = Transition { toId: "RECALLED", sellerId: reason }
    Fabric-->>Backend: Transaction Committed
    Backend-->>Core: HTTP 200 OK
    Core-->>MFR: HTTP 200 OK
    MFR-->>Mfr: HTTP 200 OK { message: "Batch Recalled Across Entire Supply Chain" }
    
    Note over Fabric,Core: Immediate Global Effect: All subsequent scans of packs in this batch instantly return status 'Recalled'
```

---

## 5.7 Suspicious Activity & Counterfeit Reporting Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Consumer / Shopkeeper
    participant Cons as consumer-service (:3003)
    participant Core as pharma-core (:4000)
    participant AlertDB as Security / Incident Store

    User->>Cons: POST /api/consumer/report { qrToken, location, notes, photoUrl }
    Cons->>Core: POST /core/hash/verify { qrToken } (Attempts decoding payload)
    Core-->>Cons: Return { valid: false, payload: decodedIfPossible }
    Cons->>AlertDB: Save Incident Log { timestamp, rawToken, location, reason: "COUNTERFEIT_SCAN" }
    Cons-->>User: HTTP 201 Created { message: "Report logged. Regulatory team alerted." }
```

---

# 6. Data Models & Persistence Architecture

## 6.1 Manufacturer PostgreSQL Schema

```sql
-- Manufacturers Table
CREATE TABLE manufacturers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    license_number VARCHAR(128) UNIQUE NOT NULL,
    kyc_status VARCHAR(32) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    public_key_pem TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Batches Table
CREATE TABLE batches (
    id VARCHAR(64) PRIMARY KEY,
    manufacturer_id VARCHAR(64) REFERENCES manufacturers(id),
    medicine_name VARCHAR(255) NOT NULL,
    composition TEXT,
    manufacturing_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    total_quantity INT NOT NULL,
    mint_status VARCHAR(32) DEFAULT 'PENDING', -- PENDING, MINTED, RECALLED
    recall_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Packs Table
CREATE TABLE packs (
    id BIGSERIAL PRIMARY KEY,
    batch_id VARCHAR(64) REFERENCES batches(id),
    serial_number VARCHAR(64) NOT NULL,
    pack_hash VARCHAR(64) UNIQUE NOT NULL,
    signed_token TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (batch_id, serial_number)
);

-- B2B Orders & Shipments
CREATE TABLE orders (
    id VARCHAR(64) PRIMARY KEY,
    shopkeeper_id VARCHAR(64) NOT NULL,
    manufacturer_id VARCHAR(64) REFERENCES manufacturers(id),
    status VARCHAR(32) DEFAULT 'PENDING', -- PENDING, DISPATCHED, DELIVERED, CANCELLED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## 6.2 Shopkeeper PostgreSQL Schema

```sql
-- Shopkeepers / Pharmacies Table
CREATE TABLE shopkeepers (
    id VARCHAR(64) PRIMARY KEY,
    pharmacy_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    drug_license_no VARCHAR(128) UNIQUE NOT NULL,
    kyc_status VARCHAR(32) DEFAULT 'PENDING',
    address TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Pack Event Audit Trail
CREATE TABLE pack_events (
    id BIGSERIAL PRIMARY KEY,
    shopkeeper_id VARCHAR(64) REFERENCES shopkeepers(id),
    pack_hash VARCHAR(64) NOT NULL,
    batch_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(32) NOT NULL, -- INTAKE, SALE
    operator_id VARCHAR(64),
    event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (shopkeeper_id, pack_hash, event_type)
);

-- Local Inventory Aggregates
CREATE TABLE inventory (
    id BIGSERIAL PRIMARY KEY,
    shopkeeper_id VARCHAR(64) REFERENCES shopkeepers(id),
    batch_id VARCHAR(64) NOT NULL,
    medicine_name VARCHAR(255) NOT NULL,
    expiry_date DATE NOT NULL,
    current_stock INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (shopkeeper_id, batch_id)
);
```

## 6.3 Encrypted Keystore Schema (`pharma-core`)

Stored in `/data/keystore.json` inside `pharma-core-service`'s persistent volume:

```json
{
  "MFR_CIPLA_001": {
    "encryptedPrivKey": "4a7f9b1c0e...:3b8a1c...:f0e9d8...",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----",
    "algorithm": "ES256",
    "keyId": "mfr-key-001",
    "createdAt": "2026-08-20T10:00:00Z"
  }
}
```

Format: `ivHex : authTagHex : cipherTextHex` encrypted via **AES-256-GCM** using a key derived from `KEY_ENCRYPTION_SECRET` + `manufacturerId` via `scrypt`.

## 6.4 Hyperledger Fabric World State (CouchDB)

State key: `<compositeKey>`  
State value: JSON serialized `Transition` record.

---

# 7. Cryptographic & Security Architecture

## 7.1 Manufacturer ES256 Key Lifecycle & Storage

```
                 Master Secret (Env: KEY_ENCRYPTION_SECRET)
                                    │
                                    │ scrypt(MasterSecret, manufacturerId)
                                    ▼
                        256-bit Derived Master Key
                                    │
    Manufacturer Private Key ───────┼───────► AES-256-GCM Encryption
    (ECDSA P-256 / ES256)           │         (Random 16-byte IV)
                                    ▼
                       Encrypted Keystore JSON File
                           (/data/keystore.json)
```

1. **Generation**: `pharma-core` creates an ECDSA P-256 keypair using Node.js `crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })`.
2. **Encryption at Rest**: The raw private key PEM is encrypted with AES-256-GCM before writing to `/data/keystore.json`.
3. **Transient Memory Life**: The decrypted private key exists strictly in ephemeral RAM for the duration of a minting operation, after which it is garbage-collected.

## 7.2 Compact QR Code Signed JWT Structure

The physical QR code contains only the raw signed JWT string. It contains no unsigned outer envelope.

### JWT Header
```json
{
  "alg": "ES256",
  "typ": "JWT",
  "kid": "mfr-key-001"
}
```

### JWT Payload Claims
```json
{
  "batchId": "BATCH-CIPLA-2026-001",
  "serial": "00042",
  "expiryDate": "2028-01-14",
  "manufacturerId": "MFR_CIPLA_001"
}
```

- **Compact Payload**: Omits non-essential metadata (formula, description) to minimize QR density and maximize camera scanning reliability across low-end mobile devices.

## 7.3 SHA-256 Pack Hash Derivation

```text
packHash = SHA256(rawSignedJWTString)
Example: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
```

The SHA-256 digest of the entire signed JWT serves as the unique identifier across blockchain events and PostgreSQL foreign keys.

## 7.4 OAuth2 JWKS Token Validation Architecture

```
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│       pharma-core-service       │                 │     pharma-backend-service      │
│            Port 4000            │                 │        Spring Boot :8080        │
└────────────────┬────────────────┘                 └────────────────┬────────────────┘
                 │                                                   │
                 │ 1. Exposes GET /.well-known/jwks.json             │
                 │ ◄─────────────────────────────────────────────────┤ (Startup fetch + 24h cache)
                 │                                                   │
                 │ 2. Issues signed write transaction JWT            │
                 │    POST /api/transition                           │
                 │    Authorization: Bearer <CoreJWT>                │
                 ├──────────────────────────────────────────────────►│
                 │                                                   │ 3. Spring Security validates
                 │                                                   │    token signature against cached
                 │                                                   │    JWKS public key by 'kid'
                 │                                                   │
                 │ 4. Executes Fabric Chaincode Submit               │
                 │ ◄─────────────────────────────────────────────────┤
```

## 7.5 Service-to-Service Authentication (`X-Service-Token`)

Internal HTTP calls between public domain microservices and `pharma-core` must pass a static cluster secret:

```http
POST /core/batch/mint HTTP/1.1
Host: pharma-core-service:80
X-Service-Token: 9e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c
Content-Type: application/json
```

Middleware in `pharma-core`:
```typescript
export function requireServiceToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-service-token'];
  if (!token || token !== process.env.SERVICE_SECRET) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or missing internal service token' });
  }
  next();
}
```

---

# 8. Unified Error Handling & HTTP Status Matrix

Every service in the PharmaChain ecosystem returns a standardized error envelope:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable explanation of error",
  "data": {}
}
```

### Standardized Error Code Reference

| Error Code | HTTP Status | Originating Service | Root Cause / Trigger | Client Action Required |
|---|---|---|---|---|
| `INVALID_SIGNATURE` | 400 | `pharma-core` | ECDSA P-256 signature verification failed | Reject pack — Potential counterfeit alert |
| `TRANSITION_NOT_FOUND` | 404 | `pharma-backend` | Requested hash key is not present in Fabric state | For consumer: genuine unsold stock; For sale: reject |
| `TRANSITION_ALREADY_EXISTS`| 409 | `pharma-backend` | Attempted duplicate event write on Fabric | Idempotency guard triggered |
| `ALREADY_SOLD` | 409 | `shopkeeper-svc` | Pack already possesses a `:SALE` transition on ledger | Reject checkout — Item was previously sold |
| `PACK_NOT_AT_SHOP` | 400 | `shopkeeper-svc` | Pack lacks an `:INTAKE` event for this shop | Complete intake scan before attempting sale |
| `RECALLED` | 409 | `shopkeeper / consumer` | Batch has active `:RECALL` transition on ledger | Immediate quarantine — Do not sell / consume |
| `EXPIRED` | 400 | `shopkeeper / consumer` | `expiryDate < currentDate` | Quarantine expired inventory |
| `DUPLICATE_INTAKE` | 409 | `shopkeeper-svc` | Pack was already received into local stock | Avoid duplicate inventory addition |
| `UNAUTHORIZED` | 401 | All Services | Missing/invalid user JWT or `X-Service-Token` | Re-authenticate or check service credentials |
| `KYC_PENDING` | 403 | `manufacturer / shopkeeper`| Business account pending regulatory approval | Wait for administrative KYC verification |
| `CHAIN_ERROR` | 502 / 500 | `pharma-backend` | Fabric gRPC failure or peer endorsement timeout | Internal gateway failure — retry transaction |

---

# 9. Kubernetes Manifests & Skaffold Development Specification

## 9.1 Monorepo & Manifest Directory Layout

All Kubernetes manifests reside in a **single flat `k8s/` directory** with no subdirectories. A single root-level `skaffold.yml` coordinates the entire platform.

```
SIH_2026/
├── skaffold.yml                     ← Master Skaffold config (v4beta2)
├── k8s/                             ← ALL Kubernetes manifests (flat structure)
│   ├── manufacturer.deployment.yml
│   ├── manufacturer.service.yml
│   ├── shopkeeper.deployment.yml
│   ├── shopkeeper.service.yml
│   ├── consumer.deployment.yml
│   ├── consumer.service.yml
│   ├── pharma-core.deployment.yml
│   ├── pharma-core.service.yml
│   ├── pharma-backend.deployment.yml
│   ├── pharma-backend.service.yml
│   ├── manufacturer-db.deployment.yml
│   ├── manufacturer-db.service.yml
│   ├── shopkeeper-db.deployment.yml
│   ├── shopkeeper-db.service.yml
│   ├── ingress.yml                  ← Single shared NGINX Ingress
│   ├── secrets.yml                  ← Multi-document secrets (gitignored)
│   └── secrets.yml.example          ← Committed safe template with placeholders
├── services/
│   ├── manufacturer/
│   │   └── dockerfile               ← Always lowercase "dockerfile"
│   ├── shopkeeper/
│   │   └── dockerfile
│   ├── consumer/
│   │   └── dockerfile
│   └── pharma-core/
│       └── dockerfile
├── Backend/                         ← Spring Boot Gateway (pharma-backend)
│   └── dockerfile
├── chaincode/                       ← Java Chaincode (pharmacc)
└── crypto-config/                   ← Fabric MSP & TLS Materials
```

---

## 9.2 Skaffold Master Configuration (`skaffold.yml`)

```yaml
# skaffold.yml — PharmaChain Platform
# Manages continuous builds and live file synchronization into Kubernetes.
# tagPolicy: sha256 ensures deterministic, non-conflicting image IDs.

apiVersion: skaffold/v4beta2
kind: Config

build:
  tagPolicy:
    sha256: {}
  artifacts:
    # ── 1. Manufacturer Service ─────────────────────────────────────────────
    - image: manufacturer-service
      context: services/manufacturer
      docker:
        dockerfile: dockerfile
      sync:
        infer:
          - "src/**"

    # ── 2. Shopkeeper Service ───────────────────────────────────────────────
    - image: shopkeeper-service
      context: services/shopkeeper
      docker:
        dockerfile: dockerfile
      sync:
        infer:
          - "src/**"

    # ── 3. Consumer Service ─────────────────────────────────────────────────
    - image: consumer-service
      context: services/consumer
      docker:
        dockerfile: dockerfile
      sync:
        infer:
          - "src/**"

    # ── 4. Pharma Core Crypto Vault ─────────────────────────────────────────
    - image: pharma-core-service
      context: services/pharma-core
      docker:
        dockerfile: dockerfile
      sync:
        infer:
          - "src/**"

    # ── 5. Pharma Backend Blockchain Gateway ────────────────────────────────
    - image: pharma-backend-service
      context: Backend
      docker:
        dockerfile: dockerfile
      sync:
        infer:
          - "src/main/**"

manifests:
  rawYaml:
    - k8s/secrets.yml
    - k8s/manufacturer-db.deployment.yml
    - k8s/manufacturer-db.service.yml
    - k8s/shopkeeper-db.deployment.yml
    - k8s/shopkeeper-db.service.yml
    - k8s/pharma-backend.deployment.yml
    - k8s/pharma-backend.service.yml
    - k8s/pharma-core.deployment.yml
    - k8s/pharma-core.service.yml
    - k8s/manufacturer.deployment.yml
    - k8s/manufacturer.service.yml
    - k8s/shopkeeper.deployment.yml
    - k8s/shopkeeper.service.yml
    - k8s/consumer.deployment.yml
    - k8s/consumer.service.yml
    - k8s/ingress.yml

portForward:
  - resourceType: service
    resourceName: ingress-nginx-controller
    namespace: ingress-nginx
    port: 80
    localPort: 80
```

---

## 9.3 Standard Lowercase `dockerfile` Pattern

Every Node.js microservice uses this **standard lowercase `dockerfile`** pattern:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
```

> **Rules:**
> 1. Always named `dockerfile` (lowercase).
> 2. `WORKDIR` is `/app`.
> 3. `CMD ["npm", "run", "dev"]` (uses nodemon/tsx) so Skaffold's `sync.infer` automatically hot-reloads code without container restarts.

---

## 9.4 Kubernetes Deployment Manifest Patterns

### Standard Microservice Deployment (`k8s/manufacturer.deployment.yml`)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: manufacturer-deployment
  labels:
    app: manufacturer
spec:
  replicas: 1
  selector:
    matchLabels:
      app: manufacturer
  template:
    metadata:
      labels:
        app: manufacturer
    spec:
      containers:
      - name: manufacturer-container
        image: manufacturer-service
        imagePullPolicy: IfNotPresent
        resources:
          requests:
            cpu: "250m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /readyz
            port: 3001
          initialDelaySeconds: 15
          periodSeconds: 5
          timeoutSeconds: 5
        ports:
        - containerPort: 3001
          name: mfr-http
        env:
        - name: PORT
          value: "3001"
        - name: PHARMA_CORE_URL
          value: "http://pharma-core-service:80"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: MANUFACTURER_DB_URL
        - name: SERVICE_TOKEN
          valueFrom:
            secretKeyRef:
              name: auth-secret
              key: SERVICE_TOKEN
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secret
              key: MANUFACTURER_JWT_SECRET
```

### Internal Core Security Deployment (`k8s/pharma-core.deployment.yml`)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pharma-core-deployment
  labels:
    app: pharma-core
spec:
  replicas: 1
  selector:
    matchLabels:
      app: pharma-core
  template:
    metadata:
      labels:
        app: pharma-core
    spec:
      containers:
      - name: pharma-core-container
        image: pharma-core-service
        imagePullPolicy: IfNotPresent
        resources:
          requests:
            cpu: "250m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /core/health
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
        ports:
        - containerPort: 4000
          name: core-http
        env:
        - name: PORT
          value: "4000"
        - name: PHARMA_BACKEND_URL
          value: "http://pharma-backend-service:80"
        - name: SERVICE_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secret
              key: SERVICE_TOKEN
        - name: KEY_ENCRYPTION_SECRET
          valueFrom:
            secretKeyRef:
              name: crypto-secret
              key: KEY_ENCRYPTION_SECRET
        volumeMounts:
        - name: keystore-vol
          mountPath: /data
      volumes:
      - name: keystore-vol
        persistentVolumeClaim:
          claimName: pharma-core-keystore-pvc
```

---

## 9.5 Kubernetes Service Manifest Patterns

Every internal Service exposes **standard cluster port 80** to maintain clean inter-service URL conventions (`http://<service>-service`):

### `k8s/manufacturer.service.yml`
```yaml
apiVersion: v1
kind: Service
metadata:
  name: manufacturer-service
  labels:
    app: manufacturer
spec:
  selector:
    app: manufacturer
  type: ClusterIP
  ports:
  - name: http
    port: 80
    targetPort: 3001
```

### `k8s/pharma-core.service.yml`
```yaml
apiVersion: v1
kind: Service
metadata:
  name: pharma-core-service
  labels:
    app: pharma-core
spec:
  selector:
    app: pharma-core
  type: ClusterIP
  ports:
  - name: http
    port: 80
    targetPort: 4000
```

---

## 9.6 Shared NGINX Ingress Manifest (`k8s/ingress.yml`)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pharma-ingress
  labels:
    app.kubernetes.io/name: pharma-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "10"
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      # ── Manufacturer Service Route ──────────────────────────────────────────
      - path: /api/manufacturer(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: manufacturer-service
            port:
              number: 80

      # ── Shopkeeper Service Route ────────────────────────────────────────────
      - path: /api/shopkeeper(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: shopkeeper-service
            port:
              number: 80

      # ── Consumer Service Route ──────────────────────────────────────────────
      - path: /api/consumer(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: consumer-service
            port:
              number: 80
```

> **Security Guarantee**: `pharma-core-service` and `pharma-backend-service` are **never** routed in `ingress.yml`.

---

## 9.7 Unified Secrets Configuration (`k8s/secrets.yml`)

The platform's secrets are defined in a multi-document YAML file separated by `---`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: database-secret
type: Opaque
stringData:
  MANUFACTURER_DB_URL: "postgres://pharma:pharma@manufacturer-db-service:5432/manufacturer"
  SHOPKEEPER_DB_URL: "postgres://pharma:pharma@shopkeeper-db-service:5432/shopkeeper"

---
apiVersion: v1
kind: Secret
metadata:
  name: auth-secret
type: Opaque
stringData:
  SERVICE_TOKEN: "pharma-cluster-internal-secret-token-change-in-prod"
  MANUFACTURER_JWT_SECRET: "mfr-super-secret-jwt-key"
  SHOPKEEPER_JWT_SECRET: "shop-super-secret-jwt-key"

---
apiVersion: v1
kind: Secret
metadata:
  name: crypto-secret
type: Opaque
stringData:
  KEY_ENCRYPTION_SECRET: "e4d9b2a1f0c8e7d6b5a4938271605f4e3d2c1b0a9f8e7d6c5b4a3928170f1234"
```

---

# 10. Environment Variables Reference

```env
# ══════════════════════════════════════════════════════════════════════════════
# SHARED INTERNAL AUTHENTICATION
# ══════════════════════════════════════════════════════════════════════════════
SERVICE_TOKEN=pharma-cluster-internal-secret-token-change-in-prod
SERVICE_SECRET=pharma-cluster-internal-secret-token-change-in-prod

# ══════════════════════════════════════════════════════════════════════════════
# PHARMA-CORE SERVICE (Port 4000)
# ══════════════════════════════════════════════════════════════════════════════
PORT=4000
KEY_ENCRYPTION_SECRET=e4d9b2a1f0c8e7d6b5a4938271605f4e3d2c1b0a9f8e7d6c5b4a3928170f1234
PHARMA_BACKEND_URL=http://pharma-backend-service:80
KEYSTORE_PATH=/data/keystore.json

# ══════════════════════════════════════════════════════════════════════════════
# PHARMA-BACKEND SERVICE (Spring Boot Port 8080)
# ══════════════════════════════════════════════════════════════════════════════
PEER_ENDPOINT=peer0.org1.example.com:7051
PEER_OVERRIDE_AUTH=peer0.org1.example.com
FABRIC_MSP_ID=Org1MSP
FABRIC_CERT_PATH=/crypto/users/User1@org1.example.com/msp/signcerts/cert.pem
FABRIC_KEY_DIR=/crypto/users/User1@org1.example.com/msp/keystore
FABRIC_TLS_CERT_PATH=/crypto/peers/peer0.org1.example.com/tls/ca.crt
AUTH_JWKS_URI=http://pharma-core-service:4000/.well-known/jwks.json

# ══════════════════════════════════════════════════════════════════════════════
# MANUFACTURER SERVICE (Port 3001)
# ══════════════════════════════════════════════════════════════════════════════
PORT=3001
DATABASE_URL=postgres://pharma:pharma@manufacturer-db-service:5432/manufacturer
PHARMA_CORE_URL=http://pharma-core-service:80
MANUFACTURER_JWT_SECRET=mfr-super-secret-jwt-key

# ══════════════════════════════════════════════════════════════════════════════
# SHOPKEEPER SERVICE (Port 3002)
# ══════════════════════════════════════════════════════════════════════════════
PORT=3002
DATABASE_URL=postgres://pharma:pharma@shopkeeper-db-service:5432/shopkeeper
PHARMA_CORE_URL=http://pharma-core-service:80
SHOPKEEPER_JWT_SECRET=shop-super-secret-jwt-key

# ══════════════════════════════════════════════════════════════════════════════
# CONSUMER SERVICE (Port 3003)
# ══════════════════════════════════════════════════════════════════════════════
PORT=3003
PHARMA_CORE_URL=http://pharma-core-service:80
```

---

# 11. Implementation Roadmap & Phased Build Plan

```
PHASE 1: Core Cryptography, Gateway & Blockchain Integration (Day 1)
├── Scaffold Monorepo & verify `skaffold dev` pipeline
├── Implement pharma-core: AES-256 Keystore, ES256 Engine, JWKS endpoint
├── Implement pharma-backend fixes: F-01, F-02, F-04 (Recall), F-05 (Status), F-06 (JWKS), F-07 (Errors), F-08 (Batch)
└── Validate end-to-end minting of 5 sample packs on Hyperledger Fabric via `skaffold dev`

PHASE 2: Manufacturer & Shopkeeper Microservices (Day 2)
├── manufacturer-service: Auth, KYC, Batch Creation, /core/batch/mint call, QR CSV/ZIP export
├── shopkeeper-service: Auth, Intake Scan, POS Sale Scan, Inventory tracking
└── Full supply chain integration test: Mint -> Intake -> Sale

PHASE 3: Consumer Verification, Frontend & Demo Polish (Day 3)
├── consumer-service: Stateless verification proxy, 7 UI state mapping, Fraud reporting
├── Frontend Dashboards: Manufacturer Web Portal, Shopkeeper Mobile, Consumer Mobile
└── End-to-end Recall Simulation: Trigger recall -> verify immediate global sale rejection
```

---

**Architecture Approved & Frozen for SIH 2026**  
*Document maintained by Team PharmaChain | 2026-08-20*
