import express from 'express';
import {
    listShopkeepersController,
    getShopkeeperDetailController,
    approveShopkeeperController,
    rejectShopkeeperController,
    suspendShopkeeperController,
} from '../controllers/shopkeeper.controller.js';
import { requireAdminAuth } from '../middleware/adminAuth.middleware.js';
import { requireRoles } from '../middleware/roleCheck.middleware.js';

const router = express.Router();

router.use(requireAdminAuth);

// GET /api/admin/shopkeepers
router.get('/', listShopkeepersController);

// GET /api/admin/shopkeepers/:id
router.get('/:id', getShopkeeperDetailController);

// POST /api/admin/shopkeepers/:id/approve
router.post('/:id/approve', requireRoles('SUPERADMIN', 'DRUG_INSPECTOR'), approveShopkeeperController);

// POST /api/admin/shopkeepers/:id/reject
router.post('/:id/reject', requireRoles('SUPERADMIN', 'DRUG_INSPECTOR'), rejectShopkeeperController);

// POST /api/admin/shopkeepers/:id/suspend
router.post('/:id/suspend', requireRoles('SUPERADMIN', 'DRUG_INSPECTOR'), suspendShopkeeperController);

export default router;
