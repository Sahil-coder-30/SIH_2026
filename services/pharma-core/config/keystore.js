import { promises as fs } from 'fs';
import path from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────
const KEYSTORE_PATH = process.env.KEYSTORE_PATH || './data/keystore.json';

// ── In-memory read cache ──────────────────────────────────────────────────────
// Eliminates repeated disk reads during batch minting (1000 reads → 1 read).
// Invalidated automatically on every successful write.
let _keystoreCache = null;

// ── Write mutex ───────────────────────────────────────────────────────────────
// Promise chain that serialises concurrent writeKeystore() calls.
// Prevents race conditions from corrupting keystore.json when multiple
// mint/generate requests arrive simultaneously (e.g., parallel KYC approvals).
// Note: this is an in-process lock — valid for single-replica K8s deployments (V1).
// Multi-replica deployments would need a distributed lock (PostgreSQL advisory / Redis).
let _writeLock = Promise.resolve();

const withWriteLock = (fn) => {
    _writeLock = _writeLock.then(fn).catch((err) => {
        // Re-throw so callers see the error; don't let the chain stay broken
        throw err;
    });
    return _writeLock;
};

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
            // Pre-warm the in-memory cache on startup to avoid the first read hitting disk
            const raw = await fs.readFile(KEYSTORE_PATH, 'utf-8');
            _keystoreCache = JSON.parse(raw);
            console.log(`[pharma-core Keystore] Loaded existing keystore at ${KEYSTORE_PATH} (${Object.keys(_keystoreCache).length} entries)`);
        } catch {
            // File does not exist — create an empty keystore
            _keystoreCache = {};
            await fs.writeFile(KEYSTORE_PATH, JSON.stringify(_keystoreCache, null, 2), 'utf-8');
            console.log(`[pharma-core Keystore] Created new empty keystore at ${KEYSTORE_PATH}`);
        }
    } catch (error) {
        console.error('[pharma-core Keystore] FATAL: Could not initialize keystore:', error.message);
        process.exit(1);
    }
};

/**
 * Reads the keystore. Returns the in-memory cache if available (warm path),
 * otherwise reads from disk and populates the cache (cold path).
 *
 * During a batch mint of N packs, this function is called N times but only
 * performs one actual disk read (on the first call after cache invalidation).
 *
 * @returns {Promise<Object>} The full keystore object.
 */
export const readKeystore = async () => {
    if (_keystoreCache !== null) return _keystoreCache; // Cache hit — zero disk I/O

    try {
        const raw = await fs.readFile(KEYSTORE_PATH, 'utf-8');
        _keystoreCache = JSON.parse(raw);
        console.log('[pharma-core Keystore] Cache miss — loaded keystore from disk');
        return _keystoreCache;
    } catch (error) {
        console.error('[pharma-core Keystore] Read error:', error.message);
        throw new Error('Keystore read failed');
    }
};

/**
 * Writes a complete keystore object to disk atomically (serialised via write mutex).
 * Invalidates and refreshes the in-memory cache on success.
 *
 * The write mutex ensures that concurrent calls (e.g., two manufacturers registered
 * simultaneously) cannot interleave and produce a partial/corrupt JSON file.
 *
 * @param {Object} keystoreData - The full keystore object to persist.
 * @returns {Promise<void>}
 */
export const writeKeystore = (keystoreData) =>
    withWriteLock(async () => {
        await fs.writeFile(KEYSTORE_PATH, JSON.stringify(keystoreData, null, 2), 'utf-8');
        _keystoreCache = keystoreData; // Update cache atomically with the write
        console.log(`[pharma-core Keystore] Keystore written (${Object.keys(keystoreData).length} entries)`);
    });

/**
 * Explicitly invalidates the in-memory cache.
 * Rarely needed — writeKeystore() auto-invalidates — but available for testing.
 */
export const invalidateCache = () => {
    _keystoreCache = null;
};
