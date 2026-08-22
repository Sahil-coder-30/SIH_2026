import express from 'express';
import { getJwksController } from '../controllers/jwks.controller.js';

const router = express.Router();

// ── Public JWKS Endpoints ─────────────────────────────────────────────────────
// These routes MUST remain public (no X-Service-Token required).
// pharma-backend-service fetches this on startup and caches it for 24h
// to validate RS256 Bearer JWTs and ES256 pack JWTs.

// GET /.well-known/jwks.json
router.get('/jwks.json', getJwksController);

// GET /.well-known/jwks (alias without .json extension)
router.get('/jwks', getJwksController);

// GET /.well-known/openid-configuration (standard OIDC discovery metadata)
router.get('/openid-configuration', (req, res) => {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:4000';
    const baseUrl = `${protocol}://${host}`;

    res.status(200).json({
        issuer: 'pharma-core',
        jwks_uri: `${baseUrl}/.well-known/jwks.json`,
        response_types_supported: ['token'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256', 'ES256'],
        scopes_supported: ['openid', 'system'],
        token_endpoint_auth_methods_supported: ['client_secret_jwt', 'private_key_jwt'],
        claims_supported: ['iss', 'sub', 'aud', 'exp', 'iat', 'kid'],
    });
});

export default router;
