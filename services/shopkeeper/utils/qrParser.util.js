// ── QR Code / Verification URL Parser ─────────────────────────────────────────
// Handles both raw signed JWT strings and full verification URLs.
//
// Supported input formats:
//   1. Raw JWT:  "eyJhbGciOiJFUzI1NiIs..."
//   2. Full URL: "https://pharmachain.gov.in/verify/a8f4c123...?token=eyJhbGciOiJFUzI1NiIs..."
//   3. Any URL with token query param: "https://example.com/scan?token=eyJ..."

/**
 * Extracts the signed token and optional packHash from a QR scan input.
 * @param {string} input - Raw JWT string or full verification URL
 * @returns {{ signedToken: string, packHash: string|null }}
 */
export const extractTokenAndHash = (input) => {
    if (!input || typeof input !== 'string') {
        throw new Error('QR input is required and must be a string.');
    }

    const trimmed = input.trim();

    // ── Case 1: Full URL format
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            const url = new URL(trimmed);

            // Extract token from query parameter
            const token = url.searchParams.get('token');
            if (!token) {
                throw new Error('URL does not contain a "token" query parameter.');
            }

            // Extract packHash from path: /verify/:packHash
            let packHash = null;
            const pathParts = url.pathname.split('/').filter(Boolean);
            const verifyIdx = pathParts.indexOf('verify');
            if (verifyIdx !== -1 && pathParts[verifyIdx + 1]) {
                packHash = pathParts[verifyIdx + 1];
            }

            return { signedToken: token, packHash };
        } catch (e) {
            if (e.message.includes('token')) throw e;
            throw new Error(`Invalid QR URL format: ${e.message}`);
        }
    }

    // ── Case 2: Raw JWT string (starts with eyJ typically, or any non-URL string)
    return { signedToken: trimmed, packHash: null };
};
