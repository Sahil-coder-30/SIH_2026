# MediaCare — Shopkeeper Backend API Specification & Requirements

This document provides the complete, production-grade **REST API Specification** required by the **Shopkeeper Mobile Application**. 

Provide this document to your backend engineering team to integrate with the MongoDB database, Blockchain ledger, and Verification Engine.

---

## 0. General Standards & Security Architecture

### 0.1 Base URL & Headers
- **Base URL**: `https://api.yourdomain.com` (configured in mobile app via `EXPO_PUBLIC_API_URL`)
- **Content-Type**: `application/json`
- **Protected Request Header**:
  ```http
  Authorization: Bearer <accessToken>
  ```

### 0.2 Standard Error Response Format
All error responses (`4xx`, `5xx`) must follow a consistent JSON structure:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "The email/mobile number or password entered is incorrect."
  }
}
```

### 0.3 Standard Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource (account, transaction) created.
- `400 Bad Request`: Missing or invalid input fields.
- `401 Unauthorized`: Missing, expired, or invalid JWT access token (triggers auto-refresh on mobile).
- `403 Forbidden`: Authenticated user does not have permission (or account is pending/suspended).
- `404 Not Found`: Resource or Pack ID does not exist.
- `409 Conflict`: Resource already exists (e.g. email or drug license number already registered).
- `422 Unprocessable Entity`: Validation failure.
- `500 Internal Server Error`: Server or database failure.

---

## 1. Authentication & Account Management APIs

### 1.1 Shopkeeper Login
Authenticates an existing pharmacy user using their registered Email or 10-digit Mobile number and Password.

- **Endpoint**: `POST /api/shopkeeper/login`
- **Authentication**: None (Public)
- **Request Body**:
  ```json
  {
    "identifier": "ramesh.sharma@apollo.com", // Or mobile "+919876543210"
    "password": "SecurePassword123"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "shopkeeper": {
      "id": "USR-994821",
      "shopId": "SHOP-12345",
      "shopName": "Apollo Medicos & Pharmacy",
      "ownerName": "Dr. Ramesh Sharma",
      "ownerEmail": "ramesh.sharma@apollo.com",
      "ownerPhone": "+91 98765 43210",
      "shopEmail": "store@apollomedicos.com",
      "shopPhone": "+91 11 2345 6789",
      "address": "Shop #14, Health Complex, Sector 18",
      "city": "Noida",
      "state": "Uttar Pradesh",
      "pincode": "201301",
      "drugLicenseNumber": "DL-2026-UP-88741",
      "licenseType": "retail", // "retail" | "wholesale" | "other"
      "issuingAuthority": "Drug Control Administration UP",
      "licenseIssueDate": "2024-01-15",
      "licenseExpiryDate": "2029-01-14",
      "verificationStatus": "verified", // "verified" | "pending" | "rejected" | "suspended"
      "rejectionReason": null,
      "role": "SHOPKEEPER"
    }
  }
  ```
- **Response `401 Unauthorized`**:
  ```json
  {
    "success": false,
    "error": {
      "code": "INVALID_CREDENTIALS",
      "message": "Invalid email/mobile or password."
    }
  }
  ```

---

### 1.2 Pharmacy 3-Step Registration
Registers a new pharmacy with shop details, owner identity, pharmaceutical license data, and credentials.

- **Endpoint**: `POST /api/shopkeeper/register`
- **Authentication**: None (Public)
- **Request Body**:
  ```json
  {
    "shopName": "Apollo Medicos & Pharmacy",
    "shopPhone": "+91 11 2345 6789",
    "shopEmail": "store@apollomedicos.com",
    "address": "Shop #14, Health Complex, Sector 18",
    "city": "Noida",
    "state": "Uttar Pradesh",
    "pincode": "201301",

    "ownerName": "Dr. Ramesh Sharma",
    "ownerPhone": "+91 98765 43210",
    "ownerEmail": "ramesh.sharma@apollo.com",

    "drugLicenseNumber": "DL-2026-UP-88741",
    "licenseType": "retail",
    "issuingAuthority": "Drug Control Administration UP",
    "licenseIssueDate": "2024-01-15",
    "licenseExpiryDate": "2029-01-14",
    "licenseDocument": {
      "name": "Drug_License_DL-2026-UP-88741.pdf",
      "size": 348160,
      "mimeType": "application/pdf"
    },

    "password": "SecurePassword123"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "message": "Your pharmacy registration was submitted successfully.",
    "shopId": "SHOP-78219",
    "shopkeeper": {
      "shopId": "SHOP-78219",
      "shopName": "Apollo Medicos & Pharmacy",
      "ownerName": "Dr. Ramesh Sharma",
      "verificationStatus": "pending",
      "role": "SHOPKEEPER"
    }
  }
  ```
- **Response `409 Conflict`**:
  ```json
  {
    "success": false,
    "error": {
      "code": "DUPLICATE_REGISTRATION",
      "message": "A pharmacy with this Drug License Number or email already exists."
    }
  }
  ```

---

### 1.3 Check Verification Status
Checks if the pharmacy account has been reviewed and approved by regulatory administrators.

- **Endpoint**: `GET /api/shopkeeper/verification-status`
- **Authentication**: `Bearer <accessToken>`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "verificationStatus": "verified", // "verified" | "pending" | "rejected" | "suspended"
    "shopId": "SHOP-12345",
    "shopName": "Apollo Medicos & Pharmacy",
    "rejectionReason": null
  }
  ```
