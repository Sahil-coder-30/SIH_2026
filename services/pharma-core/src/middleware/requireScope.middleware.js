// ── requireScope.middleware.js ─────────────────────────────────────────────────
// Per-service identity + authorization for pharma-core.
// Implements API_CONTRACT.md §2.1 "Phase 1 — per-service tokens + scopes".
//
// Before this middleware existed, every edge service presented the same shared
// secret, so compromising the public `consumer` service granted the ability to
// mint signed pharmaceutical packs. Now each caller carries its own credential
// and each credential carries a fixed capability set.
//
// What this is honestly NOT: certificate-bound identity. It is a shared secret
// per service. Phase 2 (short-lived scoped tokens) and Phase 3 (mTLS) are
// designed in the contract and deliberately out of scope here.

import crypto from 'crypto';
import { requireEnv } from '../config/env.js';

// ── Service registry — token → caller name ────────────────────────────────────
// requireEnv throws at import time, so pharma-core cannot boot with a missing
// or placeholder service token. There is never a literal default.
const SERVICE_REGISTRY = new Map([
    [requireEnv('SERVICE_TOKEN_MANUFACTURER'), 'manufacturer'],
    [requireEnv('SERVICE_TOKEN_SHOPKEEPER'),   'shopkeeper'],
    [requireEnv('SERVICE_TOKEN_CONSUMER'),     'consumer'],
]);

// If two services were given the same token the Map silently collapses and the
// scope model becomes a lie. Refuse to start instead.
if (SERVICE_REGISTRY.size !== 3) {
    throw new Error(
        '[pharma-core FATAL] SERVICE_TOKEN_MANUFACTURER, SERVICE_TOKEN_SHOPKEEPER and ' +
        'SERVICE_TOKEN_CONSUMER must be three DIFFERENT values. Sharing one token defeats ' +
        'the entire purpose of per-service scopes.',
    );
}

// ── Scope matrix (API_CONTRACT.md §2.1) ───────────────────────────────────────
// Note what each service cannot do:
//   shopkeeper — cannot mint, cannot recall (a pharmacy writes custody events only)
//   consumer   — read-only verification; cannot write to the ledger at all
const SCOPES = Object.freeze({
    manufacturer: ['keys:generate', 'keys:read', 'batch:mint', 'hash:verify', 'hash:status', 'chain:recall', 'export:read'],
    shopkeeper:   ['keys:read', 'hash:verify', 'hash:status', 'chain:intake', 'chain:sale'],
    consumer:     ['keys:read', 'hash:verify', 'hash:status'],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * SHA-256 digest of a token, so every comparison is over a fixed 32-byte buffer.
 * timingSafeEqual throws on length mismatch, which would itself leak length.
 * @param {string} value
 * @returns {Buffer}
 */
const digest = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest();

// Pre-hash the registry once at startup.
const REGISTRY_DIGESTS = [...SERVICE_REGISTRY.entries()].map(([token, caller]) => ({
    caller,
    hash: digest(token),
}));

/**
 * Resolves a presented credential to a caller name in constant time.
 * Every registry entry is compared on every call — no early return — so the
 * time taken does not reveal which entry matched.
 * @param {string|undefined} presented
 * @returns {string|null} caller name, or null when unrecognised
 */
const resolveCaller = (presented) => {
    if (!presented) return null;

    const presentedHash = digest(presented);
    let match = null;

    for (const entry of REGISTRY_DIGESTS) {
        if (crypto.timingSafeEqual(presentedHash, entry.hash)) match = entry.caller;
    }

    return match;
};

/**
 * Collects the credentials a caller may have presented, in preference order.
 * `Authorization: Bearer` is the target form; `X-Service-Token` is accepted so
 * services can be cut over one at a time (API_CONTRACT.md §2.1).
 * @param {import('express').Request} req
 * @returns {string[]}
 */
const presentedCredentials = (req) => {
    const candidates = [];

    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        candidates.push(authHeader.slice(7).trim());
    }

    const serviceHeader = req.headers['x-service-token'];
    if (typeof serviceHeader === 'string' && serviceHeader.trim()) {
        candidates.push(serviceHeader.trim());
    }

    return candidates;
};

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Authenticates the calling service and asserts it holds `scope`.
 *
 * 401 UNKNOWN_SERVICE — no recognised credential presented
 * 403 SCOPE_DENIED    — recognised caller, but the scope is not in its matrix
 *
 * On success sets `req.callerService` and logs it, so an audit trail exists for
 * every privileged operation.
 *
 * @param {string} scope
 * @returns {import('express').RequestHandler}
 */
export const requireScope = (scope) => (req, res, next) => {
    let caller = null;
    for (const credential of presentedCredentials(req)) {
        caller = resolveCaller(credential);
        if (caller) break;
    }

    if (!caller) {
        console.warn(
            `[pharma-core Auth] UNKNOWN_SERVICE — ${req.method} ${req.originalUrl} ` +
            `(scope required: ${scope})`,
        );
        return res.status(401).json({
            status:  'error',
            code:    'UNKNOWN_SERVICE',
            message: 'Unrecognised service credential. Present Authorization: Bearer <SERVICE_TOKEN_*>.',
        });
    }

    if (!SCOPES[caller].includes(scope)) {
        console.warn(
            `[pharma-core Auth] SCOPE_DENIED — caller "${caller}" attempted "${scope}" ` +
            `on ${req.method} ${req.originalUrl}`,
        );
        return res.status(403).json({
            status:  'error',
            code:    'SCOPE_DENIED',
            message: `Service "${caller}" is not authorized for scope "${scope}".`,
            caller,
            scope,
        });
    }

    req.callerService = caller;
    console.log(`[pharma-core Auth] ${caller} → ${scope} (${req.method} ${req.originalUrl})`);
    return next();
};

/**
 * The scope matrix, exported for diagnostics only.
 * @returns {Record<string, string[]>}
 */
export const getScopeMatrix = () => JSON.parse(JSON.stringify(SCOPES));

export default requireScope;
