import express from 'express';
import { getDashboardStatsController } from '../controllers/dashboard.controller.js';
import { requireAdminAuth } from '../middleware/adminAuth.middleware.js';

const router = express.Router();

router.get('/stats', requireAdminAuth, getDashboardStatsController);

export default router;
