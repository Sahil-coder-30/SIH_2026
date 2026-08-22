import { mintPacksBatch } from '../services/crypto.service.js';
import { submitTransitionBatchChunked } from '../services/backendClient.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_QUANTITY   = 100_000;
const MIN_QUANTITY   = 1;

/**
 * POST /core/batch/mint
 *
 * Mints a pharmaceutical batch: signs N JWTs (ES256), derives N pack hashes,
 * constructs N MFG transitions, and submits them to pharma-backend in chunks.
 *
 * Performance characteristics:
 *   - Private key is decrypted ONCE (1 scrypt call, ~100-150ms), regardless of N.
 *   - All N JWTs are signed in-memory (~0.1ms/pack).
 *   - Transitions are submitted to pharma-backend in chunks of BATCH_CHUNK_SIZE
 *     (default 250), each resulting in one Fabric block commit.
 *
 * Request body:
 *   { batchId: string, manufacturerId: string, expiryDate: string, quantity: number }
 *
 * Response:
 *   { status, batchId, totalPacks, packs: [{serial, packHash, signedToken}],
 *     backendSubmitted, partialBlockchainSubmit, mintedAt }
 */
export const mintBatchController = async (req, res) => {
    try {
        const { batchId, manufacturerId, expiryDate, quantity } = req.body;

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
            `[pharma-core Batch] mintBatch start — batchId: ${batchId}, ` +
            `manufacturerId: ${manufacturerId}, quantity: ${qty}`,
        );

        const mintStart = Date.now();

        // ── Optimized bulk signing (1 scrypt + N EC signs) ───────────────────
        // mintPacksBatch decrypts the manufacturer's EC private key exactly ONCE,
        // then signs all packs in a tight in-memory loop. See crypto.service.js.
        const { packs, transitions } = await mintPacksBatch(
            batchId,
            manufacturerId,
            expiryDate,
            qty,
        );

        const signMs = Date.now() - mintStart;
        console.log(`[pharma-core Batch] Signed ${packs.length} packs in ${signMs}ms`);

        // ── Chunked blockchain submission ─────────────────────────────────────
        // Submit transitions to pharma-backend in chunks of BATCH_CHUNK_SIZE.
        // Each chunk becomes one Fabric block (idempotent — safe to retry).
        // A failure in any chunk is non-fatal: we return packs and flag partial state.
        const chunkSize         = parseInt(process.env.BATCH_CHUNK_SIZE || '250', 10);
        let   backendSubmitted  = false;
        let   partialSubmit     = false;
        let   recordedHashes    = [];

        try {
            recordedHashes   = await submitTransitionBatchChunked(transitions, chunkSize);
            backendSubmitted = true;
            console.log(
                `[pharma-core Batch] Blockchain submission complete — ` +
                `${recordedHashes.length}/${transitions.length} transitions recorded`,
            );
        } catch (backendErr) {
            partialSubmit = true;
            console.warn(
                `[pharma-core Batch] ⚠️  Blockchain submission partially failed: ${backendErr.message}. ` +
                `Packs are signed and returned — manufacturer-service can retry missing transitions.`,
            );
        }

        const totalMs = Date.now() - mintStart;
        console.log(`[pharma-core Batch] mintBatch complete for ${batchId} in ${totalMs}ms`);

        return res.status(200).json({
            status:                 'success',
            batchId,
            totalPacks:             packs.length,
            packs,
            backendSubmitted,
            partialBlockchainSubmit: partialSubmit,
            blockchainRecorded:     recordedHashes.length,
            mintedAt:               new Date().toISOString(),
            timingMs: {
                signing:    signMs,
                total:      totalMs,
            },
        });
    } catch (error) {
        console.error('[pharma-core Batch] mintBatchController error:', error.message);

        // Distinguish key-not-found from generic server errors
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
