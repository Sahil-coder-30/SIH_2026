import express from 'express';
import {
    registerController,
    loginController,
    verificationStatusController,
    refreshController,
    forgotPasswordController,
    resetPasswordController,
    kycApproveController,
    kycRejectController,
    kycSuspendController,
    logoutController,
} from '../controllers/auth.controller.js';
import { identifyUser } from '../middleware/identifyUser.middleware.js';

const router = express.Router();

// ── Public Auth Routes ────────────────────────────────────────────────────────

// POST /api/shopkeeper/auth/register
router.post('/register', registerController);

// POST /api/shopkeeper/auth/login → returns Bearer token in body + shop_token cookie
router.post('/login', loginController);

// POST /api/shopkeeper/auth/refresh
router.post('/refresh', refreshController);

// POST /api/shopkeeper/auth/forgot-password
router.post('/forgot-password', forgotPasswordController);

// POST /api/shopkeeper/auth/reset-password
router.post('/reset-password', resetPasswordController);

// POST /api/shopkeeper/auth/kyc/approve → admin-only, X-Admin-Token header required
// Sets verificationStatus = 'APPROVED'. Without this, login always returns 403.
router.post('/kyc/approve', kycApproveController);

// POST /api/shopkeeper/auth/kyc/reject → admin-only, X-Admin-Token header required
router.post('/kyc/reject', kycRejectController);

// POST /api/shopkeeper/auth/kyc/suspend → admin-only, X-Admin-Token header required
router.post('/kyc/suspend', kycSuspendController);

// ── Protected Auth Routes ─────────────────────────────────────────────────────

// GET /api/shopkeeper/auth/verification-status → returns { kycStatus, shopkeeperId }
// Used by mobile app to leave the "pending verification" screen after approval.
router.get('/verification-status', identifyUser, verificationStatusController);

// POST /api/shopkeeper/auth/logout → clears shop_token cookie, returns 204
router.post('/logout', identifyUser, logoutController);

export default router;
