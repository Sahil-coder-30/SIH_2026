import axios from 'axios';

// ── Constants ─────────────────────────────────────────────────────────────────
const PHARMA_CORE_URL = process.env.PHARMA_CORE_URL || 'http://pharma-core-service:80';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'pharma-cluster-internal-secret-token-change-in-prod';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates an axios instance with Bearer JWT / Service Token headers for pharma-core.
 * Configured with generous timeouts and body limits for bulk operations (up to 1 lakh packs).
 * @param {string} [authToken] - Optional user session JWT
 */
const getCoreClient = (authToken) =>
    axios.create({
        baseURL: PHARMA_CORE_URL,
        headers: {
            Authorization: authToken ? `Bearer ${authToken}` : `Bearer ${SERVICE_TOKEN}`,
            'X-Service-Token': SERVICE_TOKEN,
            'Content-Type': 'application/json',
        },
        timeout:          180_000,   // 3 minutes — allows pharma-core to sign 1 lakh packs + chunked fabric submit
        maxContentLength: Infinity,  // Accommodate large response payloads (100k pack objects)
        maxBodyLength:    Infinity,
    });

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Generates an EC P-256 keypair for a manufacturer via pharma-core.
 * @param {string} manufacturerId
 * @param {string} [authToken]
 * @returns {Promise<{ publicKeyPem: string, keyId: string }>}
 */
export const generateKeyForManufacturer = async (manufacturerId, authToken) => {
    const response = await getCoreClient(authToken).post('/core/keys/generate', { manufacturerId });
    console.log(`[manufacturer-service CoreClient] Key generated for ${manufacturerId}`);
    return response.data;
};

/**
 * Requests pharma-core to mint all packs in a batch (sign JWTs + register on Fabric).
 * @param {Object} params - { batchId, manufacturerId, expiryDate, quantity, authToken }
 * @returns {Promise<{ batchId: string, packs: Array<{ serial, packHash, signedToken }>, totalPacks: number, backendSubmitted: boolean, partialBlockchainSubmit: boolean }>}
 */
export const mintBatchViaPharmaCore = async ({ batchId, manufacturerId, expiryDate, quantity, authToken }) => {
    const response = await getCoreClient(authToken).post('/core/batch/mint', {
        batchId,
        manufacturerId,
        expiryDate,
        quantity,
    });
    console.log(`[manufacturer-service CoreClient] Batch ${batchId} minted — ${quantity} packs signed by pharma-core`);
    return response.data;
};

/**
 * Initiates a batch recall through pharma-core.
 * @param {Object} params - { batchId, manufacturerId, reason, authToken }
 * @returns {Promise<Object>}
 */
export const recallBatchViaPharmaCore = async ({ batchId, manufacturerId, reason, authToken }) => {
    const response = await getCoreClient(authToken).post('/core/chain/recall', { batchId, manufacturerId, reason });
    console.log(`[manufacturer-service CoreClient] Recall initiated for batch ${batchId}`);
    return response.data;
};
