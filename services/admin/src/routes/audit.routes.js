import express from 'express';
import { getAuditLogsController } from '../controllers/audit.controller.js';
import { requireAdminAuth } from '../middleware/adminAuth.middleware.js';

const router = express.Router();

router.use(requireAdminAuth);

// GET /api/admin/audit-logs
router.get('/', getAuditLogsController);

export default router;
