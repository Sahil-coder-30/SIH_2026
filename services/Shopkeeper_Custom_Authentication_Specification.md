# Shopkeeper Authentication & Registration Specification

## 1. Overview

This document defines the authentication and registration system for the Shopkeeper Mobile Application in the Medicine Forgery Detection and Pharmaceutical Traceability System.

The system uses **custom authentication**.

Firebase Authentication is **not used**.

The Main Server is responsible for:

- Shopkeeper registration
- Password hashing
- Login authentication
- JWT access tokens
- Refresh tokens
- Account verification status
- Password reset
- Session management
- Shopkeeper authorization

MongoDB stores the shopkeeper profile and authentication-related data.

---

# 2. Shopkeeper Registration

The shopkeeper must provide information required to identify the pharmacy and verify its pharmaceutical license.

## A. Shop / Business Details

| Field | Type | Required | Description |
|---|---|---:|---|
| `shopName` | String | Yes | Registered name of the pharmacy/shop |
| `shopPhone` | String | Yes | Official shop contact number |
| `shopEmail` | String | Yes | Official shop email |
| `address` | String | Yes | Complete shop address |
| `city` | String | Yes | City where the shop is located |
| `state` | String | Yes | State where the shop is located |
| `pincode` | String | Yes | Shop PIN code |

## B. Owner / Authorized Person

| Field | Type | Required | Description |
|---|---|---:|---|
| `ownerName` | String | Yes | Owner or authorized person's name |
| `ownerPhone` | String | Yes | Owner/authorized person's phone |
| `ownerEmail` | String | Yes | Owner/authorized person's email |

> Government ID information should only be collected if it is required by the project's verification authority or applicable regulations.

## C. Pharmaceutical License

| Field | Type | Required | Description |
|---|---|---:|---|
| `drugLicenseNumber` | String | Yes | Official drug/pharmacy license number |
| `licenseType` | String | Yes | Type/category of drug license |
| `issuingAuthority` | String | Yes | Authority that issued the license |
| `licenseIssueDate` | Date | Yes | License issue date |
| `licenseExpiryDate` | Date | Yes | License expiration date |
| `licenseDocument` | File/URL | Yes | Uploaded license document |

---

# 3. Authentication

The system uses custom authentication handled by the Main Server.

## Login Credentials

The shopkeeper uses:

- Email or registered mobile number
- Password

Passwords must **never be stored as plain text**.

Use a strong password hashing algorithm such as:

- Argon2id
- bcrypt

Recommended:

```text
Password
   ↓
Argon2id / bcrypt
   ↓
passwordHash
   ↓
MongoDB
```

---

# 4. Login Page

The Shopkeeper Mobile App should display:

### Fields

1. Email / Mobile Number
2. Password
3. Show/Hide Password

### Actions

- Login
- Forgot Password?
- Register Shopkeeper Account

### Optional

- Remember Me
- Biometric login after the first successful login

Example UI:

```text
┌─────────────────────────────┐
│                             │
│          💊 LOGO            │
│                             │
│     Shopkeeper Login        │
│  Secure Medicine Tracking   │
│                             │
│  Email / Mobile Number      │
│  ┌───────────────────────┐  │
│  │ Enter registered      │  │
│  │ email or phone        │  │
│  └───────────────────────┘  │
│                             │
│  Password              👁   │
│  ┌───────────────────────┐  │
│  │ Enter password        │  │
│  └───────────────────────┘  │
│                             │
│       Forgot Password?      │
│                             │
│  ┌───────────────────────┐  │
│  │        LOGIN          │  │
│  └───────────────────────┘  │
│                             │
│  Don't have an account?     │
│       Register Shop         │
│                             │
└─────────────────────────────┘
```

---

# 5. Registration Flow

```text
Shopkeeper
    ↓
Open Registration
    ↓
Enter Shop Details
    ↓
Enter Owner Details
    ↓
Enter License Details
    ↓
Upload License Document
    ↓
Create Password
    ↓
POST /api/shopkeeper/register
    ↓
Main Server
    ↓
Validate Data
    ↓
Hash Password
    ↓
Create shopId
    ↓
Save in MongoDB
    ↓
verificationStatus = "pending"
    ↓
Registration Complete
```

---

# 6. Login Flow

```text
Shopkeeper
    ↓
Enter Email / Phone + Password
    ↓
POST /api/shopkeeper/login
    ↓
Main Server
    ↓
Find Shopkeeper
    ↓
Verify Password Hash
    ↓
Check Account Status
    ↓
┌─────────────┬──────────────┬─────────────┐
│   PENDING   │   VERIFIED   │   SUSPENDED  │
│             │              │              │
│ Show review │ Open         │ Access       │
│ message     │ Dashboard    │ denied       │
└─────────────┴──────────────┴─────────────┘
```

