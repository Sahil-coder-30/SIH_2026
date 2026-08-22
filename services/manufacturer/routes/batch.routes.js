import express from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import {
    createBatchController,
    listBatchesController,
    getBatchController,
    getPublicBatchDetailsController,
    mintBatchController,
    recallBatchController,
    exportBatchCsvController,
    listBatchPacksController,
    lookupPackGlobalController,
} from '../controllers/batch.controller.js';

const router = express.Router();

// ── Public Routes (No authentication required) ────────────────────────────────
// Called by consumer-service and shopkeeper-service to fetch medicine details by batchId
// after verifying a pack's QR JWT.
router.get('/public/:batchId', getPublicBatchDetailsController);

// ── Protected Routes (Manufacturer JWT required) ──────────────────────────────
router.use(identifyUser);

// GET /api/manufacturer/batch/pack/lookup/:identifier — Universal Global Search across all batches
router.get('/pack/lookup/:identifier', lookupPackGlobalController);

// POST /api/manufacturer/batch — create a new batch with full 30+ medicine fields
router.post('/', createBatchController);

// GET /api/manufacturer/batch — list all batches for this manufacturer (with pagination & filters)
router.get('/', listBatchesController);

// GET /api/manufacturer/batch/:batchId — get a specific batch and active mint progress
router.get('/:batchId', getBatchController);

// GET /api/manufacturer/batch/:batchId/packs — paginated pack table browser inside batch detail
router.get('/:batchId/packs', listBatchPacksController);

// GET /api/manufacturer/batch/:batchId/export/csv — download CSV of QRs (packs, boxes, or cartons)
router.get('/:batchId/export/csv', exportBatchCsvController);

// POST /api/manufacturer/batch/:batchId/mint — trigger asynchronous minting (HTTP 202)
router.post('/:batchId/mint', mintBatchController);

// POST /api/manufacturer/batch/:batchId/recall — initiate batch recall across supply chain
router.post('/:batchId/recall', recallBatchController);

export default router;
