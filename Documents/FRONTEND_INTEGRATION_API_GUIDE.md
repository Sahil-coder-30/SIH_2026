# 🚀 PharmaChain — Complete Frontend Integration Guide

This guide is the **single source of truth** for frontend developers building the 4 PharmaChain client applications:
1. **Manufacturer Dashboard** (`Manufacture-DashBoard`)
2. **Shopkeeper Dashboard** (`Shopkeeper-DashBoard`)
3. **Admin / Regulatory Dashboard** (`Admin-DashBoard`)
4. **Consumer Web Portal & Mobile App** (`Consumer-App`)

---

## 🏛️ System Architecture

```text
CLIENTS
┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
│ Manufacture-DashBoard │  │   shopkeeper-mobile   │  │    customer-mobile    │  │    admin-dashboard    │
│        (web)          │  │       (Expo RN)       │  │       (Expo RN)       │  │        (web)          │
└───────────┬───────────┘  └───────────┬───────────┘  └───────────┬───────────┘  └───────────┬───────────┘
            │ cookie                   │ Bearer                   │ no auth                   │ admin token
            │ mfr_token                │                          │                           │
════════════╪══════════════════════════╪══════════════════════════╪═══════════════════════════╪═════════════
PUBLIC EDGE │                          │                          │                           │
┌───────────▼───────────┐  ┌───────────▼───────────┐  ┌───────────▼───────────┐  ┌───────────▼───────────┐
│     manufacturer      │  │      shopkeeper       │  │       consumer        │  │     admin-server      │
│        :3001          │  │        :3002          │  │        :3003          │  │        :3005          │
│       MongoDB         │  │       MongoDB         │  │     NO DATABASE       │  │       MongoDB         │
└───────────┬───────────┘  └───────────┬───────────┘  └───────────┬───────────┘  └───────────┬───────────┘
            │                          │                          │                           │
            └──────────────────────────┴────────────┬─────────────┴───────────────────────────┘
                                                    │ X-Service-Token (shared secret)
                                                    ▼
═════════════════════════════════════════════════════════════════════════════════════════════════════════════
INTERNAL
                                       ┌─────────────────────────┐
                                       │       pharma-core       │  ← never reachable from
                                       │          :4000          │    a browser or a phone
                                       │  ECDSA P-256 signing    │
                                       │  RSA-4096 identity      │
                                       │  AES-256-GCM keystore   │
                                       │  NO business data       │
                                       └────────────┬────────────┘
                                                    │
                        ┌───────────────────────────┴───────────────────────────┐
                        │ RS256 JWT (+ JWKS pull)                               │ presigned PUT / GET
                        ▼                                                       ▼
        ┌───────────────────────────────┐                       ┌───────────────────────────────┐
        │        pharma-backend         │                       │            AWS S3             │
        │      Spring Boot :8080        │                       │  pack CSV (local fallback)    │
        └───────────────┬───────────────┘                       └───────────────────────────────┘
                        │ gRPC mTLS | fabric-gateway
                        ▼
        ┌───────────────────────────────┐
        │    Fabric peer + CouchDB      │  ← custody truth
        └───────────────────────────────┘
```

---

## 🌐 1. Environment Configurations & Base URLs

### Frontend `.env` Templates

#### **A. Manufacturer Dashboard (`Manufacture-DashBoard/.env`)**
```env
VITE_API_BASE_URL=http://localhost/api/manufacturer
VITE_BACKEND_SERVER_URL=http://localhost:3001
VITE_CORE_SERVER_URL=http://localhost:4000
```

#### **B. Shopkeeper Dashboard (`Shopkeeper-DashBoard/.env`)**
```env
VITE_API_BASE_URL=http://localhost/api/shopkeeper
VITE_TRANSACTION_BASE_URL=http://localhost/api/transactions
VITE_MEDICINE_BASE_URL=http://localhost/api/medicine
```

#### **C. Admin Dashboard (`Admin-DashBoard/.env`)**
```env
VITE_API_BASE_URL=http://localhost/api/admin
```

