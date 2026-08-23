// ── identifyUser middleware — manufacturer-service ────────────────────────────
// Verifies HS256 JWT from Authorization header or HttpOnly cookie.
// Attaches req.user (decoded payload) and req.user.id (manufacturer DB id).
// Returns 401 on missing or invalid token.

import jwt from 'jsonwebtoken';

// ── Constants ─────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Validates the manufacturer's session JWT.
 * Token is read from:
 *   1. Authorization: Bearer <token> header
 *   2. HttpOnly cookie named 'mfr_token' (fallback)
 * Attaches req.user and req.authToken on success.
 */
export const identifyUser = async (req, res, next) => {
    // ── Extract token ─────────────────────────────────────────────────────────
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.cookies?.mfr_token) {
        token = req.cookies.mfr_token;
    }

    // ── Validate presence ─────────────────────────────────────────────────────
    if (!token) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: No authentication token provided',
        });
    }

    // ── Verify JWT signature and expiry ───────────────────────────────────────
    try {
        if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');

        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

        // ── Attach identity to request ────────────────────────────────────────
        req.user = decoded;
        req.user.id = decoded.id || decoded.sub;
        req.authToken = token;

        next();
    } catch (err) {
        console.error('[manufacturer-service Auth] JWT verification failed:', err.message);

        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ status: 'error', message: 'Unauthorized: Token has expired' });
        }

        return res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid token' });
    }
};