- **Response when Rejected**:
  ```json
  {
    "success": true,
    "verificationStatus": "rejected",
    "shopId": "SHOP-12345",
    "rejectionReason": "The drug license document uploaded is expired or illegible. Please re-upload a valid license copy."
  }
  ```

---

### 1.4 Refresh Token (Silent JWT Renewal)
Issues a fresh `accessToken` using a valid `refreshToken` when API requests return `401`.

- **Endpoint**: `POST /api/shopkeeper/refresh`
- **Authentication**: None (Requires valid `refreshToken` in payload)
- **Request Body**:
  ```json
  {
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6..." // Optional rotation
  }
  ```

---

### 1.5 Forgot Password
Initiates an account password reset link or OTP.

- **Endpoint**: `POST /api/shopkeeper/forgot-password`
- **Authentication**: None
- **Request Body**:
  ```json
  {
    "identifier": "ramesh.sharma@apollo.com"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Password reset instructions have been sent to your registered email or mobile."
  }
  ```

---

### 1.6 Reset Password
Sets a new password using a reset token.

- **Endpoint**: `POST /api/shopkeeper/reset-password`
- **Authentication**: None
- **Request Body**:
  ```json
  {
    "token": "reset-token-received-in-email",
    "password": "NewSecurePassword123"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Your password has been reset successfully."
  }
  ```

---

### 1.7 Shopkeeper Logout
Revokes the refresh token on the server and clears session state.

