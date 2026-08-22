import express from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import { intakeScanController, saleScanController } from '../controllers/scan.controller.js';

const router = express.Router();

// All shopkeeper intake/sale scan routes require auth
router.use(identifyUser);

// POST /api/shopkeeper/scan/intake
router.post('/intake', intakeScanController);

// POST /api/shopkeeper/scan/sale
router.post('/sale', saleScanController);

export default router;