#### **D. Consumer App (`Consumer-App/.env`)**
```env
VITE_API_BASE_URL=http://localhost/api/consumer
```

---

## 🔐 2. Global Axios & Authentication Setup

```typescript
// src/services/apiClient.ts
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enables cookie handling
});

// Attach Bearer Token automatically from localStorage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Unified error response handler
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const customError = {
      status: error.response?.status || 500,
      code: error.response?.data?.code || 'UNKNOWN_ERROR',
      message: error.response?.data?.message || error.message || 'An unexpected error occurred',
      data: error.response?.data || null,
    };
    return Promise.reject(customError);
  }
);
```

---

# 🏭 SERVICE 1: Manufacturer Service (`/api/manufacturer`)

Used by **`Manufacture-DashBoard`**.

---

### 1.1 Manufacturer Registration
- **URL:** `POST /api/manufacturer/auth/register`
- **Auth:** Public

#### Request Body
```json
{
  "companyName": "Cipla Pharmaceuticals Ltd",
  "licenseNumber": "MH-MUM-2026-9812",
  "email": "himanshu@gmail.com",
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
    "email": "himanshu@gmail.com",
    "kycStatus": "PENDING"
  }
}
```

---

### 1.2 Manufacturer Login
- **URL:** `POST /api/manufacturer/auth/login`
- **Auth:** Public

#### Request Body
```json
{
  "email": "himanshu@gmail.com",
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
    "email": "himanshu@gmail.com",
    "companyName": "Cipla Pharmaceuticals Ltd"
  }
}
```

#### Error Response (`HTTP 403 Forbidden` - KYC Pending)
```json
{
  "status": "error",
  "code": "KYC_PENDING",
  "message": "Account pending KYC approval. Contact administrator.",
  "kycStatus": "PENDING"
}
```

---

### 1.3 Create Medicine Batch
- **URL:** `POST /api/manufacturer/batch`
- **Auth:** `Bearer <token>`

#### Request Body
```json
{
  "medicineName": "Amoxicillin 500mg",
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
    "medicineName": "Amoxicillin 500mg",
    "totalQuantity": 1000,
    "mintStatus": "PENDING"
  }
}
```

---

### 1.4 Trigger Cryptographic Minting (Async)
Signs each pack with the manufacturer's EC P-256 key, builds the CSV, and uploads directly to AWS S3.

- **URL:** `POST /api/manufacturer/batch/:batchId/mint`
- **Auth:** `Bearer <token>`

#### Success Response (`HTTP 202 Accepted`)
```json
{
  "status": "accepted",
  "message": "Cryptographic minting started in background. Poll batch status for completion.",
  "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
  "pollUrl": "/api/manufacturer/batch/PC-BATCH-MFRMHM-20260824-91E3B4"
}
```

---

