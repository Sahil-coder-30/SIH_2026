import express from 'express';
import {
    listManufacturersController,
    getManufacturerDetailController,
    approveManufacturerController,
    rejectManufacturerController,
} from '../controllers/manufacturer.controller.js';
import { requireAdminAuth } from '../middleware/adminAuth.middleware.js';
import { requireRoles } from '../middleware/roleCheck.middleware.js';

const router = express.Router();

router.use(requireAdminAuth);

// GET /api/admin/manufacturers
router.get('/', listManufacturersController);

// GET /api/admin/manufacturers/:id
router.get('/:id', getManufacturerDetailController);

// POST /api/admin/manufacturers/:id/approve
router.post('/:id/approve', requireRoles('SUPERADMIN', 'DRUG_INSPECTOR'), approveManufacturerController);

// POST /api/admin/manufacturers/:id/reject
router.post('/:id/reject', requireRoles('SUPERADMIN', 'DRUG_INSPECTOR'), rejectManufacturerController);

export default router;
