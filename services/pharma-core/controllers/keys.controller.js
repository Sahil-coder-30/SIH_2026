import { generateManufacturerKey } from '../services/crypto.service.js';
import { readKeystore } from '../config/keystore.js';

// ── Controllers ───────────────────────────────────────────────────────────────

export const generateKeyController = async (req, res) => {
    try {
        const { manufacturerId } = req.body;

        if (!manufacturerId) {
            return res.status(400).json({ status: 'error', message: 'manufacturerId is required' });
        }

        // ── Check for existing key ────────────────────────────────────────────
        const keystore = await readKeystore();
        if (keystore[manufacturerId]) {
            return res.status(409).json({
                status: 'error',
                message: `Key already exists for manufacturer: ${manufacturerId}`,
            });
        }

        const { publicKeyPem, keyId } = await generateManufacturerKey(manufacturerId);

        return res.status(201).json({
            status: 'success',
            publicKeyPem,
            keyId,
        });
    } catch (error) {
        console.error('[pharma-core Keys] generateKeyController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const getPublicKeyController = async (req, res) => {
    try {
        const { mfrId } = req.params;

        const keystore = await readKeystore();
        const entry = keystore[mfrId];

        if (!entry) {
            return res.status(404).json({
                status: 'error',
                message: `No key found for manufacturer: ${mfrId}`,
            });
        }

        return res.status(200).json({
            status: 'success',
            manufacturerId: mfrId,
            publicKeyPem: entry.publicKeyPem,
            keyId: entry.keyId,
        });
    } catch (error) {
        console.error('[pharma-core Keys] getPublicKeyController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
