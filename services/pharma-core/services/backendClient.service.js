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
        timeout: 10000,
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
 * @param {Array<Object>} transitions - Array of transition objects.
 * @returns {Promise<Object>}
 */
export const submitTransitionBatch = async (transitions) => {
    const response = await createBackendClient().post('/api/transition/batch', transitions);
    console.log(`[pharma-core BackendClient] Batch of ${transitions.length} transitions submitted`);
    return response.data;
};

/**
 * Submits a batch recall to pharma-backend-service.
 * @param {Object} recallPayload - { batchId, fromId, reason, recallDate, recallTime }
 * @returns {Promise<Object>}
 */
export const submitRecall = async (recallPayload) => {
    const response = await createBackendClient().post('/api/transition/recall', recallPayload);
    console.log(`[pharma-core BackendClient] Recall submitted for batch: ${recallPayload.batchId}`);
    return response.data;
};

/**
 * Fetches the live pack status from pharma-backend-service (Hyperledger Fabric world state).
 * Status lookup is a read operation — still requires auth per Spring Security config.
 * @param {string} packHash
 * @param {string} batchId
 * @returns {Promise<Object>} { status: 'Sold'|'Recalled'|'AtShop'|'Packaged'|'NOT_FOUND', detail: {} }
 */
export const getPackStatus = async (packHash, batchId) => {
    const response = await createBackendClient().get('/api/transition/status', {
        params: { packHash, batchId },
    });
    return response.data;
};
