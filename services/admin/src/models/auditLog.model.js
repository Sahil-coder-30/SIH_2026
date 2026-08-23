import mongoose from 'mongoose';

export const AUDIT_ACTIONS = [
    'MANUFACTURER_APPROVED',
    'MANUFACTURER_REJECTED',
    'MANUFACTURER_SUSPENDED',
    'SHOPKEEPER_APPROVED',
    'SHOPKEEPER_REJECTED',
    'SHOPKEEPER_SUSPENDED',
    'ADMIN_LOGIN',
    'ADMIN_CREATED',
];

const AuditLogSchema = new mongoose.Schema(
    {
        action: { type: String, enum: AUDIT_ACTIONS, required: true },
        performedBy: {
            adminId:  { type: String, required: true },
            email:    { type: String, required: true },
            fullName: { type: String, required: true },
            role:     { type: String, required: true },
        },
        targetType: { type: String, enum: ['MANUFACTURER', 'SHOPKEEPER', 'ADMIN', 'SYSTEM'], required: true },
        targetId:   { type: String, required: true },
        targetName: { type: String, default: null },
        reason:     { type: String, default: null },
        metadata:   { type: mongoose.Schema.Types.Mixed, default: {} },
        ipAddress:  { type: String, default: 'internal' },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ targetId: 1 });
AuditLogSchema.index({ action: 1 });

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;
