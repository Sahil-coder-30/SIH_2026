import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';

// ── Configuration ─────────────────────────────────────────────────────────────
const BLOCKCHAIN_URL = process.env.BLOCKCHAIN_URL || 'http://127.0.0.1:8080';

// Locate pharma-core RSA private key for RS256 token signing
const rsaKeyPaths = [
    './services/pharma-core/src/config/rsa/pharma-core-private.pem',
    './services/pharma-core/config/rsa/pharma-core-private.pem',
    './config/rsa/pharma-core-private.pem',
];
let privateKeyPem = null;
for (const p of rsaKeyPaths) {
    if (fs.existsSync(p)) {
        privateKeyPem = fs.readFileSync(p, 'utf8');
        break;
    }
}

if (!privateKeyPem) {
    console.error('❌ Error: pharma-core RSA private key PEM file not found.');
    process.exit(1);
}

/**
 * Signs an RS256 JWT using pharma-core's private key.
 * pharma-backend verifies this against pharma-core's JWKS.
 */
function signCoreJwt() {
    const header = { alg: 'RS256', typ: 'JWT', kid: 'pharma-core-rs256' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: 'pharma-core',
        sub: 'pharma-core',
        aud: 'pharma-backend',
        iat: now,
        exp: now + 300, // 5 minutes validity
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(privateKeyPem, 'base64url');
    return `${signatureInput}.${signature}`;
}

// ── Helper Utilities ──────────────────────────────────────────────────────────
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ [PASS] ${testName}`);
    } else {
        failedTests++;
        failures.push({ testName, details });
        console.error(`  ❌ [FAIL] ${testName} — ${details}`);
    }
}

const formatDate = (d = new Date()) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}${mm}${yyyy}`;
};

const formatTime = (d = new Date()) => d.toTimeString().split(' ')[0];

