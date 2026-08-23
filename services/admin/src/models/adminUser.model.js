import mongoose from 'mongoose';

export const ADMIN_ROLES = ['SUPERADMIN', 'DRUG_INSPECTOR', 'COMPLIANCE_AUDITOR'];

const AdminUserSchema = new mongoose.Schema(
    {
        adminId:      { type: String, required: true, unique: true },
        email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
        fullName:     { type: String, required: true, trim: true },
        department:   { type: String, default: 'CDSCO Regulatory Division' },
        passwordHash: { type: String, required: true },
        role:         { type: String, enum: ADMIN_ROLES, default: 'DRUG_INSPECTOR' },
        isActive:     { type: Boolean, default: true },
        lastLoginAt:  { type: Date, default: null },
    },
    { timestamps: true }
);

AdminUserSchema.methods.toPublicProfile = function () {
    return {
        adminId:    this.adminId,
        email:      this.email,
        fullName:   this.fullName,
        department: this.department,
        role:       this.role,
        isActive:   this.isActive,
        lastLoginAt:this.lastLoginAt,
        createdAt:  this.createdAt,
    };
};

const AdminUser = mongoose.model('AdminUser', AdminUserSchema);
export default AdminUser;
