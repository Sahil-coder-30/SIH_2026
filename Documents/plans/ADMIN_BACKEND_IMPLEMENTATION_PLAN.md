# Admin Service Backend Implementation Plan

**Target Service:** `services/admin` (New Microservice — Port `3005`)  
**Audience:** Backend Developer / Service Owner  
**Repository:** `SIH_2026/services/admin` & internal extensions in `services/manufacturer` + `services/shopkeeper`  
**Internal Cluster Token:** `ADMIN_TOKEN` / `SERVICE_TOKEN`  

---

## Executive Summary & Architecture

The PharmaChain platform currently enforces KYC / verification gates:
1. **Manufacturer Service (`:3001`):** `kycStatus` must be `APPROVED` before login or batch minting is permitted. Approval triggers ECDSA P-256 key generation in `pharma-core` (`:4000`).
2. **Shopkeeper Service (`:3002`):** `verificationStatus` must be `approved` / `verified` to trade authentic inventory.

Currently, approval is only exposed via isolated `POST /api/manufacturer/auth/kyc/approve` and `POST /api/shopkeeper/auth/kyc/approve` endpoints with raw tokens. **There is no Admin Service to authenticate administrators, query pending queues, inspect drug licenses, reject invalid submissions with audit reasons, or track compliance activity.**

This document specifies the complete backend implementation for the dedicated **Admin Microservice (`admin-service`)** and the required internal query extensions in `manufacturer-service` and `shopkeeper-service`.

---

## 1. System Architecture & Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                          ADMIN WEB PORTAL                              │
│            (Drug Control Authority / CDSCO / Superadmin)               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Bearer admin_jwt / Cookie
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     ADMIN SERVICE (:3005)                              │
│  - Admin Authentication & RBAC (Superadmin, Drug Inspector, Auditor)   │
│  - Regulatory Audit Logging (every approve/reject/suspend action)      │
│  - Verification Orchestrator & Dashboard Analytics Aggregator          │
│  - Dedicated DB: 'admin' (Admin accounts, Audit logs, Config)          │
└───────────────┬───────────────────┬───────────────────┬────────────────┘
                │                   │                   │
  X-Admin-Token │     X-Admin-Token │     Service-Token │
                ▼                   ▼                   ▼
    ┌───────────────────────┐ ┌───────────────────┐ ┌────────────────────┐
    │ MANUFACTURER SERVICE  │ │ SHOPKEEPER SERVICE│ │ PHARMA-CORE        │
    │ (:3001)               │ │ (:3002)           │ │ (:4000)            │
    │ - Manufacturer KYC DB │ │ - Shopkeeper DB   │ │ - EC P-256 Keystore│
    │ - Query & Status API  │ │ - License Docs DB │ │ - Key Stats & JWKS │
    └───────────────────────┘ └───────────────────┘ └────────────────────┘
```

---

## 2. Directory Structure for `services/admin`

Create the new microservice directory `services/admin` matching the clean MVC structure of the other services:

```
services/admin/
├── .env
├── .gitignore
├── Dockerfile
├── package.json
├── server.js
└── src/
    ├── app/
    │   └── app.js
    ├── config/
    │   └── db.js
    ├── controllers/
    │   ├── auth.controller.js
    │   ├── dashboard.controller.js
    │   ├── manufacturer.controller.js
    │   ├── shopkeeper.controller.js
    │   └── audit.controller.js
    ├── middleware/
    │   ├── adminAuth.middleware.js
    │   ├── roleCheck.middleware.js
    │   └── validate.middleware.js
    ├── models/
    │   ├── adminUser.model.js
    │   └── auditLog.model.js
    ├── routes/
    │   ├── auth.routes.js
    │   ├── dashboard.routes.js
    │   ├── manufacturer.routes.js
    │   ├── shopkeeper.routes.js
    │   └── audit.routes.js
    └── services/
        ├── manufacturerClient.service.js
        ├── shopkeeperClient.service.js
        └── pharmaCoreClient.service.js
```

---

## 3. Environment Configuration (`services/admin/.env`)

```env
# ══════════════════════════════════════════════════════════════════════════════
# ADMIN SERVICE (Port 3005)
# ══════════════════════════════════════════════════════════════════════════════

PORT=3005
NODE_ENV=development

# Dedicated MongoDB database for Admin authentication & Audit logs
MONGO_URI=mongodb+srv://sahilsharma3043_db_user:ztH8xdKhwycWwD3o@cluster0.wv6khhi.mongodb.net/admin_service?retryWrites=true&w=majority

