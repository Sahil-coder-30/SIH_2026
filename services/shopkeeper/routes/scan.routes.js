import express from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import { requireVerified } from '../middleware/requireVerified.middleware.js';
import {
    intakeScanController,
    saleScanController,
    authenticatedScanController,
    customerScanController,
} from '../controllers/scan.controller.js';

const router = express.Router();

// ── Public Routes (no auth) ───────────────────────────────────────────────────

// POST /api/shopkeeper/scan/intake
// POST /api/shopkeeper/scan/sale
// (these are mounted separately via app.js with identifyUser)

export const shopkeeperScanRouter = (() => {
    const r = express.Router();
    r.use(identifyUser);
    r.post('/intake', intakeScanController);
    r.post('/sale',   saleScanController);
    return r;
})();

// ── Authenticated Medicine Scan — POST /api/medicine/scan ─────────────────────
export const medicineScanRouter = (() => {
    const r = express.Router();
    r.post('/scan', identifyUser, requireVerified, authenticatedScanController);
    return r;
})();

// ── Public Customer Scan — POST /api/v1/scan/customer ────────────────────────
export const customerScanRouter = (() => {
    const r = express.Router();
    r.post('/customer', customerScanController);
    return r;
})();

export default shopkeeperScanRouter;
