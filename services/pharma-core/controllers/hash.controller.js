import { verifyPackJwt } from '../services/crypto.service.js';
import { getPackStatus } from '../services/backendClient.service.js';

// ── Controllers ───────────────────────────────────────────────────────────────

export const verifyHashController = async (req, res) => {
    try {
        const { signedToken } = req.body;

        if (!signedToken) {
            return res.status(400).json({ status: 'error', message: 'signedToken is required' });
        }

        const result = await verifyPackJwt(signedToken);

        if (!result.valid) {
            return res.status(400).json({
                status: 'error',
                code: 'INVALID_SIGNATURE',
                message: 'ES256 signature verification failed',
                error: result.error,
            });
        }

        return res.status(200).json({
            status: 'success',
            valid: true,
            payload: result.payload,
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

        if (!batchId) {
            return res.status(400).json({ status: 'error', message: 'batchId query param is required' });
        }

        // ── Fetch live status from pharma-backend-service → Hyperledger Fabric ─
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
