import { promises as fs } from 'fs';
import path from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────
const KEYSTORE_PATH = process.env.KEYSTORE_PATH || './data/keystore.json';

/**
 * Ensures the keystore file and its parent directory exist on startup.
 * Creates an empty keystore if the file does not yet exist.
 * Exits the process if the directory cannot be created.
 * @returns {Promise<void>}
 */
export const initKeystore = async () => {
    try {
        const dir = path.dirname(KEYSTORE_PATH);
        await fs.mkdir(dir, { recursive: true });

        try {
            await fs.access(KEYSTORE_PATH);
            console.log(`[pharma-core Keystore] Loaded existing keystore at ${KEYSTORE_PATH}`);
        } catch {
            // File does not exist — create empty keystore
            await fs.writeFile(KEYSTORE_PATH, JSON.stringify({}), 'utf-8');
            console.log(`[pharma-core Keystore] Created new empty keystore at ${KEYSTORE_PATH}`);
        }
    } catch (error) {
        console.error('[pharma-core Keystore] FATAL: Could not initialize keystore:', error.message);
        process.exit(1);
    }
};

/**
 * Reads and parses the keystore JSON file from disk.
 * @returns {Promise<Object>} The full keystore object.
 */
export const readKeystore = async () => {
    try {
        const raw = await fs.readFile(KEYSTORE_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (error) {
        console.error('[pharma-core Keystore] Read error:', error.message);
        throw new Error('Keystore read failed');
    }
};

/**
 * Writes a complete keystore object back to disk atomically.
 * @param {Object} keystoreData - The full keystore object to persist.
 * @returns {Promise<void>}
 */
export const writeKeystore = async (keystoreData) => {
    try {
        await fs.writeFile(KEYSTORE_PATH, JSON.stringify(keystoreData, null, 2), 'utf-8');
    } catch (error) {
        console.error('[pharma-core Keystore] Write error:', error.message);
        throw new Error('Keystore write failed');
    }
};
