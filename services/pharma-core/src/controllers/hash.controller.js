import { verifyPackJwt } from '../services/crypto.service.js';
import { getPackStatus } from '../services/backendClient.service.js';

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /core/hash/verify
 *
 * Verifies an ES256 signed JWT from a QR code.
 *
 * ⚠️  IMPORTANT — ALWAYS returns HTTP 200, even for invalid signatures.
 * API contract §4.2: "A counterfeit is a successful verification with a bad outcome."
 * No axios client sets validateStatus, so a non-2xx throws before the COUNTERFEIT
 * branch in consumer/shopkeeper is ever reached. Returning 200 with valid:false
 * is the correct API surface.
 */
export const verifyHashController = async (req, res) => {
    try {
        const { signedToken } = req.body;

        if (!signedToken) {
            return res.status(400).json({ status: 'error', message: 'signedToken is required' });
        }

        const result = await verifyPackJwt(signedToken);

        if (!result.valid) {
            // 200 — not 400. The caller decides what to show the user.
            return res.status(200).json({
                status:  'success',
                valid:   false,
                code:    'INVALID_SIGNATURE',
                message: 'ES256 signature verification failed — pack may be counterfeit',
                error:   result.error || null,
            });
        }

        return res.status(200).json({
            status:   'success',
            valid:    true,
            payload:  result.payload,
            packHash: result.packHash,
        });
    } catch (error) {
        console.error('[pharma-core Hash] verifyHashController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const getHashStatusController = async (req, res) => {
    try {
        const { hash } = req.params;
        const { batchId } = req.query;

        // batchId is optional — ledger key is packHash alone in new chaincode format
        const statusResult = await getPackStatus(hash, batchId);

        return res.status(200).json({
            status: 'success',
            ...statusResult,
        });
    } catch (error) {
        console.error('[pharma-core Hash] getHashStatusController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
