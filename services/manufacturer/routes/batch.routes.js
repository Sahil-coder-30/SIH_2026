import express from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import {
    createBatchController,
    listBatchesController,
    getBatchController,
    mintBatchController,
    recallBatchController,
} from '../controllers/batch.controller.js';

const router = express.Router();

// ── All batch routes require manufacturer JWT ─────────────────────────────────
router.use(identifyUser);

// POST /api/manufacturer/batch — create a new batch
router.post('/', createBatchController);

// GET /api/manufacturer/batch — list all batches for this manufacturer
router.get('/', listBatchesController);

// GET /api/manufacturer/batch/:batchId — get a specific batch
router.get('/:batchId', getBatchController);

// POST /api/manufacturer/batch/:batchId/mint — sign JWTs and register on Fabric
router.post('/:batchId/mint', mintBatchController);

// POST /api/manufacturer/batch/:batchId/recall — initiate batch recall
router.post('/:batchId/recall', recallBatchController);

export default router;
