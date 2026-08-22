// ── requireVerified middleware — shopkeeper-service ───────────────────────────
// Guards sensitive operations so only fully-verified shopkeepers can proceed.
// Must be used AFTER identifyUser (which attaches req.shopkeeper).

import Shopkeeper from '../models/shopkeeper.model.js';

/**
 * Blocks access to sensitive routes if the shopkeeper's verificationStatus
 * is not 'verified'. Returns 403 Forbidden with a descriptive code.
 */
export const requireVerified = async (req, res, next) => {
    try {
        // req.user is set by identifyUser middleware
        const shopkeeper = await Shopkeeper.findOne({ shopId: req.user.id }).lean();

        if (!shopkeeper) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'SHOPKEEPER_NOT_FOUND',
                    message: 'Shopkeeper account not found.',
                },
            });
        }

        const status = shopkeeper.verificationStatus;

        if (status === 'verified') {
            // Attach full shopkeeper to request for controllers to use
            req.shopkeeper = shopkeeper;
            return next();
        }

        if (status === 'pending') {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'ACCOUNT_PENDING',
                    message: 'Your pharmacy account is under review. You will be notified once verified.',
                },
            });
        }

        if (status === 'rejected') {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'ACCOUNT_REJECTED',
                    message: 'Your pharmacy account has been rejected.',
                    reason: shopkeeper.rejectionReason || null,
                },
            });
        }

        if (status === 'suspended') {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'ACCOUNT_SUSPENDED',
                    message: 'Your pharmacy account has been suspended. Contact support.',
                },
            });
        }

        // Fallback
        return res.status(403).json({
            success: false,
            error: {
                code: 'ACCESS_DENIED',
                message: 'You do not have permission to perform this action.',
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service requireVerified] Error:', err.message);
        return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
        });
    }
};
