import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import verifyRouter from '../routes/verify.routes.js';
import reportRouter from '../routes/report.routes.js';

const app = express();

// ── Core Middleware ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Token, X-Service-Token');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────────────────────────
// All consumer routes are public — no user authentication required.
// Consumer service is a stateless verification proxy.
app.use('/api/consumer/verify', verifyRouter);
app.use('/api/consumer/report', reportRouter);

// ── Health Probes ─────────────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'consumer-service', message: 'Consumer service is healthy' });
});

app.get('/readyz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'consumer-service', message: 'Consumer service is ready' });
});

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ status: 'error', message: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal server error';

    console.error(`[consumer-service Error] ${statusCode} — ${message}`, err.stack || '');

    res.status(statusCode).json({
        status: 'error',
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

export default app;
