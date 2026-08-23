import {
    fetchShopkeepers,
    fetchShopkeeperById,
    approveShopkeeperKYC,
    rejectShopkeeperKYC,
    suspendShopkeeper,
} from '../services/shopkeeperClient.service.js';
import AuditLog from '../models/auditLog.model.js';

// GET /api/admin/shopkeepers
export const listShopkeepersController = async (req, res) => {
    try {
        const result = await fetchShopkeepers(req.query);
        return res.status(200).json(result);
    } catch (error) {
        console.error('[admin-service Shopkeeper] listShopkeepers error:', error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ status: 'error', message: error.response?.data?.message || error.message });
    }
};

// GET /api/admin/shopkeepers/:id
export const getShopkeeperDetailController = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await fetchShopkeeperById(id);
        return res.status(200).json(result);
    } catch (error) {
        console.error('[admin-service Shopkeeper] getShopkeeperDetail error:', error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ status: 'error', message: error.response?.data?.message || error.message });
    }
};

// POST /api/admin/shopkeepers/:id/approve
export const approveShopkeeperController = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await approveShopkeeperKYC(id);

        // Regulatory audit log
        await AuditLog.create({
            action:      'SHOPKEEPER_APPROVED',
            performedBy: {
                adminId:  req.admin.adminId,
                email:    req.admin.email,
                fullName: req.admin.fullName,
                role:     req.admin.role,
            },
            targetType:  'SHOPKEEPER',
            targetId:    result.shopkeeperId || id,
            targetName:  result.shopName || null,
            reason:      req.body.reason || 'Drug license (Form 20/21 or 20B/21B) verified against State Pharmacy Council.',
            metadata:    { verifiedAt: result.verifiedAt },
            ipAddress:   req.ip || 'internal',
        });

        return res.status(200).json({
            status:  'success',
            message: 'Pharmacy verified and approved for inventory operations.',
            data:    result,
        });
    } catch (error) {
        console.error('[admin-service Shopkeeper] approveShopkeeper error:', error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ status: 'error', message: error.response?.data?.message || error.message });
    }
};

// POST /api/admin/shopkeepers/:id/reject
export const rejectShopkeeperController = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ status: 'error', message: 'Rejection reason is required for compliance audit logs' });
        }

        const result = await rejectShopkeeperKYC(id, reason.trim());

        // Regulatory audit log
        await AuditLog.create({
            action:      'SHOPKEEPER_REJECTED',
            performedBy: {
                adminId:  req.admin.adminId,
                email:    req.admin.email,
                fullName: req.admin.fullName,
                role:     req.admin.role,
            },
            targetType:  'SHOPKEEPER',
            targetId:    result.shopkeeperId || id,
            targetName:  result.shopName || null,
            reason:      reason.trim(),
            ipAddress:   req.ip || 'internal',
        });

        return res.status(200).json({
            status:  'success',
            message: 'Pharmacy verification rejected.',
            data:    result,
        });
    } catch (error) {
        console.error('[admin-service Shopkeeper] rejectShopkeeper error:', error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ status: 'error', message: error.response?.data?.message || error.message });
    }
};

// POST /api/admin/shopkeepers/:id/suspend
export const suspendShopkeeperController = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ status: 'error', message: 'Suspension reason is required for regulatory enforcement' });
        }

        const result = await suspendShopkeeper(id, reason.trim());

        // Regulatory audit log
        await AuditLog.create({
            action:      'SHOPKEEPER_SUSPENDED',
            performedBy: {
                adminId:  req.admin.adminId,
                email:    req.admin.email,
                fullName: req.admin.fullName,
                role:     req.admin.role,
            },
            targetType:  'SHOPKEEPER',
            targetId:    result.shopkeeperId || id,
            targetName:  result.shopName || null,
            reason:      reason.trim(),
            ipAddress:   req.ip || 'internal',
        });

        return res.status(200).json({
            status:  'success',
            message: 'Pharmacy license suspended.',
            data:    result,
        });
    } catch (error) {
        console.error('[admin-service Shopkeeper] suspendShopkeeper error:', error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ status: 'error', message: error.response?.data?.message || error.message });
    }
};
