import axios from 'axios';

// ── Constants ─────────────────────────────────────────────────────────────────
const PHARMA_CORE_URL = process.env.PHARMA_CORE_URL || 'http://pharma-core-service:80';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'pharma-cluster-internal-secret-token-change-in-prod';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates an axios instance with Bearer JWT / Service Token headers for pharma-core.
 * @param {string} [authToken]
 */
const getCoreClient = (authToken) =>
    axios.create({
        baseURL: PHARMA_CORE_URL,
        headers: {
            Authorization: authToken ? `Bearer ${authToken}` : `Bearer ${SERVICE_TOKEN}`,
            'X-Service-Token': SERVICE_TOKEN,
            'Content-Type': 'application/json',
        },
        timeout: 10000,
    });

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Verifies an ES256 signed JWT and derives its packHash.
 * @param {string} signedToken - Raw QR token string.
 * @param {string} [authToken]
 * @returns {Promise<{ valid: boolean, payload?: Object, packHash?: string, error?: string }>}
 */
export const verifyToken = async (signedToken, authToken) => {
    const response = await getCoreClient(authToken).post('/core/hash/verify', { signedToken });
    console.log(`[shopkeeper-service CoreClient] Token verification complete — valid: ${response.data.valid}`);
    return response.data;
};

/**
 * Fetches the live blockchain status for a pack.
 * @param {string} packHash
 * @param {string} batchId
 * @param {string} [authToken]
 * @returns {Promise<Object>} { status: 'Sold'|'Recalled'|'AtShop'|'Packaged'|'NOT_FOUND' }
 */
export const getPackStatus = async (packHash, batchId, authToken) => {
    const response = await getCoreClient(authToken).get(`/core/hash/status/${packHash}`, {
        params: { batchId },
    });
    return response.data;
};

/**
 * Fetches full medicine info for a packId (for scan-by-packId flows).
 * @param {string} packId
 * @param {string} [authToken]
 * @returns {Promise<Object>}
 */
export const getPackInfo = async (packId, authToken) => {
    const response = await getCoreClient(authToken).get(`/core/pack/${packId}`);
    return response.data;
};

/**
 * Records an INTAKE transition on Fabric via pharma-core.
 * @param {Object} params - { packHash, shopId, operatorId, manufacturerId, authToken }
 * @returns {Promise<Object>}
 */
export const recordIntake = async ({ packHash, shopId, operatorId, manufacturerId, authToken }) => {
    const response = await getCoreClient(authToken).post('/core/chain/intake', {
        packHash,
        shopId,
        operatorId,
        manufacturerId,
    });
    console.log(`[shopkeeper-service CoreClient] Intake recorded for packHash: ${packHash}`);
    return response.data;
};

/**
 * Records a SALE transition on Fabric via pharma-core.
 * @param {Object} params - { packHash, shopId, operatorId, authToken }
 * @returns {Promise<Object>}
 */
export const recordSale = async ({ packHash, shopId, operatorId, authToken }) => {
    const response = await getCoreClient(authToken).post('/core/chain/sale', { packHash, shopId, operatorId });
    console.log(`[shopkeeper-service CoreClient] Sale recorded for packHash: ${packHash}`);
    return response.data;
};

/**
 * Records a RETURN transition on Fabric via pharma-core.
 * @param {Object} params - { packHash, shopId, operatorId, reason, authToken }
 * @returns {Promise<Object>}
 */
export const recordReturn = async ({ packHash, shopId, operatorId, reason, authToken }) => {
    const response = await getCoreClient(authToken).post('/core/chain/return', {
        packHash,
        shopId,
        operatorId,
        reason,
    });
    console.log(`[shopkeeper-service CoreClient] Return recorded for packHash: ${packHash}`);
    return response.data;
};

/**
 * Performs a lightweight medicine verification by packId (for transaction endpoints).
 * Returns medicine metadata + blockchain status without requiring a signed JWT.
 * @param {string} packId
 * @param {string} [authToken]
 * @returns {Promise<Object>}
 */
export const verifyPackId = async (packId, authToken) => {
    const response = await getCoreClient(authToken).post('/core/verify/packId', { packId });
    return response.data;
};
