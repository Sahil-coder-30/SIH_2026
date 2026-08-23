# Frontend Team Plan: Admin Oversight & Approvals Portal

**Audience:** Frontend Development Team  
**App:** `PharmaChain Admin Portal` (Web Application — React / Vite / Next.js / Tailwind CSS / TypeScript)  
**Backend Service:** `admin-service` (`http://localhost:3005` or `/api/admin`)  
**Companion Backend Plan:** `Documents/plans/ADMIN_BACKEND_IMPLEMENTATION_PLAN.md`  

---

## 1. Rules & Scope Discipline

| # | Rule |
|---|---|
| **R1** | **Scope discipline.** The Admin Portal has two core missions: **(1) Approve/Reject Manufacturer KYC (provisioning EC P-256 keys)** and **(2) Review/Approve/Reject/Suspend Shopkeeper Drug Licenses**. Build these flows completely before touching optional widgets. |
| **R2** | **Build the mock layer first.** Write complete TypeScript interfaces and `.mock.ts` fixtures so you can build all 7 screens without waiting for the backend to be running. |
| **R3** | **Regulatory aesthetic.** This is a National Drug Control / CDSCO regulatory portal. Use a clean, authoritative, high-trust UI (deep navy `#0B192C`, slate blues, emerald greens for approved, amber for pending, crimson for rejected, crisp typography like Inter/Outfit). |
| **R4** | **Explicit confirmation on critical actions.** Approving a manufacturer triggers hardware/software cryptographic key provisioning that allows batch minting. Never allow one-click accidental approvals—always require a confirmation dialog. |
| **R5** | **Mandatory rejection reasons.** When an admin rejects an application or suspends a license, the UI must require a non-empty reason code and description to satisfy compliance audit requirements. |

---

## 2. Mocking Architecture & Switch Pattern

To enable 100% independent frontend development, implement the single-switch mock layer pattern:

```
src/
├── services/
│   └── api/
│       ├── client.ts              # Axios instance with Bearer interceptor
│       ├── adminAuth.ts           # Real Admin Auth API
│       ├── adminAuth.mock.ts      # Mock Admin Auth
│       ├── manufacturers.ts       # Real Manufacturer KYC API
│       ├── manufacturers.mock.ts  # Mock Manufacturer KYC
│       ├── shopkeepers.ts         # Real Shopkeeper Verification API
│       ├── shopkeepers.mock.ts    # Mock Shopkeeper Verification
│       ├── dashboard.ts           # Real Dashboard Analytics API
│       ├── dashboard.mock.ts      # Mock Dashboard Analytics
│       ├── audit.ts               # Real Audit Logs API
│       ├── audit.mock.ts          # Mock Audit Logs
│       ├── fixtures.ts            # Realistic data fixtures
│       └── index.ts               # The single USE_MOCKS switch
```

### The Switch (`src/services/api/index.ts`):
```typescript
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'; // or process.env.NEXT_PUBLIC_USE_MOCKS === 'true'

export const api = USE_MOCKS
    ? await import('./mockApi')
    : await import('./realApi');
```

---

## 3. TypeScript Interfaces & Data Contracts

Create `src/types/admin.ts`:

