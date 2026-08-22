import express from 'express';
import { registerController, loginController } from '../controllers/auth.controller.js';

const router = express.Router();

// ── Public Auth Routes ────────────────────────────────────────────────────────

// POST /api/shopkeeper/auth/register
router.post('/register', registerController);

// POST /api/shopkeeper/auth/login
router.post('/login', loginController);

export default router;
