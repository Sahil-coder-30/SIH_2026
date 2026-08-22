import express from 'express';
import { customerScanController } from '../controllers/scan.controller.js';

const router = express.Router();

// POST /api/v1/scan/customer — Public consumer QR verification
router.post('/customer', customerScanController);

export default router;
