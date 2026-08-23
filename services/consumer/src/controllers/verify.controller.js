import { verifyToken, getPackStatus } from '../services/coreClient.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────
// The 7 consumer UI verification states as defined in the architecture.
const UI_STATE = Object.freeze({
    GENUINE: 'GENUINE',           // Valid sig, not expired, AtShop or Packaged
    ALREADY_SOLD: 'ALREADY_SOLD', // Valid sig, Sold on ledger
    RECALLED: 'RECALLED',         // Valid sig, batch recalled
    EXPIRED: 'EXPIRED',           // Valid sig, expiryDate < today
    AT_SHOP: 'AT_SHOP',           // Valid sig, verified at registered pharmacy
    COUNTERFEIT: 'COUNTERFEIT',   // Invalid signature
    NOT_FOUND: 'NOT_FOUND',       // Valid sig, no on-chain MFG event
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const mapStatusToUiState = (blockchainStatus) => {
    switch (blockchainStatus) {
        case 'Recalled':  return UI_STATE.RECALLED;
        case 'Sold':      return UI_STATE.ALREADY_SOLD;
        case 'AtShop':    return UI_STATE.AT_SHOP;
        case 'Packaged':  return UI_STATE.GENUINE;
        case 'MINTED':    return UI_STATE.GENUINE;
        case 'UNKNOWN':   return UI_STATE.GENUINE;
        case 'NOT_FOUND': return UI_STATE.NOT_FOUND;
        default:          return UI_STATE.NOT_FOUND;
    }
};

// ── URL & Token Parser Helper ──────────────────────────────────────────────────
/**
 * Intelligently extracts the raw signed JWT token and packHash whether the scanner provides:
 *   1. Full verify URL: "https://pharmachain.gov.in/verify/a8f5f167...?token=eyJhbGci..."
 *   2. Path param URL:  "https://pharmachain.gov.in/verify/a8f5f167..."
 *   3. Raw JWT string:  "eyJhbGciOiJFUzI1Ni..."
 */
const extractTokenAndHashFromQrData = (input) => {
    if (!input || typeof input !== 'string') return { token: '', hash: '' };
    
    const raw = input.trim();
    let token = raw;
    let hash  = '';

    if (raw.includes('/verify/')) {
        const afterVerify = raw.split('/verify/')[1];
        if (afterVerify) {
            hash = afterVerify.split('?')[0].split('/')[0];
        }
    }

    if (raw.includes('token=')) {
        try {
            const urlObj = new URL(raw.startsWith('http') ? raw : `https://pharmachain.gov.in/${raw}`);
            token = urlObj.searchParams.get('token') || raw;
        } catch {
            const match = raw.match(/[?&]token=([^&]+)/);
            if (match && match[1]) token = decodeURIComponent(match[1]);
        }
    }

    return { token, hash };
};

// ── Controllers ───────────────────────────────────────────────────────────────

export const verifyQrController = async (req, res) => {
    try {
        const inputData = req.body?.qrData || req.body?.token || req.body?.signedToken || req.query?.token || req.query?.qrData;

        if (!inputData) {
            return res.status(400).json({ status: 'error', message: 'qrData or token is required' });
        }


        const { token: parsedToken, hash: parsedUrlHash } = extractTokenAndHashFromQrData(inputData);

        // ── Tier 1: Cryptographic signature verification ───────────────────────
        const verifyResult = await verifyToken(parsedToken);

        if (!verifyResult.valid) {
            // UI State 6 — COUNTERFEIT
            return res.status(200).json({
                status: 'success',
                uiState: UI_STATE.COUNTERFEIT,
                message: 'COUNTERFEIT WARNING: Invalid digital signature. Do not consume this medicine.',
                valid: false,
                scannedHash: parsedUrlHash || null,
            });
        }

        const { payload, packHash } = verifyResult;
        const { batchId, expiryDate, manufacturerId } = payload;

        // ── Check expiry date ─────────────────────────────────────────────────
        if (new Date(expiryDate) < new Date()) {
            // UI State 4 — EXPIRED
            return res.status(200).json({
                status: 'success',
                uiState: UI_STATE.EXPIRED,
                message: `EXPIRED: Medicine passed expiration date on ${expiryDate}. Do not consume.`,
                valid: true,
                payload,
            });
        }

        // ── Tier 2: Blockchain status lookup ──────────────────────────────────
        const statusResult = await getPackStatus(packHash, batchId);
        const blockchainStatus = statusResult.status || 'NOT_FOUND';

        const uiState = mapStatusToUiState(blockchainStatus);

        // ── Build consumer-friendly response ──────────────────────────────────
        const messages = {
            [UI_STATE.GENUINE]:      '100% Genuine Medicine — Registered & Safe',
            [UI_STATE.ALREADY_SOLD]: `Warning: Pack already registered as sold. Possible reuse detected.`,
            [UI_STATE.RECALLED]:     'CRITICAL: Batch recalled by manufacturer. Do not consume.',
            [UI_STATE.AT_SHOP]:      'Verified authentic inventory at a registered pharmacy.',
            [UI_STATE.NOT_FOUND]:    'Valid manufacturer token, but no on-chain mint event found.',
        };

        console.log(`[consumer-service Verify] packHash: ${packHash} — uiState: ${uiState}`);

        return res.status(200).json({
            status: 'success',
            uiState,
            message: messages[uiState] || 'Verification complete',
            valid: true,
            payload,
            packHash,
            blockchainStatus,
            detail: statusResult.detail || null,
        });
    } catch (error) {
        console.error('[consumer-service Verify] verifyQrController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
