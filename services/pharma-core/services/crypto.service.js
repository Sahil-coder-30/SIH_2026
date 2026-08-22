import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { readKeystore, writeKeystore } from '../config/keystore.js';
import { getCorePrivateKey, getCorePublicKey, CORE_KID } from '../config/keys.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const ES256_ALGORITHM = 'ES256';  // For manufacturer pack JWTs (ECDSA P-256)
const RS256_ALGORITHM = 'RS256';  // For pharma-core identity JWTs (RSA-4096)
const CURVE           = 'prime256v1';
const SCRYPT_KEYLEN   = 32;       // 256-bit AES key
const SCRYPT_N        = 16384;
const GCM_IV_LENGTH   = 16;

// Core identity JWT lifetime — short-lived machine-to-machine token
const CORE_JWT_TTL_SECONDS = 300; // 5 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derives a 256-bit AES key from the master secret and a manufacturer-specific salt.
 * Uses scrypt for memory-hard key derivation.
 * @param {string} masterSecret - The KEY_ENCRYPTION_SECRET env var value.
 * @param {string} manufacturerId - Used as the scrypt salt for key isolation.
 * @returns {Promise<Buffer>} 32-byte derived key.
 */
const deriveKey = (masterSecret, manufacturerId) =>
    new Promise((resolve, reject) => {
        crypto.scrypt(
            masterSecret,
            manufacturerId,
            SCRYPT_KEYLEN,
            { N: SCRYPT_N },
            (err, key) => (err ? reject(err) : resolve(key)),
        );
    });

// ── MANUFACTURER KEY OPERATIONS (ES256 / ECDSA P-256) ────────────────────────

/**
 * Generates an ECDSA P-256 keypair for a manufacturer, encrypts the private key
 * with AES-256-GCM, and persists it to the keystore file.
 * @param {string} manufacturerId - Unique manufacturer identifier.
 * @returns {Promise<{ publicKeyPem: string, keyId: string }>}
 */