```typescript
// ── Admin Identity ────────────────────────────────────────────────────────────
export type AdminRole = 'SUPERADMIN' | 'DRUG_INSPECTOR' | 'COMPLIANCE_AUDITOR';

export interface AdminUser {
  adminId: string;
  email: string;
  fullName: string;
  department: string;
  role: AdminRole;
  createdAt: string;
}

export interface AdminAuthResponse {
  status: 'success';
  token: string;
  data: AdminUser;
}

// ── Dashboard Metrics ─────────────────────────────────────────────────────────
export interface DashboardStats {
  manufacturers: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  shopkeepers: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    suspended: number;
  };
  cryptography: {
    activeKeys: number;
    algorithm: string;
  };
  urgentActionRequired: number;
}

// ── Manufacturer Verification Types ───────────────────────────────────────────
export type ManufacturerKycStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ManufacturerRecord {
  manufacturerId: string;
  companyName: string;
  licenseNumber: string;
  email: string;
  kycStatus: ManufacturerKycStatus;
  createdAt: string;
  updatedAt?: string;
  hasSigningKey: boolean;
  publicKeyPem?: string | null;
  rejectionReason?: string | null;
}

// ── Shopkeeper Verification Types ─────────────────────────────────────────────
export type ShopkeeperStatus = 'pending' | 'verified' | 'approved' | 'rejected' | 'suspended';
export type LicenseType = 'retail' | 'wholesale' | 'other';

export interface ShopkeeperRecord {
  shopId: string;
  shopName: string;
  shopPhone: string;
  shopEmail: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  drugLicenseNumber: string;
  licenseType: LicenseType;
  issuingAuthority: string;
  licenseIssueDate: string;
  licenseExpiryDate: string;
  documentUrl?: string | null;
  documentMeta?: {
    name: string;
    size: number;
    mimeType: string;
  } | null;
  verificationStatus: ShopkeeperStatus;
  rejectionReason?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

// ── Audit Trail ───────────────────────────────────────────────────────────────
export interface AuditLogEntry {
  _id: string;
  action: string;
  performedBy: {
    adminId: string;
    fullName: string;
    email: string;
    role: string;
  };
  targetType: 'MANUFACTURER' | 'SHOPKEEPER' | 'ADMIN' | 'SYSTEM';
  targetId: string;
  targetName?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

// ── Common Pagination Envelope ────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  status: 'success';
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  data: T[];
}
```

---

## 4. Mock Fixtures for Instant Development

Create `src/services/api/fixtures.ts`:

```typescript
import { DashboardStats, ManufacturerRecord, ShopkeeperRecord, AuditLogEntry } from '@/types/admin';

export const MOCK_STATS: DashboardStats = {
  manufacturers: { total: 14, pending: 3, approved: 10, rejected: 1 },
  shopkeepers: { total: 48, pending: 7, approved: 38, rejected: 2, suspended: 1 },
  cryptography: { activeKeys: 10, algorithm: 'ECDSA P-256 (SHA-256)' },
  urgentActionRequired: 10,
};

export const MOCK_MANUFACTURERS: ManufacturerRecord[] = [
  {
    manufacturerId: 'MFR_CIPLA_001_A3F',
    companyName: 'Cipla Pharmaceuticals India Ltd.',
    licenseNumber: 'MH-TZ1-284910',
    email: 'regulatory@cipla.com',
    kycStatus: 'PENDING',
    createdAt: '2026-08-23T09:30:00Z',
    hasSigningKey: false,
  },
  {
    manufacturerId: 'MFR_SUNPHARMA_002_B91',
    companyName: 'Sun Pharma Laboratories',
    licenseNumber: 'GJ-GNR-992104',
    email: 'compliance@sunpharma.com',
    kycStatus: 'PENDING',
    createdAt: '2026-08-23T11:15:00Z',
    hasSigningKey: false,
  },
  {
    manufacturerId: 'MFR_DRREDDY_003_K77',
    companyName: "Dr. Reddy's Laboratories Ltd.",
    licenseNumber: 'TS-HYD-551029',
    email: 'auth@drreddys.com',
    kycStatus: 'APPROVED',
    createdAt: '2026-08-20T14:00:00Z',
    hasSigningKey: true,
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----',
  },
  {
    manufacturerId: 'MFR_FAKECO_999_X00',
    companyName: 'Apex Chem & Drugs Pvt Ltd',
    licenseNumber: 'DL-WDL-001928',
    email: 'info@apexchem.fake',
    kycStatus: 'REJECTED',
    createdAt: '2026-08-21T08:00:00Z',
    hasSigningKey: false,
    rejectionReason: 'Invalid drug manufacturing license; not listed in State Licensing Authority portal.',
  }
];

export const MOCK_SHOPKEEPERS: ShopkeeperRecord[] = [
  {
    shopId: 'SHOP-8B1A2C3D',
    shopName: 'Apollo Pharmacy — Connaught Place',
    shopPhone: '+91 11 4321 0000',
    shopEmail: 'cp.delhi@apollopharmacy.in',
    address: 'Block E, Inner Circle, Connaught Place',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110001',
    ownerName: 'Virender Sharma',
    ownerPhone: '+91 98112 34567',
    ownerEmail: 'virender.sharma@gmail.com',
    drugLicenseNumber: 'DL-ND-2024-004128',
    licenseType: 'retail',
    issuingAuthority: 'Drugs Control Department, Govt. of NCT Delhi',
    licenseIssueDate: '2024-01-15',
    licenseExpiryDate: '2029-01-14',
    documentUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800',
    documentMeta: { name: 'Drug_License_Form_20_21.pdf', size: 1420000, mimeType: 'application/pdf' },
    verificationStatus: 'pending',
    createdAt: '2026-08-23T14:20:00Z',
  },
  {
    shopId: 'SHOP-7F9E0D1C',
    shopName: 'MedPlus Health Services Chemist',
    shopPhone: '+91 40 2345 6789',
    shopEmail: 'store412@medplusindia.com',
    address: 'Plot 42, Hitec City Main Road',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500081',
    ownerName: 'K. S. Rao',
    ownerPhone: '+91 99490 12345',
    ownerEmail: 'ksrao@medplus.in',
    drugLicenseNumber: 'TS-RR-2023-881902',
    licenseType: 'retail',
    issuingAuthority: 'Telangana State Drugs Control Administration',
    licenseIssueDate: '2023-06-10',
    licenseExpiryDate: '2028-06-09',
    documentUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800',
    documentMeta: { name: 'TS_Form20B_21B.pdf', size: 2100000, mimeType: 'application/pdf' },
    verificationStatus: 'approved',
    verifiedAt: '2026-08-22T10:00:00Z',
    createdAt: '2026-08-22T09:00:00Z',
  },
  {
    shopId: 'SHOP-4D2A1B9E',
    shopName: 'Gupta Medicos Wholesale Depot',
    shopPhone: '+91 124 400 1122',
    shopEmail: 'guptamedicos@rediffmail.com',
    address: 'Shop 12, Old Railway Road',
    city: 'Gurugram',
    state: 'Haryana',
    pincode: '122001',
    ownerName: 'Ramesh Gupta',
    ownerPhone: '+91 98120 99887',
    ownerEmail: 'ramesh.gupta@yahoo.com',
    drugLicenseNumber: 'HR-GGN-2022-771120',
    licenseType: 'wholesale',
    issuingAuthority: 'FDA Haryana',
    licenseIssueDate: '2022-03-01',
    licenseExpiryDate: '2027-02-28',
    documentUrl: null,
    documentMeta: null,
    verificationStatus: 'rejected',
    rejectionReason: 'Mandatory Form 20B/21B wholesale license scan not provided.',
    createdAt: '2026-08-21T16:00:00Z',
  }
];

export const MOCK_AUDIT_LOGS: AuditLogEntry[] = [
  {
    _id: 'LOG_001',
    action: 'MANUFACTURER_APPROVED',
    performedBy: { adminId: 'ADM_01', fullName: 'Dr. A. K. Verma', email: 'admin@pharmachain.gov.in', role: 'SUPERADMIN' },
    targetType: 'MANUFACTURER',
    targetId: 'MFR_DRREDDY_003_K77',
    targetName: "Dr. Reddy's Laboratories Ltd.",
    metadata: { keyId: 'KEY_DRREDDY_P256_01', algorithm: 'ECDSA P-256' },
    createdAt: '2026-08-20T14:02:10Z',
  },
  {
    _id: 'LOG_002',
    action: 'SHOPKEEPER_APPROVED',
    performedBy: { adminId: 'ADM_01', fullName: 'Dr. A. K. Verma', email: 'admin@pharmachain.gov.in', role: 'SUPERADMIN' },
    targetType: 'SHOPKEEPER',
    targetId: 'SHOP-7F9E0D1C',
    targetName: 'MedPlus Health Services Chemist',
    createdAt: '2026-08-22T10:00:15Z',
  }
];
```

---