- **Endpoint**: `POST /api/shopkeeper/logout`
- **Authentication**: `Bearer <accessToken>`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Logged out successfully."
  }
  ```

---

## 2. Medicine Verification & Scanning APIs

### 2.1 Authenticated Shopkeeper Medicine Scan
Verifies a medicine's QR code payload, validates blockchain authenticity, checks for duplication anomalies, and returns provenance details.

- **Endpoint**: `POST /api/medicine/scan` (or `/api/v1/scan/shopkeeper`)
- **Authentication**: `Bearer <accessToken>`
- **Request Body**:
  ```json
  {
    "qrData": "MED-789-PK8F29A71X-PCM26"
  }
  ```
- **Response `200 OK` (Authentic Result)**:
  ```json
  {
    "success": true,
    "medicineId": "MED-789",
    "name": "Paracetamol 500mg",
    "manufacturer": "XYZ Pharma Pvt. Ltd.",
    "batchNo": "PCM-26-A91",
    "mfgDate": "2026-08-20",
    "expDate": "2028-08-19",
    "packId": "PK8F29A71X",
    "status": "Verified", // "Verified" | "Suspicious" | "Counterfeit" | "Expired" | "Recalled"
    "trustScore": 96,
    "lifecycleState": "AVAILABLE", // "AVAILABLE" | "RECEIVED" | "SOLD" | "RETURNED"
    "blockchainTxHash": "0x8f29a71b...e31",
    "message": "This medicine is genuine, manufacturer-verified, and safe for dispensing."
  }
  ```
- **Response `200 OK` (Suspicious / Duplicate Result)**:
  ```json
  {
    "success": true,
    "medicineId": "MED-789",
    "name": "Paracetamol 500mg",
    "batchNo": "PCM-26-A91",
    "packId": "PK8F29A71X",
    "status": "Suspicious",
    "trustScore": 42,
    "riskReasons": [
      "This Pack ID has been scanned multiple times in different geographic locations.",
      "Supply chain record mismatch with authorized distributor."
    ],
    "message": "Suspicious activity detected. Do not dispense without verification."
  }
  ```

---

### 2.2 Public / Guest Medicine Scan
Allows walk-in consumers to scan medicines without logging in.

- **Endpoint**: `POST /api/v1/scan/customer`
- **Authentication**: None (Public)
- **Request Body**:
  ```json
  {
    "qrData": "MED-789-PK8F29A71X-PCM26"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "medicineId": "MED-789",
    "name": "Paracetamol 500mg",
    "manufacturer": "XYZ Pharma Pvt. Ltd.",
    "batchNo": "PCM-26-A91",
    "mfgDate": "2026-08-20",
    "expDate": "2028-08-19",
    "packId": "PK8F29A71X",
    "status": "Verified",
    "trustScore": 96,
    "message": "This medicine is genuine and safe to use."
  }
  ```

---

## 3. Supply Chain Operations (Idempotent Write APIs)

> [!IMPORTANT]
> All write transactions (`receive`, `sell`, `return`) MUST accept the `Idempotency-Key` HTTP header. If the client retries due to a network glitch, the backend returns the previous result without duplicate processing.

---

### 3.1 Receive Medicine Stock into Shop
Logs incoming stock received from an authorized manufacturer or distributor.

- **Endpoint**: `POST /api/transactions/receive`
- **Authentication**: `Bearer <accessToken>`
- **Headers**:
  ```http
  Idempotency-Key: 7b5a8e32-5a21-4f8a-92bc-819a3b817fa1
  ```
- **Request Body**:
  ```json
  {
    "packId": "PK8F29A71X"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "transactionId": "TXN-REC-889102",
    "packId": "PK8F29A71X",
    "status": "RECEIVED",
    "timestamp": "2026-08-22T16:00:00Z",
    "message": "Medicine successfully received into shop inventory."
  }
  ```

---

### 3.2 Sell Medicine to Customer
Registers a retail medicine sale to a consumer and transitions the blockchain state to `SOLD`.

- **Endpoint**: `POST /api/transactions/sell`
- **Authentication**: `Bearer <accessToken>`
- **Headers**:
  ```http
  Idempotency-Key: 9c2b4d11-12a8-4c91-a1bf-7729bc811fa9
  ```
- **Request Body**:
  ```json
  {
    "packId": "PK8F29A71X",
    "customerPhone": "+91 98111 22233" // Optional
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "transactionId": "TXN-SELL-551920",
    "packId": "PK8F29A71X",
    "status": "SOLD",
    "timestamp": "2026-08-22T16:05:00Z",
    "message": "Medicine sale registered successfully."
  }
  ```

---

### 3.3 Return Medicine
Processes a customer return or defective pack return.

- **Endpoint**: `POST /api/transactions/return`
- **Authentication**: `Bearer <accessToken>`
- **Headers**:
  ```http
  Idempotency-Key: 3f1e9a77-9921-4a11-b9cd-55881a293bc1
  ```
- **Request Body**:
  ```json
  {
    "packId": "PK8F29A71X",
    "reason": "CUSTOMER_RETURN" // "CUSTOMER_RETURN" | "DAMAGED_PACKAGING" | "EXPIRED"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "transactionId": "TXN-RET-118492",
    "packId": "PK8F29A71X",
    "status": "RETURNED",
    "timestamp": "2026-08-22T16:10:00Z",
    "message": "Medicine return registered successfully."
  }
  ```

---

## 4. Dashboard, History & Inventory APIs

### 4.1 Dashboard Overview Statistics
Fetches real-time counters for the shopkeeper home screen.

- **Endpoint**: `GET /api/shopkeeper/stats`
- **Authentication**: `Bearer <accessToken>`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "totalScans": 145,
    "verifiedCount": 130,
    "suspiciousCount": 10,
    "counterfeitCount": 5,
    "todaySalesCount": 24
  }
  ```

---

### 4.2 Medicine Transaction & Scan History
Returns paginated logs of past scans, sales, receipts, and returns.

