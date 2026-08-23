import axios from 'axios';

// ── Constants ─────────────────────────────────────────────────────────────────
const PHARMA_CORE_URL = process.env.PHARMA_CORE_URL || 'http://pharma-core-service:80';
const SERVICE_TOKEN   = process.env.SERVICE_TOKEN   || '1d230ff87628d00c450d7bb7f5f5245ad30ad7d1b57be42253e66de27738d11a7351a2a4a7dbc451fb1445e658f382c9';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates an axios instance with X-Service-Token header for pharma-core.
 * @param {string} [authToken] - Optional bearer token for additional auth.
 */
const getCoreClient = (authToken) =>
    axios.create({
        baseURL: PHARMA_CORE_URL,
        headers: {
            Authorization:    authToken ? `Bearer ${authToken}` : `Bearer ${SERVICE_TOKEN}`,
            'X-Service-Token': SERVICE_TOKEN,
            'Content-Type':    'application/json',
        },
        timeout: 10000,
    });

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Verifies an ES256 signed JWT pack token via pharma-core.
 * @param {string} signedToken - Raw QR token string.
 * @param {string} [authToken]
 * @returns {Promise<{ valid: boolean, payload?: Object, packHash?: string, error?: string }>}
 */
export const verifyToken = async (signedToken, authToken) => {
    const client = getCoreClient(authToken);
    const response = await client.post('/core/hash/verify', { signedToken });
    return response.data;
};

/**
 * Reads the current chain-of-custody state for a pack from the Fabric ledger.
 * @param {string} packHash
 * @param {string} [batchId]
 * @param {string} [authToken]
 * @returns {Promise<Object>} { status: 'Sold'|'Recalled'|'AtShop'|'Packaged'|'NOT_FOUND' }
 */
export const getPackStatus = async (packHash, batchId, authToken) => {
    const client = getCoreClient(authToken);
    try {
        const response = await client.get(`/core/hash/status/${packHash}`, { params: { batchId } });
        return response.data;
    } catch (err) {
        console.warn(`[shopkeeper-service CoreClient] getPackStatus error (non-fatal): ${err.message}`);
        return { status: 'NOT_FOUND' };
    }
};

/**
 * Records an INTAKE transition on Fabric via pharma-core.
 * @param {Object} params - { packHash, shopId, operatorId, manufacturerId, authToken }
 * @returns {Promise<Object>}
 */
export const recordIntake = async ({ packHash, shopId, operatorId, manufacturerId, authToken }) => {
    try {
        const response = await getCoreClient(authToken).post('/core/chain/intake', {
            packHash,
            shopId,
            operatorId,
            manufacturerId,
        });
        console.log(`[shopkeeper-service CoreClient] Intake recorded on chain for packHash: ${packHash}`);
        return response.data;
    } catch (err) {
        console.warn(`[shopkeeper-service CoreClient] Fabric intake call deferred: ${err.message}`);
        return { recorded: false, error: err.message };
    }
};

/**
 * Records a SALE transition on Fabric via pharma-core.
 * @param {Object} params - { packHash, shopId, operatorId, authToken }
 * @returns {Promise<Object>}
 */
export const recordSale = async ({ packHash, shopId, operatorId, authToken }) => {
    try {
        const response = await getCoreClient(authToken).post('/core/chain/sale', {
            packHash,
            shopId,
            operatorId,
        });
        console.log(`[shopkeeper-service CoreClient] Sale recorded on chain for packHash: ${packHash}`);
        return response.data;
    } catch (err) {
        console.warn(`[shopkeeper-service CoreClient] Fabric sale call deferred: ${err.message}`);
        return { recorded: false, error: err.message };
    }
};

/**
 * Records a RETURN transition on Fabric via pharma-core.
 * @param {Object} params - { packHash, shopId, operatorId, reason, authToken }
 * @returns {Promise<Object>}
 */
export const recordReturn = async ({ packHash, shopId, operatorId, reason, authToken }) => {
    try {
        const response = await getCoreClient(authToken).post('/core/chain/return', {
            packHash,
            shopId,
            operatorId,
            reason,
        });
        console.log(`[shopkeeper-service CoreClient] Return recorded for packHash: ${packHash}`);
        return response.data;
    } catch (err) {
        console.warn(`[shopkeeper-service CoreClient] Return call deferred: ${err.message}`);
        return { recorded: false, error: err.message };
    }
};

/**
 * Fetches medicine info for a packId (used in transaction controllers).
 */
export const verifyPackId = async (packId, authToken) => {
    try {
        const client = getCoreClient(authToken);
        const response = await client.post('/core/hash/verify', { signedToken: packId });
        return response.data;
    } catch (err) {
        return { valid: false, error: err.message };
    }
};

/**
 * Fetches pack info from pharma-core.
 */
export const getPackInfo = async (packId, authToken) => {
    try {
        const client = getCoreClient(authToken);
        const response = await client.get(`/core/hash/status/${packId}`);
        return response.data;
    } catch (err) {
        return { status: 'NOT_FOUND' };
    }
};

