# 🛡️ PharmaChain — Manufacturer & Consumer Service API Specification

This document provides complete, production-grade documentation for the **Manufacturer Service**, **Consumer Service**, and their associated **Pharma-Core / Blockchain** cryptographic endpoints.

---

## 📑 Table of Contents

1. [System Overview & Base URLs](#-system-overview--base-urls)
2. [Authentication & Authorization Headers](#-authentication--authorization-headers)
3. [Manufacturer Service APIs](#-manufacturer-service-apis)
   - [3.1 Register Manufacturer](#31-register-manufacturer)
   - [3.2 Manufacturer Login](#32-manufacturer-login)
   - [3.3 Manufacturer Logout](#33-manufacturer-logout)
   - [3.4 Admin KYC Approval (with Key Generation)](#34-admin-kyc-approval-with-key-generation)
   - [3.5 Admin KYC Rejection](#35-admin-kyc-rejection)
   - [3.6 Admin Manufacturer Stats](#36-admin-manufacturer-stats)
   - [3.7 Admin List Manufacturers](#37-admin-list-manufacturers)
   - [3.8 Admin Get Manufacturer by ID](#38-admin-get-manufacturer-by-id)
   - [3.9 Create Medicine Batch](#39-create-medicine-batch)
   - [3.10 List Batches](#310-list-batches)
   - [3.11 Get Batch by ID](#311-get-batch-by-id)
   - [3.12 Get Public Batch Details (No Auth)](#312-get-public-batch-details-no-auth)
   - [3.13 Trigger Batch Cryptographic Minting](#313-trigger-batch-cryptographic-minting)
   - [3.14 Get Batch Packs Preview (Paginated)](#314-get-batch-packs-preview-paginated)
   - [3.15 Get Batch Packs S3 Metadata](#315-get-batch-packs-s3-metadata)
   - [3.16 Export Batch CSV (Direct from S3)](#316-export-batch-csv-direct-from-s3)
   - [3.17 Global Pack Lookup](#317-global-pack-lookup)
   - [3.18 Initiate Batch Recall](#318-initiate-batch-recall)
4. [Consumer Service APIs](#-consumer-service-apis)
   - [4.1 Verify Medicine Pack (QR / JWT)](#41-verify-medicine-pack-qr--jwt)
   - [4.2 Report Suspicious / Counterfeit Medicine](#42-report-suspicious--counterfeit-medicine)
5. [Standard Error Handling & Status Codes](#-standard-error-handling--status-codes)

---

## 🌐 System Overview & Base URLs

PharmaChain microservices run inside a Kubernetes cluster exposed through an NGINX Ingress Controller on port `80`.

| Environment | Base URL | Description |
|---|---|---|
| **Kubernetes Ingress (Default)** | `http://localhost` | Standard cluster entrypoint |
| **Direct Manufacturer Service** | `http://localhost:3001` | Local port-forward / dev port |
| **Direct Consumer Service** | `http://localhost:3003` | Local port-forward / dev port |
| **Direct Pharma-Core Service** | `http://localhost:4000` | Local cryptographic vault |

---

## 🔑 Authentication & Authorization Headers

| Header | Format / Example | Required For |
|---|---|---|
| `Authorization` | `Bearer <JWT_TOKEN>` | Protected Manufacturer endpoints |
| `X-Admin-Token` | `960e412b2690c03cb83337b91010016a572343f23123feb3` | Regulatory / Admin KYC routes |
| `Cookie` | `mfr_token=<JWT_TOKEN>` | Automatically set on browser login |

---

# 🏭 Manufacturer Service APIs

---

### 3.1 Register Manufacturer
Registers a new pharmaceutical manufacturing entity. Sets `kycStatus: "PENDING"`.

- **Endpoint:** `POST /api/manufacturer/auth/register`
- **Auth Required:** No

#### Request Headers
```http
Content-Type: application/json
```

#### Request Body
```json
{
  "companyName": "Cipla Pharmaceuticals Ltd",
  "licenseNumber": "MH-MUM-2026-9812",
  "email": "contact@cipla.com",
  "password": "SecurePassword@123"
}
```

#### Success Response (`HTTP 201 Created`)
```json
{
  "status": "success",
  "message": "Registration successful. KYC review is pending.",
  "data": {
    "id": "MFR_MHMUM20269812_8F2A1C",
    "companyName": "Cipla Pharmaceuticals Ltd",
    "email": "contact@cipla.com",
    "kycStatus": "PENDING"
  }
}
```

#### Error Responses
- **`HTTP 400 Bad Request` (Missing fields or short password):**
  ```json
  {
    "status": "error",
    "message": "companyName, licenseNumber, email, and password are required"
  }
  ```
- **`HTTP 409 Conflict` (Email already registered):**
  ```json
  {
    "status": "error",
    "message": "Email already registered"
  }
  ```

---

### 3.2 Manufacturer Login
Authenticates an approved manufacturer. Fails if KYC is still pending or rejected.

- **Endpoint:** `POST /api/manufacturer/auth/login`
- **Auth Required:** No

#### Request Body
```json
{
  "email": "contact@cipla.com",
  "password": "SecurePassword@123"
}
```

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "id": "MFR_MHMUM20269812_8F2A1C",
    "email": "contact@cipla.com",
    "companyName": "Cipla Pharmaceuticals Ltd"
  }
}
```

#### Error Responses
- **`HTTP 401 Unauthorized` (Invalid credentials):**
  ```json
  {
    "status": "error",
    "message": "Invalid credentials"
  }
  ```
- **`HTTP 403 Forbidden` (KYC not yet approved):**
  ```json
  {
    "status": "error",
    "code": "KYC_PENDING",
    "message": "Account pending KYC approval. Contact administrator.",
    "kycStatus": "PENDING"
  }
  ```

---

### 3.3 Manufacturer Logout
Clears the session cookie (`mfr_token`).

- **Endpoint:** `POST /api/manufacturer/auth/logout`
- **Auth Required:** Optional (Safe to call anytime)

#### Success Response (`HTTP 204 No Content`)
*(Empty response body with Set-Cookie expired header)*

---

### 3.4 Admin KYC Approval (with Key Generation)
Admin approval endpoint. Provisions the ECDSA P-256 signing key in `pharma-core`.

- **Endpoint:** `POST /api/manufacturer/auth/kyc/approve`
- **Auth Required:** Yes (`X-Admin-Token` required)

#### Request Headers
```http
Content-Type: application/json
X-Admin-Token: 960e412b2690c03cb83337b91010016a572343f23123feb3
```

#### Request Body
```json
{
  "email": "contact@cipla.com"
}
```
*(Or specify `"manufacturerId": "MFR_MHMUM20269812_8F2A1C"`)*

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "message": "Cipla Pharmaceuticals Ltd approved. They can now log in and mint batches.",
  "manufacturerId": "MFR_MHMUM20269812_8F2A1C",
  "companyName": "Cipla Pharmaceuticals Ltd",
  "kycStatus": "APPROVED",
  "keyGenerated": true,
  "verifiedAt": "2026-08-24T05:27:46.939Z"
}
```

#### Error Responses
- **`HTTP 401 Unauthorized` (Missing/wrong admin token):**
  ```json
  {
    "status": "error",
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing X-Admin-Token"
  }
  ```
- **`HTTP 404 Not Found` (Manufacturer does not exist):**
  ```json
  {
    "status": "error",
    "message": "Manufacturer not found"
  }
  ```

---

### 3.5 Admin KYC Rejection
Rejects a manufacturer's KYC application with a recorded reason.

- **Endpoint:** `POST /api/manufacturer/auth/kyc/reject`
- **Auth Required:** Yes (`X-Admin-Token` required)

#### Request Body
```json
{
  "email": "fraud_pharma@test.com",
  "reason": "Invalid or expired manufacturing drug license certificate."
}
```

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "message": "Fraud Pharma Ltd registration rejected.",
  "manufacturerId": "MFR_FRAUD123_4A81B9",
  "companyName": "Fraud Pharma Ltd",
  "kycStatus": "REJECTED",
  "rejectionReason": "Invalid or expired manufacturing drug license certificate."
}
```

---

### 3.6 Admin Manufacturer Stats
Returns aggregate statistics of registered manufacturers.

- **Endpoint:** `GET /api/manufacturer/internal/stats`
- **Auth Required:** Yes (`X-Admin-Token` required)

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "total": 42,
    "pending": 5,
    "approved": 35,
    "rejected": 2
  }
}
```

---

### 3.7 Admin List Manufacturers
Returns paginated list of manufacturers with optional status filter.

- **Endpoint:** `GET /api/manufacturer/internal/list?status=PENDING&page=1&limit=10`
- **Auth Required:** Yes (`X-Admin-Token` required)

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1
  },
  "data": [
    {
      "manufacturerId": "MFR_MHMUM20269812_8F2A1C",
      "companyName": "Cipla Pharmaceuticals Ltd",
      "licenseNumber": "MH-MUM-2026-9812",
      "email": "contact@cipla.com",
      "kycStatus": "APPROVED",
      "hasSigningKey": true,
      "createdAt": "2026-08-24T05:25:00.000Z"
    }
  ]
}
```

---

### 3.8 Admin Get Manufacturer by ID
- **Endpoint:** `GET /api/manufacturer/internal/:id`
- **Auth Required:** Yes (`X-Admin-Token` required)

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "manufacturerId": "MFR_MHMUM20269812_8F2A1C",
    "companyName": "Cipla Pharmaceuticals Ltd",
    "email": "contact@cipla.com",
    "licenseNumber": "MH-MUM-2026-9812",
    "kycStatus": "APPROVED",
    "hasSigningKey": true,
    "verifiedAt": "2026-08-24T05:27:46.939Z"
  }
}
```

---

### 3.9 Create Medicine Batch
Registers a batch before cryptographic minting. Generates standard `PC-BATCH-...` ID.

- **Endpoints:** `POST /api/manufacturer/batch` & `POST /api/manufacturer/batch/create`
- **Auth Required:** Yes (`Bearer <token>`)

#### Request Body
```json
{
  "medicineName": "Amoxicillin 500mg Trihydrate",
  "manufacturerBatchNumber": "B.NO-CIP-2026-004",
  "totalQuantity": 1000,
  "manufacturingDate": "2026-08-24",
  "expiryDate": "2028-12-31",
  "genericName": "Amoxicillin",
  "brandName": "Moxcip 500",
  "dosage": "500 mg",
  "form": "CAPSULE",
  "packSize": 10,
  "unitsPerCarton": 100,
  "storageConditions": "Store below 25°C in a dry place."
}
```

#### Success Response (`HTTP 201 Created`)
```json
{
  "status": "success",
  "message": "Batch created successfully. Ready for cryptographic minting.",
  "data": {
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "systemBatchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "manufacturerBatchNumber": "B.NO-CIP-2026-004",
    "medicineName": "Amoxicillin 500mg Trihydrate",
    "totalQuantity": 1000,
    "mintStatus": "PENDING",
    "createdAt": "2026-08-24T05:30:00.000Z"
  }
}
```

#### Error Responses
- **`HTTP 400 Bad Request` (Invalid Quantity):**
  ```json
  {
    "status": "error",
    "message": "totalQuantity must be between 1 and 100000"
  }
  ```
- **`HTTP 401 Unauthorized`:**
  ```json
  {
    "status": "error",
    "message": "Authentication token missing or invalid"
  }
  ```

---

### 3.10 List Batches
Returns all batches owned by the authenticated manufacturer.

- **Endpoint:** `GET /api/manufacturer/batch?page=1&limit=10`
- **Auth Required:** Yes (`Bearer <token>`)

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 12,
    "totalPages": 2
  },
  "data": [
    {
      "systemBatchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
      "manufacturerBatchNumber": "B.NO-CIP-2026-004",
      "medicineName": "Amoxicillin 500mg Trihydrate",
      "totalQuantity": 1000,
      "mintStatus": "MINTED",
      "mintedPacksCount": 1000,
      "s3Mode": "aws"
    }
  ]
}
```

---

### 3.11 Get Batch by ID
Retrieves private batch data and any active in-flight minting progress.

- **Endpoint:** `GET /api/manufacturer/batch/:batchId`
- **Auth Required:** Yes (`Bearer <token>`)

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "systemBatchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "medicineName": "Amoxicillin 500mg Trihydrate",
    "mintStatus": "MINTED",
    "mintedPacksCount": 1000,
    "s3FileKey": "batches/PC-BATCH-MFRMHM-20260824-91E3B4.csv",
    "s3Mode": "aws",
    "s3DownloadUrl": "https://pharmachain-qr-csvs.s3.us-east-1.amazonaws.com/batches/PC-BATCH-MFRMHM-20260824-91E3B4.csv?..."
  }
}
```

---

### 3.12 Get Public Batch Details (No Auth)
Public endpoint used by scanners and consumer portals. Returns 404 while batch is PENDING or MINTING; returns 200 once MINTED.

- **Endpoint:** `GET /api/manufacturer/batch/public/:batchId`
- **Auth Required:** No

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "systemBatchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "medicineName": "Amoxicillin 500mg Trihydrate",
    "genericName": "Amoxicillin",
    "brandName": "Moxcip 500",
    "dosage": "500 mg",
    "form": "CAPSULE",
    "manufacturingDate": "2026-08-24T00:00:00.000Z",
    "expiryDate": "2028-12-31T00:00:00.000Z",
    "storageConditions": "Store below 25°C in a dry place.",
    "mintStatus": "MINTED"
  }
}
```

---

### 3.13 Trigger Batch Cryptographic Minting
Asynchronously generates ECDSA P-256 signatures, compiles CSV, streams to AWS S3, and commits batch transitions to blockchain.

- **Endpoint:** `POST /api/manufacturer/batch/:batchId/mint`
- **Auth Required:** Yes (`Bearer <token>`)

#### Success Response (`HTTP 202 Accepted`)
```json
{
  "status": "accepted",
  "message": "Cryptographic minting started in background. Poll batch status for completion.",
  "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
  "pollUrl": "/api/manufacturer/batch/PC-BATCH-MFRMHM-20260824-91E3B4"
}
```

#### Error Responses
- **`HTTP 409 Conflict` (Batch already minted):**
  ```json
  {
    "status": "error",
    "message": "Batch has already been minted"
  }
  ```

---

### 3.14 Get Batch Packs Preview (Paginated)
Parses the batch CSV (from S3 or local storage) and returns searchable, paginated pack data for dashboard tables.

- **Endpoint:** `GET /api/manufacturer/batch/:batchId/preview?page=1&limit=50&search=00010`
- **Auth Required:** Yes (`Bearer <token>`)

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1000,
      "totalPages": 20
    },
    "packs": [
      {
        "serialNumber": "00001",
        "packHash": "8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4",
        "signedToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Im1mci1rZXkifQ...",
        "verifyUrl": "https://pharmachain.gov.in/verify/8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4?token=eyJhbGciOiJFUzI1Ni...",
        "expiryDate": "2028-12-31"
      }
    ]
  }
}
```

---

### 3.15 Get Batch Packs S3 Metadata
- **Endpoint:** `GET /api/manufacturer/batch/:batchId/packs`
- **Auth Required:** Yes (`Bearer <token>`)

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "mintStatus": "MINTED",
    "mintedPacksCount": 1000,
    "s3Mode": "aws",
    "s3FileKey": "batches/PC-BATCH-MFRMHM-20260824-91E3B4.csv",
    "s3DownloadUrl": "https://pharmachain-qr-csvs.s3.us-east-1.amazonaws.com/batches/PC-BATCH-MFRMHM-20260824-91E3B4.csv?..."
  }
}
```

---

### 3.16 Export Batch CSV (Direct from S3)
Returns the CSV containing all minted pack hashes and signed QR tokens. In production, returns a `302 Redirect` to the AWS S3 pre-signed URL.

- **Endpoint:** `GET /api/manufacturer/batch/:batchId/export/csv`
- **Auth Required:** Yes (`Bearer <token>`)

#### Success Response (`HTTP 200 OK` or `HTTP 302 Found`)
```csv
serialNumber,packHash,signedToken,verifyUrl,batchId,medicineName,expiryDate
"00001","8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4","eyJhbGciOiJFUzI1Ni...","https://pharmachain.gov.in/verify/8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4?token=eyJhbGciOiJFUzI1Ni...","PC-BATCH-MFRMHM-20260824-91E3B4","Amoxicillin 500mg Trihydrate","2028-12-31"
"00002","7bc19a3182fc3e8891dc4507186284e77a04e02b5d2ac2598acfae3cb078f4a1","eyJhbGciOiJFUzI1Ni...","https://pharmachain.gov.in/verify/7bc19a3182fc3e8891dc4507186284e77a04e02b5d2ac2598acfae3cb078f4a1?token=eyJhbGciOiJFUzI1Ni...","PC-BATCH-MFRMHM-20260824-91E3B4","Amoxicillin 500mg Trihydrate","2028-12-31"
```

---

### 3.17 Global Pack Lookup
Finds pack details across all batches by hash.

- **Endpoint:** `GET /api/manufacturer/batch/pack/lookup/:identifier`
- **Auth Required:** Yes (`Bearer <token>`)

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "packHash": "8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4",
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "serialNumber": "00001",
    "medicineName": "Amoxicillin 500mg Trihydrate"
  }
}
```

---

### 3.18 Initiate Batch Recall
Flags a batch as recalled and propagates state to the Hyperledger Fabric ledger.

- **Endpoint:** `POST /api/manufacturer/batch/:batchId/recall`
- **Auth Required:** Yes (`Bearer <token>`)

#### Request Body
```json
{
  "reason": "Quality check failure — dissolution test variation observed in lot sample."
}
```

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "message": "Batch recall initiated successfully across supply chain.",
  "data": {
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "isRecalled": true,
    "recallReason": "Quality check failure — dissolution test variation observed in lot sample.",
    "recalledAt": "2026-08-24T05:55:00.000Z"
  }
}
```

---

# 📱 Consumer Service APIs

---

### 4.1 Verify Medicine Pack (QR / JWT)
Public anti-counterfeiting verification engine. Accepts full QR scan URL, raw JWT `token`, or `qrData`.

- **Endpoints:** `POST /api/consumer/verify` & `GET /api/consumer/verify?token=...`
- **Auth Required:** No

#### Request Body Options

**Option A — Full QR URL:**
```json
{
  "qrData": "https://pharmachain.gov.in/verify/8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4?token=eyJhbGciOiJFUzI1Ni..."
}
```

**Option B — Raw JWT String:**
```json
{
  "token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Im1mci1rZXkifQ..."
}
```

---

#### Verification State Responses

#### ✅ Genuine Pack (`GENUINE`)
```json
{
  "status": "success",
  "uiState": "GENUINE",
  "message": "100% Genuine Medicine — Registered & Safe",
  "valid": true,
  "payload": {
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "serial": "00001",
    "expiryDate": "2028-12-31",
    "manufacturerId": "MFR_MHMUM20269812_8F2A1C"
  },
  "packHash": "8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4",
  "blockchainStatus": "Packaged"
}
```

#### 🚨 Counterfeit / Tampered Signature (`COUNTERFEIT`)
```json
{
  "status": "success",
  "uiState": "COUNTERFEIT",
  "message": "COUNTERFEIT WARNING: Invalid digital signature. Do not consume this medicine.",
  "valid": false,
  "scannedHash": "8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4"
}
```

#### ⚠️ Recalled Batch (`RECALLED`)
```json
{
  "status": "success",
  "uiState": "RECALLED",
  "message": "CRITICAL: Batch recalled by manufacturer. Do not consume.",
  "valid": true,
  "payload": {
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "expiryDate": "2028-12-31"
  },
  "blockchainStatus": "Recalled"
}
```

#### ⏳ Expired Medicine (`EXPIRED`)
```json
{
  "status": "success",
  "uiState": "EXPIRED",
  "message": "EXPIRED: Medicine passed expiration date on 2025-01-01. Do not consume.",
  "valid": true,
  "payload": {
    "batchId": "PC-BATCH-OLD-2024-001",
    "expiryDate": "2025-01-01"
  }
}
```

---

### 4.2 Report Suspicious / Counterfeit Medicine
Enables consumers and inspectors to file incident reports with location and photo evidence.

- **Endpoint:** `POST /api/consumer/report`
- **Auth Required:** No

#### Request Body
```json
{
  "qrToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
  "location": "Shop 4, MG Road, Mumbai, Maharashtra",
  "notes": "Packaging label printing is faded; QR verification reported counterfeit.",
  "photoUrl": "https://storage.pharmachain.gov.in/evidence/rpt-9812.jpg"
}
```

#### Success Response (`HTTP 201 Created`)
```json
{
  "status": "success",
  "message": "Report submitted. Our team will investigate.",
  "reportId": "RPT-1787550100452"
}
```

#### Error Response (`HTTP 400 Bad Request`):
```json
{
  "status": "error",
  "message": "qrToken is required"
}
```

---

## 🚦 Standard Error Handling & Status Codes

| Code | Status | Meaning | Typical Scenario |
|---|---|---|---|
| `200` | OK | Success | Standard GET / POST retrieval |
| `201` | Created | Resource Created | Batch created / Report logged / User registered |
| `202` | Accepted | Async Processing | Background EC minting started |
| `204` | No Content | Action Complete | User logout / Cookie cleared |
| `400` | Bad Request | Validation Error | Missing parameters, quantity out of range |
| `401` | Unauthorized | Missing / Bad Auth | Invalid JWT or missing `X-Admin-Token` |
| `403` | Forbidden | Access Denied | KYC status is `PENDING` or `REJECTED` |
| `404` | Not Found | Resource Missing | Batch / Manufacturer ID not found |
| `409` | Conflict | Duplicate State | Batch already minted, Email already registered |
| `500` | Internal Error | Server Exception | Cluster connectivity or cryptographic failure |

---

## 💻 Quick Integration Examples (cURL & JavaScript)

### 1. cURL — Complete Mint Flow
```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost/api/manufacturer/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"himanshu@gmail.com","password":"12345678"}' | jq -r .token)

# 2. Create Batch
BATCH_ID=$(curl -s -X POST http://localhost/api/manufacturer/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "medicineName": "Paracetamol 650mg",
    "manufacturerBatchNumber": "PCM-2026-01",
    "totalQuantity": 1000,
    "expiryDate": "2028-12-31"
  }' | jq -r .data.systemBatchId)

# 3. Mint on S3 & Hyperledger Fabric
curl -X POST "http://localhost/api/manufacturer/batch/$BATCH_ID/mint" \
  -H "Authorization: Bearer $TOKEN"
```

### 2. JavaScript / TypeScript — Consumer QR Scanner Hook
```typescript
import axios from 'axios';

export async function verifyScannedQR(qrPayload: string) {
  try {
    const response = await axios.post('http://localhost/api/consumer/verify', {
      qrData: qrPayload,
    });
    
    const { uiState, message, valid, payload } = response.data;
    
    if (uiState === 'GENUINE') {
      console.log('✅ Authentic medicine:', payload.batchId);
    } else if (uiState === 'COUNTERFEIT') {
      console.error('🚨 COUNTERFEIT WARNING:', message);
    }
    
    return response.data;
  } catch (error) {
    console.error('Verification request failed:', error);
    throw error;
  }
}
```
