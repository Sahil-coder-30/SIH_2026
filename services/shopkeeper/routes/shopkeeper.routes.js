import express from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import { requireVerified } from '../middleware/requireVerified.middleware.js';
import {
    statsController,
    historyController,
    inventoryController,
    getProfileController,
    updateProfileController,
} from '../controllers/shopkeeper.controller.js';

const router = express.Router();

// All shopkeeper dashboard/profile routes require auth
router.use(identifyUser);

// ── Dashboard & History ───────────────────────────────────────────────────────

// GET /api/shopkeeper/stats
router.get('/stats', requireVerified, statsController);

// GET /api/shopkeeper/medicine/history
router.get('/medicine/history', requireVerified, historyController);

// GET /api/shopkeeper/inventory
router.get('/inventory', requireVerified, inventoryController);

// ── Profile ───────────────────────────────────────────────────────────────────

// GET  /api/shopkeeper/profile
// PATCH /api/shopkeeper/profile
router.route('/profile')
    .get(getProfileController)
    .patch(updateProfileController);

export default router;
