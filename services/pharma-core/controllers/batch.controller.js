import { signPackJwt, derivePackHash } from '../services/crypto.service.js';
import { submitTransitionBatch } from '../services/backendClient.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const SERIAL_PAD_LENGTH = 5; // Zero-pad serials to 5 digits: "00001"

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatSerial = (n) => String(n).padStart(SERIAL_PAD_LENGTH, '0');

const formatDate = (d = new Date()) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}${mm}${yyyy}`; // DDMMYYYY
};

const formatTime = (d = new Date()) =>
    d.toTimeString().split(' ')[0]; // HH:MM:SS

// ── Controllers ───────────────────────────────────────────────────────────────

export const mintBatchController = async (req, res) => {
    try {
        const { batchId, manufacturerId, expiryDate, quantity } = req.body;

        if (!batchId || !manufacturerId || !expiryDate || !quantity) {
            return res.status(400).json({
                status: 'error',
                message: 'batchId, manufacturerId, expiryDate, and quantity are required',
            });
        }

        if (quantity > 10000) {
            return res.status(400).json({ status: 'error', message: 'quantity must be ≤ 10,000' });
        }

        const now = new Date();
        const sellingDate = formatDate(now);
        const sellingTime = formatTime(now);
        const packs = [];
        const transitions = [];

        // ── Sign JWT for each pack in the batch (ES256) ───────────────────────
        for (let i = 1; i <= quantity; i++) {
            const serial = formatSerial(i);
            const payload = { batchId, serial, expiryDate, manufacturerId };

            const signedToken = await signPackJwt(payload, manufacturerId);
            const packHash = derivePackHash(signedToken);

            packs.push({ serial, packHash, signedToken });

            // Construct MFG transition for this pack
            transitions.push({
                hash: `${packHash}:MFG`,
                fromId: 'MINTED',
                toId: manufacturerId,
                sellingDate,
                sellingTime,
                sellerId: manufacturerId,
            });
        }

        // ── Submit batch transitions to pharma-backend via RS256 Bearer JWT ───
        let backendResult = null;
        try {
            backendResult = await submitTransitionBatch(transitions);
            console.log(`[pharma-core Batch] Batch transitions submitted to pharma-backend for ${batchId}`);
        } catch (backendErr) {
            console.warn(`[pharma-core Batch] Notice: pharma-backend submission skipped/deferred: ${backendErr.message}`);
        }

        console.log(`[pharma-core Batch] Minted ${packs.length} packs for batch ${batchId}`);

        return res.status(200).json({
            status: 'success',
            batchId,
            totalPacks: packs.length,
            packs,
            backendSubmitted: backendResult !== null,
        });
    } catch (error) {
        console.error('[pharma-core Batch] mintBatchController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
