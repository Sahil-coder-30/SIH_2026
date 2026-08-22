import { promises as fs } from 'fs';
import path from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_PRIVATE_KEY_PATH = path.resolve('./config/rsa/pharma-core-private.pem');
const DEFAULT_PUBLIC_KEY_PATH  = path.resolve('./config/rsa/pharma-core-public.pem');

const CORE_RSA_KID = process.env.CORE_RSA_KID || 'pharma-core-rs256';

// ── In-memory cache (loaded once at startup via initKeys) ─────────────────────
let _privateKeyPem = null;
let _publicKeyPem  = null;

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Loads the pharma-core RSA-4096 keypair into memory.
 *
 * Loading Priority:
 *   1. Environment variables: CORE_RSA_PRIVATE_KEY & CORE_RSA_PUBLIC_KEY (from K8s Secret)
 *   2. File paths: CORE_PRIVATE_KEY_PATH & CORE_PUBLIC_KEY_PATH (from disk or mounted volume)
 *   3. Default local paths: ./config/rsa/pharma-core-{private,public}.pem
 *
 * @returns {Promise<void>}
 */
export const initKeys = async () => {
    try {
        // ── 1. Check direct environment variables (useful in K8s Secrets) ─────
        if (process.env.CORE_RSA_PRIVATE_KEY && process.env.CORE_RSA_PUBLIC_KEY) {
            _privateKeyPem = process.env.CORE_RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
            _publicKeyPem  = process.env.CORE_RSA_PUBLIC_KEY.replace(/\\n/g, '\n');
            console.log('[pharma-core Keys] RSA-4096 keypair loaded from environment variables');
            return;
        }

        // ── 2. Fallback to file paths on disk ──────────────────────────────────
        const privPath = process.env.CORE_PRIVATE_KEY_PATH || DEFAULT_PRIVATE_KEY_PATH;
        const pubPath  = process.env.CORE_PUBLIC_KEY_PATH  || DEFAULT_PUBLIC_KEY_PATH;

        _privateKeyPem = await fs.readFile(privPath, 'utf-8');
        _publicKeyPem  = await fs.readFile(pubPath,  'utf-8');

        console.log('[pharma-core Keys] RSA-4096 keypair loaded from file paths');
        console.log(`[pharma-core Keys]   private: ${privPath}`);
        console.log(`[pharma-core Keys]   public:  ${pubPath}`);
    } catch (error) {
        console.error('[pharma-core Keys] FATAL: Could not load RSA keypair:', error.message);
        console.error('[pharma-core Keys] Ensure CORE_RSA_PRIVATE_KEY/CORE_RSA_PUBLIC_KEY env vars are set, or files exist in config/rsa/');
        process.exit(1);
    }
};

/**
 * Returns the in-memory RSA private key PEM (loaded at startup).
 * @returns {string}
 */
export const getCorePrivateKey = () => {
    if (!_privateKeyPem) throw new Error('[pharma-core Keys] RSA private key not loaded. Call initKeys() first.');
    return _privateKeyPem;
};

/**
 * Returns the in-memory RSA public key PEM (loaded at startup).
 * @returns {string}
 */
export const getCorePublicKey = () => {
    if (!_publicKeyPem) throw new Error('[pharma-core Keys] RSA public key not loaded. Call initKeys() first.');
    return _publicKeyPem;
};

/**
 * The key ID for the pharma-core RSA signing key.
 * Used as `kid` in RS256 JWTs and in the JWKS response.
 */
export const CORE_KID = CORE_RSA_KID;
