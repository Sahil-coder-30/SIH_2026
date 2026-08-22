import dotenv from 'dotenv';
import app from './app/app.js';
import { initKeystore } from './config/keystore.js';
import { initKeys } from './config/keys.js';

dotenv.config();

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
    // ── Load RSA-4096 identity keypair first (needed by all subsequent ops) ──
    await initKeys();

    // ── Initialize JSON keystore (manufacturer EC keys) ───────────────────────
    await initKeystore();

    console.log(`[pharma-core] 🔐 Server ready on port ${PORT}`);
    console.log(`[pharma-core]    JWKS: http://localhost:${PORT}/.well-known/jwks.json`);
});
