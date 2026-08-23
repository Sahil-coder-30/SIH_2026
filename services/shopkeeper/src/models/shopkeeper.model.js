import mongoose from 'mongoose';

// ── Constants ─────────────────────────────────────────────────────────────────
export const VERIFICATION_STATUS = ['pending', 'verified', 'approved', 'rejected', 'suspended', 'PENDING', 'VERIFIED', 'APPROVED', 'REJECTED', 'SUSPENDED'];


// ── Schema ────────────────────────────────────────────────────────────────────
const ShopkeeperSchema = new mongoose.Schema(
    {
        shopId: { type: String, required: true, unique: true },

        // ── Authentication credentials (email/phone used as login identifier)
        authentication: {
            email: { type: String, required: true, unique: true, lowercase: true, trim: true },
            phone: { type: String, required: true, unique: true, trim: true },
            passwordHash: { type: String, required: true },
            refreshTokenHash: { type: String, default: null },
            passwordResetToken: { type: String, default: null },
            passwordResetExpires: { type: Date, default: null },
        },

        // ── Shop / Business Details
        shop: {
            name:    { type: String, required: true },
            phone:   { type: String, required: true },
            email:   { type: String, required: true, lowercase: true, trim: true },
            address: { type: String, required: true },
            city:    { type: String, required: true },
            state:   { type: String, required: true },
            pincode: { type: String, required: true },
        },

        // ── Owner / Authorized Person
        owner: {
            name:  { type: String, required: true },
            phone: { type: String, required: true },
            email: { type: String, required: true, lowercase: true, trim: true },
        },

        // ── Pharmaceutical License
        license: {
            drugLicenseNumber: { type: String, required: true, unique: true, trim: true },
            licenseType:       { type: String, required: true }, // retail | wholesale | other
            issuingAuthority:  { type: String, required: true },
            issueDate:         { type: Date, required: true },
            expiryDate:        { type: Date, required: true },
            documentUrl:       { type: String, default: null },
            documentMeta: {
                name:     { type: String, default: null },
                size:     { type: Number, default: null },
                mimeType: { type: String, default: null },
            },
        },

        // ── Account Status
        verificationStatus: {
            type:    String,
            enum:    VERIFICATION_STATUS,
            default: 'pending',
        },
        rejectionReason: { type: String, default: null },
        verifiedAt:      { type: Date, default: null },

        // ── Security / Login Tracking
        security: {
            failedLoginAttempts: { type: Number, default: 0 },
            lockUntil:           { type: Date, default: null },
            lastLoginAt:         { type: Date, default: null },
            lastPasswordChangeAt:{ type: Date, default: null },
        },
    },
    { timestamps: true },
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Note: field-level unique:true already creates indexes for email, phone, drugLicenseNumber.
ShopkeeperSchema.index({ verificationStatus: 1 });

// ── Methods ───────────────────────────────────────────────────────────────────
/** Returns the safe public profile payload (no credentials) */
ShopkeeperSchema.methods.toPublicProfile = function () {
    return {
        id: this.shopId,
        shopId: this.shopId,
        shopName: this.shop.name,
        ownerName: this.owner.name,
        ownerEmail: this.owner.email,
        ownerPhone: this.owner.phone,
        shopEmail: this.shop.email,
        shopPhone: this.shop.phone,
        address: this.shop.address,
        city: this.shop.city,
        state: this.shop.state,
        pincode: this.shop.pincode,
        drugLicenseNumber: this.license.drugLicenseNumber,
        licenseType: this.license.licenseType,
        issuingAuthority: this.license.issuingAuthority,
        licenseIssueDate: this.license.issueDate,
        licenseExpiryDate: this.license.expiryDate,
        verificationStatus: this.verificationStatus,
        rejectionReason: this.rejectionReason,
        role: 'SHOPKEEPER',
    };
};

const Shopkeeper = mongoose.model('Shopkeeper', ShopkeeperSchema);
export default Shopkeeper;
