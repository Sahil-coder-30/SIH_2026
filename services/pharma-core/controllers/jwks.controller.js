import { buildJwks } from '../services/crypto.service.js';

// ── Controllers ───────────────────────────────────────────────────────────────

export const getJwksController = async (_req, res) => {
    try {
        const jwks = await buildJwks();

        // Set Cache-Control so pharma-backend-service can cache JWKS for 24h
        res.set('Cache-Control', 'public, max-age=86400');

        return res.status(200).json(jwks);
    } catch (error) {
        console.error('[pharma-core JWKS] getJwksController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
