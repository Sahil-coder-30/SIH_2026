import http from 'http';
import app from './app/app.js';
import { initKeys } from './config/keys.js';
import { initKeystore } from './config/keystore.js';
import { signCoreJwt } from './services/crypto.service.js';
import jwt from 'jsonwebtoken';

process.env.KEY_ENCRYPTION_SECRET = 'e4d9b2a1f0c8e7d6b5a4938271605f4e3d2c1b0a9f8e7d6c5b4a3928170f1234';
process.env.SERVICE_SECRET = 'pharma-cluster-internal-secret-token-change-in-prod';
process.env.MANUFACTURER_JWT_SECRET = 'mfr-super-secret-jwt-key';
process.env.SHOPKEEPER_JWT_SECRET = 'shop-super-secret-jwt-key';
process.env.KEYSTORE_PATH = './data/keystore.json';
process.env.CORE_PRIVATE_KEY_PATH = './config/rsa/pharma-core-private.pem';
process.env.CORE_PUBLIC_KEY_PATH = './config/rsa/pharma-core-public.pem';

async function testHttpEndpoints() {
    await initKeys();
    await initKeystore();

    const server = app.listen(4999);
    const baseUrl = 'http://127.0.0.1:4999';

    const fetchJson = async (path, options = {}) => {
        const res = await fetch(`${baseUrl}${path}`, options);
        const data = await res.json();
        return { status: res.status, headers: res.headers, data };
    };

    console.log('\n--- 1. Testing Health Probes ---');
    const health = await fetchJson('/healthz');
    console.log('GET /healthz:', health.status, health.data);
    if (health.status !== 200) throw new Error('Healthz failed');

    console.log('\n--- 2. Testing Public /.well-known/jwks.json Endpoint ---');
    const jwks = await fetchJson('/.well-known/jwks.json');
    console.log('GET /.well-known/jwks.json:', jwks.status, `Returned ${jwks.data.keys?.length} keys`);
    if (jwks.status !== 200 || !jwks.data.keys) throw new Error('JWKS endpoint failed');

    console.log('\n--- 3. Testing Alias /core/.well-known/jwks.json & /jwks.json ---');
    const jwksAlias1 = await fetchJson('/core/.well-known/jwks.json');
    const jwksAlias2 = await fetchJson('/jwks.json');
    const oidcConfig = await fetchJson('/.well-known/openid-configuration');
    console.log('GET /core/.well-known/jwks.json:', jwksAlias1.status);
    console.log('GET /jwks.json:', jwksAlias2.status);
    console.log('GET /.well-known/openid-configuration:', oidcConfig.status, oidcConfig.data.issuer);
    if (jwksAlias1.status !== 200 || jwksAlias2.status !== 200 || oidcConfig.status !== 200) {
        throw new Error('JWKS alias failed');
    }

    console.log('\n--- 4. Testing JWT / JWKS Auth Gate on pharma-core APIs ---');
    // A. Unauthenticated call -> 401
    const unauth = await fetchJson('/core/keys/public/MFR_NONE');
    console.log('GET /core/keys/public/MFR_NONE without token ->', unauth.status, unauth.data.message);
    if (unauth.status !== 401) throw new Error('Auth guard did not block unauthenticated request');

    // B. Invalid token -> 401
    const badAuth = await fetchJson('/core/keys/public/MFR_NONE', {
        headers: { Authorization: 'Bearer invalid-token-xyz' },
    });
    console.log('GET /core/keys/public/MFR_NONE with bad token ->', badAuth.status, badAuth.data.message);
    if (badAuth.status !== 401) throw new Error('Auth guard did not block bad token request');

    // C. RS256 Machine-to-Machine JWT (signed with RSA private key) -> 404 (Auth passed)
    const rs256Token = signCoreJwt();
    const rs256Auth = await fetchJson('/core/keys/public/MFR_NONE', {
        headers: { Authorization: `Bearer ${rs256Token}` },
    });
    console.log('GET /core/keys/public/MFR_NONE with RS256 Bearer JWT ->', rs256Auth.status, rs256Auth.data.message);
    if (rs256Auth.status !== 404) throw new Error('RS256 Bearer JWT auth failed');

    // D. HS256 User Session JWT (Manufacturer session) -> 404 (Auth passed)
    const hs256Token = jwt.sign({ id: 'MFR_001', role: 'MANUFACTURER' }, 'mfr-super-secret-jwt-key');
    const hs256Auth = await fetchJson('/core/keys/public/MFR_NONE', {
        headers: { Authorization: `Bearer ${hs256Token}` },
    });
    console.log('GET /core/keys/public/MFR_NONE with HS256 Bearer JWT ->', hs256Auth.status, hs256Auth.data.message);
    if (hs256Auth.status !== 404) throw new Error('HS256 Bearer JWT auth failed');

    // E. X-Service-Token Direct Header fallback -> 404 (Auth passed)
    const serviceAuth = await fetchJson('/core/keys/public/MFR_NONE', {
        headers: { 'x-service-token': 'pharma-cluster-internal-secret-token-change-in-prod' },
    });
    console.log('GET /core/keys/public/MFR_NONE with X-Service-Token ->', serviceAuth.status, serviceAuth.data.message);
    if (serviceAuth.status !== 404) throw new Error('Service token fallback failed');

    server.close();
    console.log('\n🎉 ALL HTTP, JWKS & JWT AUTH FLOW TESTS PASSED! 🎉\n');
}

testHttpEndpoints().catch((err) => {
    console.error('❌ HTTP Test failed:', err);
    process.exit(1);
});
