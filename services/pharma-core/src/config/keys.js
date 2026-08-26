import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

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
 * Auto-generates local RSA keys if not present on disk.
 *
 * @returns {Promise<void>}
 */
export const initKeys = async () => {
    try {
        // ── 1. Check direct environment variables (useful in K8s Secrets) ─────
        if (process.env.CORE_RSA_PRIVATE_KEY && process.env.CORE_RSA_PUBLIC_KEY) {
            _privateKeyPem = process.env.CORE_RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
            _publicKeyPem  = process.env.CORE_RSA_PUBLIC_KEY.replace(/\\n/g, '\n');
            console.log('[pharma-core Keys] RSA keypair loaded from environment variables');
            return;
        }

        // ── 2. Fallback to file paths on disk ──────────────────────────────────
        const privPath = process.env.CORE_PRIVATE_KEY_PATH || DEFAULT_PRIVATE_KEY_PATH;
        const pubPath  = process.env.CORE_PUBLIC_KEY_PATH  || DEFAULT_PUBLIC_KEY_PATH;

        try {
            _privateKeyPem = await fs.readFile(privPath, 'utf-8');
            _publicKeyPem  = await fs.readFile(pubPath,  'utf-8');
            console.log('[pharma-core Keys] RSA keypair loaded from file paths');
        } catch {
            console.log('[pharma-core Keys] RSA key files not found on disk, auto-generating fresh keypair...');
            const rsaDir = path.dirname(privPath);
            await fs.mkdir(rsaDir, { recursive: true });

            const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding:  { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            });

            await fs.writeFile(privPath, privateKey, 'utf-8');
            await fs.writeFile(pubPath, publicKey, 'utf-8');

            _privateKeyPem = privateKey;
            _publicKeyPem = publicKey;
            console.log('[pharma-core Keys] Generated & saved RSA keypair to:', privPath);
        }
    } catch (error) {
        console.error('[pharma-core Keys] FATAL: Could not load RSA keypair:', error.message);
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
