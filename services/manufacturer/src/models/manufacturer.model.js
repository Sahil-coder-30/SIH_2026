import mongoose from 'mongoose';

// ── Constants ─────────────────────────────────────────────────────────────────
export const KYC_STATUS = ['PENDING', 'APPROVED', 'REJECTED'];

// ── Schema ────────────────────────────────────────────────────────────────────
const ManufacturerSchema = new mongoose.Schema(
    {
        // Domain-unique ID (e.g. MFR_CIPLA_001_A3F) used as blockchain identity
        manufacturerId: { type: String, required: true, unique: true },
        companyName:    { type: String, required: true },
        licenseNumber:  { type: String, required: true, unique: true },
        email:          { type: String, required: true, unique: true, lowercase: true },
        passwordHash:   { type: String, required: true },
        kycStatus:      { type: String, enum: KYC_STATUS, default: 'PENDING' },
        publicKeyPem:   { type: String, default: null },
        rejectionReason:{ type: String, default: null },
        verifiedAt:     { type: Date, default: null },
    },
    { timestamps: true },
);

const Manufacturer = mongoose.model('Manufacturer', ManufacturerSchema);
export default Manufacturer;
