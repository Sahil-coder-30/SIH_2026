import AuditLog from '../models/auditLog.model.js';

// GET /api/admin/audit-logs
export const getAuditLogsController = async (req, res) => {
    try {
        const { action, targetType, targetId, adminId, page = 1, limit = 20 } = req.query;
        const query = {};

        if (action)     query.action = action.toUpperCase();
        if (targetType) query.targetType = targetType.toUpperCase();
        if (targetId)   query.targetId = targetId;
        if (adminId)    query['performedBy.adminId'] = adminId;

        const pageNum  = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
        const skip     = (pageNum - 1) * limitNum;

        const [logs, total] = await Promise.all([
            AuditLog.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            AuditLog.countDocuments(query),
        ]);

        return res.status(200).json({
            status: 'success',
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
            data: logs,
        });
    } catch (error) {
        console.error('[admin-service Audit] getAuditLogs error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
