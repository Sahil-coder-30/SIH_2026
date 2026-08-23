import { mintAndUploadBatch } from '../services/crypto.service.js';
import { submitTransitionBatchChunked } from '../services/backendClient.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_QUANTITY = 100_000;
const MIN_QUANTITY = 1;

/**
 * POST /core/batch/mint
 *
 * S3 Pipeline Mint Controller.
 *
 * Signs N pharmaceutical pack JWTs (ES256), builds a CSV, uploads it to AWS S3
 * (or local fallback in dev mode), commits MINTED transitions to Hyperledger Fabric,
 * and returns a lightweight JSON response containing only the S3 download URL.
 *
 * KEY CHANGE from old architecture:
 *   ❌ OLD: returned { packs: [ 100k objects ] } — 50MB HTTP payload to manufacturer-service
 *   ✅ NEW: returns { s3DownloadUrl, s3FileKey, totalPacks } — ~200 byte payload
 *
 * Performance characteristics (100k packs):
 *   - Private key decrypted ONCE (1 scrypt, ~150ms)
 *   - All JWTs signed in memory (~10s for 100k at ~0.1ms/pack)
 *   - CSV built in one pass (~500ms for 100k rows)
 *   - S3 multipart upload (~5-15s depending on network)
 *   - Total: ~20-30s  (vs ~4.1 hours naive per-pack approach)
 *
 * Request body:
 *   {
 *     batchId:        string,   // PharmaChain system batch ID (e.g. "PC-BATCH-CIPLA0-...")
 *     manufacturerId: string,   // Must have a stored EC key in keystore
 *     expiryDate:     string,   // ISO date (e.g. "2028-01-14")
 *     quantity:       number,   // 1 – 100,000
 *     medicineName:   string    // Used in CSV metadata (e.g. "Amoxicillin 625mg")
 *   }
 *
 * Response (success):
 *   {
 *     status:                  "success",
 *     batchId:                 string,
 *     totalPacks:              number,
 *     s3FileKey:               string,    // S3 object key, e.g. "batches/PC-BATCH-....csv"
 *     s3DownloadUrl:           string,    // Pre-signed URL (AWS) or http://localhost:4000/core/export/... (dev)
 *     s3UrlExpiresAt:          string,    // ISO timestamp when URL expires (null for local mode)
 *     s3Mode:                  "aws"|"local",
 *     backendSubmitted:        boolean,
 *     partialBlockchainSubmit: boolean,
 *     blockchainRecorded:      number,
 *     mintedAt:                string,
 *     timingMs:                { signing, upload, total }
 *   }
 */
export const mintBatchController = async (req, res) => {
    try {
        const { batchId, manufacturerId, expiryDate, quantity, medicineName } = req.body;

        // ── Input validation ─────────────────────────────────────────────────
        if (!batchId || !manufacturerId || !expiryDate || quantity == null) {
            return res.status(400).json({
                code:    'MISSING_FIELDS',
                message: 'batchId, manufacturerId, expiryDate, and quantity are required',
            });
        }

        const qty = parseInt(quantity, 10);

        if (isNaN(qty) || qty < MIN_QUANTITY) {
            return res.status(400).json({
                code:    'INVALID_QUANTITY',
                message: `quantity must be a positive integer (minimum ${MIN_QUANTITY})`,
            });
        }

        if (qty > MAX_QUANTITY) {
            return res.status(400).json({
                code:    'QUANTITY_EXCEEDED',
                message: `quantity must be ≤ ${MAX_QUANTITY.toLocaleString()}`,
            });
        }

        console.log(
            `[pharma-core Batch] mintBatch (S3 pipeline) start — batchId: ${batchId}, ` +
            `manufacturerId: ${manufacturerId}, quantity: ${qty}, ` +
            `medicineName: "${medicineName || 'N/A'}"`,
        );

        // ── Orchestrated mint + upload ────────────────────────────────────────
        // mintAndUploadBatch handles: 1 scrypt decrypt → N EC signs → CSV build → S3 upload → Fabric submit
        // submitTransitionBatchChunked is injected so it can be mocked in tests
        const result = await mintAndUploadBatch(
            batchId,
            manufacturerId,
            expiryDate,
            qty,
            medicineName || '',
            submitTransitionBatchChunked, // injected blockchain submit function
        );

        return res.status(200).json(result);

    } catch (error) {
        console.error('[pharma-core Batch] mintBatchController error:', error.message);

        if (error.message.includes('No key found for manufacturer')) {
            return res.status(404).json({
                code:    'KEY_NOT_FOUND',
                message: `No EC signing key found for manufacturer: ${req.body?.manufacturerId}. ` +
                         `Ensure key generation was completed via POST /core/keys/generate.`,
            });
        }

        return res.status(500).json({ code: 'MINT_ERROR', message: error.message });
    }
};
