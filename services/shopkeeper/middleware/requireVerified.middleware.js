// ── requireVerified middleware — shopkeeper-service ───────────────────────────
// Guards sensitive operations so only fully-verified shopkeepers can proceed.
// Must be used AFTER identifyUser (which attaches req.user).

import Shopkeeper from '../models/shopkeeper.model.js';

/**
 * Blocks access to sensitive routes if the shopkeeper's verificationStatus
 * is not 'verified'. Returns 403 Forbidden with a descriptive status & code.
 */
export const requireVerified = async (req, res, next) => {
    try {
        const shopkeeper = await Shopkeeper.findOne({ shopId: req.user.id }).lean();

        if (!shopkeeper) {
            return res.status(401).json({
                status: 'error',
                code: 'SHOPKEEPER_NOT_FOUND',
                message: 'Shopkeeper account not found.',
            });
        }

        const status = shopkeeper.verificationStatus;

        if (status === 'verified') {
            req.shopkeeper = shopkeeper;
            return next();
        }

        if (status === 'pending') {
            return res.status(403).json({
                status: 'error',
                code: 'ACCOUNT_PENDING',
                message: 'Your pharmacy account is under review. You will be notified once verified.',
            });
        }

        if (status === 'rejected') {
            return res.status(403).json({
                status: 'error',
                code: 'ACCOUNT_REJECTED',
                message: 'Your pharmacy account has been rejected.',
                rejectionReason: shopkeeper.rejectionReason || null,
            });
        }

        if (status === 'suspended') {
            return res.status(403).json({
                status: 'error',
                code: 'ACCOUNT_SUSPENDED',
                message: 'Your pharmacy account has been suspended. Contact support.',
            });
        }

        return res.status(403).json({
            status: 'error',
            code: 'ACCESS_DENIED',
            message: 'You do not have permission to perform this action.',
        });
    } catch (err) {
        console.error('[shopkeeper-service requireVerified] Error:', err.message);
        return res.status(500).json({
            status: 'error',
            code: 'INTERNAL_ERROR',
            message: 'Internal server error.',
        });
    }
};
