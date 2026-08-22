import mongoose from 'mongoose';

// ── Constants ─────────────────────────────────────────────────────────────────
export const EVENT_TYPE = ['INTAKE', 'SALE'];

// ── Sub-schemas ───────────────────────────────────────────────────────────────

// PackEvent — immutable audit trail of all scan events at this pharmacy
const PackEventSchema = new mongoose.Schema(
    {
        shopkeeperId: { type: String, required: true, index: true },
        packHash:     { type: String, required: true },
        batchId:      { type: String, required: true },
        eventType:    { type: String, enum: EVENT_TYPE, required: true },
        operatorId:   { type: String, default: null },
    },
    { timestamps: true },
);

// Compound unique: one INTAKE and one SALE record per (shop, pack) pair
PackEventSchema.index({ shopkeeperId: 1, packHash: 1, eventType: 1 }, { unique: true });

// Inventory — aggregated current stock per batch at each pharmacy
const InventorySchema = new mongoose.Schema(
    {
        shopkeeperId: { type: String, required: true, index: true },
        batchId:      { type: String, required: true },
        medicineName: { type: String, required: true },
        expiryDate:   { type: Date, required: true },
        currentStock: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true },
);

// Compound unique: one inventory row per (shop, batch)
InventorySchema.index({ shopkeeperId: 1, batchId: 1 }, { unique: true });

// ── Models ────────────────────────────────────────────────────────────────────
export const PackEvent = mongoose.model('PackEvent', PackEventSchema);
export const Inventory = mongoose.model('Inventory', InventorySchema);
