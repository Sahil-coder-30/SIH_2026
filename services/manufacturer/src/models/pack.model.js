import mongoose from 'mongoose';

// ── Schema ────────────────────────────────────────────────────────────────────
const PackSchema = new mongoose.Schema(
    {
        batchId:      { type: String, required: true, index: true },
        serialNumber: { type: String, required: true },
        packHash:     { type: String, required: true, unique: true },
        signedToken:  { type: String, required: true },
    },
    { timestamps: true },
);

// Compound unique: one serial per batch
PackSchema.index({ batchId: 1, serialNumber: 1 }, { unique: true });

const Pack = mongoose.model('Pack', PackSchema);
export default Pack;