# HS256 JWT secret for Admin session tokens
ADMIN_JWT_SECRET=c9748b5f3a02798e11a91e57c6b9e288e63b4f6208a65f9037c8e9b142512a81
ADMIN_JWT_EXPIRES_IN=8h

# Inter-service Authentication Tokens (Must match manufacturer & shopkeeper ADMIN_TOKEN)
ADMIN_TOKEN=960e412b2690c03cb83337b91010016a572343f23123feb3
SERVICE_TOKEN=1d230ff87628d00c450d7bb7f5f5245ad30ad7d1b57be42253e66de27738d11a7351a2a4a7dbc451fb1445e658f382c9

# Downstream Microservices URLs
MANUFACTURER_SERVICE_URL=http://localhost:3001
SHOPKEEPER_SERVICE_URL=http://localhost:3002
PHARMA_CORE_URL=http://localhost:4000

# Seed default Superadmin on boot if none exists
BOOTSTRAP_ADMIN_EMAIL=admin@pharmachain.gov.in
BOOTSTRAP_ADMIN_PASSWORD=AdminGovSecured2026!
BOOTSTRAP_ADMIN_NAME="National Drug Regulator (CDSCO)"
```

---

## 4. Data Models in `services/admin`

### 4.1 Admin User Model (`src/models/adminUser.model.js`)

```javascript
import mongoose from 'mongoose';

export const ADMIN_ROLES = ['SUPERADMIN', 'DRUG_INSPECTOR', 'COMPLIANCE_AUDITOR'];

const AdminUserSchema = new mongoose.Schema(
    {
        adminId:      { type: String, required: true, unique: true },
        email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
        fullName:     { type: String, required: true, trim: true },
        department:   { type: String, default: 'CDSCO Regulatory Division' },
        passwordHash: { type: String, required: true },
        role:         { type: String, enum: ADMIN_ROLES, default: 'DRUG_INSPECTOR' },
        isActive:     { type: Boolean, default: true },
        lastLoginAt:  { type: Date, default: null },
    },
    { timestamps: true }
);

AdminUserSchema.methods.toPublicProfile = function () {
    return {
        adminId:    this.adminId,
        email:      this.email,
        fullName:   this.fullName,
        department: this.department,
        role:       this.role,
        createdAt:  this.createdAt,
    };
};

export default mongoose.model('AdminUser', AdminUserSchema);
```

### 4.2 Regulatory Audit Log Model (`src/models/auditLog.model.js`)

```javascript
import mongoose from 'mongoose';

export const AUDIT_ACTIONS = [
    'MANUFACTURER_APPROVED',
    'MANUFACTURER_REJECTED',
    'MANUFACTURER_SUSPENDED',
    'SHOPKEEPER_APPROVED',
    'SHOPKEEPER_REJECTED',
    'SHOPKEEPER_SUSPENDED',
    'ADMIN_LOGIN',
    'ADMIN_CREATED'
];

const AuditLogSchema = new mongoose.Schema(
    {
        action:        { type: String, enum: AUDIT_ACTIONS, required: true },
        performedBy: {
            adminId:  { type: String, required: true },
            email:    { type: String, required: true },
            fullName: { type: String, required: true },
            role:     { type: String, required: true },
        },
        targetType:    { type: String, enum: ['MANUFACTURER', 'SHOPKEEPER', 'ADMIN', 'SYSTEM'], required: true },
        targetId:      { type: String, required: true },
        targetName:    { type: String, default: null },
        reason:        { type: String, default: null },
        metadata:      { type: mongoose.Schema.Types.Mixed, default: {} },
        ipAddress:     { type: String, default: 'internal' },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ targetId: 1 });
AuditLogSchema.index({ action: 1 });

