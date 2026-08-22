import express from 'express';
import { requireServiceToken } from '../middleware/requireServiceToken.middleware.js';
import { verifyHashController, getHashStatusController } from '../controllers/hash.controller.js';

const router = express.Router();

// ── All hash routes require X-Service-Token ───────────────────────────────────
router.use(requireServiceToken);

// POST /core/hash/verify — verify ES256 JWT signature and derive packHash
router.post('/verify', verifyHashController);

// GET /core/hash/status/:hash — get live pack status from Fabric via pharma-backend
router.get('/status/:hash', getHashStatusController);

export default router;