### 1.5 Poll Batch Status & S3 Download URL
- **URL:** `GET /api/manufacturer/batch/:batchId`
- **Auth:** `Bearer <token>`

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "systemBatchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "medicineName": "Amoxicillin 500mg",
    "mintStatus": "MINTED",
    "mintedPacksCount": 1000,
    "s3Mode": "aws",
    "s3FileKey": "batches/PC-BATCH-MFRMHM-20260824-91E3B4.csv",
    "s3DownloadUrl": "https://pharmachain-qr-csvs.s3.us-east-1.amazonaws.com/batches/PC-BATCH-MFRMHM-20260824-91E3B4.csv?..."
  }
}
```

---

### 1.6 Export / Download CSV File
- **URL:** `GET /api/manufacturer/batch/:batchId/export/csv`
- **Auth:** `Bearer <token>`
- **Behavior:** Returns `302 Redirect` to pre-signed S3 URL or directly streams CSV text.

---

### 1.7 Batch Pack Preview Table (Paginated)
- **URL:** `GET /api/manufacturer/batch/:batchId/preview?page=1&limit=50&search=0001`
- **Auth:** `Bearer <token>`

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "pagination": { "page": 1, "limit": 50, "total": 1000, "totalPages": 20 },
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

### 1.8 Initiate Batch Recall
- **URL:** `POST /api/manufacturer/batch/:batchId/recall`
- **Auth:** `Bearer <token>`

#### Request Body
```json
{
  "reason": "Quality assurance test failure — microbial limits exceeded."
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
    "recallReason": "Quality assurance test failure — microbial limits exceeded.",
    "recalledAt": "2026-08-24T05:55:00.000Z"
  }
}
```

---

# 🏪 SERVICE 2: Shopkeeper Service (`/api/shopkeeper` & `/api/transactions`)

Used by **`Shopkeeper-DashBoard`**.

---

### 2.1 Shopkeeper Registration
- **URL:** `POST /api/shopkeeper/auth/register`
- **Auth:** Public

#### Request Body
```json
{
  "name": "Apollo Pharmacy Bandra",
  "ownerName": "Rajesh Sharma",
  "email": "rajesh@apollopharmacy.com",
  "phone": "+919876543210",
  "licenseNumber": "DL-MUM-2026-4412",
  "password": "Password@123",
  "address": {
    "street": "Shop 3, Linking Road, Bandra West",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400050"
  }
}
```

#### Success Response (`HTTP 201 Created`)
```json
{
  "status": "success",
  "message": "Shopkeeper registered successfully. KYC verification pending.",
  "data": {
    "shopkeeperId": "SK_DLMUM20264412_A9B1",
    "verificationStatus": "PENDING"
  }
}
```

---

### 2.2 Shopkeeper Login
- **URL:** `POST /api/shopkeeper/auth/login`
- **Auth:** Public

#### Request Body
```json
{
  "email": "rajesh@apollopharmacy.com",
  "password": "Password@123"
}
```

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "id": "SK_DLMUM20264412_A9B1",
    "name": "Apollo Pharmacy Bandra",
    "verificationStatus": "APPROVED"
  }
}
```

---

### 2.3 Shop Dashboard Stats
- **URL:** `GET /api/shopkeeper/stats`
- **Auth:** `Bearer <token>`

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "totalInventory": 450,
    "todaySales": 28,
    "returnedCount": 2,
    "criticalExpiryCount": 5
  }
}
```

---

### 2.4 Shop Inventory Roster
- **URL:** `GET /api/shopkeeper/inventory?page=1&limit=20`
- **Auth:** `Bearer <token>`

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "pagination": { "page": 1, "limit": 20, "total": 450, "totalPages": 23 },
  "data": [
    {
      "packHash": "8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4",
      "medicineName": "Amoxicillin 500mg",
      "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
      "expiryDate": "2028-12-31",
      "status": "IN_STOCK",
      "receivedAt": "2026-08-24T06:00:00.000Z"
    }
  ]
}
```

---

### 2.5 Inbound Inventory Scan & Receive (Transaction)
Commits medicine ownership from Manufacturer to Shopkeeper on Hyperledger Fabric.

- **URL:** `POST /api/transactions/receive`
- **Auth:** `Bearer <token>`

#### Request Body
```json
{
  "qrData": "https://pharmachain.gov.in/verify/8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4?token=eyJhbGciOiJFUzI1Ni..."
}
```

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "message": "Medicine verified and accepted into pharmacy inventory.",
  "data": {
    "packHash": "8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4",
    "medicineName": "Amoxicillin 500mg",
    "batchId": "PC-BATCH-MFRMHM-20260824-91E3B4",
    "blockchainStatus": "AtShop",
    "transactionId": "TXN_RCV_1787550821"
  }
}
```

---

### 2.6 Outbound Customer Sale (Transaction)
Transitions pack status to `Sold` on the blockchain ledger so it cannot be double-sold.

- **URL:** `POST /api/transactions/sell`
- **Auth:** `Bearer <token>`

#### Request Body
```json
{
  "packHash": "8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4",
  "customerPhone": "+919876543210",
  "invoiceNumber": "INV-2026-00892"
}
```

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "message": "Sale recorded. Pack marked as SOLD on blockchain ledger.",
  "data": {
    "packHash": "8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4",
    "blockchainStatus": "Sold",
    "soldAt": "2026-08-24T06:15:00.000Z"
  }
}
```