export default mongoose.model('AuditLog', AuditLogSchema);
```

---

## 5. Extensions Required on Existing Services

To support listing, filtering, and rejecting across services, add these internal endpoints to `services/manufacturer` and `services/shopkeeper`.

### 5.1 Additions to `services/manufacturer`

In `services/manufacturer/src/controllers/auth.controller.js` (and routes):

1. **`GET /api/manufacturer/internal/list`**
   - Header: `X-Admin-Token: <ADMIN_TOKEN>`
   - Query: `status` (`PENDING`, `APPROVED`, `REJECTED`, `ALL`), `search` (matches companyName, licenseNumber, email), `page`, `limit`
   - Returns: Paginated list of manufacturers without password hashes.

2. **`GET /api/manufacturer/internal/:id`**
   - Header: `X-Admin-Token: <ADMIN_TOKEN>`
   - Returns: Complete manufacturer profile + public key presence.

3. **`POST /api/manufacturer/auth/kyc/reject`**
   - Header: `X-Admin-Token: <ADMIN_TOKEN>`
   - Body: `{ manufacturerId, reason }`
   - Logic: Sets `kycStatus = 'REJECTED'`, stores rejection note, returns updated record.

4. **`GET /api/manufacturer/internal/stats`**
   - Header: `X-Admin-Token: <ADMIN_TOKEN>`
   - Returns: `{ total: N, pending: N, approved: N, rejected: N }`

### 5.2 Additions to `services/shopkeeper`

In `services/shopkeeper/src/controllers/auth.controller.js` (and routes):

1. **`GET /api/shopkeeper/internal/list`**
   - Header: `X-Admin-Token: <ADMIN_TOKEN>`
   - Query: `status` (`pending`, `approved`, `rejected`, `suspended`, `all`), `licenseType`, `search`, `page`, `limit`
   - Returns: Paginated list of shopkeepers with shop, owner, and license metadata.

2. **`GET /api/shopkeeper/internal/:id`**
   - Header: `X-Admin-Token: <ADMIN_TOKEN>`
   - Returns: Complete shopkeeper profile with license document URL/metadata.

3. **`POST /api/shopkeeper/auth/kyc/reject`**
   - Header: `X-Admin-Token: <ADMIN_TOKEN>`
   - Body: `{ shopkeeperId, reason }`
   - Logic: Sets `verificationStatus = 'rejected'`, `rejectionReason = reason`, saves record.

4. **`POST /api/shopkeeper/auth/kyc/suspend`**
   - Header: `X-Admin-Token: <ADMIN_TOKEN>`
   - Body: `{ shopkeeperId, reason }`
   - Logic: Sets `verificationStatus = 'suspended'`, `rejectionReason = reason`.

5. **`GET /api/shopkeeper/internal/stats`**
   - Header: `X-Admin-Token: <ADMIN_TOKEN>`
   - Returns: `{ total: N, pending: N, approved: N, rejected: N, suspended: N }`

---

## 6. Full API Contract for `admin-service`

All routes except `/api/admin/auth/login` require:
`Authorization: Bearer <ADMIN_JWT_TOKEN>` or HttpOnly cookie `admin_token`.

### 6.1 Authentication Endpoints

#### `POST /api/admin/auth/login`
- **Body:** `{ "email": "admin@pharmachain.gov.in", "password": "..." }`
- **Response (200):**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "data": {
    "adminId": "ADM_CDSCO_01",
    "email": "admin@pharmachain.gov.in",
    "fullName": "National Drug Regulator (CDSCO)",
    "role": "SUPERADMIN"
  }
}
```

#### `GET /api/admin/auth/me`
- **Response (200):** Current admin profile and permission matrix.

#### `POST /api/admin/auth/logout`
- **Response (200):** Clears session cookie and invalidates token.

---

### 6.2 Overview & Analytics Endpoints

#### `GET /api/admin/dashboard/stats`
- **Description:** Aggregates real-time verification stats from manufacturer-service, shopkeeper-service, and pharma-core.
- **Response (200):**
```json
{
  "status": "success",
  "data": {
    "manufacturers": {
      "total": 45,
      "pending": 6,
      "approved": 37,
      "rejected": 2
    },
    "shopkeepers": {
      "total": 312,
      "pending": 18,
      "approved": 284,
      "rejected": 7,
      "suspended": 3
    },
    "cryptography": {
      "activeKeys": 37,
      "algorithm": "ECDSA P-256 (SHA-256)"
    },
    "urgentActionRequired": 24
  }
}
```

---

### 6.3 Manufacturer Verification Management

#### `GET /api/admin/manufacturers`
- **Query Params:** `status` (PENDING | APPROVED | REJECTED | ALL), `search` (keyword), `page` (default 1), `limit` (default 10)
- **Response (200):**
```json
{
  "status": "success",
  "pagination": { "page": 1, "limit": 10, "total": 6, "totalPages": 1 },
  "data": [
    {
      "manufacturerId": "MFR_CIPLA_001_A3F",
      "companyName": "Cipla Pharmaceuticals Ltd.",
      "licenseNumber": "MH-TZ1-284910",
      "email": "compliance@cipla.com",
      "kycStatus": "PENDING",
      "createdAt": "2026-08-23T10:15:30.000Z",
      "hasSigningKey": false
    }
  ]
}
```

