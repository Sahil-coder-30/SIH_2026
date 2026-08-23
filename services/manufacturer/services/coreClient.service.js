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
        // S3 Pipeline: pharma-core no longer returns 100k pack objects.
        // Response is now a ~200-byte JSON with s3DownloadUrl + s3FileKey.
        // Timeout is kept generous (3 min) to cover signing (10-20s) + S3 upload (10-30s) + Fabric submit.
        timeout:          180_000,
        maxContentLength: Infinity,
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
 * Requests pharma-core to mint all packs in a batch via the S3 pipeline.
 *
 * pharma-core will:
 *   1. Sign N JWTs in memory (1 scrypt + N EC signs)
 *   2. Build the signed CSV in one pass
 *   3. Upload CSV to AWS S3 (or local fallback in dev)
 *   4. Generate a pre-signed download URL
 *   5. Submit MINTED transitions to Hyperledger Fabric
 *
 * @param {Object} params - { batchId, manufacturerId, expiryDate, quantity, medicineName, authToken }
 * @returns {Promise<{
 *   status:                  'success',
 *   batchId:                 string,
 *   totalPacks:              number,
 *   s3FileKey:               string,
 *   s3DownloadUrl:           string,
 *   s3UrlExpiresAt:          string|null,
 *   s3Mode:                  'aws'|'local',
 *   backendSubmitted:        boolean,
 *   partialBlockchainSubmit: boolean,
 *   blockchainRecorded:      number,
 *   mintedAt:                string,
 *   timingMs:                { signing: number, upload: number, total: number }
 * }>}
 */
export const mintBatchViaPharmaCore = async ({ batchId, manufacturerId, expiryDate, quantity, medicineName, authToken }) => {
    const response = await getCoreClient(authToken).post('/core/batch/mint', {
        batchId,
        manufacturerId,
        expiryDate,
        quantity,
        medicineName: medicineName || '',   // Used for CSV metadata in pharma-core
    });
    console.log(
        `[manufacturer-service CoreClient] pharma-core S3 mint complete for ${batchId}` +
        ` — ${response.data.totalPacks} packs | mode: ${response.data.s3Mode}`,
    );
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

/**
 * Fetches paginated, searchable pack preview data from pharma-core's CSV preview API.
 * pharma-core reads the CSV (local disk or S3), parses it, and returns structured JSON.
 *
 * This is the data source for the manufacturer dashboard's "Batch Preview" page —
 * the table that shows all signed packs after minting is complete.
 *
 * @param {Object} params
 * @param {string}      params.batchId    - PharmaChain system batch ID
 * @param {string|null} params.s3FileKey  - S3 object key (from Batch.s3FileKey), null in local mode
 * @param {number}      params.page       - Page number (1-indexed)
 * @param {number}      params.limit      - Items per page (max 200)
 * @param {string}      params.search     - Optional search term (serial, hash prefix, or medicine name)
 * @param {string}      [params.authToken]
 * @returns {Promise<{
 *   status:  'success',
 *   batchId: string,
 *   s3Mode:  'aws'|'local',
 *   stats:   { totalPacks: number, filteredPacks: number, csvSizeBytes: number },
 *   meta:    { page: number, limit: number, pages: number, total: number },
 *   packs:   Array<{ serialNumber, packHash, signedToken, verifyUrl, medicineName, expiryDate, qrPreviewUrl }>
 * }>}
 */
export const fetchBatchPreviewViaPharmaCore = async ({
    batchId,
    s3FileKey,
    page    = 1,
    limit   = 50,
    search  = '',
    authToken,
}) => {
    const response = await getCoreClient(authToken).get(
        `/core/export/${encodeURIComponent(batchId)}/preview`,
        {
            params: {
                page,
                limit,
                search: search || undefined,
                s3FileKey: s3FileKey || undefined,
            },
            // CSV for 100k packs is ~60MB uncompressed — give it time to load + parse
            timeout: 60_000,
        },
    );
    console.log(
        `[manufacturer-service CoreClient] Preview fetched for ${batchId}` +
        ` | page ${page} | ${response.data.stats?.totalPacks} total packs`,
    );
    return response.data;
};