---

# 7. Account Status

The backend should maintain the following states.

## `pending`

The registration has been submitted but the shop has not yet been verified.

The shopkeeper can log in but cannot perform sensitive medicine operations.

## `verified`

The shop has been successfully verified.

The shopkeeper can:

- Access dashboard
- Scan medicine QR codes
- Verify medicine
- Mark medicine as sold
- Process authorized returns
- Report suspicious medicines

## `rejected`

The registration or license verification failed.

The shopkeeper should be shown the reason where appropriate and allowed to resubmit corrected information.

## `suspended`

The account has been temporarily disabled because of suspicious activity, invalid information, administrative action, or other security reasons.

---

# 8. JWT Authentication

After successful login, the Main Server should issue:

- Access Token
- Refresh Token

Example response:

```json
{
  "success": true,
  "message": "Login successful",
  "shopkeeper": {
    "shopId": "SHOP-8F42A91C",
    "shopName": "ABC Pharmacy",
    "ownerName": "Owner Name",
    "verificationStatus": "verified"
  },
  "accessToken": "jwt-access-token",
  "refreshToken": "refresh-token"
}
```

## Access Token

Recommended:

```text
Short lifetime: approximately 15 minutes
```

The exact lifetime can be adjusted according to your security requirements.

## Refresh Token

Used to obtain a new access token without requiring the shopkeeper to log in again.

Recommended:

```text
Longer lifetime: approximately 7-30 days
```

The exact lifetime should be determined by your security requirements.

---

# 9. Protected API Requests

After login, the mobile application sends the access token with protected requests.

Example:

```http
Authorization: Bearer <access-token>
```

The Main Server verifies:

1. Token signature
2. Token expiration
3. User/shopkeeper identity
4. Account status
5. Required authorization

Only then should the request be processed.

---

# 10. Recommended API Endpoints

## Authentication

### Register

```http
POST /api/shopkeeper/register
```

### Login

```http
POST /api/shopkeeper/login
```

### Refresh Access Token

```http
POST /api/shopkeeper/refresh
```

### Logout

```http
POST /api/shopkeeper/logout
```

### Forgot Password

```http
POST /api/shopkeeper/forgot-password
```

### Reset Password

```http
POST /api/shopkeeper/reset-password
```

### Get Profile

```http
GET /api/shopkeeper/profile
```

### Update Profile

```http
PUT /api/shopkeeper/profile
```

---

# 11. Registration Request

Example:

```json
{
  "shopName": "ABC Pharmacy",
  "shopPhone": "+91XXXXXXXXXX",
  "shopEmail": "abcpharmacy@example.com",

  "address": "Example Market, Main Road",
  "city": "Noida",
  "state": "Uttar Pradesh",
  "pincode": "201301",

  "ownerName": "Owner Name",
  "ownerPhone": "+91XXXXXXXXXX",
  "ownerEmail": "owner@example.com",

  "drugLicenseNumber": "DL-XXXXXXXX",
  "licenseType": "Retail",
  "issuingAuthority": "Relevant Licensing Authority",
  "licenseIssueDate": "2026-01-01",
  "licenseExpiryDate": "2027-01-01",

  "password": "user-password"
}
```

The backend should hash the password immediately and should never store the raw password.

---

# 12. MongoDB Document Structure

Recommended document:

```json
{
  "_id": "mongodb-object-id",

  "shopId": "SHOP-8F42A91C",

  "authentication": {
    "email": "abcpharmacy@example.com",
    "phone": "+91XXXXXXXXXX",
    "passwordHash": "argon2-or-bcrypt-hash"
  },

  "shop": {
    "name": "ABC Pharmacy",
    "phone": "+91XXXXXXXXXX",
    "email": "abcpharmacy@example.com",
    "address": "Example Market, Main Road",
    "city": "Noida",
    "state": "Uttar Pradesh",
    "pincode": "201301"
  },

  "owner": {
    "name": "Owner Name",
    "phone": "+91XXXXXXXXXX",
    "email": "owner@example.com"
  },

  "license": {
    "drugLicenseNumber": "DL-XXXXXXXX",
    "licenseType": "Retail",
    "issuingAuthority": "Relevant Licensing Authority",
    "issueDate": "2026-01-01",
    "expiryDate": "2027-01-01",
    "documentUrl": "secure-storage-reference"
  },

  "verificationStatus": "pending",

  "security": {
    "failedLoginAttempts": 0,
    "lastLoginAt": null,
    "lastPasswordChangeAt": null
  },

  "createdAt": "2026-08-22T00:00:00.000Z",
  "updatedAt": "2026-08-22T00:00:00.000Z",
  "verifiedAt": null
}
```

The values above are examples only.

---

# 13. System-Generated Fields

