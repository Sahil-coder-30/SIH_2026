import express from 'express';
import { requireServiceToken } from '../middleware/requireServiceToken.middleware.js';
import { mintBatchController } from '../controllers/batch.controller.js';

const router = express.Router();

// ── All batch routes require X-Service-Token ──────────────────────────────────
router.use(requireServiceToken);

// POST /core/batch/mint — sign JWTs for all packs in a batch and record on Fabric
router.post('/mint', mintBatchController);

export default router;
