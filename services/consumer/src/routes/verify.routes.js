import express from 'express';
import { verifyQrController } from '../controllers/verify.controller.js';

const router = express.Router();

// ── Public Verification Route ─────────────────────────────────────────────────
// No authentication required — open to all consumer mobile apps.

// GET & POST /api/consumer/verify
router.post('/', verifyQrController);
router.get('/', verifyQrController);


export default router;
