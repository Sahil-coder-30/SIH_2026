// ── env.js — fail-fast environment access ─────────────────────────────────────
// A service that will not boot is strictly better than one that boots with a
// published secret. Every credential in pharma-core is read through requireEnv,
// which throws at import time (i.e. before app.listen) when the value is absent.
//
// There are deliberately NO literal defaults anywhere in this file.

/**
 * Reads a required environment variable.
 * @param {string} name
 * @returns {string} The trimmed value.
 * @throws {Error} If the variable is unset, empty, or still a placeholder.
 */
export const requireEnv = (name) => {
    const raw = process.env[name];

    if (raw === undefined || raw === null || String(raw).trim() === '') {
        throw new Error(
            `[pharma-core FATAL] Required environment variable ${name} is not set. ` +
            'pharma-core refuses to start without it — there is no default value by design. ' +
            'Add it to services/pharma-core/.env and restart.',
        );
    }

    const value = String(raw).trim();

    // Guard against shipped placeholders reaching a running service.
    if (/^(changeme|change-in-prod|your_|placeholder|todo)/i.test(value)) {
        throw new Error(
            `[pharma-core FATAL] Environment variable ${name} still holds a placeholder value ` +
            `("${value.slice(0, 16)}…"). Replace it with a real secret before starting.`,
        );
    }

    return value;
};

/**
 * Reads an optional environment variable.
 * @param {string} name
 * @param {string|null} fallback
 * @returns {string|null}
 */
export const optionalEnv = (name, fallback = null) => {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
    return String(raw).trim();
};
