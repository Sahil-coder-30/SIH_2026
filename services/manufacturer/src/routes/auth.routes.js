import express from 'express';
import {
    registerController,
    loginController,
    kycApproveController,
    logoutController,
} from '../controllers/auth.controller.js';

const router = express.Router();

// ── Public Auth Routes (no JWT required) ──────────────────────────────────────

// POST /api/manufacturer/auth/register
router.post('/register', registerController);

// POST /api/manufacturer/auth/login → sets mfr_token cookie
router.post('/login', loginController);

// POST /api/manufacturer/auth/kyc/approve → admin-only, X-Admin-Token header required
// Sets kycStatus=APPROVED and provisions EC P-256 signing key via pharma-core.
// Fail-closed: returns 500 if ADMIN_TOKEN env var is not set.
router.post('/kyc/approve', kycApproveController);

// POST /api/manufacturer/auth/logout → clears mfr_token cookie, returns 204
// Safe to call unauthenticated.
router.post('/logout', logoutController);

export default router;