The shopkeeper must not control these fields.

| Field | Generated By | Purpose |
|---|---|---|
| `shopId` | Backend | Unique shop identifier |
| `passwordHash` | Backend | Secure password storage |
| `verificationStatus` | Backend/Admin | Controls account access |
| `createdAt` | Backend | Registration time |
| `updatedAt` | Backend | Last update |
| `verifiedAt` | Backend/Admin | Verification time |
| `failedLoginAttempts` | Backend | Brute-force protection |
| `lastLoginAt` | Backend | Login tracking |

---

# 14. Security Requirements

## Password Security

Never store:

```text
password: "MyPassword123"
```

Store only:

```text
passwordHash: "<secure-hash>"
```

Use Argon2id or bcrypt.

## Login Protection

Implement:

- Rate limiting
- Failed-login tracking
- Temporary account lock after repeated failures
- Password reset
- Strong password requirements
- HTTPS in production

## Token Security

Access tokens should have short expiration times.

Refresh tokens should be securely stored and rotated when appropriate.

Never expose secret JWT signing keys to the mobile application.

---

# 15. Shopkeeper Authorization

Authentication answers:

> "Who is this user?"

Authorization answers:

> "What is this shopkeeper allowed to do?"

Example:

```text
Logged In
    ↓
Is account verified?
    ↓
No ─────→ Pending/Suspended screen
    │
   Yes
    ↓
Is operation allowed?
    ↓
Yes → Execute operation
No  → Return 403 Forbidden
```

The mobile application should not be trusted to enforce these rules by itself.

The Main Server must enforce authorization.

---

# 16. Medicine Operation Access

Only verified shopkeepers should be allowed to perform sensitive operations.

### Allowed after verification

- Scan medicine QR
- Verify medicine
- Associate medicine with shop
- Mark medicine as sold
- Process authorized returns
- Report suspected fake medicine

### Not allowed before verification

- Mark medicine as sold
- Modify medicine status
- Associate medicine with a shop
- Perform medicine returns
- Access sensitive traceability operations

---

# 17. Password Reset Flow

```text
Shopkeeper
    ↓
Forgot Password
    ↓
Enter Registered Email/Phone
    ↓
POST /api/shopkeeper/forgot-password
    ↓
Server Generates Secure Reset Token/OTP
    ↓
Send Verification Method
    ↓
Shopkeeper Verifies Token/OTP
    ↓
Set New Password
    ↓
Hash New Password
    ↓
Update MongoDB
    ↓
Invalidate Old Sessions
```

Reset tokens should:

- Expire quickly
- Be single-use
- Be stored securely
- Never be returned directly in normal API responses

---

# 18. Recommended Mobile App Screens

The Shopkeeper Mobile App should have:

### Authentication

1. Login
2. Registration
3. Forgot Password
4. Reset Password
5. Registration Submitted
6. Verification Pending
7. Account Rejected
8. Account Suspended

### Main Application

9. Dashboard
10. Scan Medicine
11. Medicine Verification Result
12. Sell Medicine
13. Return Medicine
14. Suspicious/Fake Medicine Report
15. Shop Profile
16. Settings
17. Logout

---

# 19. Complete Authentication Architecture

```text
                    SHOPKEEPER MOBILE
                           │
                           │ HTTPS
                           ▼
                 ┌────────────────────┐
                 │    MAIN SERVER     │
                 │                    │
                 │ Custom Auth        │
                 │ JWT                │
                 │ Authorization      │
                 │ Verification       │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │      MongoDB       │
                 │                    │
                 │ Shopkeeper         │
                 │ Credentials Hash   │
                 │ License            │
                 │ Verification      │
                 │ Shop Information   │
                 └────────────────────┘
```

The mobile application should never connect directly to MongoDB.

---

# 20. Recommended First-Version Flow

For your SIH prototype, implement this flow first:

```text
REGISTER
   ↓
Shop + Owner + License Information
   ↓
Password Hash
   ↓
MongoDB
   ↓
Status = pending
   ↓
Admin Verification
   ↓
Status = verified
   ↓
LOGIN
   ↓
JWT Access Token
   ↓
Shopkeeper Dashboard
   ↓
Scan Medicine
```

This keeps the authentication architecture simple while still providing proper security and a clear verification process.

---

# 21. Important Design Rules

1. Firebase Authentication is not used.
2. Passwords are never stored in plain text.
3. Passwords are hashed using Argon2id or bcrypt.
4. `shopId` is generated by the backend.
5. `verificationStatus` is controlled by the backend/admin.
6. The mobile app never connects directly to MongoDB.
7. Protected APIs require a valid access token.
8. The server performs authorization for every sensitive operation.
9. Unverified shopkeepers cannot modify medicine traceability records.
10. HTTPS must be used in production.
