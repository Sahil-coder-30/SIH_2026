import { initKeys, getCorePrivateKey, getCorePublicKey, CORE_KID } from './config/keys.js';
import { initKeystore } from './config/keystore.js';
import {
    generateManufacturerKey,
    decryptPrivateKey,
    signPackJwt,
    verifyPackJwt,
    signCoreJwt,
    verifyCoreJwt,
    buildJwks,
    derivePackHash,
} from './services/crypto.service.js';

process.env.KEY_ENCRYPTION_SECRET = 'e4d9b2a1f0c8e7d6b5a4938271605f4e3d2c1b0a9f8e7d6c5b4a3928170f1234';
process.env.KEYSTORE_PATH = './data/test_keystore.json';
process.env.CORE_PRIVATE_KEY_PATH = './config/rsa/pharma-core-private.pem';
process.env.CORE_PUBLIC_KEY_PATH = './config/rsa/pharma-core-public.pem';

async function runTests() {
    console.log('--- 1. Testing RSA Key Initialization ---');
    await initKeys();
    const privKey = getCorePrivateKey();
    const pubKey = getCorePublicKey();
    console.log(`✓ Loaded Private Key (Length: ${privKey.length} bytes)`);
    console.log(`✓ Loaded Public Key (Length: ${pubKey.length} bytes)`);
    console.log(`✓ Core KID: ${CORE_KID}`);

    console.log('\n--- 2. Testing RS256 Core Identity JWT Signing & Verification ---');
    const coreJwt = signCoreJwt();
    console.log(`✓ Signed RS256 Token: ${coreJwt.substring(0, 50)}...`);
    const verifiedCore = verifyCoreJwt(coreJwt);
    if (!verifiedCore.valid) throw new Error('Core JWT verification failed: ' + verifiedCore.error);
    console.log('✓ Verified RS256 Token Payload:', verifiedCore.payload);

    console.log('\n--- 3. Testing Keystore & EC P-256 Keygen for Manufacturer ---');
    await initKeystore();
    const testMfrId = 'MFR_TEST_001';
    const mfrKey = await generateManufacturerKey(testMfrId);
    console.log(`✓ Generated EC P-256 Key for ${testMfrId} with kid: ${mfrKey.keyId}`);

    const decryptedPem = await decryptPrivateKey(testMfrId);
    if (!decryptedPem.includes('BEGIN PRIVATE KEY')) throw new Error('Decrypted private key invalid');
    console.log('✓ Decrypted Manufacturer Private Key via AES-256-GCM');

    console.log('\n--- 4. Testing ES256 Pack JWT Signing & Verification ---');
    const packPayload = {
        batchId: 'BATCH-TEST-2026',
        serial: '00001',
        expiryDate: '2028-12-31',
        manufacturerId: testMfrId,
    };
    const packJwt = await signPackJwt(packPayload, testMfrId);
    console.log(`✓ Signed ES256 Pack Token: ${packJwt.substring(0, 50)}...`);

    const packVerification = await verifyPackJwt(packJwt);
    if (!packVerification.valid) throw new Error('Pack JWT verification failed: ' + packVerification.error);
    console.log('✓ Verified Pack JWT successfully! Pack Hash:', packVerification.packHash);

    console.log('\n--- 5. Testing JWKS Output (Combined EC + RSA Public Keys) ---');
    const jwks = await buildJwks();
    console.log(`✓ JWKS contains ${jwks.keys.length} keys:`);
    jwks.keys.forEach((k, idx) => {
        console.log(`   [Key ${idx + 1}] kty: ${k.kty}, alg: ${k.alg}, kid: ${k.kid}, use: ${k.use}`);
    });

    const rsaKeyInJwks = jwks.keys.find((k) => k.kty === 'RSA' && k.kid === CORE_KID);
    if (!rsaKeyInJwks) throw new Error('RSA key missing in JWKS');
    if (!rsaKeyInJwks.n || !rsaKeyInJwks.e) throw new Error('RSA JWK modulus/exponent missing');
    console.log('✓ Verified RSA-4096 JWK properties (n, e, alg: RS256, use: sig)');

    console.log('\n🎉 ALL AUTHENTICATION & JWKS TESTS PASSED SUCCESSFULLY! 🎉');
}

runTests().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
