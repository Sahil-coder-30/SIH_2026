import express from 'express';
import {
    loginController,
    getMeController,
    logoutController,
    createAdminController,
} from '../controllers/auth.controller.js';
import { requireAdminAuth } from '../middleware/adminAuth.middleware.js';
import { requireRoles } from '../middleware/roleCheck.middleware.js';

const router = express.Router();

// Public
router.post('/login', loginController);
router.post('/logout', logoutController);

// Protected
router.get('/me', requireAdminAuth, getMeController);
router.post('/create-admin', requireAdminAuth, requireRoles('SUPERADMIN'), createAdminController);

export default router;