## 5. Screen-by-Screen Specification

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  PHARMACHAIN CDSCO ADMIN PORTAL                      [🔔 10 Alerts]  [👤 Dr. Verma ▼]  │
├───────────────┬────────────────────────────────────────────────────────────────────────┤
│ 📊 Dashboard  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────┐ │
│ 🏭 Mfrs (3)   │  │ Pending MFRs  │ │ Pending Shops │ │ Active Keys   │ │ Total Shops │ │
│ 🏪 Shops (7)  │  │     3         │ │      7        │ │     10        │ │     38      │ │
│ 📜 Audit Log  │  └───────────────┘ └───────────────┘ └───────────────┘ └─────────────┘ │
│ ⚙️ Settings   │                                                                        │
│ 🚪 Logout     │  [ Urgent KYC Review Queue: Cipla Pharmaceuticals, Apollo Pharmacy ]   │
└───────────────┴────────────────────────────────────────────────────────────────────────┘
```

### Screen 1: Admin Login (`/login`)
- **Visuals:** Formal government security portal aesthetic. Emblem / Trust shield logo, CDSCO / Drug Control title.
- **Fields:** Email address, Password, Remember Me toggle.
- **Actions:** "Sign In as Drug Inspector / Admin".
- **States:** Normal, Loading spinner, Invalid credentials banner (401), Server down fallback.

---

### Screen 2: Executive Overview Dashboard (`/` or `/dashboard`)
- **Metric Cards Row:**
  1. **Pending Manufacturer KYC:** Count badge in amber with direct link to `/manufacturers?status=PENDING`.
  2. **Pending Pharmacy Verifications:** Count badge in blue with direct link to `/shopkeepers?status=pending`.
  3. **Cryptographic Signing Keys Active:** Total provisioned ECDSA P-256 keys.
  4. **Active Retail/Wholesale Network:** Total verified pharmacies trading on the platform.
- **Urgent Action Items Queue:**
  - Table of the oldest 5 pending registrations with time elapsed (e.g. "Submitted 4 hours ago").
  - Inline "Quick Review" button opening the review drawer/modal.
- **Live Audit Feed:**
  - Real-time stream of the last 5 approval/rejection actions taken by officers.

---

### Screen 3: Manufacturer Approvals Hub (`/manufacturers`)
- **Tabs:**
  - `Pending Review (3)` (Default tab)
  - `Approved (10)`
  - `Rejected (1)`
  - `All Manufacturers`
- **Filter Bar:**
  - Search input (Searches Company Name, License Number, Email).
  - Date Range selector.
- **Data Table Columns:**
  - **Company:** Company name + domain email.
  - **Drug License Number:** Formatted badge with copy-to-clipboard button.
  - **Applied Date:** Formatted relative date (e.g. `23 Aug 2026, 15:00`).
  - **KYC Status:** Badges (`PENDING` = Amber, `APPROVED` = Green, `REJECTED` = Red).
  - **Cryptographic Key Status:** `P-256 Provisioned` (Green lock icon) vs `Key Pending` (Gray clock).
  - **Actions:**
    - `Review & Approve` (Opens Review Modal).
    - `Reject` (Opens Rejection Modal).

---

### Screen 4: Manufacturer Detail & Review Drawer / Modal
When clicking "Review KYC" on a manufacturer:
- **Left Panel / Top Section — Profile Inspection:**
  - Registered Legal Name, Corporate Email, License ID.
  - State Licensing Authority verification checklist.
- **Right Panel / Security Warning:**
  - Visual callout: *"Approving this manufacturer will automatically instruct `pharma-core` to generate an immutable ECDSA P-256 digital signing key. This authorizes the manufacturer to mint blockchain drug batches."*
- **Action Buttons:**
  - **Button 1 (Primary Green):** `Approve KYC & Generate Signing Key` -> Displays confirmation dialog -> Calls `POST /api/admin/manufacturers/:id/approve`.
  - **Button 2 (Destructive Red Outline):** `Reject Submission` -> Opens reason input modal -> Calls `POST /api/admin/manufacturers/:id/reject`.

---

### Screen 5: Pharmacy & Shopkeeper Approvals Hub (`/shopkeepers`)
- **Tabs:**
  - `Pending Review (7)`
  - `Verified / Approved (38)`
  - `Rejected (2)`
  - `Suspended (1)`
- **Filters:**
  - Search by Shop Name, Owner Name, or Drug License.
  - Filter by License Type (`Retail (Form 20/21)` vs `Wholesale (Form 20B/21B)`).
  - State & City dropdowns (e.g. Delhi, Maharashtra, Haryana).
- **Data Table Columns:**
  - **Pharmacy / Store:** Shop name + Address snippet.
  - **Owner:** Owner name + Phone + Email.
  - **License Info:** License No, Type (`retail`/`wholesale`), Authority, Expiry Date.
  - **Document Preview:** Thumbnail / Link to view Form 20/21 scan.
  - **Status:** Badges (`pending`, `approved`, `rejected`, `suspended`).
  - **Actions:** `Review Application`, `Approve`, `Reject`, `Suspend`.

---

### Screen 6: Shopkeeper Detail & Document Inspector
- **Header:** Shop Name, Drug License Number, Application Timestamp.
- **Two-Column Layout:**
  - **Column 1 — Business & Owner Info:**
    - Store Physical Address, Geo-coordinates / Pincode, City, State.
    - Owner details with quick verification status indicators.
    - Issuing Authority, License issue date and expiry date with validity check (highlights expired licenses in red).
  - **Column 2 — Drug License Document Viewer:**
    - Interactive viewer for PDF or image document scan.
    - Zoom in/out, rotate, download certificate for verification against state records.
- **Action Footer:**
  - `Approve Pharmacy` (Enables login & stock management).
  - `Reject Application` (Mandatory reason required).
  - `Suspend License` (Emergency block for pharmacies flagged for illicit/counterfeit medicine).

---

### Screen 7: Regulatory Audit Logs (`/audit-logs`)
- **Filters:** Action Type, Admin User, Target Entity, Date Range.
- **Table Columns:**
  - **Timestamp:** Exact ISO format + local time.
  - **Admin Officer:** Full Name + Department + IP Address.
  - **Action:** `MANUFACTURER_APPROVED`, `SHOPKEEPER_APPROVED`, `SHOPKEEPER_REJECTED`, etc.
  - **Target:** Entity ID (e.g. `MFR_CIPLA_001_A3F`) with link to profile.
  - **Reason / Remarks:** Audit explanation text.
- **Export Button:** `Download Audit Log (CSV / PDF)` for regulatory reporting.

---

## 6. Interactive Modal Flows & Wireframe Behaviors

### 6.1 "Approve Manufacturer & Provision Key" Dialog
```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ Confirm Manufacturer Approval & Key Generation          │
├─────────────────────────────────────────────────────────────┤
│  You are approving: Cipla Pharmaceuticals Ltd.             │
│  License: MH-TZ1-284910                                     │
│                                                             │
│  • An ECDSA P-256 keypair will be provisioned in the        │
│    pharma-core keystore.                                    │
│  • The company will receive authority to digitally sign     │
│    and mint authentic medicine batch QR codes.              │
│                                                             │
│  [ Cancel ]              [ ✅ Confirm & Provision Key ]     │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 "Reject Application" Dialog
```
┌─────────────────────────────────────────────────────────────┐
│  🚫 Reject Application                                      │
├─────────────────────────────────────────────────────────────┤
│  Select Rejection Reason (Mandatory):                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [▼] Invalid / Unverifiable Drug License Number         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  Additional Audit Comments for Applicant:                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ License number MH-TZ1-284910 could not be located on   │ │
│  │ the state licensing authority portal. Please re-upload. │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  [ Cancel ]                    [ 🚫 Reject Application ]    │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Frontend Acceptance Criteria Checklist

- [ ] **Auth:** Admin can log in with email/password; session persists on refresh; unauthorized routes redirect to `/login`.
- [ ] **Mock Toggle:** Setting `VITE_USE_MOCKS=true` allows all pages to render with complete fixture data and realistic loading latencies (600ms).
- [ ] **Manufacturer Queue:** Tab counts correctly display pending vs approved counts.
- [ ] **Manufacturer Approval:** Clicking Approve triggers optimistic status update to `APPROVED`, displays signing key provisioned status, and shows success toast.
- [ ] **Manufacturer Rejection:** Rejection dialog enforces non-empty reason; updates status to `REJECTED`.
- [ ] **Shopkeeper Queue:** Table supports filtering by `retail` / `wholesale` and searching by city/name.
- [ ] **Shopkeeper Document Viewer:** Admin can inspect the uploaded drug license certificate scan.
- [ ] **Shopkeeper Approval & Suspension:** Admin can approve or suspend a shopkeeper with audit reason.
- [ ] **Audit Trail:** Every action taken in the UI immediately records an entry in the `/audit-logs` view.
- [ ] **Error Handling:** 401 token expiration triggers session logout toast; 409 conflict (e.g. key already generated) displays clear informational warning instead of crashing.
