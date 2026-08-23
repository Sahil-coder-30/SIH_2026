import jwt from 'jsonwebtoken';
import AdminUser from '../models/adminUser.model.js';

export const requireAdminAuth = async (req, res, next) => {
    try {
        const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
        if (!JWT_SECRET) {
            return res.status(500).json({ status: 'error', message: 'ADMIN_JWT_SECRET is not configured' });
        }

        // Check header (Bearer <token>) or cookie (admin_token)
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (req.cookies && req.cookies.admin_token) {
            token = req.cookies.admin_token;
        }

        if (!token) {
            return res.status(401).json({
                status:  'error',
                code:    'UNAUTHORIZED',
                message: 'Admin authorization token required. Please log in.',
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        } catch (err) {
            return res.status(401).json({
                status:  'error',
                code:    'TOKEN_EXPIRED_OR_INVALID',
                message: 'Invalid or expired admin session. Please log in again.',
            });
        }

        const admin = await AdminUser.findOne({ adminId: decoded.adminId, isActive: true });
        if (!admin) {
            return res.status(401).json({
                status:  'error',
                code:    'ACCOUNT_DISABLED',
                message: 'Admin account not found or disabled.',
            });
        }

        req.admin = admin;
        next();
    } catch (error) {
        console.error('[admin-service Auth Middleware] error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
