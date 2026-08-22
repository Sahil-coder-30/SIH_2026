import jwt from 'jsonwebtoken';
import { getCorePublicKey } from '../config/keys.js';

/**
 * requireAuth — JWKS & JWT Authentication Gate for pharma-core APIs.
 *
 * Verifies inbound callers seeking data or executing blockchain transactions.
 * Supports:
 *   1. RS256 Bearer JWTs validated against pharma-core's RSA public key (JWKS)
 *   2. HS256 Bearer JWTs from domain services (manufacturer / shopkeeper sessions)
 *   3. X-Service-Token header for direct service-to-service internal calls
 *
 * Attaches req.user (payload) on success.
 */
export const requireAuth = (req, res, next) => {
    const manufacturerSecret = process.env.MANUFACTURER_JWT_SECRET || process.env.JWT_SECRET || 'mfr-super-secret-jwt-key';
    const shopkeeperSecret   = process.env.SHOPKEEPER_JWT_SECRET   || process.env.JWT_SECRET || 'shop-super-secret-jwt-key';
    const serviceSecret      = process.env.SERVICE_SECRET          || process.env.SERVICE_TOKEN;

    // ── 1. Check X-Service-Token Direct Header ────────────────────────────────
    const serviceTokenHeader = req.headers['x-service-token'];
    if (serviceTokenHeader && serviceSecret && serviceTokenHeader === serviceSecret) {
        req.user = { id: 'service-account', role: 'INTERNAL_SERVICE' };
        return next();
    }

    // ── 2. Extract Bearer Token from Authorization Header ────────────────────
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    } else if (req.headers['x-access-token']) {
        token = req.headers['x-access-token'];
    }

    // ── 3. Validate Token Presence ───────────────────────────────────────────
    if (!token) {
        return res.status(401).json({
            status: 'error',
            code: 'UNAUTHORIZED',
            message: 'Authentication token required. Provide Authorization: Bearer <jwt> or valid service token.',
        });
    }

    // ── 4. Verify via RS256 (JWKS RSA Public Key) ────────────────────────────
    try {
        const rsaPublicKey = getCorePublicKey();
        const decoded = jwt.verify(token, rsaPublicKey, { algorithms: ['RS256'] });
        req.user = decoded;
        return next();
    } catch {
        // Not an RS256 token, try HS256 secrets below
    }

    // ── 5. Verify via HS256 (Manufacturer / Shopkeeper Domain Secrets) ──────
    const secretsToTry = [manufacturerSecret, shopkeeperSecret];
    for (const secret of secretsToTry) {
        try {
            const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
            req.user = decoded;
            return next();
        } catch {
            // Try next secret
        }
    }

    // ── 6. Check Token directly against Service Secret String ────────────────
    if (serviceSecret && token === serviceSecret) {
        req.user = { id: 'service-account', role: 'INTERNAL_SERVICE' };
        return next();
    }

    // ── 7. Verification Failed ────────────────────────────────────────────────
    console.error('[pharma-core Auth] Unauthorized request: Invalid token provided');
    return res.status(401).json({
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication token: signature verification failed',
    });
};

// Export requireServiceToken alias for full backward compatibility
export const requireServiceToken = requireAuth;
export default requireAuth;
