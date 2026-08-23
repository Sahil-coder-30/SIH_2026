import axios from 'axios';

// ── Constants ─────────────────────────────────────────────────────────────────
const MANUFACTURER_SERVICE_URL = process.env.MANUFACTURER_SERVICE_URL || 'http://manufacturer-service:80';

// ── Helpers ───────────────────────────────────────────────────────────────────
const getManufacturerClient = () =>
    axios.create({
        baseURL: MANUFACTURER_SERVICE_URL,
        headers: { 'Content-Type': 'application/json' },
        timeout: 8000,
    });

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Fetches public batch metadata from manufacturer-service.
 * This is the one allowed cross-business-service call (no crypto, plain data).
 * @param {string} batchId - The systemBatchId (e.g. "PC-BATCH-CIPLA0-20260822-7D3A1F")
 * @returns {Promise<Object>} Batch metadata (medicineName, genericName, brandName, composition, dosage, storageConditions, etc.)
 */
export const getPublicBatchMetadata = async (batchId) => {
    try {
        const response = await getManufacturerClient().get(`/api/manufacturer/batch/public/${batchId}`);
        console.log(`[shopkeeper-service MfgClient] Fetched batch metadata for: ${batchId}`);
        return response.data?.data || response.data;
    } catch (err) {
        console.warn(`[shopkeeper-service MfgClient] Failed to fetch batch metadata for ${batchId}: ${err.message}`);
        return null;
    }
};
