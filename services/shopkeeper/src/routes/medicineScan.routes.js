import express from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import { requireVerified } from '../middleware/requireVerified.middleware.js';
import { authenticatedScanController } from '../controllers/scan.controller.js';

const router = express.Router();

// POST /api/medicine/scan — Authenticated medicine verification
router.post('/scan', identifyUser, requireVerified, authenticatedScanController);

export default router;
