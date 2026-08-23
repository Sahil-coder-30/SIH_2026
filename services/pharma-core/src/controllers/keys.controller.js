import { generateManufacturerKey } from '../services/crypto.service.js';
import { readKeystore } from '../config/keystore.js';

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /core/keys/generate
 *
 * Generates an ECDSA P-256 keypair for a manufacturer, encrypts the private key
 * with AES-256-GCM, and persists it to the keystore.
 *
 * Idempotency guard: returns 409 CONFLICT if the manufacturer already has a key.
 * This prevents accidental overwrite of a key that may already have signed packs.
 *
 * Request:  { "manufacturerId": "MFR_CIPLA_001" }
 * Response: { "status": "success", "publicKeyPem": "-----BEGIN PUBLIC KEY-----..." }
 */
export const generateKeyController = async (req, res) => {
    try {
        const { manufacturerId } = req.body;

        if (!manufacturerId) {
            return res.status(400).json({
                code:    'MISSING_FIELDS',
                message: 'manufacturerId is required',
            });
        }

        // ── Idempotency guard: prevent overwriting an active signing key ──────
        // If a key is overwritten after packs have been minted, all existing QR
        // codes will fail signature verification — catastrophic for the supply chain.
        const keystore = await readKeystore();
        if (keystore[manufacturerId]) {
            return res.status(409).json({
                code:    'KEY_EXISTS',
                message: `An EC signing key already exists for manufacturer: ${manufacturerId}. ` +
                         `Overwriting keys with active pack inventory is not permitted.`,
                data: {
                    manufacturerId,
                    keyId:     keystore[manufacturerId].keyId,
                    createdAt: keystore[manufacturerId].createdAt,
                },
            });
        }

        // ── Generate EC P-256 keypair and store encrypted in keystore ─────────
        const { publicKeyPem, keyId } = await generateManufacturerKey(manufacturerId);

        return res.status(201).json({
            status:         'success',
            publicKeyPem,
            keyId,
            manufacturerId,
        });
    } catch (error) {
        console.error('[pharma-core Keys] generateKeyController error:', error.message);
        return res.status(500).json({ code: 'KEY_GENERATION_ERROR', message: error.message });
    }
};

/**
 * GET /core/keys/public/:mfrId
 *
 * Returns the stored public key PEM for a manufacturer.
 * Used by manufacturer-service to cache the public key after KYC approval.
 *
 * Response: { "status": "success", "manufacturerId", "publicKeyPem", "keyId" }
 */
export const getPublicKeyController = async (req, res) => {
    try {
        const { mfrId } = req.params;

        if (!mfrId) {
            return res.status(400).json({ code: 'MISSING_FIELDS', message: 'mfrId path parameter is required' });
        }

        const keystore = await readKeystore();
        const entry    = keystore[mfrId];

        if (!entry) {
            return res.status(404).json({
                code:    'KEY_NOT_FOUND',
                message: `No EC signing key found for manufacturer: ${mfrId}`,
                data:    { manufacturerId: mfrId },
            });
        }

        return res.status(200).json({
            status:         'success',
            manufacturerId: mfrId,
            publicKeyPem:   entry.publicKeyPem,
            keyId:          entry.keyId,
            algorithm:      entry.algorithm,
            createdAt:      entry.createdAt,
        });
    } catch (error) {
        console.error('[pharma-core Keys] getPublicKeyController error:', error.message);
        return res.status(500).json({ code: 'KEY_FETCH_ERROR', message: error.message });
    }
};

/**
 * GET /core/keys/stats
 * Returns aggregate metrics about stored cryptographic keys.
 */
export const getKeyStatsController = async (req, res) => {
    try {
        const keystore = await readKeystore();
        const mfrIds = Object.keys(keystore);
        return res.status(200).json({
            status: 'success',
            totalKeys: mfrIds.length,
            manufacturersCount: mfrIds.length,
            keyIds: mfrIds.map(id => keystore[id].keyId),
        });
    } catch (error) {
        console.error('[pharma-core Keys] getKeyStatsController error:', error.message);
        return res.status(500).json({ code: 'KEY_STATS_ERROR', message: error.message });
    }
};