---

# 🛡️ SERVICE 3: Admin & Regulatory Service (`/api/admin`)

Used by **`Admin-DashBoard`**.

---

### 3.1 Admin Login
- **URL:** `POST /api/admin/auth/login`
- **Auth:** Public

#### Request Body
```json
{
  "email": "admin@pharmachain.gov.in",
  "password": "AdminPassword@123"
}
```

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "id": "ADM_001",
    "email": "admin@pharmachain.gov.in",
    "role": "SUPERADMIN",
    "name": "CDSCO Senior Inspector"
  }
}
```

---

### 3.2 System Overview Stats
- **URL:** `GET /api/admin/dashboard/stats`
- **Auth:** `Bearer <token>`

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": {
    "manufacturers": { "total": 42, "pending": 3, "approved": 39 },
    "shopkeepers": { "total": 158, "pending": 8, "approved": 150 },
    "batches": { "total": 1280, "minted": 1265, "recalled": 15 },
    "counterfeitAlerts": { "totalReports": 24, "pendingReview": 4 }
  }
}
```

---

### 3.3 List Manufacturer Applications
- **URL:** `GET /api/admin/manufacturers?status=PENDING&page=1&limit=10`
- **Auth:** `Bearer <token>`

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "pagination": { "page": 1, "limit": 10, "total": 3, "totalPages": 1 },
  "data": [
    {
      "id": "MFR_MHMUM20269812_8F2A1C",
      "companyName": "Cipla Pharmaceuticals Ltd",
      "licenseNumber": "MH-MUM-2026-9812",
      "email": "himanshu@gmail.com",
      "kycStatus": "PENDING",
      "submittedAt": "2026-08-24T05:20:00.000Z"
    }
  ]
}
```

---

### 3.4 Approve Manufacturer KYC
Provisions ECDSA P-256 cryptographic keys in `pharma-core` and enables manufacturer minting.

- **URL:** `POST /api/admin/manufacturers/:id/approve`
- **Auth:** `Bearer <token>` (Requires `SUPERADMIN` or `DRUG_INSPECTOR` role)

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "message": "Manufacturer KYC approved and ECDSA keypair provisioned.",
  "data": {
    "manufacturerId": "MFR_MHMUM20269812_8F2A1C",
    "kycStatus": "APPROVED",
    "keyGenerated": true,
    "verifiedAt": "2026-08-24T05:27:46.939Z"
  }
}
```

---

### 3.5 Reject Manufacturer KYC
- **URL:** `POST /api/admin/manufacturers/:id/reject`
- **Auth:** `Bearer <token>`

#### Request Body
```json
{
  "reason": "Expired manufacturing license document."
}
```

---

### 3.6 Approve / Reject / Suspend Shopkeeper KYC
- **Approve:** `POST /api/admin/shopkeepers/:id/approve`
- **Reject:** `POST /api/admin/shopkeepers/:id/reject`
- **Suspend:** `POST /api/admin/shopkeepers/:id/suspend`
- **Auth:** `Bearer <token>`

---

### 3.7 System Audit Logs
- **URL:** `GET /api/admin/audit-logs?page=1&limit=50`
- **Auth:** `Bearer <token>`

#### Success Response (`HTTP 200 OK`)
```json
{
  "status": "success",
  "data": [
    {
      "timestamp": "2026-08-24T05:27:46.939Z",
      "action": "KYC_APPROVED",
      "actor": "admin@pharmachain.gov.in",
      "target": "MFR_MHMUM20269812_8F2A1C",
      "details": "Manufacturer Cipla approved and key generated."
    }
  ]
}
```

---

# 📱 SERVICE 4: Consumer Service (`/api/consumer`)

Used by **Consumer Web Portal & Mobile Scanner**. **No authentication required.**

---

### 4.1 Anti-Counterfeit Medicine Verification
Accepts full QR code URL, raw signed JWT string, or query parameter.

