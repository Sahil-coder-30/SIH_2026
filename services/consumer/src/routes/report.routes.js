import express from 'express';
import { reportCounterfeitController } from '../controllers/report.controller.js';

const router = express.Router();

// ── Public Reporting Route ────────────────────────────────────────────────────
// No authentication required — any consumer can submit a suspicious activity report.

// POST /api/consumer/report
router.post('/', reportCounterfeitController);

export default router;
