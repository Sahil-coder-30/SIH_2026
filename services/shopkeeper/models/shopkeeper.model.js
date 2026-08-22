import mongoose from 'mongoose';

// ── Constants ─────────────────────────────────────────────────────────────────
export const KYC_STATUS = ['PENDING', 'APPROVED', 'REJECTED'];

// ── Schema ────────────────────────────────────────────────────────────────────
const ShopkeeperSchema = new mongoose.Schema(
    {
        shopkeeperId:  { type: String, required: true, unique: true },
        pharmacyName:  { type: String, required: true },
        ownerName:     { type: String, required: true },
        email:         { type: String, required: true, unique: true, lowercase: true },
        passwordHash:  { type: String, required: true },
        drugLicenseNo: { type: String, required: true, unique: true },
        kycStatus:     { type: String, enum: KYC_STATUS, default: 'PENDING' },
        address:       { type: String, required: true },
    },
    { timestamps: true },
);

const Shopkeeper = mongoose.model('Shopkeeper', ShopkeeperSchema);
export default Shopkeeper;
