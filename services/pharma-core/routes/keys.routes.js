import express from 'express';
import { requireServiceToken } from '../middleware/requireServiceToken.middleware.js';
import { generateKeyController, getPublicKeyController } from '../controllers/keys.controller.js';

const router = express.Router();

// ── All key routes require X-Service-Token ────────────────────────────────────
router.use(requireServiceToken);

// POST /core/keys/generate — generate and store a new EC P-256 keypair for a manufacturer
router.post('/generate', generateKeyController);

// GET /core/keys/public/:mfrId — retrieve the public key PEM for a manufacturer
router.get('/public/:mfrId', getPublicKeyController);

export default router;