#### `GET /api/admin/manufacturers/:id`
- **Description:** Get full manufacturer record and cryptographic key status.

#### `POST /api/admin/manufacturers/:id/approve`
- **Description:** Approves manufacturer KYC. Calls downstream `manufacturer-service` which in turn provisions EC P-256 signing key from `pharma-core`. Logs audit event.
- **Response (200):**
```json
{
  "status": "success",
  "message": "Manufacturer approved. EC P-256 signing key provisioned.",
  "data": {
    "manufacturerId": "MFR_CIPLA_001_A3F",
    "companyName": "Cipla Pharmaceuticals Ltd.",
    "kycStatus": "APPROVED",
    "keyGenerated": true,
    "approvedAt": "2026-08-24T01:30:00.000Z"
  }
}
```

#### `POST /api/admin/manufacturers/:id/reject`
- **Body:** `{ "reason": "License number could not be verified on state drug registry." }`
- **Response (200):** Sets `kycStatus = 'REJECTED'` and writes audit trail.

---

### 6.4 Shopkeeper / Pharmacy Verification Management

#### `GET /api/admin/shopkeepers`
- **Query Params:** `status` (pending | approved | rejected | suspended | all), `search`, `city`, `licenseType` (retail | wholesale), `page`, `limit`
- **Response (200):**
```json
{
  "status": "success",
  "pagination": { "page": 1, "limit": 10, "total": 18, "totalPages": 2 },
  "data": [
    {
      "shopId": "SHOP-A1B2C3D4",
      "shopName": "Apollo Pharmacy Sector 14",
      "ownerName": "Rajesh Kumar",
      "email": "rajesh@apollopharmacy.in",
      "phone": "+919876543210",
      "city": "Gurugram",
      "state": "Haryana",
      "drugLicenseNumber": "HR-GGN-2024-8841",
      "licenseType": "retail",
      "verificationStatus": "pending",
      "createdAt": "2026-08-23T14:20:00.000Z"
    }
  ]
}
```

#### `GET /api/admin/shopkeepers/:id`
- **Description:** Get full shopkeeper registration profile, store address, owner contact, and uploaded drug license metadata / document URL.

#### `POST /api/admin/shopkeepers/:id/approve`
- **Response (200):**
```json
{
  "status": "success",
  "message": "Pharmacy verified and approved for inventory operations.",
  "data": {
    "shopId": "SHOP-A1B2C3D4",
    "shopName": "Apollo Pharmacy Sector 14",
    "verificationStatus": "approved",
    "verifiedAt": "2026-08-24T01:35:00.000Z"
  }
}
```

#### `POST /api/admin/shopkeepers/:id/reject`
- **Body:** `{ "reason": "Form 20/21 Drug License certificate expired or blurry document." }`
- **Response (200):** Sets `verificationStatus = 'rejected'` and records reason.

#### `POST /api/admin/shopkeepers/:id/suspend`
- **Body:** `{ "reason": "Reported for selling counterfeit batches. License suspended pending investigation." }`
- **Response (200):** Sets `verificationStatus = 'suspended'`.

---

### 6.5 Regulatory Audit Trail

#### `GET /api/admin/audit-logs`
- **Query Params:** `action`, `targetType`, `adminId`, `page`, `limit`
- **Response (200):** Paginated immutable chronological audit entries for government inspection.

---

## 7. Inter-Service Communication Helper Implementations

Create resilient HTTP client modules in `services/admin/src/services/`:

### 7.1 Manufacturer Client (`src/services/manufacturerClient.service.js`)

```javascript
import axios from 'axios';

const MFR_URL = process.env.MANUFACTURER_SERVICE_URL || 'http://localhost:3001';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const client = axios.create({
    baseURL: MFR_URL,
    headers: { 'X-Admin-Token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
    timeout: 10000,
});

export const fetchManufacturers = async (params) => {
    const res = await client.get('/api/manufacturer/internal/list', { params });
    return res.data;
};

export const fetchManufacturerById = async (id) => {
    const res = await client.get(`/api/manufacturer/internal/${id}`);
    return res.data;
};

export const approveManufacturerKYC = async (manufacturerId) => {
    const res = await client.post('/api/manufacturer/auth/kyc/approve', { manufacturerId });
    return res.data;
};

export const rejectManufacturerKYC = async (manufacturerId, reason) => {
    const res = await client.post('/api/manufacturer/auth/kyc/reject', { manufacturerId, reason });
    return res.data;
};

export const fetchManufacturerStats = async () => {
    const res = await client.get('/api/manufacturer/internal/stats');
    return res.data;
};
```