- **URL:** `POST /api/consumer/verify` & `GET /api/consumer/verify?token=...`
- **Auth:** Public

#### Request Body
```json
{
  "qrData": "https://pharmachain.gov.in/verify/8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Im1mci1rZXkifQ..."
}
```

---

#### 🌟 The 7 UI Verification States Explained for Frontend:

| `uiState` | Meaning | UI Badge / Color | User Message |
|---|---|---|---|
| **`GENUINE`** | Valid digital signature + Active on-chain | 🟢 Green | 100% Genuine Medicine — Registered & Safe |
| **`COUNTERFEIT`**| Invalid digital signature | 🔴 Red | COUNTERFEIT WARNING: Invalid digital signature |
| **`RECALLED`** | Batch recalled by manufacturer | 🔴 Red Pulsing | CRITICAL: Batch recalled by manufacturer |
| **`EXPIRED`** | Past expiration date | 🟠 Amber | EXPIRED: Medicine passed expiration date |
| **`ALREADY_SOLD`**| Pack already sold to customer | 🟠 Amber | Warning: Pack already registered as sold |
| **`AT_SHOP`** | Inventory at registered pharmacy | 🔵 Blue | Verified authentic inventory at registered pharmacy |
| **`NOT_FOUND`** | Valid token but missing mint event | ⚪ Grey | Valid token, but no on-chain event found |

---

#### Success Response Sample (`GENUINE`)
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

#### Counterfeit Response Sample (`COUNTERFEIT`)
```json
{
  "status": "success",
  "uiState": "COUNTERFEIT",
  "message": "COUNTERFEIT WARNING: Invalid digital signature. Do not consume this medicine.",
  "valid": false,
  "scannedHash": "8a8d5b0a37eb3e415dcf8807186284e77a04e02b5d2ac2598acfae3cb078fad4"
}
```

---

### 4.2 Report Counterfeit / Suspicious Medicine
- **URL:** `POST /api/consumer/report`
- **Auth:** Public

#### Request Body
```json
{
  "qrToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
  "location": "Shop 4, MG Road, Mumbai, Maharashtra",
  "notes": "Packaging label is discolored; QR code scanner flagged counterfeit.",
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

---

## 🛠️ 5. Standard Error Format & Status Codes

All 4 services return unified error payloads:

```json
{
  "status": "error",
  "code": "ERROR_CONSTANT_CODE",
  "message": "Human-readable description of what went wrong."
}
```

| HTTP Status | Code | Meaning | Action for Frontend Developer |
|---|---|---|---|
| **400** | `VALIDATION_ERROR` | Bad input data | Display form validation error next to field |
| **401** | `UNAUTHORIZED` | Invalid or expired token | Clear token & redirect to `/login` |
| **403** | `KYC_PENDING` | Account not yet approved | Redirect to "Verification Pending" screen |
| **404** | `NOT_FOUND` | Record not found | Display 404 alert / empty state |
| **409** | `CONFLICT` | Duplicate state | Alert user (e.g. Email exists / Batch already minted) |
| **500** | `INTERNAL_SERVER_ERROR` | Backend exception | Show generic error toast ("Try again later") |

---

## 🎯 Quick Implementation Checklist for Frontend Team

1. [ ] Configure `.env` file with `http://localhost` (or direct ports for local debugging).
2. [ ] Add `apiClient.ts` with Axios interceptors for automatic token handling and 401 redirect.
3. [ ] Implement **Manufacturer Dashboard**: Batch creation form + Polling hook on `/batch/:id` after minting.
4. [ ] Implement **Shopkeeper Dashboard**: QR scanner calling `POST /api/transactions/receive` (Inbound) and `POST /api/transactions/sell` (Outbound).
5. [ ] Implement **Admin Dashboard**: Review tables for Manufacturer & Shopkeeper KYC approvals.
6. [ ] Implement **Consumer Scanner**: Render distinct badge components based on `uiState` (`GENUINE`, `COUNTERFEIT`, `RECALLED`, `EXPIRED`, etc.).
