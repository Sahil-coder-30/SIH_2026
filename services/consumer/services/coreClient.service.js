import axios from 'axios';

// ── Constants ─────────────────────────────────────────────────────────────────
const PHARMA_CORE_URL = process.env.PHARMA_CORE_URL || 'http://pharma-core-service:80';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pre-configured axios instance with X-Service-Token for pharma-core.
 */
const coreClient = axios.create({
    baseURL: PHARMA_CORE_URL,
    headers: {
        'X-Service-Token': SERVICE_TOKEN,
        'Content-Type': 'application/json',
    },
    timeout: 10000,
});

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Tier-1: Verifies ES256 JWT signature and derives packHash.
 * @param {string} signedToken
 * @returns {Promise<Object>}
 */
export const verifyToken = async (signedToken) => {
    const response = await coreClient.post('/core/hash/verify', { signedToken });
    return response.data;
};

/**
 * Tier-2: Fetches live blockchain status for a pack.
 * @param {string} packHash
 * @param {string} batchId
 * @returns {Promise<Object>} { status: 'Sold'|'Recalled'|'AtShop'|'Packaged'|'NOT_FOUND' }
 */
export const getPackStatus = async (packHash, batchId) => {
    const response = await coreClient.get(`/core/hash/status/${packHash}`, {
        params: { batchId },
    });
    return response.data;
};
