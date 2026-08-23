import { fetchManufacturerStats } from '../services/manufacturerClient.service.js';
import { fetchShopkeeperStats } from '../services/shopkeeperClient.service.js';
import { fetchKeyStats } from '../services/pharmaCoreClient.service.js';
import AuditLog from '../models/auditLog.model.js';

// GET /api/admin/dashboard/stats
export const getDashboardStatsController = async (req, res) => {
    try {
        const [mfrStats, shopStats, keyStats, recentAudits] = await Promise.all([
            fetchManufacturerStats().catch(() => ({ data: { total: 0, pending: 0, approved: 0, rejected: 0 } })),
            fetchShopkeeperStats().catch(() => ({ data: { total: 0, pending: 0, approved: 0, rejected: 0, suspended: 0 } })),
            fetchKeyStats().catch(() => ({ totalKeys: 0 })),
            AuditLog.find({}).sort({ createdAt: -1 }).limit(5).lean(),
        ]);

        const mfrData  = mfrStats.data || { total: 0, pending: 0, approved: 0, rejected: 0 };
        const shopData = shopStats.data || { total: 0, pending: 0, approved: 0, rejected: 0, suspended: 0 };
        const totalPending = (mfrData.pending || 0) + (shopData.pending || 0);

        return res.status(200).json({
            status: 'success',
            data: {
                manufacturers:        mfrData,
                shopkeepers:          shopData,
                cryptography: {
                    activeKeys: keyStats.totalKeys || keyStats.manufacturersCount || mfrData.approved || 0,
                    algorithm:  'ECDSA P-256 (SHA-256)',
                },
                urgentActionRequired: totalPending,
                recentActivity:       recentAudits,
            },
        });
    } catch (error) {
        console.error('[admin-service Dashboard] getDashboardStats error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
