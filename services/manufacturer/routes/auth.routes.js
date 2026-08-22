import express from 'express';
import { registerController, loginController } from '../controllers/auth.controller.js';

const router = express.Router();

// ── Public Auth Routes (no JWT required) ──────────────────────────────────────

// POST /api/manufacturer/auth/register
router.post('/register', registerController);

// POST /api/manufacturer/auth/login
router.post('/login', loginController);

export default router;
