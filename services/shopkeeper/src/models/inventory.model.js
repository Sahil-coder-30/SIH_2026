import mongoose from 'mongoose';

// ── Constants ─────────────────────────────────────────────────────────────────
export const EVENT_TYPE = ['INTAKE', 'SOLD', 'SALE'];

// ── Sub-schemas ───────────────────────────────────────────────────────────────

// PackEvent — immutable audit trail of all scan events at this pharmacy
const PackEventSchema = new mongoose.Schema(
    {
        shopkeeperId: { type: String, required: true, index: true },
        packHash:     { type: String, required: true },
        packId:       { type: String, required: true },
        batchId:      { type: String, required: true },
        eventType:    { type: String, enum: EVENT_TYPE, required: true },
        operatorId:   { type: String, default: null },

        // Scan result data
        medicineName: { type: String, default: null },
        batchNo:      { type: String, default: null },
        expDate:      { type: Date, default: null },
        scanStatus:   { type: String, default: 'Verified' }, // Verified | Suspicious | Counterfeit | Expired | Recalled
        trustScore:   { type: Number, default: null },
        riskReasons:  [{ type: String }],
        manufacturer: { type: String, default: null },
        mfgDate:      { type: Date, default: null },
    },
    { timestamps: true },
);

// Compound index: prevent duplicate INTAKE and SALE events (RETURN and SCAN_ONLY can repeat)
PackEventSchema.index({ shopkeeperId: 1, packHash: 1, eventType: 1 });

// Inventory — aggregated current stock per batch at each pharmacy
const InventorySchema = new mongoose.Schema(
    {
        shopkeeperId:  { type: String, required: true, index: true },
        batchId:       { type: String, required: true },
        medicineName:  { type: String, required: true },
        batchNo:       { type: String, default: null },
        manufacturer:  { type: String, default: null },
        expiryDate:    { type: Date, required: true },
        receivedDate:  { type: Date, default: Date.now },
        currentStock:  { type: Number, default: 0, min: 0 },
        status:        { type: String, default: 'AVAILABLE' }, // AVAILABLE | RECEIVED | RESERVED | RECALLED
    },
    { timestamps: true },
);

// Compound unique: one inventory row per (shop, batch)
InventorySchema.index({ shopkeeperId: 1, batchId: 1 }, { unique: true });

// ── Models ────────────────────────────────────────────────────────────────────
export const PackEvent = mongoose.model('PackEvent', PackEventSchema);
export const Inventory = mongoose.model('Inventory', InventorySchema);
