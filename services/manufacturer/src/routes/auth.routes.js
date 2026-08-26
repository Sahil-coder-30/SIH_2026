import express from 'express';
import {
    registerController,
    loginController,
    kycApproveController,
    kycRejectController,
    logoutController,
    getProfileController,
    updateProfileController,
} from '../controllers/auth.controller.js';
import { identifyUser } from '../middleware/identifyUser.middleware.js';

const router = express.Router();

// ── Public Auth Routes (no JWT required) ──────────────────────────────────────

// POST /api/manufacturer/auth/register
router.post('/register', registerController);

// POST /api/manufacturer/auth/login → sets mfr_token cookie
router.post('/login', loginController);

// POST /api/manufacturer/auth/kyc/approve → admin-only, X-Admin-Token header required
router.post('/kyc/approve', kycApproveController);

// POST /api/manufacturer/auth/kyc/reject → admin-only, X-Admin-Token header required
router.post('/kyc/reject', kycRejectController);

// POST /api/manufacturer/auth/logout → clears mfr_token cookie, returns 204
router.post('/logout', logoutController);

// ── Protected Auth Routes (Manufacturer JWT required) ─────────────────────────
router.get('/me', identifyUser, getProfileController);
router.put('/profile', identifyUser, updateProfileController);

export default router;

