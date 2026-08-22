import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import keysRouter from '../routes/keys.routes.js';
import batchRouter from '../routes/batch.routes.js';
import hashRouter from '../routes/hash.routes.js';
import chainRouter from '../routes/chain.routes.js';
import jwksRouter from '../routes/jwks.routes.js';
import { getJwksController } from '../controllers/jwks.controller.js';

const app = express();

// ── Core Middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// ── Public Routes (no X-Service-Token required) ───────────────────────────────
// JWKS endpoint must be reachable by pharma-backend-service & clients for JWT validation
app.use('/.well-known', jwksRouter);
app.use('/core/.well-known', jwksRouter);
app.get('/jwks.json', getJwksController);
app.get('/core/jwks.json', getJwksController);

// ── Health Probes (no auth — required by K8s liveness/readiness probes) ──────
app.get('/core/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'pharma-core' });
});

app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'pharma-core', message: 'pharma-core is healthy' });
});

app.get('/readyz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'pharma-core', message: 'pharma-core is ready' });
});

// ── Protected Internal Routes (X-Service-Token required) ─────────────────────
app.use('/core/keys', keysRouter);
app.use('/core/batch', batchRouter);
app.use('/core/hash', hashRouter);
app.use('/core/chain', chainRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ status: 'error', message: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// Must have 4 parameters — Express identifies this as error-handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal server error';

    console.error(`[pharma-core Error] ${statusCode} — ${message}`, err.stack || '');

    res.status(statusCode).json({
        status: 'error',
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

export default app;
