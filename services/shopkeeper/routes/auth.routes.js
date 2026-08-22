import express from 'express';
import {
    registerController,
    loginController,
    verificationStatusController,
    refreshController,
    forgotPasswordController,
    resetPasswordController,
    logoutController,
} from '../controllers/auth.controller.js';
import { identifyUser } from '../middleware/identifyUser.middleware.js';

const router = express.Router();

// ── Public Auth Routes ────────────────────────────────────────────────────────

// POST /api/shopkeeper/login
router.post('/login', loginController);

// POST /api/shopkeeper/register
router.post('/register', registerController);

// POST /api/shopkeeper/refresh
router.post('/refresh', refreshController);

// POST /api/shopkeeper/forgot-password
router.post('/forgot-password', forgotPasswordController);

// POST /api/shopkeeper/reset-password
router.post('/reset-password', resetPasswordController);

// ── Protected Auth Routes ─────────────────────────────────────────────────────

// GET /api/shopkeeper/verification-status
router.get('/verification-status', identifyUser, verificationStatusController);

// POST /api/shopkeeper/logout
router.post('/logout', identifyUser, logoutController);

export default router;
