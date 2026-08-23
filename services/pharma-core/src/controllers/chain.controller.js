import { submitTransition, submitRecall } from '../services/backendClient.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (d = new Date()) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}${mm}${yyyy}`;
};

const formatTime = (d = new Date()) => d.toTimeString().split(' ')[0];

// ── Controllers ───────────────────────────────────────────────────────────────

export const chainIntakeController = async (req, res) => {
    try {
        const { packHash, shopId, operatorId, manufacturerId } = req.body;

        if (!packHash || !shopId || !operatorId || !manufacturerId) {
            return res.status(400).json({
                status: 'error',
                message: 'packHash, shopId, operatorId, and manufacturerId are required',
            });
        }

        const now = new Date();
        const transition = {
            packId: packHash,
            eventType: 'INTAKE',
            hash: `${packHash}~INTAKE`,
            fromId: manufacturerId,
            toId: shopId,
            sellingDate: formatDate(now),
            sellingTime: formatTime(now),
            sellerId: operatorId,
        };

        // ── Submit transition to pharma-backend with RS256 Bearer JWT ─────────
        let backendResult = null;
        try {
            backendResult = await submitTransition(transition);
            console.log(`[pharma-core Chain] Intake transition submitted to pharma-backend for ${packHash}`);
        } catch (backendErr) {
            console.warn(`[pharma-core Chain] Notice: pharma-backend submission skipped/deferred: ${backendErr.message}`);
        }

        console.log(`[pharma-core Chain] Intake transition processed for packHash: ${packHash}`);

        return res.status(200).json({
            status: 'success',
            message: 'Intake transition processed',
            transition,
            backendSubmitted: backendResult !== null,
        });
    } catch (error) {
        console.error('[pharma-core Chain] chainIntakeController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const chainSaleController = async (req, res) => {
    try {
        const { packHash, shopId, operatorId } = req.body;

        if (!packHash || !shopId || !operatorId) {
            return res.status(400).json({
                status: 'error',
                message: 'packHash, shopId, and operatorId are required',
            });
        }

        const now = new Date();
        const transition = {
            packId: packHash,
            eventType: 'SOLD',
            hash: `${packHash}~SOLD`,
            fromId: shopId,
            toId: 'CONSUMER',
            sellingDate: formatDate(now),
            sellingTime: formatTime(now),
            sellerId: operatorId,
        };

        // ── Submit transition to pharma-backend with RS256 Bearer JWT ─────────
        let backendResult = null;
        try {
            backendResult = await submitTransition(transition);
            console.log(`[pharma-core Chain] Sale transition submitted to pharma-backend for ${packHash}`);
        } catch (backendErr) {
            console.warn(`[pharma-core Chain] Notice: pharma-backend submission skipped/deferred: ${backendErr.message}`);
        }

        console.log(`[pharma-core Chain] Sale transition processed for packHash: ${packHash}`);

        return res.status(200).json({
            status: 'success',
            message: 'Sale transition processed',
            transition,
            backendSubmitted: backendResult !== null,
        });
    } catch (error) {
        console.error('[pharma-core Chain] chainSaleController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const chainRecallController = async (req, res) => {
    try {
        const { batchId, manufacturerId, reason } = req.body;

        if (!batchId || !manufacturerId || !reason) {
            return res.status(400).json({
                status: 'error',
                message: 'batchId, manufacturerId, and reason are required',
            });
        }

        const recallPayload = {
            systemBatchId: batchId,         // RecallRequest.java field name
            actorId:       manufacturerId,   // RecallRequest.java field name (was: fromId)
            reason,
            // recallDate/recallTime are auto-set inside submitRecall() from current timestamp
        };

        // ── Submit recall to pharma-backend with RS256 Bearer JWT ─────────────
        let backendResult = null;
        try {
            backendResult = await submitRecall(recallPayload);
            console.log(`[pharma-core Chain] Recall payload submitted to pharma-backend for batch: ${batchId}`);
        } catch (backendErr) {
            console.warn(`[pharma-core Chain] Notice: pharma-backend submission skipped/deferred: ${backendErr.message}`);
        }

        console.log(`[pharma-core Chain] Recall processed for batch: ${batchId}`);

        return res.status(200).json({
            status: 'success',
            message: 'Recall transition processed',
            recallPayload,
            backendSubmitted: backendResult !== null,
        });
    } catch (error) {
        console.error('[pharma-core Chain] chainRecallController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
