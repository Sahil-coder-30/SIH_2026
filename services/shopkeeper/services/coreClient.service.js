import axios from 'axios';

// ── Constants ─────────────────────────────────────────────────────────────────
const PHARMA_CORE_URL = process.env.PHARMA_CORE_URL || 'http://pharma-core-service:80';
const SERVICE_TOKEN   = process.env.SERVICE_TOKEN   || 'pharma-cluster-internal-secret-token-change-in-prod';

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
 * Tries the new route first (/core/verify), falls back to legacy (/core/hash/verify).
 * @param {string} signedToken - Raw QR token string.
 * @param {string} [authToken]
 * @returns {Promise<{ valid: boolean, payload?: Object, packHash?: string, error?: string }>}
 */
export const verifyToken = async (signedToken, authToken) => {
    const client = getCoreClient(authToken);
    try {
        const response = await client.post('/core/verify', { signedToken });
        console.log(`[shopkeeper-service CoreClient] Token verified via /core/verify — valid: ${response.data.valid}`);
        return response.data;
    } catch (primaryErr) {
        // Fallback to legacy route
        try {
            const response = await client.post('/core/hash/verify', { signedToken });
            console.log(`[shopkeeper-service CoreClient] Token verified via /core/hash/verify (fallback) — valid: ${response.data.valid}`);
            return response.data;
        } catch (fallbackErr) {
            console.error(`[shopkeeper-service CoreClient] Both /core/verify and /core/hash/verify failed`);
            throw primaryErr;
        }
    }
};

/**
 * Reads the current chain-of-custody state for a pack from the Fabric ledger.
 * Tries the new route first (/core/ledger/pack/:packId), falls back to legacy.
 * @param {string} packHash
 * @param {string} [batchId]
 * @param {string} [authToken]
 * @returns {Promise<Object>} { status: 'MINTED'|'AT_SHOP'|'SOLD'|'RECALLED'|'NOT_FOUND' }
 */
export const getPackStatus = async (packHash, batchId, authToken) => {
    const client = getCoreClient(authToken);
    try {
        const response = await client.get(`/core/ledger/pack/${packHash}`);
        return response.data;
    } catch {
        // Fallback to legacy route
        const response = await client.get(`/core/hash/status/${packHash}`, { params: { batchId } });
        return response.data;
    }
};

/**
 * Submits a state transition to the Fabric ledger via pharma-core.
 * Tries the new route first (/core/ledger/transition), falls back to specific legacy routes.
 * @param {Object} params - { packHash, fromState, toState, actor, shopId, operatorId, manufacturerId }
 * @returns {Promise<Object>}
 */
export const submitTransition = async ({ packHash, fromState, toState, actor, shopId, operatorId, manufacturerId, authToken }) => {
    const client = getCoreClient(authToken);
    try {
        const response = await client.post('/core/ledger/transition', {
            packId:    packHash,
            fromState,
            toState,
            actor:     actor || operatorId || shopId,
            shopId,
            operatorId,
            manufacturerId,
        });
        console.log(`[shopkeeper-service CoreClient] Transition ${fromState} → ${toState} recorded for pack: ${packHash}`);
        return response.data;
    } catch (err) {
        console.warn(`[shopkeeper-service CoreClient] /core/ledger/transition failed: ${err.message}, trying legacy routes`);
        throw err;
    }
};

/**
 * Records an INTAKE transition on Fabric via pharma-core.
 * @param {Object} params - { packHash, shopId, operatorId, manufacturerId, authToken }
 * @returns {Promise<Object>}
 */
export const recordIntake = async ({ packHash, shopId, operatorId, manufacturerId, authToken }) => {
    try {
        return await submitTransition({
            packHash,
            fromState: 'MINTED',
            toState:   'AT_SHOP',
            shopId,
            operatorId,
            manufacturerId,
            authToken,
        });
    } catch {
        // Fallback to legacy specific route
        const response = await getCoreClient(authToken).post('/core/chain/intake', {
            packHash, shopId, operatorId, manufacturerId,
        });
        console.log(`[shopkeeper-service CoreClient] Intake recorded (legacy) for packHash: ${packHash}`);
        return response.data;
    }
};

/**
 * Records a SALE transition on Fabric via pharma-core.
 * @param {Object} params - { packHash, shopId, operatorId, authToken }
 * @returns {Promise<Object>}
 */
export const recordSale = async ({ packHash, shopId, operatorId, authToken }) => {
    try {
        return await submitTransition({
            packHash,
            fromState: 'AT_SHOP',
            toState:   'SOLD',
            shopId,
            operatorId,
            authToken,
        });
    } catch {
        const response = await getCoreClient(authToken).post('/core/chain/sale', {
            packHash, shopId, operatorId,
        });
        console.log(`[shopkeeper-service CoreClient] Sale recorded (legacy) for packHash: ${packHash}`);
        return response.data;
    }
};

/**
 * Records a RETURN transition on Fabric via pharma-core.
 * @param {Object} params - { packHash, shopId, operatorId, reason, authToken }
 * @returns {Promise<Object>}
 */
export const recordReturn = async ({ packHash, shopId, operatorId, reason, authToken }) => {
    const response = await getCoreClient(authToken).post('/core/chain/return', {
        packHash, shopId, operatorId, reason,
    });
    console.log(`[shopkeeper-service CoreClient] Return recorded for packHash: ${packHash}`);
    return response.data;
};

/**
 * Fetches full medicine info for a packId (for transaction endpoints).
 * @param {string} packId
 * @param {string} [authToken]
 * @returns {Promise<Object>}
 */
export const verifyPackId = async (packId, authToken) => {
    const response = await getCoreClient(authToken).post('/core/verify/packId', { packId });
    return response.data;
};

/**
 * Fetches full pack info from pharma-core.
 * @param {string} packId
 * @param {string} [authToken]
 * @returns {Promise<Object>}
 */
export const getPackInfo = async (packId, authToken) => {
    const response = await getCoreClient(authToken).get(`/core/pack/${packId}`);
    return response.data;
};
