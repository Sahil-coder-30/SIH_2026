// ── requireServiceToken.middleware.js ─────────────────────────────────────────
// Re-exports requireAuth from requireAuth.middleware.js for backward compatibility.
import { requireAuth } from './requireAuth.middleware.js';

export const requireServiceToken = requireAuth;
export default requireAuth;
