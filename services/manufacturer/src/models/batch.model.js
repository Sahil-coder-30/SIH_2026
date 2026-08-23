import mongoose from 'mongoose';

// ── Mint Status Lifecycle ──────────────────────────────────────────────────────
// PENDING  → Batch created, awaiting mint trigger
// MINTING  → pharma-core is signing packs (background job running)
// MINTED   → All packs signed, blockchain transitions recorded
// RECALLED → Batch recalled across entire supply chain
export const MINT_STATUS = ['PENDING', 'MINTING', 'MINTED', 'RECALLED'];

// ── Schema ────────────────────────────────────────────────────────────────────
//
// TWO-TIER DATA ARCHITECTURE WITH DUAL BATCH IDENTIFIERS:
//
//   1. systemBatchId / batchId (PharmaChain System Identifier):
//      - Format: "PC-BATCH-{MFR_PREFIX}-{YYYYMMDD}-{6_HEX_RANDOM}"
//      - Generated automatically by our backend.
//      - Guaranteed globally unique across all manufacturers worldwide.
//      - Embedded in QR JWTs, blockchain state, and pack hashes.
//      - Over time, as PharmaChain is adopted, manufacturers will print this
//        directly on medicine blisters as the primary B.No.
//
//   2. manufacturerBatchNumber (Manufacturer's Legacy / Internal Batch No):
//      - Format: e.g. "AUG-625-AUG26-001", "B.No. 40291", "CIP-2026-X"
//      - The manufacturer's existing internal batch code.
//      - Stored in database, indexed for fast search.
//      - Allows backwards compatibility during gradual system adoption.
//
const BatchSchema = new mongoose.Schema(
    {
        // ── PharmaChain System Identifiers ─────────────────────────────────────
        // Standardized system batch ID used on Hyperledger Fabric, QR JWTs, and pack records.
        batchId:                 { type: String, required: true, unique: true, index: true },
        systemBatchId:           { type: String, required: true, unique: true, index: true },

        // ── Manufacturer Legacy / Internal Identifier ──────────────────────────
        // The manufacturer's own custom batch number (printed on existing packaging).
        manufacturerBatchNumber: { type: String, default: null, index: true },

        // ── Tier 1 Core Identity ───────────────────────────────────────────────
        manufacturerId: { type: String, required: true, index: true },
        expiryDate:     { type: Date, required: true },
        totalQuantity:  { type: Number, required: true, min: 1, max: 100000 },
        mintStatus:     { type: String, enum: MINT_STATUS, default: 'PENDING' },

        // ── Product Identity ───────────────────────────────────────────────────
        medicineName:          { type: String, required: true },
        genericName:           { type: String, default: null },
        brandName:             { type: String, default: null },
        therapeuticCategory:   { type: String, default: null },
        // H = prescription only, H1 = controlled prescription, X = habit-forming, G = general, OTC
        drugSchedule:          { type: String, enum: ['G', 'H', 'H1', 'X', 'OTC', null], default: null },
        // IP = Indian Pharmacopoeia, BP = British, USP = United States, EP = European
        pharmacopoeiaStandard: { type: String, enum: ['IP', 'BP', 'USP', 'EP', null], default: null },

        // ── Composition & Formulation ──────────────────────────────────────────
        composition:       { type: String, default: null },  // Full ingredient list
        dosage:            { type: String, default: null },  // "625mg"
        strength:          { type: String, default: null },  // "625mg per film coated tablet"
        form:              { type: String, default: null },  // Tablet, Capsule, Syrup, Injection...
        route:             { type: String, default: null },  // Oral, IV, Topical, Inhalation...
        color:             { type: String, default: null },
        shape:             { type: String, default: null },
        coating:           { type: String, default: null },  // Film coated, Sugar coated, Uncoated...
        storageConditions: { type: String, default: null },  // "Store below 25°C..."
        shelfLifeMonths:   { type: Number, default: null },

        // ── Manufacturing Details ──────────────────────────────────────────────
        manufacturingDate:      { type: Date, required: true },
        productionSite:         { type: String, default: null },
        productionSiteAddress:  { type: String, default: null },
        manufacturingLicenseNo: { type: String, default: null },
        productionLineId:       { type: String, default: null },
        supervisorId:           { type: String, default: null },  // internal — excluded from public API
        shiftCode:              { type: String, default: null },  // internal — excluded from public API
        equipmentBatchId:       { type: String, default: null },  // internal — excluded from public API
        packSize:               { type: Number, default: null },  // tablets per blister strip
        packType:               { type: String, default: null },  // "Alu-Alu Blister", "HDPE Bottle"...
        unitsPerCarton:         { type: Number, default: null },

        // ── Regulatory & Compliance ────────────────────────────────────────────
        cdscoApprovalNo:     { type: String, default: null },
        gstin:               { type: String, default: null },
        hsn:                 { type: String, default: null },   // HS Classification Code
        controlledSubstance: { type: Boolean, default: false },
        coldChainRequired:   { type: Boolean, default: false },
        temperatureRange:    { type: String, default: null },   // "15°C – 25°C"

        // ── Quality Assurance ──────────────────────────────────────────────────
        qaOfficerId:           { type: String, default: null },
        qaApprovalDate:        { type: Date, default: null },
        retestDate:            { type: Date, default: null },
        coaReferenceNo:        { type: String, default: null },  // Certificate of Analysis ref
        microbialTestStatus:   { type: String, enum: ['PASS', 'FAIL', 'PENDING', null], default: null },
        dissolutionTestStatus: { type: String, enum: ['PASS', 'FAIL', 'PENDING', null], default: null },
        assayResult:           { type: String, default: null },  // "99.8%"

        // ── Internal Tags & Metadata ───────────────────────────────────────────
        internalBatchNotes: { type: String, default: null },
        recallReason:       { type: String, default: null },
        tags:               [{ type: String }],   // ["ANTIBACTERIAL", "HIGH_DEMAND", "Q3-2026"]

        // ── Mint Progress Tracking (for background jobs) ────────────────────
        mintedPacksCount: { type: Number, default: 0 },
        mintError:        { type: String, default: null },

        // ── S3 CSV Artifact (populated after minting) ───────────────────────
        // S3 object key for the signed QR CSV file, e.g. "batches/PC-BATCH-....csv"
        // Used to re-generate a fresh pre-signed URL if s3UrlExpiresAt has passed.
        s3FileKey:      { type: String, default: null },

        // Pre-signed AWS S3 URL (valid for S3_URL_EXPIRY_SECONDS, default 7 days)
        // OR http://localhost:4000/core/export/:batchId in local dev mode.
        // Factory operators use this URL to download the QR CSV directly to printers.
        s3DownloadUrl:  { type: String, default: null },

        // ISO timestamp when the pre-signed URL expires.
        // null = local dev mode (no expiry). Used to trigger URL refresh in the dashboard.
        s3UrlExpiresAt: { type: String, default: null },

        // Storage mode reported by pharma-core: "aws" | "local"
        s3Mode:         { type: String, enum: ['aws', 'local', null], default: null },
    },
    { timestamps: true },
);

// ── Indexes ───────────────────────────────────────────────────────────────────
BatchSchema.index({ manufacturerId: 1, createdAt: -1 });
BatchSchema.index({ tags: 1 });
BatchSchema.index({ drugSchedule: 1 });

const Batch = mongoose.model('Batch', BatchSchema);
export default Batch;
