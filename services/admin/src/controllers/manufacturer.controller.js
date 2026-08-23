import {
    fetchManufacturers,
    fetchManufacturerById,
    approveManufacturerKYC,
    rejectManufacturerKYC,
} from '../services/manufacturerClient.service.js';
import { fetchPublicKey } from '../services/pharmaCoreClient.service.js';
import AuditLog from '../models/auditLog.model.js';

// GET /api/admin/manufacturers
export const listManufacturersController = async (req, res) => {
    try {
        const result = await fetchManufacturers(req.query);
        return res.status(200).json(result);
    } catch (error) {
        console.error('[admin-service Manufacturer] listManufacturers error:', error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ status: 'error', message: error.response?.data?.message || error.message });
    }
};

// GET /api/admin/manufacturers/:id
export const getManufacturerDetailController = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await fetchManufacturerById(id);
        const mfr = result.data;

        // Augment with pharma-core key check if available
        let keyInfo = null;
        if (mfr.manufacturerId) {
            keyInfo = await fetchPublicKey(mfr.manufacturerId);
        }

        return res.status(200).json({
            status: 'success',
            data: {
                ...mfr,
                keyDetails: keyInfo,
            },
        });
    } catch (error) {
        console.error('[admin-service Manufacturer] getManufacturerDetail error:', error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ status: 'error', message: error.response?.data?.message || error.message });
    }
};

// POST /api/admin/manufacturers/:id/approve
export const approveManufacturerController = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await approveManufacturerKYC(id);

        // Regulatory audit log
        await AuditLog.create({
            action:      'MANUFACTURER_APPROVED',
            performedBy: {
                adminId:  req.admin.adminId,
                email:    req.admin.email,
                fullName: req.admin.fullName,
                role:     req.admin.role,
            },
            targetType:  'MANUFACTURER',
            targetId:    result.manufacturerId || id,
            targetName:  result.companyName || null,
            reason:      req.body.reason || 'KYC documentation and drug manufacturing license verified.',
            metadata:    { keyGenerated: result.keyGenerated, verifiedAt: result.verifiedAt },
            ipAddress:   req.ip || 'internal',
        });

        return res.status(200).json({
            status:  'success',
            message: 'Manufacturer approved. ECDSA P-256 signing key provisioned in keystore.',
            data:    result,
        });
    } catch (error) {
        console.error('[admin-service Manufacturer] approveManufacturer error:', error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ status: 'error', message: error.response?.data?.message || error.message });
    }
};

// POST /api/admin/manufacturers/:id/reject
export const rejectManufacturerController = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ status: 'error', message: 'Rejection reason is required for compliance audit logs' });
        }

        const result = await rejectManufacturerKYC(id, reason.trim());

        // Regulatory audit log
        await AuditLog.create({
            action:      'MANUFACTURER_REJECTED',
            performedBy: {
                adminId:  req.admin.adminId,
                email:    req.admin.email,
                fullName: req.admin.fullName,
                role:     req.admin.role,
            },
            targetType:  'MANUFACTURER',
            targetId:    result.manufacturerId || id,
            targetName:  result.companyName || null,
            reason:      reason.trim(),
            ipAddress:   req.ip || 'internal',
        });

        return res.status(200).json({
            status:  'success',
            message: 'Manufacturer registration rejected.',
            data:    result,
        });
    } catch (error) {
        console.error('[admin-service Manufacturer] rejectManufacturer error:', error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ status: 'error', message: error.response?.data?.message || error.message });
    }
};
