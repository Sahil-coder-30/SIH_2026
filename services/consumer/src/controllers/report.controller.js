import { verifyToken } from '../services/coreClient.service.js';

// ── Controllers ───────────────────────────────────────────────────────────────

export const reportCounterfeitController = async (req, res) => {
    try {
        const { qrToken, location, notes, photoUrl } = req.body;

        // ── Input validation ──────────────────────────────────────────────────
        if (!qrToken) {
            return res.status(400).json({ status: 'error', message: 'qrToken is required' });
        }

        // ── Attempt token decode to extract any available payload ─────────────
        let tokenPayload = null;
        try {
            const verifyResult = await verifyToken(qrToken);
            if (verifyResult.valid) {
                tokenPayload = verifyResult.payload;
            }
        } catch {
            // Non-fatal — we still accept the report even if token is completely invalid
        }

        // ── TODO: Phase 3 — Persist report to security incident store ─────────
        // e.g. POST to an alerting service, write to a reports DB, or push to RabbitMQ
        // For now, log the report with all available context.

        const report = {
            reportedAt: new Date().toISOString(),
            qrToken,
            tokenPayload,
            location: location || null,
            notes: notes || null,
            photoUrl: photoUrl || null,
        };

        console.log('[consumer-service Report] Suspicious activity report received:', JSON.stringify(report));

        return res.status(201).json({
            status: 'success',
            message: 'Report submitted. Our team will investigate.',
            reportId: `RPT-${Date.now()}`,
        });
    } catch (error) {
        console.error('[consumer-service Report] reportCounterfeitController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
