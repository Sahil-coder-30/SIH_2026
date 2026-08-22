import express from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import { intakeScanController, saleScanController } from '../controllers/scan.controller.js';

const router = express.Router();

// ── All scan routes require shopkeeper JWT ────────────────────────────────────
router.use(identifyUser);

// POST /api/shopkeeper/scan/intake — verify QR + record AtShop on Fabric + add to inventory
router.post('/intake', intakeScanController);

// POST /api/shopkeeper/scan/sale — verify QR + check status + record Sold on Fabric
router.post('/sale', saleScanController);

export default router;
