import express from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import { requireVerified } from '../middleware/requireVerified.middleware.js';
import {
    receiveController,
    sellController,
    returnController,
} from '../controllers/transaction.controller.js';

const router = express.Router();

// All transaction routes require auth + verified status
router.use(identifyUser);
router.use(requireVerified);

// POST /api/transactions/receive
router.post('/receive', receiveController);

// POST /api/transactions/sell
router.post('/sell', sellController);

// POST /api/transactions/return
router.post('/return', returnController);

export default router;
