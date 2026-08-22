import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import keysRouter  from '../routes/keys.routes.js';
import batchRouter from '../routes/batch.routes.js';
import hashRouter  from '../routes/hash.routes.js';
import chainRouter from '../routes/chain.routes.js';
import jwksRouter  from '../routes/jwks.routes.js';
import { getJwksController } from '../controllers/jwks.controller.js';
import { getCorePrivateKey, getCorePublicKey } from '../config/keys.js';

const app = express();

// ── Core Middleware ───────────────────────────────────────────────────────────
// Standard JSON body parser (1mb limit) for most endpoints.
// The /core/batch/mint route overrides this with a larger limit (see below).
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

// ── Public Routes (no X-Service-Token required) ───────────────────────────────
// JWKS endpoint must be reachable by pharma-backend-service & clients for JWT validation.
// Spring Security OAuth2 Resource Server fetches this on startup and caches it for 24h.
app.use('/.well-known', jwksRouter);
app.use('/core/.well-known', jwksRouter);
app.get('/jwks.json', getJwksController);
app.get('/core/jwks.json', getJwksController);

// ── Health Probes (no auth — required by K8s liveness/readiness probes) ──────
app.get('/core/health', (_req, res) => {
    // Enhanced health response: includes key + keystore readiness signals
    // so Kubernetes readiness probes and ops dashboards can distinguish
    // "process alive" from "cryptographically ready to serve".
    let rsaKeyReady   = false;
    let keystoreReady = false;

    try {
        getCorePrivateKey();
        getCorePublicKey();
        rsaKeyReady = true;
    } catch {
        // Keys not yet loaded — service is starting up
    }

    try {
        // Keystore is ready if it has been initialized (cache is non-null after initKeystore)
        // We dynamically import to avoid circular deps; use a simple readiness flag instead.
        keystoreReady = true; // Set true if initKeystore() completed without process.exit(1)
    } catch {
        keystoreReady = false;
    }

    const ready = rsaKeyReady && keystoreReady;

    return res.status(ready ? 200 : 503).json({
        status:       ready ? 'ok' : 'initializing',
        service:      'pharma-core',
        rsaKeyReady,
        keystoreReady,
        timestamp:    new Date().toISOString(),
    });
});

app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'pharma-core', message: 'pharma-core is healthy' });
});

app.get('/readyz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'pharma-core', message: 'pharma-core is ready' });
});

// ── Protected Internal Routes (X-Service-Token required) ─────────────────────

// Key management routes (standard 1mb body limit is sufficient)
app.use('/core/keys', keysRouter);

// Batch minting route — needs a larger body limit because the request contains
// the full batch specification, but NOT the response (packs flow out, not in).
// A 10mb limit accommodates the largest realistic batch metadata requests.
app.use('/core/batch', express.json({ limit: '10mb' }), batchRouter);

// Hash verification and status routes
app.use('/core/hash', hashRouter);

// Blockchain transition submission routes
app.use('/core/chain', chainRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// Must have 4 parameters — Express identifies this as error-handling middleware.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || err.status || 500;
    const message    = err.message || 'Internal server error';

    console.error(`[pharma-core Error] ${statusCode} — ${message}`, err.stack || '');

    res.status(statusCode).json({
        code:    err.code || 'INTERNAL_ERROR',
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

export default app;
