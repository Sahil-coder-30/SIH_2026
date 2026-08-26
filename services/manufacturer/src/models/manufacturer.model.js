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
        phone:          { type: String, default: null },
        address:        { type: String, default: null },
        city:           { type: String, default: null },
        state:          { type: String, default: null },
        pincode:        { type: String, default: null },
        website:        { type: String, default: null },
        kycStatus:      { type: String, enum: KYC_STATUS, default: 'PENDING' },
        publicKeyPem:   { type: String, default: null },
        rejectionReason:{ type: String, default: null },
        verifiedAt:     { type: Date, default: null },
    },
    { timestamps: true },
);

ManufacturerSchema.methods.toPublicProfile = function () {
    return {
        id:              this.manufacturerId,
        manufacturerId:  this.manufacturerId,
        companyName:     this.companyName,
        licenseNumber:   this.licenseNumber,
        email:           this.email,
        phone:           this.phone,
        address:         this.address,
        city:            this.city,
        state:           this.state,
        pincode:         this.pincode,
        website:         this.website,
        kycStatus:       this.kycStatus,
        verifiedAt:      this.verifiedAt,
        createdAt:       this.createdAt,
    };
};

const Manufacturer = mongoose.model('Manufacturer', ManufacturerSchema);
export default Manufacturer;