export const generateManufacturerKey = async (manufacturerId) => {
    const masterSecret = process.env.KEY_ENCRYPTION_SECRET;
    if (!masterSecret) throw new Error('KEY_ENCRYPTION_SECRET is not configured');

    // ── Generate EC P-256 keypair ─────────────────────────────────────────────
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: CURVE,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // ── Derive encryption key and encrypt private key ─────────────────────────
    const derivedKey = await deriveKey(masterSecret, manufacturerId);
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);

    const encrypted = Buffer.concat([cipher.update(privateKey, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // ── Encode as ivHex:authTagHex:cipherHex ─────────────────────────────────
    const encryptedPrivKey = [
        iv.toString('hex'),
        authTag.toString('hex'),
        encrypted.toString('hex'),
    ].join(':');

    const keyId = `mfr-key-${manufacturerId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    // ── Persist to keystore ───────────────────────────────────────────────────
    const keystore = await readKeystore();
    keystore[manufacturerId] = {
        encryptedPrivKey,
        publicKeyPem: publicKey,
        algorithm: ES256_ALGORITHM,
        keyId,
        createdAt: new Date().toISOString(),
    };
    await writeKeystore(keystore);

    console.log(`[pharma-core Crypto] Generated and stored EC key for ${manufacturerId} (kid: ${keyId})`);
    return { publicKeyPem: publicKey, keyId };
};

/**
 * Decrypts and returns the raw private key PEM for a manufacturer.
 * The key exists only transiently in memory during this call.
 * @param {string} manufacturerId
 * @returns {Promise<string>} Raw private key PEM string.
 */
export const decryptPrivateKey = async (manufacturerId) => {
    const masterSecret = process.env.KEY_ENCRYPTION_SECRET;
    if (!masterSecret) throw new Error('KEY_ENCRYPTION_SECRET is not configured');

    const keystore = await readKeystore();
    const entry = keystore[manufacturerId];
    if (!entry) throw new Error(`No key found for manufacturer: ${manufacturerId}`);

    const [ivHex, authTagHex, cipherHex] = entry.encryptedPrivKey.split(':');
    const derivedKey = await deriveKey(masterSecret, manufacturerId);

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        derivedKey,
        Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(cipherHex, 'hex')),
        decipher.final(),
    ]);

    return decrypted.toString('utf-8');
};

/**
 * Signs a compact JWT payload with the manufacturer's ES256 private key.
 * Used to embed pack identity in QR codes.
 * @param {Object} payload - JWT claims: { batchId, serial, expiryDate, manufacturerId }
 * @param {string} manufacturerId
 * @returns {Promise<string>} Signed JWT string.
 */
export const signPackJwt = async (payload, manufacturerId) => {
    const keystore = await readKeystore();
    const entry = keystore[manufacturerId];
    if (!entry) throw new Error(`No key found for manufacturer: ${manufacturerId}`);

    const privateKeyPem = await decryptPrivateKey(manufacturerId);

    return jwt.sign(payload, privateKeyPem, {
        algorithm: ES256_ALGORITHM,
        keyid: entry.keyId,
    });
};

/**
 * Verifies an ES256-signed JWT using the appropriate manufacturer's public key.
 * Resolves the public key from the keystore by the 'kid' header claim.
 * @param {string} signedToken - Raw JWT string from QR code.
 * @returns {Promise<{ valid: boolean, payload?: Object, packHash?: string, error?: string }>}
 */
export const verifyPackJwt = async (signedToken) => {
    try {
        // ── Decode header to get kid ──────────────────────────────────────────
        const decoded = jwt.decode(signedToken, { complete: true });
        if (!decoded) return { valid: false, error: 'INVALID_TOKEN_FORMAT' };

        const kid = decoded.header.kid;
        const keystore = await readKeystore();

        // ── Find entry by keyId (only manufacturer EC keys) ───────────────────
        const entry = Object.values(keystore).find((e) => e.keyId === kid);
        if (!entry) return { valid: false, error: 'UNKNOWN_KEY_ID' };

        // ── Verify ES256 signature ────────────────────────────────────────────
        const verifiedPayload = jwt.verify(signedToken, entry.publicKeyPem, {
            algorithms: [ES256_ALGORITHM],
        });

        // ── Derive packHash = SHA256(rawSignedJWT) ────────────────────────────
        const packHash = crypto.createHash('sha256').update(signedToken).digest('hex');

        return { valid: true, payload: verifiedPayload, packHash };
    } catch (err) {
        console.error('[pharma-core Crypto] JWT verification failed:', err.message);
        return { valid: false, error: 'INVALID_SIGNATURE' };
    }
};

// ── PHARMA-CORE IDENTITY OPERATIONS (RS256 / RSA-4096) ───────────────────────

/**
 * Signs a short-lived RS256 machine-to-machine JWT using pharma-core's RSA-4096 private key.
 * This token is used as the Bearer credential when calling pharma-backend-service's
 * Spring Security OAuth2 resource server endpoints.
 *
 * JWT claims follow the OAuth2 Client Credentials pattern:
 *   iss: "pharma-core"          — issuer (pharma-core service)
 *   sub: "pharma-core"          — subject (same — service account)
 *   aud: "pharma-backend"       — intended audience
 *   iat: <now>                  — issued at
 *   exp: <now + 5min>           — short-lived (300s)
 *   kid: "pharma-core-rs256"    — key ID for JWKS resolution
 *
 * @returns {string} Signed RS256 JWT string.
 */
export const signCoreJwt = () => {
    const privateKeyPem = getCorePrivateKey();

    const payload = {
        iss: 'pharma-core',
        sub: 'pharma-core',
        aud: 'pharma-backend',
    };

    return jwt.sign(payload, privateKeyPem, {
        algorithm: RS256_ALGORITHM,
        keyid: CORE_KID,
        expiresIn: CORE_JWT_TTL_SECONDS,
    });
};

/**
 * Verifies an RS256 JWT signed by pharma-core's RSA private key.
 * Used for inbound verification if pharma-backend ever needs to confirm a callback.
 * @param {string} token - RS256 JWT string.
 * @returns {{ valid: boolean, payload?: Object, error?: string }}
 */
export const verifyCoreJwt = (token) => {
    try {
        const publicKeyPem = getCorePublicKey();
        const payload = jwt.verify(token, publicKeyPem, {
            algorithms: [RS256_ALGORITHM],
            audience: 'pharma-backend',
            issuer: 'pharma-core',
        });
        return { valid: true, payload };
    } catch (err) {
        console.error('[pharma-core Crypto] Core JWT verification failed:', err.message);
        return { valid: false, error: err.message };
    }
};

// ── JWKS BUILDER (serves BOTH EC and RSA public keys) ────────────────────────

/**
 * Builds the complete JWKS (JSON Web Key Set) response.
 * Includes:
 *   1. All manufacturer EC P-256 public keys (ES256) — for pack JWT verification
 *   2. pharma-core's RSA-4096 public key (RS256)      — for pharma-core identity verification
 *
 * pharma-backend-service (Spring Security) fetches this on startup and caches it for 24h.
 * Domain services (manufacturer, shopkeeper, consumer) can also use this to independently
 * verify pack JWTs without calling pharma-core.
 *
 * @returns {Promise<{ keys: Array<Object> }>}
 */
export const buildJwks = async () => {
    const keystore = await readKeystore();

    // ── EC P-256 keys (one per manufacturer) ─────────────────────────────────
    const ecKeys = Object.values(keystore).map((entry) => {
        const keyObj = crypto.createPublicKey(entry.publicKeyPem);
        const { x, y } = keyObj.export({ format: 'jwk' });
        return {
            kty: 'EC',
            crv: 'P-256',
            kid: entry.keyId,
            use: 'sig',
            alg: 'ES256',
            x,
            y,
        };
    });

    // ── RSA-4096 key (pharma-core identity) ──────────────────────────────────
    const rsaPublicKeyPem = getCorePublicKey();
    const rsaKeyObj = crypto.createPublicKey(rsaPublicKeyPem);
    const { n, e } = rsaKeyObj.export({ format: 'jwk' });

    const rsaJwk = {
        kty: 'RSA',
        kid: CORE_KID,
        use: 'sig',
        alg: 'RS256',
        n,   // RSA modulus (base64url)
        e,   // RSA public exponent (base64url)
    };

    return { keys: [...ecKeys, rsaJwk] };
};

// ── UTILITY ───────────────────────────────────────────────────────────────────

/**
 * Derives a SHA-256 pack hash from a signed JWT string.
 * packHash = SHA256(rawSignedJWTString)
 * @param {string} signedToken
 * @returns {string} Hex-encoded SHA-256 hash.
 */
export const derivePackHash = (signedToken) =>
    crypto.createHash('sha256').update(signedToken).digest('hex');

// ── LOCAL DATE / TIME HELPERS (used by mintPacksBatch) ────────────────────────

const _formatDate = (d = new Date()) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}${mm}${d.getFullYear()}`; // DDMMYYYY
};

const _formatTime = (d = new Date()) => d.toTimeString().split(' ')[0]; // HH:MM:SS

// ── OPTIMIZED BULK BATCH MINTING ──────────────────────────────────────────────

/**
 * Mints an entire batch of pharmaceutical pack JWTs in one optimized pass.
 *
 * Key performance guarantee:
 *   - Private key is decrypted ONCE (one scrypt call, ~100-150ms).
 *   - All N packs are signed in memory using the cached PEM (~0.1ms/pack).
 *   - Total time: ~150ms + N×0.1ms  (vs. N×150ms with the naive approach).
 *
 * Hash uniqueness guarantee:
 *   - Each JWT payload contains a unique `serial` ("00001"…"10000") scoped
 *     by `batchId`. SHA-256 of a unique input is always unique.
 *   - Collision probability is bounded by SHA-256 pre-image resistance (2^-128).
 *
 * @param {string} batchId         - Unique batch identifier (e.g. "BATCH-CIPLA-001")
 * @param {string} manufacturerId  - Manufacturer identifier (must have a stored key)
 * @param {string} expiryDate      - ISO date string (e.g. "2028-01-14")
 * @param {number} quantity        - Number of packs to mint (1 – 10,000)
 * @returns {Promise<{ packs: Array, transitions: Array }>}
 *   packs:       [{ serial, packHash, signedToken }, ...]
 *   transitions: [{ hash, fromId, toId, sellingDate, sellingTime, sellerId }, ...]
 */
export const mintPacksBatch = async (batchId, manufacturerId, expiryDate, quantity) => {
    // ── 1. Load keystore entry (one disk read, cached after first load) ────────
    const keystore = await readKeystore();
    const entry = keystore[manufacturerId];
    if (!entry) throw new Error(`No key found for manufacturer: ${manufacturerId}`);

    // ── 2. Decrypt private key ONCE (single scrypt call) ──────────────────────
    const privateKeyPem = await decryptPrivateKey(manufacturerId);

    // ── 3. Capture timestamp once for all transitions in this batch ───────────
    const now = new Date();
    const sellingDate = _formatDate(now);
    const sellingTime = _formatTime(now);

    const packs       = [];
    const transitions = [];

    // ── 4. Sign all packs in memory (pure EC crypto — ~0.1ms per pack) ────────
    for (let i = 1; i <= quantity; i++) {
        const serial  = String(i).padStart(5, '0'); // "00001" … "10000"

        // ── Extra entropy fields (guarantee hash uniqueness beyond serial+batchId) ──
        //
        // nonce: 4 cryptographically random bytes → 8 lowercase hex chars
        //   e.g. "a3f7b2c1" — generated by Node.js CSPRNG (RDRAND / /dev/urandom)
        //   Probability of two identical nonces: 1 / 2^32 ≈ 2.3 × 10^-10
        //
        // ts: nanosecond monotonic clock counter (process.hrtime.bigint)
        //   e.g. "1787406879519847293" — advances continuously, never repeats
        //   Even two packs signed in the same CPU cycle get different ts values
        //   because hrtime.bigint() has nanosecond resolution per V8/libuv.
        //
        // Combined with serial + batchId, the probability of a hash collision
        // becomes 1 / (2^32 × 10^9 × SHA256_collision_bound) ≈ 0 for all practical
        // purposes — astronomically beyond SHA-256's own security bound (2^-128).
        const nonce   = crypto.randomBytes(4).toString('hex');   // "a3f7b2c1"
        const ts      = process.hrtime.bigint().toString();       // "1787406879519847293"

        const payload = { batchId, serial, expiryDate, manufacturerId, nonce, ts };

        // jwt.sign with a PEM string is synchronous ECDSA — no I/O, no scrypt
        const signedToken = jwt.sign(payload, privateKeyPem, {
            algorithm: ES256_ALGORITHM,
            keyid:     entry.keyId,
        });

        // packHash = SHA256(rawSignedJWT)  — the architecture's primary key
        const packHash = derivePackHash(signedToken);

        packs.push({ serial, packHash, signedToken });

        transitions.push({
            packId:      packHash,
            eventType:   'MINTED',
            hash:        `${packHash}~MINTED`,
            fromId:      'GENESIS',
            toId:        manufacturerId,
            sellingDate,
            sellingTime,
            sellerId:    manufacturerId,
        });
    }


    console.log(
        `[pharma-core Crypto] mintPacksBatch: signed ${packs.length} packs for ${batchId}` +
        ` (1 scrypt + ${packs.length} EC signs)`,
    );

    return { packs, transitions };
};