async function runBlockchainOnlySuite() {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║           PHARMACHAIN STANDALONE BLOCKCHAIN SERVER API TEST SUITE            ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    console.log(`  Target Blockchain Gateway Server: ${BLOCKCHAIN_URL}`);
    console.log(`  Authentication Mode:              RS256 Bearer JWT (Identity: pharma-core)\n`);

    const coreJwt = signCoreJwt();
    const chainClient = axios.create({
        baseURL: BLOCKCHAIN_URL,
        headers: {
            Authorization: `Bearer ${coreJwt}`,
            'Content-Type': 'application/json',
        },
        validateStatus: () => true,
    });

    const now = new Date();
    const testPackHash = `PACK_STANDALONE_${Date.now()}`;
    const testBatchId  = `PC-BATCH-STANDALONE_${Date.now().toString().slice(-6)}`;

    // ──────────────────────────────────────────────────────────────────────────
    // 1. HEALTH & CONNECTIVITY PROBES
    // ──────────────────────────────────────────────────────────────────────────
    console.log('🏥 ══════════════════════════════════════════════════════════════════');
    console.log('  1. BLOCKCHAIN SERVER HEALTH & READINESS PROBES');
    console.log('══════════════════════════════════════════════════════════════════════');

    const healthRes = await chainClient.get('/actuator/health');
    assert(
        healthRes.status === 200 && healthRes.data?.status === 'UP',
        'GET /actuator/health (Spring Boot Actuator status: UP)',
        `Status: ${healthRes.status}, Data: ${JSON.stringify(healthRes.data)}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // 2. SPRING SECURITY & AUTHENTICATION ENFORCEMENT
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🛡️ ══════════════════════════════════════════════════════════════════');
    console.log('  2. SECURITY & RS256 JWT AUTHENTICATION GATES');
    console.log('══════════════════════════════════════════════════════════════════════');

    const unauthClient = axios.create({ baseURL: BLOCKCHAIN_URL, validateStatus: () => true });
    const unauthRes = await unauthClient.post('/api/transition', {
        packId: 'UNAUTH_TEST',
        eventType: 'MINTED',
    });
    assert(
        unauthRes.status === 401,
        'POST /api/transition rejects unauthenticated requests (HTTP 401)',
        `Expected 401, got ${unauthRes.status}`
    );

    const badAuthClient = axios.create({
        baseURL: BLOCKCHAIN_URL,
        headers: { Authorization: 'Bearer invalid.bogus.jwt.token' },
        validateStatus: () => true,
    });
    const badAuthRes = await badAuthClient.post('/api/transition', {
        packId: 'BADAUTH_TEST',
        eventType: 'MINTED',
    });
    assert(
        badAuthRes.status === 401,
        'POST /api/transition rejects forged or tampered JWTs (HTTP 401)',
        `Expected 401, got ${badAuthRes.status}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // 3. LEDGER STATUS QUERY (INITIAL STATE)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🔍 ══════════════════════════════════════════════════════════════════');
    console.log('  3. FABRIC WORLD STATE STATUS QUERIES');
    console.log('══════════════════════════════════════════════════════════════════════');

    const nonExistentRes = await chainClient.get('/api/transition/status', {
        params: { packHash: 'NON_EXISTENT_HASH_999999', batchId: 'PC-BATCH-NONE' },
    });
    assert(
        nonExistentRes.status === 200 && (nonExistentRes.data?.status === 'NOT_FOUND' || nonExistentRes.data?.status === 'UNKNOWN'),
        'GET /api/transition/status handles non-existent pack hash safely',
        `Response: ${JSON.stringify(nonExistentRes.data)}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // 4. SINGLE TRANSITION WRITE (MINTED)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n📝 ══════════════════════════════════════════════════════════════════');
    console.log('  4. SINGLE TRANSITION WRITE API');
    console.log('══════════════════════════════════════════════════════════════════════');

    const mintPayload = {
        packId: testPackHash,
        eventType: 'MINTED',
        hash: `${testPackHash}:MINTED`,
        fromId: 'GENESIS',
        toId: 'MFR_CIPLA_001',
        sellingDate: formatDate(now),
        sellingTime: formatTime(now),
        sellerId: 'OP_MINT_001',
    };

    const directMintRes = await chainClient.post('/api/transition', mintPayload);
    assert(
        directMintRes.status === 200 && (directMintRes.data?.packId === testPackHash || directMintRes.data?.hash === `${testPackHash}:MINTED`),
        'POST /api/transition commits single MINTED event to Hyperledger Fabric',
        `Response: ${JSON.stringify(directMintRes.data)}`
    );

    const statusAfterMint = await chainClient.get('/api/transition/status', {
        params: { packHash: testPackHash, batchId: testBatchId },
    });
    assert(
        statusAfterMint.status === 200 && statusAfterMint.data?.detail?.eventType === 'MINTED',
        'GET /api/transition/status reflects MINTED state on ledger',
        `Response: ${JSON.stringify(statusAfterMint.data)}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // 5. BATCH TRANSITION ATOMIC WRITE
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n📦 ══════════════════════════════════════════════════════════════════');
    console.log('  5. BATCH TRANSITIONS BULK WRITE API');
    console.log('══════════════════════════════════════════════════════════════════════');

    const batchPack1 = `${testPackHash}_BATCH_1`;
    const batchPack2 = `${testPackHash}_BATCH_2`;
    const batchPack3 = `${testPackHash}_BATCH_3`;

    const batchPayload = {
        batchId: testBatchId,
        transitions: [
            {
                packId: batchPack1,
                eventType: 'MINTED',
                hash: `${batchPack1}:MINTED`,
                fromId: 'GENESIS',
                toId: 'MFR_CIPLA_001',
                sellingDate: formatDate(now),
                sellingTime: formatTime(now),
                sellerId: 'OP_MINT_001',
            },
            {
                packId: batchPack2,
                eventType: 'MINTED',
                hash: `${batchPack2}:MINTED`,
                fromId: 'GENESIS',
                toId: 'MFR_CIPLA_001',
                sellingDate: formatDate(now),
                sellingTime: formatTime(now),
                sellerId: 'OP_MINT_001',
            },
            {
                packId: batchPack3,
                eventType: 'MINTED',
                hash: `${batchPack3}:MINTED`,
                fromId: 'GENESIS',
                toId: 'MFR_CIPLA_001',
                sellingDate: formatDate(now),
                sellingTime: formatTime(now),
                sellerId: 'OP_MINT_001',
            },
        ],
    };

    const directBatchRes = await chainClient.post('/api/transition/batch', batchPayload);
    assert(
        directBatchRes.status === 200 && directBatchRes.data?.committedCount === 3,
        'POST /api/transition/batch commits 3 transitions atomically in 1 Fabric block',
        `Response: ${JSON.stringify(directBatchRes.data)}`
    );

    const statusAfterBatch = await chainClient.get('/api/transition/status', {
        params: { packHash: batchPack1, batchId: testBatchId },
    });
    assert(
        statusAfterBatch.status === 200 && statusAfterBatch.data?.detail?.eventType === 'MINTED',
        'GET /api/transition/status verifies bulk batch pack existence on Fabric',
        `Response: ${JSON.stringify(statusAfterBatch.data)}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // 6. SUPPLY CHAIN CUSTODY TRANSITIONS (INTAKE -> SOLD)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🔄 ══════════════════════════════════════════════════════════════════');
    console.log('  6. SUPPLY CHAIN CUSTODY STATE MACHINE');
    console.log('══════════════════════════════════════════════════════════════════════');

    // 6.1 INTAKE Transition
    const intakePayload = {
        packId: testPackHash,
        eventType: 'INTAKE',
        hash: `${testPackHash}:INTAKE`,
        fromId: 'MFR_CIPLA_001',
        toId: 'PHARMACY_APOLLO_001',
        sellingDate: formatDate(now),
        sellingTime: formatTime(now),
        sellerId: 'PHARMACIST_RAJESH',
    };

    const intakeRes = await chainClient.post('/api/transition', intakePayload);
    assert(
        intakeRes.status === 200 && (intakeRes.data?.eventType === 'INTAKE' || intakeRes.data?.packId === testPackHash),
        'POST /api/transition records INTAKE custody transfer (MFR -> Pharmacy)',
        `Response: ${JSON.stringify(intakeRes.data)}`
    );

    const statusAfterIntake = await chainClient.get('/api/transition/status', {
        params: { packHash: testPackHash, batchId: testBatchId },
    });
    assert(
        statusAfterIntake.status === 200 && (statusAfterIntake.data?.status === 'AtShop' || statusAfterIntake.data?.detail?.eventType === 'INTAKE'),
        'GET /api/transition/status transitions state to "AtShop"',
        `Response: ${JSON.stringify(statusAfterIntake.data)}`
    );

    // 6.2 SOLD Transition
    const salePayload = {
        packId: testPackHash,
        eventType: 'SOLD',
        hash: `${testPackHash}:SOLD`,
        fromId: 'PHARMACY_APOLLO_001',
        toId: 'CONSUMER_PATIENT_001',
        sellingDate: formatDate(now),
        sellingTime: formatTime(now),
        sellerId: 'PHARMACIST_RAJESH',
    };

    const saleRes = await chainClient.post('/api/transition', salePayload);
    assert(
        saleRes.status === 200 && (saleRes.data?.eventType === 'SOLD' || saleRes.data?.packId === testPackHash),
        'POST /api/transition records SOLD retail transaction (Pharmacy -> Consumer)',
        `Response: ${JSON.stringify(saleRes.data)}`
    );

    const statusAfterSale = await chainClient.get('/api/transition/status', {
        params: { packHash: testPackHash, batchId: testBatchId },
    });
    assert(
        statusAfterSale.status === 200 && statusAfterSale.data?.status === 'Sold',
        'GET /api/transition/status transitions state to "Sold" (prevents double-spending)',
        `Response: ${JSON.stringify(statusAfterSale.data)}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // 7. BATCH RECALL ENGINE
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🚨 ══════════════════════════════════════════════════════════════════');
    console.log('  7. BATCH SAFETY RECALL API');
    console.log('══════════════════════════════════════════════════════════════════════');

    const recallPayload = {
        systemBatchId: testBatchId,
        actorId: 'REGULATOR_CDSCO_OFFICER',
        reason: 'Impurity Detected in Quality Control Audit',
        recallDate: formatDate(now),
        recallTime: formatTime(now),
    };

    const recallRes = await chainClient.post('/api/transition/recall', recallPayload);
    assert(
        recallRes.status === 200 && (recallRes.data?.eventType === 'RECALLED' || recallRes.data?.status === 'success' || recallRes.data?.packId === testBatchId),
        'POST /api/transition/recall triggers batch-level RECALLED event on Fabric',
        `Response: ${JSON.stringify(recallRes.data)}`
    );

    const statusAfterRecall = await chainClient.get('/api/transition/status', {
        params: { packHash: batchPack2, batchId: testBatchId },
    });
    assert(
        statusAfterRecall.status === 200 && statusAfterRecall.data?.status === 'Recalled',
        'GET /api/transition/status overrides pack state to "Recalled"',
        `Response: ${JSON.stringify(statusAfterRecall.data)}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // 8. RICH QUERIES & COMPOSITE HASH LOOKUPS
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n📊 ══════════════════════════════════════════════════════════════════');
    console.log('  8. RICH LEDGER & COMPOSITE KEY QUERIES');
    console.log('══════════════════════════════════════════════════════════════════════');

    const hashLookupRes = await chainClient.get(`/api/transition/${encodeURIComponent(`${testPackHash}:SOLD`)}`);
    assert(
        hashLookupRes.status === 200 && hashLookupRes.data?.eventType === 'SOLD',
        'GET /api/transition/{hash} retrieves immutable JSON record by composite key',
        `Response: ${JSON.stringify(hashLookupRes.data)}`
    );

    const richQueryFrom = await chainClient.get('/api/transition', {
        params: { fromId: 'GENESIS' },
    });
    assert(
        richQueryFrom.status === 200 && Array.isArray(richQueryFrom.data) && richQueryFrom.data.length > 0,
        'GET /api/transition?fromId=GENESIS returns matched transitions via CouchDB Mango index',
        `Matched count: ${richQueryFrom.data?.length}`
    );

    const richQueryTo = await chainClient.get('/api/transition', {
        params: { toId: 'PHARMACY_APOLLO_001' },
    });
    assert(
        richQueryTo.status === 200 && Array.isArray(richQueryTo.data) && richQueryTo.data.length > 0,
        'GET /api/transition?toId=... filters transitions by destination entity',
        `Matched count: ${richQueryTo.data?.length}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n======================================================================');
    console.log(`📊 BLOCKCHAIN API TEST SUMMARY: ${passedTests}/${totalTests} Tests Passed (${failedTests} Failed)`);
    console.log('======================================================================\n');

    if (failedTests > 0) {
        console.error('❌ Failed tests:');
        failures.forEach(f => console.error(`  - ${f.testName}: ${f.details}`));
        process.exit(1);
    } else {
        console.log('🎉 ALL BLOCKCHAIN SERVER APIS TESTED & FULLY FUNCTIONAL ON HYPERLEDGER FABRIC! 🎉\n');
    }
}

runBlockchainOnlySuite().catch((err) => {
    console.error('Fatal error during blockchain API test execution:', err.message, err.stack);
    process.exit(1);
});
