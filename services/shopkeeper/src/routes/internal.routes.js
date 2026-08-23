import express from 'express';
import {
    internalListController,
    internalDetailController,
    internalStatsController,
    kycApproveController,
    kycRejectController,
    kycSuspendController,
} from '../controllers/auth.controller.js';

const router = express.Router();

// ── Internal Admin-Guarded Endpoints (X-Admin-Token required) ────────────────

// GET /api/shopkeeper/internal/list
router.get('/list', internalListController);

// GET /api/shopkeeper/internal/stats
router.get('/stats', internalStatsController);

// GET /api/shopkeeper/internal/:id
router.get('/:id', internalDetailController);

// POST /api/shopkeeper/internal/approve (alias to /auth/kyc/approve)
router.post('/approve', kycApproveController);

// POST /api/shopkeeper/internal/reject (alias to /auth/kyc/reject)
router.post('/reject', kycRejectController);

// POST /api/shopkeeper/internal/suspend
router.post('/suspend', kycSuspendController);

export default router;
