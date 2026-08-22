import mongoose from 'mongoose';

// ── Constants ─────────────────────────────────────────────────────────────────
export const MINT_STATUS = ['PENDING', 'MINTING', 'MINTED', 'RECALLED'];

// ── Schema ────────────────────────────────────────────────────────────────────
const BatchSchema = new mongoose.Schema(
    {
        batchId:          { type: String, required: true, unique: true },
        manufacturerId:   { type: String, required: true, index: true },
        medicineName:     { type: String, required: true },
        composition:      { type: String, default: null },
        manufacturingDate:{ type: Date, required: true },
        expiryDate:       { type: Date, required: true },
        totalQuantity:    { type: Number, required: true, min: 1 },
        mintStatus:       { type: String, enum: MINT_STATUS, default: 'PENDING' },
        recallReason:     { type: String, default: null },
    },
    { timestamps: true },
);

const Batch = mongoose.model('Batch', BatchSchema);
export default Batch;
