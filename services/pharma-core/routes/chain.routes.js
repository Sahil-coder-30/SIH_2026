import express from 'express';
import { requireServiceToken } from '../middleware/requireServiceToken.middleware.js';
import {
    chainIntakeController,
    chainSaleController,
    chainRecallController,
} from '../controllers/chain.controller.js';

const router = express.Router();

// ── All chain routes require X-Service-Token ──────────────────────────────────
router.use(requireServiceToken);

// POST /core/chain/intake — record pack INTAKE transition on Fabric
router.post('/intake', chainIntakeController);

// POST /core/chain/sale — record pack SALE transition on Fabric
router.post('/sale', chainSaleController);

// POST /core/chain/recall — record batch RECALL transition on Fabric
router.post('/recall', chainRecallController);

export default router;