### 7.2 Shopkeeper Client (`src/services/shopkeeperClient.service.js`)

```javascript
import axios from 'axios';

const SHOP_URL = process.env.SHOPKEEPER_SERVICE_URL || 'http://localhost:3002';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const client = axios.create({
    baseURL: SHOP_URL,
    headers: { 'X-Admin-Token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
    timeout: 10000,
});

export const fetchShopkeepers = async (params) => {
    const res = await client.get('/api/shopkeeper/internal/list', { params });
    return res.data;
};

export const fetchShopkeeperById = async (id) => {
    const res = await client.get(`/api/shopkeeper/internal/${id}`);
    return res.data;
};

export const approveShopkeeperKYC = async (shopkeeperId) => {
    const res = await client.post('/api/shopkeeper/auth/kyc/approve', { shopkeeperId });
    return res.data;
};

export const rejectShopkeeperKYC = async (shopkeeperId, reason) => {
    const res = await client.post('/api/shopkeeper/auth/kyc/reject', { shopkeeperId, reason });
    return res.data;
};

export const suspendShopkeeper = async (shopkeeperId, reason) => {
    const res = await client.post('/api/shopkeeper/auth/kyc/suspend', { shopkeeperId, reason });
    return res.data;
};

export const fetchShopkeeperStats = async () => {
    const res = await client.get('/api/shopkeeper/internal/stats');
    return res.data;
};
```

---

## 8. Kubernetes & Ingress Integration

### 8.1 Ingress Addition (`k8s/ingress.yml`)

Add the `/api/admin` routing rule:

```yaml
      # ── Admin Service Route ────────────────────────────────────────────────
      - pathType: Prefix
        path: "/api/admin"
        backend:
          service:
            name: admin-service
            port:
              number: 80
```

### 8.2 Service & Deployment Manifests

Create `k8s/admin.deployment.yml` and `k8s/admin.service.yml` configured with port `3005` matching the standard pod conventions.

---

## 9. Implementation & Testing Step Checklist

- [ ] **Step 1: Create `services/admin` directory structure and package.json** (`npm install express mongoose bcryptjs jsonwebtoken cors cookie-parser morgan axios dotenv`).
- [ ] **Step 2: Add Internal Query Endpoints in `services/manufacturer`:**
  - Implement `/internal/list`, `/internal/:id`, `/auth/kyc/reject`, `/internal/stats`.
- [ ] **Step 3: Add Internal Query Endpoints in `services/shopkeeper`:**
  - Implement `/internal/list`, `/internal/:id`, `/auth/kyc/reject`, `/auth/kyc/suspend`, `/internal/stats`.
- [ ] **Step 4: Implement Models & Database Connection in `services/admin`:**
  - Setup `AdminUser`, `AuditLog`, and auto-seed initial bootstrap admin.
- [ ] **Step 5: Implement Admin Controllers, Middleware & Routes:**
  - Auth, Dashboard Stats, Manufacturer Approval flow, Shopkeeper Approval flow, Audit query.
- [ ] **Step 6: Run Local End-to-End Verification:**
  1. Register a test manufacturer: `POST http://localhost:3001/api/manufacturer/auth/register` (status `PENDING`).
  2. Register a test shopkeeper: `POST http://localhost:3002/api/shopkeeper/auth/register` (status `pending`).
  3. Login to admin service: `POST http://localhost:3005/api/admin/auth/login`.
  4. Query pending queues: `GET http://localhost:3005/api/admin/manufacturers?status=PENDING` and `GET http://localhost:3005/api/admin/shopkeepers?status=pending`.
  5. Approve manufacturer: `POST http://localhost:3005/api/admin/manufacturers/:id/approve` -> Verify EC P-256 key was generated in `pharma-core`.
  6. Approve shopkeeper: `POST http://localhost:3005/api/admin/shopkeepers/:id/approve` -> Verify login is unlocked.
  7. Check audit log: `GET http://localhost:3005/api/admin/audit-logs` -> Ensure all events were captured with timestamps.
