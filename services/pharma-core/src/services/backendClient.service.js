import axios from 'axios';
import { signCoreJwt } from './crypto.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const PHARMA_BACKEND_URL = process.env.PHARMA_BACKEND_URL || 'http://pharma-backend-service:80';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates an axios instance pre-configured for pharma-backend-service.
 * A fresh RS256 JWT is signed on every call (tokens are short-lived, 5 min TTL).
 * pharma-backend validates the JWT using pharma-core's RSA public key from JWKS.
 *
 * Token flow:
 *   pharma-core (RS256 private key) → signs JWT
 *   pharma-backend (fetches JWKS from /.well-known/jwks.json) → verifies JWT
 *
 * @returns {import('axios').AxiosInstance}
 */
const createBackendClient = () => {
    const bearerJwt = signCoreJwt(); // Fresh RS256 signed token per request
    return axios.create({
        baseURL: PHARMA_BACKEND_URL,
        headers: {
            Authorization: `Bearer ${bearerJwt}`,
            'Content-Type': 'application/json',
        },
        timeout:          60_000,      // 60s — large Fabric batch commits can take time
        maxBodyLength:    Infinity,    // Avoid axios body size cap on chunk payloads
        maxContentLength: Infinity,
    });
};

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Submits a single blockchain transition to pharma-backend-service.
 * @param {Object} transition - { hash, fromId, toId, sellingDate, sellingTime, sellerId }
 * @returns {Promise<Object>} Response data from pharma-backend.
 */
export const submitTransition = async (transition) => {
    const response = await createBackendClient().post('/api/transition', transition);
    console.log(`[pharma-core BackendClient] Transition submitted for hash: ${transition.hash}`);
    return response.data;
};

/**
 * Submits a batch of transitions in one Fabric transaction.
 *
 * ⚠️  CRITICAL FIX (BLOCKCHAIN_TEAM_PLAN Task 2):
 *   Backend RecordBatchRequest.java expects: { "batchId": "...", "transitions": [...] }
 *   The old code sent a bare array → HttpMessageNotReadableException → 500 on every call.
 *   This wrapper object is the agreed shape.
 *
 * @param {string}        batchId     - System batch ID (PC-BATCH-…)
 * @param {Array<Object>} transitions - Array of transition objects.
 * @returns {Promise<Object>}
 */
export const submitTransitionBatch = async (batchId, transitions) => {
    // Wrap in the agreed shape — backend owns the deserialization
    const payload = { batchId, transitions };
    const response = await createBackendClient().post('/api/transition/batch', payload);
    console.log(`[pharma-core BackendClient] Batch of ${transitions.length} transitions submitted for ${batchId}`);
    return response.data;
};

/**
 * Submits a batch recall to pharma-backend-service.
 *
 * ⚠️  CRITICAL FIX (BLOCKCHAIN_TEAM_PLAN Task 3):
 *   Backend RecallRequest.java expects:
 *     { systemBatchId, actorId, reason, recallDate, recallTime }
 *   Old code sent: { batchId, fromId } → two null fields → NPE → 500 on every call.
 *
 * @param {Object} params - { systemBatchId, actorId, reason }
 * @returns {Promise<Object>}
 */
export const submitRecall = async ({ systemBatchId, actorId, reason }) => {
    const now         = new Date();
    const recallDate  = now.toISOString().split('T')[0];            // YYYY-MM-DD
    const recallTime  = now.toTimeString().split(' ')[0];           // HH:MM:SS

    const payload = { systemBatchId, actorId, reason, recallDate, recallTime };

    const response = await createBackendClient().post('/api/transition/recall', payload);
    console.log(`[pharma-core BackendClient] Recall submitted for batch: ${systemBatchId}`);
    return response.data;
};

/**
 * Fetches the live pack status from pharma-backend-service (Hyperledger Fabric world state).
 * Status lookup is a read operation — still requires auth per Spring Security config.
 * @param {string} packHash
 * @param {string} [batchId]
 * @returns {Promise<Object>} { status: 'Sold'|'Recalled'|'AtShop'|'Packaged'|'NOT_FOUND', detail: {} }
 */
export const getPackStatus = async (packHash, batchId) => {
    try {
        const response = await createBackendClient().get('/api/transition/status', {
            params: { packHash, batchId },
        });
        return response.data;
    } catch (err) {
        // If Fabric is unreachable (ECONNREFUSED) or pack doesn't exist (404/400),
        // return NOT_FOUND gracefully rather than failing Tier-1 verification.
        console.warn(`[pharma-core BackendClient] getPackStatus notice: ${err.message}`);
        return { status: 'NOT_FOUND', fabricAvailable: false };
    }

};

/**
 * Submits a large batch of transitions to pharma-backend-service in fixed-size chunks.
 *
 * Why chunking?
 *   - Each chunk maps to one Fabric block commit (clean boundary).
 *   - Smaller payloads reduce HTTP timeout risk (~50KB vs ~200KB for 1000 packs).
 *   - The chaincode `recordTransitionBatch` is idempotent — safe to retry any chunk.
 *
 * @param {string}        batchId     - System batch ID passed to backend wrapper.
 * @param {Array<Object>} transitions - Full array of transition objects.
 * @param {number}        chunkSize   - Max transitions per HTTP request (default 250).
 * @returns {Promise<string[]>}         Flat array of all recorded hashes across chunks.
 */
export const submitTransitionBatchChunked = async (batchId, transitions, chunkSize = 250) => {
    const totalChunks = Math.ceil(transitions.length / chunkSize);
    const allRecorded = [];

    for (let i = 0; i < transitions.length; i += chunkSize) {
        const chunk    = transitions.slice(i, i + chunkSize);
        const chunkNum = Math.floor(i / chunkSize) + 1;

        console.log(
            `[pharma-core BackendClient] Submitting chunk ${chunkNum}/${totalChunks}` +
            ` (${chunk.length} transitions, offset ${i})`,
        );

        // Pass batchId through to the wrapped payload
        const result = await submitTransitionBatch(batchId, chunk);

        // pharma-backend returns: { totalProcessed, committedCount, failedCount, recordedHashes }
        // Handle both array response and object response gracefully.
        if (Array.isArray(result)) {
            allRecorded.push(...result);
        } else if (Array.isArray(result?.recordedHashes)) {
            allRecorded.push(...result.recordedHashes);
        }

        console.log(
            `[pharma-core BackendClient] Chunk ${chunkNum}/${totalChunks} committed ✅` +
            ` (${result?.committedCount ?? '?'} committed, ${result?.failedCount ?? '?'} failed)`,
        );
    }

    console.log(
        `[pharma-core BackendClient] All ${totalChunks} chunk(s) submitted — ` +
        `${allRecorded.length}/${transitions.length} transitions recorded on Fabric`,
    );

    return allRecorded;
};
