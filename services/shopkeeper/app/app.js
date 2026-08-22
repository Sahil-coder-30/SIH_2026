import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import authRouter from '../routes/auth.routes.js';
import shopkeeperRouter from '../routes/shopkeeper.routes.js';
import transactionRouter from '../routes/transaction.routes.js';
import { shopkeeperScanRouter, medicineScanRouter, customerScanRouter } from '../routes/scan.routes.js';

const app = express();

// ── Core Middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// ── Health Probes ─────────────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'shopkeeper-service', message: 'Shopkeeper service is healthy' });
});
app.get('/readyz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'shopkeeper-service', message: 'Shopkeeper service is ready' });
});

// ── Routes ────────────────────────────────────────────────────────────────────

// 1. Auth & Account Management
//    POST   /api/shopkeeper/login
//    POST   /api/shopkeeper/register
//    GET    /api/shopkeeper/verification-status
//    POST   /api/shopkeeper/refresh
//    POST   /api/shopkeeper/forgot-password
//    POST   /api/shopkeeper/reset-password
//    POST   /api/shopkeeper/logout
app.use('/api/shopkeeper', authRouter);

// 2. Dashboard, History, Inventory, Profile
//    GET    /api/shopkeeper/stats
//    GET    /api/shopkeeper/medicine/history
//    GET    /api/shopkeeper/inventory
//    GET    /api/shopkeeper/profile
//    PATCH  /api/shopkeeper/profile
app.use('/api/shopkeeper', shopkeeperRouter);

// 3. QR Scan (Shopkeeper Internal) — Intake & Sale (signed JWT tokens)
//    POST   /api/shopkeeper/scan/intake
//    POST   /api/shopkeeper/scan/sale
app.use('/api/shopkeeper/scan', shopkeeperScanRouter);

// 4. Authenticated Medicine Scan (2.1)
//    POST   /api/medicine/scan
app.use('/api/medicine', medicineScanRouter);

// 5. Public Consumer Scan (2.2)
//    POST   /api/v1/scan/customer
app.use('/api/v1/scan', customerScanRouter);

// 6. Supply Chain Transactions (Idempotent)
//    POST   /api/transactions/receive
//    POST   /api/transactions/sell
//    POST   /api/transactions/return
app.use('/api/transactions', transactionRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found' },
    });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || err.status || 500;
    const message    = err.message || 'Internal server error';

    console.error(`[shopkeeper-service Error] ${statusCode} — ${message}`, err.stack || '');

    res.status(statusCode).json({
        success: false,
        error: {
            code:    err.code || 'INTERNAL_ERROR',
            message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        },
    });
});

export default app;
