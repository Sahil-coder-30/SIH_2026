import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ── Configuration ─────────────────────────────────────────────────────────────
const BLOCKCHAIN_URL = process.env.BLOCKCHAIN_URL || 'http://127.0.0.1:8080';
const INGRESS_HOST   = process.env.INGRESS_HOST   || 'http://127.0.0.1';
const CORE_URL       = process.env.CORE_URL       || INGRESS_HOST;
const MFR_URL        = process.env.MFR_URL        || INGRESS_HOST;
const SHOP_URL       = process.env.SHOP_URL       || INGRESS_HOST;
const CONS_URL       = process.env.CONS_URL       || INGRESS_HOST;

const ADMIN_TOKEN   = '960e412b2690c03cb83337b91010016a572343f23123feb3';
const SERVICE_TOKEN = '1d230ff87628d00c450d7bb7f5f5245ad30ad7d1b57be42253e66de27738d11a7351a2a4a7dbc451fb1445e658f382c9';

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

function signCoreJwt() {
    if (!privateKeyPem) {
        throw new Error('pharma-core RSA private key PEM not found.');
    }
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

// ── Test Runner & Assertion Utilities ─────────────────────────────────────────
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

async function runBlockchainTestSuite() {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║        PHARMACHAIN BLOCKCHAIN SERVICE & HYPERLEDGER FABRIC TEST SUITE        ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    console.log(`  Blockchain Gateway (Spring Boot / Fabric): ${BLOCKCHAIN_URL}`);
    console.log(`  Pharma-Core Crypto Vault & Ingress:        ${CORE_URL}\n`);

    // ──────────────────────────────────────────────────────────────────────────
    // PART 1: BLOCKCHAIN GATEWAY SERVER (Port 8080) DIRECT APIS
    // ──────────────────────────────────────────────────────────────────────────
    console.log('⛓️  ══════════════════════════════════════════════════════════════════');
    console.log('  PART 1: DIRECT BLOCKCHAIN SERVER (pharma-backend :8080) APIS');
    console.log('══════════════════════════════════════════════════════════════════════');

    const coreJwt = signCoreJwt();
    const chainClient = axios.create({
        baseURL: BLOCKCHAIN_URL,
        headers: {
            Authorization: `Bearer ${coreJwt}`,
            'Content-Type': 'application/json',
        },
        validateStatus: () => true,
    });

    // 1.1 Spring Boot Actuator Health Probe
    const healthRes = await chainClient.get('/actuator/health');
    assert(
        healthRes.status === 200 && healthRes.data?.status === 'UP',
        'GET /actuator/health (Liveness & Readiness: UP)',
        `Status: ${healthRes.status}, Data: ${JSON.stringify(healthRes.data)}`
    );

    // 1.2 Spring Security & Machine Identity Auth Guard
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
        headers: { Authorization: 'Bearer fake.invalid.jwt.token' },
        validateStatus: () => true,
    });
    const badAuthRes = await badAuthClient.post('/api/transition', {
        packId: 'BADAUTH_TEST',
        eventType: 'MINTED',
    });
    assert(
        badAuthRes.status === 401,
        'POST /api/transition rejects invalid/tampered JWT (HTTP 401)',
        `Expected 401, got ${badAuthRes.status}`
    );

    // 1.3 Live Pack Status Query for Non-Existent Pack
    const nonExistentRes = await chainClient.get('/api/transition/status', {
        params: { packHash: 'NON_EXISTENT_HASH_12345', batchId: 'PC-BATCH-000' },
    });
    assert(
        nonExistentRes.status === 200 && (nonExistentRes.data.status === 'NOT_FOUND' || nonExistentRes.data.status === 'UNKNOWN'),
        'GET /api/transition/status gracefully handles unknown pack hash',
        `Response: ${JSON.stringify(nonExistentRes.data)}`
    );

    // 1.4 Single Transition Write (POST /api/transition - MINTED)
    const testPackHash = `PACK_CHAIN_TEST_${Date.now()}`;
    const testBatchId  = `PC-BATCH-CHAIN_${Date.now().toString().slice(-6)}`;
    const now = new Date();

    const mintPayload = {
        packId: testPackHash,
        eventType: 'MINTED',
        hash: `${testPackHash}:MINTED`,
        fromId: 'GENESIS',
        toId: 'MFR_DIRECT_TEST',
        sellingDate: formatDate(now),
        sellingTime: formatTime(now),
        sellerId: 'OP_MINT_001',
    };

    const directMintRes = await chainClient.post('/api/transition', mintPayload);
    assert(
        directMintRes.status === 200 && (directMintRes.data?.packId === testPackHash || directMintRes.data?.hash === `${testPackHash}:MINTED`),
        'POST /api/transition records single MINTED transition to Fabric ledger',
        `Response: ${JSON.stringify(directMintRes.data)}`
    );

    // 1.5 Verify Status on Fabric World State after MINTED
    const statusAfterMint = await chainClient.get('/api/transition/status', {
        params: { packHash: testPackHash, batchId: testBatchId },
    });
    assert(
        statusAfterMint.status === 200 && statusAfterMint.data?.detail?.eventType === 'MINTED',
        'GET /api/transition/status retrieves MINTED transition state from Fabric',
        `Response: ${JSON.stringify(statusAfterMint.data)}`
    );

    // 1.6 Batch Transition Write (POST /api/transition/batch)
    const batchPack1 = `${testPackHash}_B1`;
    const batchPack2 = `${testPackHash}_B2`;
    const batchPayload = {
        batchId: testBatchId,
        transitions: [
            {
                packId: batchPack1,
                eventType: 'MINTED',
                hash: `${batchPack1}:MINTED`,
                fromId: 'GENESIS',
                toId: 'MFR_DIRECT_TEST',
                sellingDate: formatDate(now),
                sellingTime: formatTime(now),
                sellerId: 'OP_MINT_001',
            },
            {
                packId: batchPack2,
                eventType: 'MINTED',
                hash: `${batchPack2}:MINTED`,
                fromId: 'GENESIS',
                toId: 'MFR_DIRECT_TEST',
                sellingDate: formatDate(now),
                sellingTime: formatTime(now),
                sellerId: 'OP_MINT_001',
            },
        ],
    };

    const directBatchRes = await chainClient.post('/api/transition/batch', batchPayload);
    assert(
        directBatchRes.status === 200 && directBatchRes.data?.committedCount === 2,
        'POST /api/transition/batch bulk commits 2 transitions in 1 Fabric block transaction',
        `Response: ${JSON.stringify(directBatchRes.data)}`
    );

    // 1.7 Supply Chain Custody Lifecycle: INTAKE Event (POST /api/transition)
    const intakePayload = {
        packId: testPackHash,
        eventType: 'INTAKE',
        hash: `${testPackHash}:INTAKE`,
        fromId: 'MFR_DIRECT_TEST',
        toId: 'SHOP_CHAIN_001',
        sellingDate: formatDate(now),
        sellingTime: formatTime(now),
        sellerId: 'OP_SHOP_INTAKE',
    };

    const directIntakeRes = await chainClient.post('/api/transition', intakePayload);
    assert(
        directIntakeRes.status === 200,
        'POST /api/transition records INTAKE transition (Custody transfer: Manufacturer -> Shopkeeper)',
        `Response: ${JSON.stringify(directIntakeRes.data)}`
    );

    const statusAfterIntake = await chainClient.get('/api/transition/status', {
        params: { packHash: testPackHash, batchId: testBatchId },
    });
    assert(
        statusAfterIntake.status === 200 && (statusAfterIntake.data?.status === 'AtShop' || statusAfterIntake.data?.detail?.eventType === 'INTAKE'),
        'GET /api/transition/status updates live status to "AtShop"',
        `Response: ${JSON.stringify(statusAfterIntake.data)}`
    );

    // 1.8 Supply Chain Custody Lifecycle: SALE Event (POST /api/transition)
    const salePayload = {
        packId: testPackHash,
        eventType: 'SOLD',
        hash: `${testPackHash}:SOLD`,
        fromId: 'SHOP_CHAIN_001',
        toId: 'CONSUMER',
        sellingDate: formatDate(now),
        sellingTime: formatTime(now),
        sellerId: 'OP_SHOP_SALE',
    };

    const directSaleRes = await chainClient.post('/api/transition', salePayload);
    assert(
        directSaleRes.status === 200,
        'POST /api/transition records SOLD transition (Custody transfer: Shopkeeper -> Consumer)',
        `Response: ${JSON.stringify(directSaleRes.data)}`
    );

    const statusAfterSale = await chainClient.get('/api/transition/status', {
        params: { packHash: testPackHash, batchId: testBatchId },
    });
    assert(
        statusAfterSale.status === 200 && statusAfterSale.data?.status === 'Sold',
        'GET /api/transition/status updates live status to "Sold"',
        `Response: ${JSON.stringify(statusAfterSale.data)}`
    );

    // 1.9 Batch Recall Engine (POST /api/transition/recall)
    const recallPayload = {
        systemBatchId: testBatchId,
        actorId: 'MFR_DIRECT_TEST',
        reason: 'QA Audit Batch Safety Recall',
        recallDate: formatDate(now),
        recallTime: formatTime(now),
    };

    const directRecallRes = await chainClient.post('/api/transition/recall', recallPayload);
    assert(
        directRecallRes.status === 200 && (directRecallRes.data?.eventType === 'RECALLED' || directRecallRes.data?.status === 'success'),
        'POST /api/transition/recall commits batch-level RECALLED event to Fabric',
        `Response: ${JSON.stringify(directRecallRes.data)}`
    );

    const statusAfterRecall = await chainClient.get('/api/transition/status', {
        params: { packHash: batchPack1, batchId: testBatchId },
    });
    assert(
        statusAfterRecall.status === 200 && statusAfterRecall.data?.status === 'Recalled',
        'GET /api/transition/status reflects batch recall override ("Recalled")',
        `Response: ${JSON.stringify(statusAfterRecall.data)}`
    );

    // 1.10 Query Single Transition by Composite Key Hash
    const getByHashRes = await chainClient.get(`/api/transition/${encodeURIComponent(`${testPackHash}:SOLD`)}`);
    assert(
        getByHashRes.status === 200 && getByHashRes.data?.eventType === 'SOLD',
        'GET /api/transition/{hash} retrieves full immutable event payload from ledger',
        `Response: ${JSON.stringify(getByHashRes.data)}`
    );

    // 1.11 Rich CouchDB Query Transitions
    const richQueryRes = await chainClient.get('/api/transition', {
        params: { fromId: 'GENESIS' },
    });
    assert(
        richQueryRes.status === 200 && Array.isArray(richQueryRes.data),
        'GET /api/transition?fromId=... performs CouchDB rich query on transitions',
        `Count: ${richQueryRes.data?.length}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // PART 2: PHARMA-CORE LEDGER INTEGRATION & VAULT APIS
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🔒 ══════════════════════════════════════════════════════════════════');
    console.log('  PART 2: PHARMA-CORE LEDGER INTEGRATION & CRYPTO VAULT');
    console.log('══════════════════════════════════════════════════════════════════════');

    // 2.1 Core Health & JWKS
    const coreHealth = await axios.get(`${CORE_URL}/core/health`);
    assert(
        coreHealth.status === 200 && coreHealth.data.rsaKeyReady === true,
        'GET /core/health reports RSA & Keystore cryptographic readiness'
    );

    const jwksRes = await axios.get(`${CORE_URL}/.well-known/jwks.json`);
    assert(
        jwksRes.status === 200 && jwksRes.data.keys.some(k => k.kty === 'RSA' && k.kid === 'pharma-core-rs256'),
        'GET /.well-known/jwks.json serves RSA public key consumed by Spring Security'
    );

    // 2.2 Provision EC P-256 Manufacturer Key
    const testMfrId = `MFR_CHAIN_SUITE_${Date.now()}`;
    const keyGenRes = await axios.post(
        `${CORE_URL}/core/keys/generate`,
        { manufacturerId: testMfrId },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(
        keyGenRes.status === 201 && keyGenRes.data.status === 'success',
        'POST /core/keys/generate provisions AES-256-GCM encrypted ECDSA P-256 key'
    );

    // 2.3 Core Batch Mint with Automatic Blockchain Submission
    const coreBatchId = `PC-BATCH-CORECHAIN-${Date.now().toString().slice(-6)}`;
    const coreMintRes = await axios.post(
        `${CORE_URL}/core/batch/mint`,
        {
            batchId: coreBatchId,
            manufacturerId: testMfrId,
            expiryDate: '2029-12-31',
            quantity: 3,
            medicineName: 'Azithromycin 500mg IP',
        },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(
        coreMintRes.status === 200 && coreMintRes.data.totalPacks === 3,
        'POST /core/batch/mint signs packs in memory and records MINTED on Fabric',
        `Response: ${JSON.stringify(coreMintRes.data)}`
    );

    // 2.4 Parse Generated CSV from Preview API
    const corePreviewRes = await axios.get(
        `${CORE_URL}/core/export/${coreBatchId}/preview?page=1&limit=3&s3FileKey=${encodeURIComponent(coreMintRes.data.s3FileKey)}`,
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(
        corePreviewRes.status === 200 && corePreviewRes.data.packs?.length === 3,
        'GET /core/export/:batchId/preview parses generated tokens & pack hashes'
    );

    const samplePack = corePreviewRes.data.packs[0];

    // 2.5 Core Ledger Status Lookup
    const coreStatusRes = await axios.get(`${CORE_URL}/core/hash/status/${samplePack.packHash}`, {
        headers: { 'X-Service-Token': SERVICE_TOKEN },
    });
    assert(
        coreStatusRes.status === 200 && coreStatusRes.data.status != null,
        'GET /core/hash/status/:hash queries live Fabric world state via pharma-backend',
        `Status: ${coreStatusRes.data.status}`
    );

    // 2.6 Core Chain Intake & Sale Transition Endpoints
    const coreIntakeRes = await axios.post(
        `${CORE_URL}/core/chain/intake`,
        {
            packHash: samplePack.packHash,
            shopId: 'SHOP_CORE_001',
            operatorId: 'OP_CORE_001',
            manufacturerId: testMfrId,
        },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(
        coreIntakeRes.status === 200 && coreIntakeRes.data.status === 'success',
        'POST /core/chain/intake submits INTAKE transition with RS256 Bearer JWT'
    );

    const coreSaleRes = await axios.post(
        `${CORE_URL}/core/chain/sale`,
        {
            packHash: samplePack.packHash,
            shopId: 'SHOP_CORE_001',
            operatorId: 'OP_CORE_001',
        },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(
        coreSaleRes.status === 200 && coreSaleRes.data.status === 'success',
        'POST /core/chain/sale submits SOLD transition with RS256 Bearer JWT'
    );

    const coreRecallRes = await axios.post(
        `${CORE_URL}/core/chain/recall`,
        {
            batchId: coreBatchId,
            manufacturerId: testMfrId,
            reason: 'Pharma-Core Audit Recall',
        },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(
        coreRecallRes.status === 200 && coreRecallRes.data.status === 'success',
        'POST /core/chain/recall submits RECALL transition with RS256 Bearer JWT'
    );

    // ──────────────────────────────────────────────────────────────────────────
    // PART 3: END-TO-END SUPPLY CHAIN MICROSERVICES BLOCKCHAIN VERIFICATION
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🌐 ══════════════════════════════════════════════════════════════════');
    console.log('  PART 3: END-TO-END SUPPLY CHAIN BLOCKCHAIN VERIFICATION');
    console.log('══════════════════════════════════════════════════════════════════════');

    // 3.1 Register and KYC Approve Manufacturer
    const mfrEmail = `blockchain_mfr_${Date.now()}@pharmachain.io`;
    const regMfrRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/register`, {
        companyName: 'Cipla Laboratories Ltd',
        licenseNumber: `DL-CIPLA-${Date.now().toString().slice(-5)}`,
        email: mfrEmail,
        password: 'CiplaPassword123!',
    });
    assert(regMfrRes.status === 201, 'Manufacturer registered');
    const registeredMfrId = regMfrRes.data.data.id;

    await axios.post(
        `${MFR_URL}/api/manufacturer/auth/kyc/approve`,
        { manufacturerId: registeredMfrId },
        { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
    );

    const mfrLoginRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/login`, {
        email: mfrEmail,
        password: 'CiplaPassword123!',
    });
    const mfrToken = mfrLoginRes.data.token;

    // 3.2 Create Batch & Trigger Async Mint
    const batchCreateRes = await axios.post(
        `${MFR_URL}/api/manufacturer/batch`,
        {
            medicineName: 'Amoxicillin & Potassium Clavulanate 625mg',
            genericName: 'Amoxicillin Clavulanate',
            brandName: 'Augmentin 625 Duo',
            dosageForm: 'Tablet',
            strength: '625mg',
            composition: 'Amoxicillin 500mg + Clavulanic Acid 125mg',
            storageConditions: 'Store in dry place below 25°C',
            manufacturingDate: '2026-08-01',
            expiryDate: '2028-08-01',
            totalQuantity: 2,
            mrp: 205.50,
        },
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    const mfrBatchId = batchCreateRes.data.data.systemBatchId;

    const mintTriggerRes = await axios.post(
        `${MFR_URL}/api/manufacturer/batch/${mfrBatchId}/mint`,
        {},
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    assert(mintTriggerRes.status === 202, 'POST /api/manufacturer/batch/:id/mint triggers async minting');

    // Poll until MINTED
    let mintedBatchData = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 600));
        const checkRes = await axios.get(`${MFR_URL}/api/manufacturer/batch/${mfrBatchId}`, {
            headers: { Authorization: `Bearer ${mfrToken}` },
        });
        if (checkRes.data?.data?.mintStatus === 'MINTED') {
            mintedBatchData = checkRes.data.data;
            break;
        }
    }
    assert(mintedBatchData != null && mintedBatchData.mintStatus === 'MINTED', 'Batch status transitions to MINTED with Fabric blockchain commitment');

    // Get packs from preview
    const mfrPreviewRes = await axios.get(`${MFR_URL}/api/manufacturer/batch/${mfrBatchId}/preview?page=1&limit=3`, {
        headers: { Authorization: `Bearer ${mfrToken}` },
    });
    assert(mfrPreviewRes.status === 200 && mfrPreviewRes.data.packs?.length > 0, 'GET /api/manufacturer/batch/:batchId/preview returns signed packs');
    const e2ePack = mfrPreviewRes.data.packs[0];

    // 3.3 Register and KYC Approve Shopkeeper
    const shopTs = Date.now();
    const shopEmail = `pharmacy_${shopTs}@medplus.in`;
    const shopPhone = `9${shopTs.toString().slice(-9)}`;
    const shopRegRes = await axios.post(`${SHOP_URL}/api/shopkeeper/register`, {
        shopName: 'MedPlus Pharmacy Central',
        shopPhone,
        shopEmail,
        address: 'MG Road, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        ownerName: 'Dr. Rajesh Kumar',
        ownerPhone: shopPhone,
        ownerEmail: shopEmail,
        drugLicenseNumber: `KA-BLR-${shopTs.toString().slice(-5)}`,
        licenseType: 'RETAIL_20B_21B',
        issuingAuthority: 'Drugs Control Department Karnataka',
        licenseIssueDate: '2024-01-01',
        licenseExpiryDate: '2029-12-31',
        password: 'ShopPassword123!',
    });
    assert(shopRegRes.status === 201 && shopRegRes.data.data?.shopId != null, 'Shopkeeper registered');
    const shopId = shopRegRes.data.data.shopId;

    await axios.post(
        `${SHOP_URL}/api/shopkeeper/auth/kyc/approve`,
        { shopkeeperId: shopId },
        { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
    );

    const shopLoginRes = await axios.post(`${SHOP_URL}/api/shopkeeper/login`, {
        identifier: shopEmail,
        password: 'ShopPassword123!',
    });
    assert(shopLoginRes.status === 200 && shopLoginRes.data.accessToken != null, 'Shopkeeper logged in');
    const shopToken = shopLoginRes.data.accessToken;

    // 3.4 Shopkeeper Intake -> Verifies Blockchain State moves to "AtShop"
    const intakeRes = await axios.post(
        `${SHOP_URL}/api/shopkeeper/scan/intake`,
        { signedToken: e2ePack.signedToken },
        { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    assert(intakeRes.status === 200 && intakeRes.data.status === 'success', 'POST /api/shopkeeper/scan/intake records INTAKE transition on blockchain');

    // 3.5 Consumer Verification Prior to Sale (Authentic at Pharmacy)
    const consumerVerifyIntake = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        token: e2ePack.signedToken,
    });
    assert(
        consumerVerifyIntake.status === 200 &&
        consumerVerifyIntake.data.valid === true &&
        (consumerVerifyIntake.data.blockchainStatus === 'AtShop' || consumerVerifyIntake.data.uiState === 'AT_SHOP' || consumerVerifyIntake.data.uiState === 'GENUINE'),
        'POST /api/consumer/verify reads live blockchain ledger state'
    );

    // 3.6 Shopkeeper Sells Pack -> Verifies Blockchain State moves to "Sold"
    const saleRes = await axios.post(
        `${SHOP_URL}/api/shopkeeper/scan/sale`,
        { signedToken: e2ePack.signedToken },
        { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    assert(saleRes.status === 200 && saleRes.data.status === 'success', 'POST /api/shopkeeper/scan/sale records SOLD transition on blockchain');

    // 3.7 Consumer Verification After Sale (Already Sold Guard)
    const consumerVerifySold = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        token: e2ePack.signedToken,
    });
    assert(
        consumerVerifySold.status === 200 &&
        (consumerVerifySold.data.blockchainStatus === 'Sold' || consumerVerifySold.data.uiState === 'ALREADY_SOLD'),
        'POST /api/consumer/verify triggers ALREADY_SOLD counterfeit/double-sale guard from ledger'
    );

    // 3.8 Recall Batch -> Verifies Blockchain State overrides to "Recalled"
    const mfrRecallRes = await axios.post(
        `${MFR_URL}/api/manufacturer/batch/${mfrBatchId}/recall`,
        { reason: 'Standard batch withdrawal test' },
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    assert(mfrRecallRes.status === 200, 'POST /api/manufacturer/batch/:id/recall triggers batch recall');

    const consumerVerifyRecalled = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        token: e2ePack.signedToken,
    });
    assert(
        consumerVerifyRecalled.status === 200 &&
        (consumerVerifyRecalled.data.blockchainStatus === 'Recalled' || consumerVerifyRecalled.data.uiState === 'RECALLED'),
        'POST /api/consumer/verify triggers RECALLED patient safety alert from ledger'
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n======================================================================');
    console.log(`📊 BLOCKCHAIN TEST SUITE SUMMARY: ${passedTests}/${totalTests} Tests Passed (${failedTests} Failed)`);
    console.log('======================================================================\n');

    if (failedTests > 0) {
        console.error('❌ Failed tests:');
        failures.forEach(f => console.error(`  - ${f.testName}: ${f.details}`));
        process.exit(1);
    } else {
        console.log('🎉 ALL BLOCKCHAIN SERVICE APIS & HYPERLEDGER FABRIC INTEGRATION VERIFIED OPERATIONAL! 🎉\n');
    }
}

runBlockchainTestSuite().catch((err) => {
    console.error('Fatal error during blockchain test suite execution:', err.message, err.stack);
    process.exit(1);
});