- **Endpoint**: `GET /api/shopkeeper/medicine/history`
- **Authentication**: `Bearer <accessToken>`
- **Query Parameters**:
  - `status`: Optional filter (`Verified`, `Suspicious`, `Counterfeit`)
  - `page`: Page number (default: `1`)
  - `limit`: Items per page (default: `20`)
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "history": [
      {
        "id": "SCAN-001",
        "medicineName": "Paracetamol 500mg",
        "batchNo": "PCM-26-A91",
        "packId": "PK8F29A71X",
        "timestamp": "2026-08-22T10:30:00Z",
        "status": "Verified",
        "action": "SALE"
      },
      {
        "id": "SCAN-002",
        "medicineName": "Amoxicillin 250mg",
        "batchNo": "AMX-25-K02",
        "packId": "AMX889102X",
        "timestamp": "2026-08-21T18:20:00Z",
        "status": "Suspicious",
        "action": "SCAN_ONLY"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 8,
      "totalItems": 145
    }
  }
  ```

---

### 4.3 Shop Inventory
Returns current stock holding of the pharmacy.

- **Endpoint**: `GET /api/shopkeeper/inventory`
- **Authentication**: `Bearer <accessToken>`
- **Query Parameters**:
  - `status`: Optional filter (`AVAILABLE`, `RECEIVED`, `RESERVED`)
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "inventory": [
      {
        "id": "INV-001",
        "medicineName": "Paracetamol 500mg",
        "batchNo": "PCM-26-A91",
        "packId": "PK8F29A71X",
        "expiryDate": "2028-08-19",
        "receivedDate": "2026-08-20",
        "status": "AVAILABLE"
      }
    ]
  }
  ```

---

## 5. Profile Management APIs

### 5.1 Get Shop Profile
Retrieves complete verified pharmacy details.

- **Endpoint**: `GET /api/shopkeeper/profile`
- **Authentication**: `Bearer <accessToken>`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "shopkeeper": {
      "shopId": "SHOP-12345",
      "shopName": "Apollo Medicos & Pharmacy",
      "ownerName": "Dr. Ramesh Sharma",
      "ownerEmail": "ramesh.sharma@apollo.com",
      "ownerPhone": "+91 98765 43210",
      "shopEmail": "store@apollomedicos.com",
      "shopPhone": "+91 11 2345 6789",
      "address": "Shop #14, Health Complex, Sector 18",
      "city": "Noida",
      "state": "Uttar Pradesh",
      "pincode": "201301",
      "drugLicenseNumber": "DL-2026-UP-88741",
      "licenseType": "retail",
      "issuingAuthority": "Drug Control Administration UP",
      "licenseExpiryDate": "2029-01-14",
      "verificationStatus": "verified"
    }
  }
  ```

---

### 5.2 Update Shop Profile
Allows updating editable store details (e.g. display name, phone, or address). Sensitive fields like `shopId`, `drugLicenseNumber`, and `verificationStatus` cannot be modified by the client.

- **Endpoint**: `PATCH /api/shopkeeper/profile`
- **Authentication**: `Bearer <accessToken>`
- **Request Body**:
  ```json
  {
    "shopName": "Apollo Medicos 24x7 Pharmacy",
    "shopPhone": "+91 11 9876 5432"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Profile updated successfully.",
    "shopkeeper": {
      "shopId": "SHOP-12345",
      "shopName": "Apollo Medicos 24x7 Pharmacy",
      "shopPhone": "+91 11 9876 5432"
    }
  }
  ```

---

## 6. Summary Endpoint Checklist

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/shopkeeper/login` | Login with Email/Mobile & Password | ❌ |
| `POST` | `/api/shopkeeper/register` | 3-Step Pharmacy & License Registration | ❌ |
| `GET` | `/api/shopkeeper/verification-status` | Check if account is verified or pending | ✅ |
| `POST` | `/api/shopkeeper/refresh` | Refresh expired Access Token | ❌ |
| `POST` | `/api/shopkeeper/forgot-password` | Send password reset link | ❌ |
| `POST` | `/api/shopkeeper/reset-password` | Set new password with token | ❌ |
| `POST` | `/api/shopkeeper/logout` | Revoke session & clear tokens | ✅ |
| `POST` | `/api/medicine/scan` | Authenticated QR medicine verification | ✅ |
| `POST` | `/api/v1/scan/customer` | Public/Guest QR medicine verification | ❌ |
| `POST` | `/api/transactions/receive` | Receive batch into store inventory | ✅ (Idempotent) |
| `POST` | `/api/transactions/sell` | Register consumer sale | ✅ (Idempotent) |
| `POST` | `/api/transactions/return` | Process medicine return | ✅ (Idempotent) |
| `GET` | `/api/shopkeeper/stats` | Dashboard metric counters | ✅ |
| `GET` | `/api/shopkeeper/medicine/history` | Transaction & scan log | ✅ |
| `GET` | `/api/shopkeeper/inventory` | Current pharmacy stock | ✅ |
| `GET` | `/api/shopkeeper/profile` | Get full pharmacy profile | ✅ |
| `PATCH` | `/api/shopkeeper/profile` | Update editable shop details | ✅ |
