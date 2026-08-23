import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import authRouter from '../routes/auth.routes.js';
import shopkeeperRouter from '../routes/shopkeeper.routes.js';
import transactionRouter from '../routes/transaction.routes.js';
import scanRouter from '../routes/scan.routes.js';
import medicineScanRouter from '../routes/medicineScan.routes.js';
import customerScanRouter from '../routes/customerScan.routes.js';
import internalRouter from '../routes/internal.routes.js';

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

// 0. Internal Admin Routes
app.use('/api/shopkeeper/internal', internalRouter);

// 1. Auth & Account Management
app.use('/api/shopkeeper/auth', authRouter);
app.use('/api/shopkeeper', authRouter);

// 2. Dashboard, History, Inventory, Profile
app.use('/api/shopkeeper', shopkeeperRouter);


// 3. Shopkeeper Intake & Sale Scans
app.use('/api/shopkeeper/scan', scanRouter);

// 4. Authenticated Medicine Scan
app.use('/api/medicine', medicineScanRouter);

// 5. Public Consumer Scan
app.use('/api/v1/scan', customerScanRouter);

// 6. Supply Chain Transactions (Idempotent)
app.use('/api/transactions', transactionRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found',
    });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || err.status || 500;
    const message    = err.message || 'Internal server error';

    console.error(`[shopkeeper-service Error] ${statusCode} — ${message}`, err.stack || '');

    res.status(statusCode).json({
        status: 'error',
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

export default app;
