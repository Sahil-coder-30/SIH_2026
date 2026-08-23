/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PHARMACHAIN COMPLETE MICROSERVICES END-TO-END API TEST SUITE
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 *  This test suite executes comprehensive, safe, and structured tests across
 *  all 4 PharmaChain microservices:
 *    1. pharma-core       (Port 4000) — Crypto Vault, Key Management, JWKS, Minting & Ledger
 *    2. manufacturer      (Port 3001) — Registration, KYC, Batch Management, Async Minting
 *    3. shopkeeper        (Port 3002) — Registration, KYC, Intake/Sale Scans, Idempotent Txns
 *    4. consumer          (Port 3003) — Stateless QR Verification & Counterfeit Incident Reporting
 *
 *  Features:
 *   • ZERO External Dependencies: Uses Node.js native fetch (Node 18+)
 *   • Safe Execution: Isolated test steps with individual try/catch & latency tracking
 *   • Rich Step-by-Step Logging: Timestamped, colorized output with request/response metadata
 *   • Idempotent & Non-Colliding: Auto-generates unique IDs, emails, license numbers
 *   • Comprehensive Coverage: 50+ API tests covering positive, negative, and edge cases
 * ══════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

// ── Built-in Zero-Dependency HTTP Client (Axios-compatible interface) ────────
class HttpClient {
    async request(url, options = {}) {
        const { method = 'GET', data, headers = {} } = options;
        const reqHeaders = { ...headers };

        let body = undefined;
        if (data !== undefined) {
            if (typeof data === 'object') {
                body = JSON.stringify(data);
                if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
                    reqHeaders['Content-Type'] = 'application/json';
                }
            } else {
                body = String(data);
            }
        }

        const res = await fetch(url, {
            method,
            headers: reqHeaders,
            body,
        });

        const contentType = res.headers.get('content-type') || '';
        let resData;
        if (contentType.includes('application/json')) {
            try {
                resData = await res.json();
            } catch {
                resData = await res.text();
            }
        } else {
            resData = await res.text();
        }

        const responseObj = {
            status: res.status,
            statusText: res.statusText,
            data: resData,
            headers: Object.fromEntries(res.headers.entries()),
        };

        if (res.status >= 400) {
            const error = new Error(`Request failed with status code ${res.status}`);
            error.response = responseObj;
            error.status = res.status;
            throw error;
        }

        return responseObj;
    }

    get(url, config = {}) {
        return this.request(url, { method: 'GET', ...config });
    }

    post(url, data, config = {}) {
        return this.request(url, { method: 'POST', data, ...config });
    }

    patch(url, data, config = {}) {
        return this.request(url, { method: 'PATCH', data, ...config });
    }

    delete(url, config = {}) {
        return this.request(url, { method: 'DELETE', ...config });
    }
}

const axios = new HttpClient();

// ── Color & Format Helpers ───────────────────────────────────────────────────
const colors = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    green:   '\x1b[32m',
    red:     '\x1b[31m',
    yellow:  '\x1b[33m',
    blue:    '\x1b[34m',
    cyan:    '\x1b[36m',
    magenta: '\x1b[35m',
    gray:    '\x1b[90m',
    bgBlue:  '\x1b[44m\x1b[37m',
};

const getTimestamp = () => {
    const now = new Date();
    return `${colors.gray}[${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}]${colors.reset}`;
};

const logInfo  = (msg) => console.log(`${getTimestamp()} ${colors.cyan}ℹ${colors.reset} ${msg}`);
const logStep  = (step, total, title) => console.log(`\n${getTimestamp()} ${colors.bold}${colors.blue}▶ [${step}/${total}] ${title}${colors.reset}`);
const logPass  = (name, details = '') => console.log(`${getTimestamp()}  ${colors.green}✔ [PASS]${colors.reset} ${colors.bold}${name}${colors.reset} ${details ? colors.dim + '(' + details + ')' + colors.reset : ''}`);
const logFail  = (name, err) => console.log(`${getTimestamp()}  ${colors.red}✖ [FAIL]${colors.reset} ${colors.bold}${name}${colors.reset}\n    ${colors.red}Error: ${err.message || err}${colors.reset}`);
const logWarn  = (msg) => console.log(`${getTimestamp()}  ${colors.yellow}⚠ [WARN]${colors.reset} ${msg}`);
const logData  = (label, obj) => console.log(`${getTimestamp()}    ${colors.gray}├─ ${label}:${colors.reset} ${colors.dim}${JSON.stringify(obj, null, 2).split('\n').join('\n       ')}${colors.reset}`);

// ── Environment & URL Configuration ──────────────────────────────────────────
const CORE_URL      = process.env.CORE_URL      || 'http://127.0.0.1:4000';
const MFR_URL       = process.env.MFR_URL       || 'http://127.0.0.1:3001';
const SHOP_URL      = process.env.SHOP_URL      || 'http://127.0.0.1:3002';
const CONS_URL      = process.env.CONS_URL      || 'http://127.0.0.1:3003';

const ADMIN_TOKEN   = process.env.ADMIN_TOKEN   || '960e412b2690c03cb83337b91010016a572343f23123feb3';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '1d230ff87628d00c450d7bb7f5f5245ad30ad7d1b57be42253e66de27738d11a7351a2a4a7dbc451fb1445e658f382c9';

// ── Global Metrics & State ───────────────────────────────────────────────────
let totalCount  = 0;
let passedCount = 0;
let failedCount = 0;
const testResults = [];

/**
 * Safe Test Runner Wrapper
 */
async function runTest(testName, testFn) {
    totalCount++;
    const startTime = Date.now();
    try {
        const result = await testFn();
        const duration = Date.now() - startTime;
        passedCount++;
        logPass(testName, `${duration}ms`);
        testResults.push({ name: testName, status: 'PASS', duration });
        return result;
    } catch (err) {
        const duration = Date.now() - startTime;
        failedCount++;
        const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        logFail(testName, errorMsg);
        testResults.push({ name: testName, status: 'FAIL', duration, error: errorMsg });
        return null;
    }
}

// ── Master Test Suite ────────────────────────────────────────────────────────
async function executeFullApiTestSuite() {
    console.log(`\n${colors.bold}${colors.bgBlue} ═══════════════════════════════════════════════════════════════════════════════════════ ${colors.reset}`);
    console.log(`${colors.bold}${colors.bgBlue}   PHARMACHAIN COMPLETE 4-SERVICE API & END-TO-END TEST SUITE                          ${colors.reset}`);
    console.log(`${colors.bold}${colors.bgBlue} ═══════════════════════════════════════════════════════════════════════════════════════ ${colors.reset}\n`);

    logInfo(`Target Service Endpoints:`);
    console.log(`  • pharma-core:        ${colors.cyan}${CORE_URL}${colors.reset}`);
    console.log(`  • manufacturer:       ${colors.cyan}${MFR_URL}${colors.reset}`);
    console.log(`  • shopkeeper:         ${colors.cyan}${SHOP_URL}${colors.reset}`);
    console.log(`  • consumer:           ${colors.cyan}${CONS_URL}${colors.reset}`);
    console.log(`  • timestamp:          ${new Date().toISOString()}\n`);

    const sharedContext = {};

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 1: PHARMA-CORE CRYPTO VAULT SERVICE (Port 4000)
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`\n${colors.bold}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}  SECTION 1: PHARMA-CORE CRYPTO VAULT & LEDGER SERVICE (${CORE_URL})             ${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

    // 1.1 Health Probes
    logStep(1, 10, 'pharma-core: Health, Readiness & Crypto Keystore Status');
    await runTest('GET /healthz (pharma-core)', async () => {
        const res = await axios.get(`${CORE_URL}/healthz`);
        if (res.status !== 200 || res.data.status !== 'ok') throw new Error(`Unexpected response: ${JSON.stringify(res.data)}`);
    });

    await runTest('GET /readyz (pharma-core)', async () => {
        const res = await axios.get(`${CORE_URL}/readyz`);
        if (res.status !== 200 || res.data.status !== 'ok') throw new Error(`Unexpected readiness: ${JSON.stringify(res.data)}`);
    });

    await runTest('GET /core/health (Detailed Keystore & RSA readiness)', async () => {
        const res = await axios.get(`${CORE_URL}/core/health`);
        if (res.status !== 200 || !res.data.rsaKeyReady) throw new Error(`RSA keys not ready: ${JSON.stringify(res.data)}`);
        logData('Core Keystore State', { rsaReady: res.data.rsaKeyReady, keystoreReady: res.data.keystoreReady });
    });

    // 1.2 JWKS & Discovery
    logStep(2, 10, 'pharma-core: JWKS & OpenID Configuration Discovery');
    await runTest('GET /.well-known/jwks.json', async () => {
        const res = await axios.get(`${CORE_URL}/.well-known/jwks.json`);
        if (res.status !== 200 || !Array.isArray(res.data.keys)) throw new Error('Invalid JWKS structure');
        if (!res.data.keys.some(k => k.kty === 'RSA')) throw new Error('JWKS missing RSA key specification');
    });

    await runTest('GET /jwks.json (Direct alias)', async () => {
        const res = await axios.get(`${CORE_URL}/jwks.json`);
        if (res.status !== 200 || res.data.keys?.length === 0) throw new Error('JWKS alias empty');
    });

    await runTest('GET /.well-known/openid-configuration', async () => {
        const res = await axios.get(`${CORE_URL}/.well-known/openid-configuration`);
        if (res.status !== 200 || res.data.issuer !== 'pharma-core') throw new Error('Invalid OIDC config');
    });

    // 1.3 Key Management
    logStep(3, 10, 'pharma-core: EC P-256 Key Management (Protected with X-Service-Token)');
    const testMfrId = `MFR_TEST_${Date.now()}`;
    await runTest('POST /core/keys/generate (Provision EC P-256 Keypair)', async () => {
        const res = await axios.post(
            `${CORE_URL}/core/keys/generate`,
            { manufacturerId: testMfrId },
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );
        if (res.status !== 201 || !res.data.publicKeyPem?.includes('PUBLIC KEY')) {
            throw new Error(`Failed to generate key: ${JSON.stringify(res.data)}`);
        }
        sharedContext.generatedKeyMfr = testMfrId;
        sharedContext.publicKeyPem = res.data.publicKeyPem;
    });

    await runTest('GET /core/keys/public/:manufacturerId', async () => {
        const res = await axios.get(`${CORE_URL}/core/keys/public/${testMfrId}`, {
            headers: { 'X-Service-Token': SERVICE_TOKEN }
        });
        if (res.status !== 200 || !res.data.publicKeyPem?.includes('PUBLIC KEY')) {
            throw new Error('Could not retrieve public key PEM');
        }
    });

    await runTest('GET /core/keys/stats (Keystore Metrics)', async () => {
        const res = await axios.get(`${CORE_URL}/core/keys/stats`, {
            headers: { 'X-Service-Token': SERVICE_TOKEN }
        });
        if (res.status !== 200 || typeof res.data.totalKeys !== 'number') {
            throw new Error('Failed to retrieve keystore stats');
        }
        logData('Keystore Stats', res.data);
    });

    // 1.4 Direct Core Minting & Export
    logStep(4, 10, 'pharma-core: Direct In-Memory Batch Minting & S3/Local CSV Export');
    const directCoreBatchId = `PC-BATCH-CORE-${Date.now().toString().slice(-6)}`;
    await runTest('POST /core/batch/mint (Batch Minting 3 Packs)', async () => {
        const res = await axios.post(
            `${CORE_URL}/core/batch/mint`,
            {
                batchId: directCoreBatchId,
                manufacturerId: testMfrId,
                expiryDate: '2029-06-30',
                quantity: 3,
                medicineName: 'Azithromycin 500mg IP',
            },
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );
        if (res.status !== 200 || res.data.totalPacks !== 3) {
            throw new Error(`Unexpected mint response: ${JSON.stringify(res.data)}`);
        }
        sharedContext.directCoreBatch = res.data;
    });

    await runTest('GET /core/export/:batchId/preview (Paginated CSV Preview)', async () => {
        const fileKey = sharedContext.directCoreBatch.s3FileKey;
        const res = await axios.get(
            `${CORE_URL}/core/export/${directCoreBatchId}/preview?page=1&limit=5&s3FileKey=${encodeURIComponent(fileKey)}`,
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );
        if (res.status !== 200 || !Array.isArray(res.data.packs) || res.data.packs.length !== 3) {
            throw new Error(`CSV preview failed: ${JSON.stringify(res.data)}`);
        }
        sharedContext.coreSamplePack = res.data.packs[0];
        logData('Sample Minted Pack (pharma-core)', {
            packHash: sharedContext.coreSamplePack.packHash,
            tokenPrefix: sharedContext.coreSamplePack.signedToken.slice(0, 30) + '...',
        });
    });

    // 1.5 Hash Verification & Chaincode
    logStep(5, 10, 'pharma-core: Hash Verification & Chaincode State Transitions');
    await runTest('POST /core/hash/verify (Verify Genuine Token)', async () => {
        const res = await axios.post(
            `${CORE_URL}/core/hash/verify`,
            { signedToken: sharedContext.coreSamplePack.signedToken },
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );
        if (res.status !== 200 || res.data.valid !== true) {
            throw new Error(`Genuine token failed validation: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('POST /core/hash/verify (Reject Tampered Token with valid: false)', async () => {
        const tampered = sharedContext.coreSamplePack.signedToken.slice(0, -6) + 'XXXXXX';
        const res = await axios.post(
            `${CORE_URL}/core/hash/verify`,
            { signedToken: tampered },
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );
        if (res.status !== 200 || res.data.valid !== false) {
            throw new Error(`Tampered token should return HTTP 200 with valid:false: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('GET /core/hash/status/:hash (Query Ledger Status)', async () => {
        const res = await axios.get(`${CORE_URL}/core/hash/status/${sharedContext.coreSamplePack.packHash}`, {
            headers: { 'X-Service-Token': SERVICE_TOKEN }
        });
        if (res.status !== 200) throw new Error(`Hash status query failed: ${JSON.stringify(res.data)}`);
    });

    await runTest('POST /core/chain/intake (Chaincode Transition)', async () => {
        const res = await axios.post(
            `${CORE_URL}/core/chain/intake`,
            {
                packHash: sharedContext.coreSamplePack.packHash,
                shopId: 'SHOP-TEST-CORE',
                operatorId: 'OP-TEST-001',
                manufacturerId: testMfrId,
            },
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );
        if (res.status !== 200 || res.data.status !== 'success') {
            throw new Error(`Chain intake failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('POST /core/chain/sale (Chaincode Transition)', async () => {
        const res = await axios.post(
            `${CORE_URL}/core/chain/sale`,
            {
                packHash: sharedContext.coreSamplePack.packHash,
                shopId: 'SHOP-TEST-CORE',
                operatorId: 'OP-TEST-001',
            },
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );
        if (res.status !== 200 || res.data.status !== 'success') {
            throw new Error(`Chain sale failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('Security Check: Reject Unauthenticated Request to /core/keys/stats', async () => {
        try {
            await axios.get(`${CORE_URL}/core/keys/stats`);
            throw new Error('Should have been rejected without service token');
        } catch (e) {
            if (e.response?.status !== 401 && e.response?.status !== 403) {
                throw new Error(`Expected 401/403, got ${e.response?.status}`);
            }
        }
    });


    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 2: MANUFACTURER SERVICE (Port 3001)
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`\n${colors.bold}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}  SECTION 2: MANUFACTURER DOMAIN SERVICE (${MFR_URL})                            ${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

    logStep(6, 10, 'manufacturer: Health Probes & Registration Flow');
    await runTest('GET /healthz & /readyz (manufacturer-service)', async () => {
        const [h, r] = await Promise.all([
            axios.get(`${MFR_URL}/healthz`),
            axios.get(`${MFR_URL}/readyz`),
        ]);
        if (h.status !== 200 || r.status !== 200) throw new Error('Health check failed');
    });

    const mfrEmail = `dr_reddys_${Date.now()}@pharma.com`;
    const mfrLicense = `DL-DR-${Date.now().toString().slice(-6)}`;
    await runTest('POST /api/manufacturer/auth/register (Create PENDING Account)', async () => {
        const res = await axios.post(`${MFR_URL}/api/manufacturer/auth/register`, {
            companyName: "Dr. Reddy's Laboratories",
            licenseNumber: mfrLicense,
            email: mfrEmail,
            password: 'SecureMfrPassword123!',
        });
        if (res.status !== 201 || res.data.data.kycStatus !== 'PENDING') {
            throw new Error(`Registration failed: ${JSON.stringify(res.data)}`);
        }
        sharedContext.mfrId = res.data.data.id;
        logData('Registered Manufacturer', { id: sharedContext.mfrId, email: mfrEmail });
    });

    await runTest('Security Check: Reject Login for Unapproved KYC (HTTP 403)', async () => {
        try {
            await axios.post(`${MFR_URL}/api/manufacturer/auth/login`, {
                email: mfrEmail,
                password: 'SecureMfrPassword123!',
            });
            throw new Error('Unapproved manufacturer was able to login');
        } catch (e) {
            if (e.response?.status !== 403) throw new Error(`Expected 403 Forbidden, got ${e.response?.status}`);
        }
    });

    logStep(7, 10, 'manufacturer: KYC Approval & Batch Minting Pipeline');
    await runTest('POST /api/manufacturer/auth/kyc/approve (Approve & Provision Key)', async () => {
        const res = await axios.post(
            `${MFR_URL}/api/manufacturer/auth/kyc/approve`,
            { manufacturerId: sharedContext.mfrId },
            { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
        );
        if (res.status !== 200 || res.data.kycStatus !== 'APPROVED') {
            throw new Error(`KYC approval failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('POST /api/manufacturer/auth/login (JWT Generation)', async () => {
        const res = await axios.post(`${MFR_URL}/api/manufacturer/auth/login`, {
            email: mfrEmail,
            password: 'SecureMfrPassword123!',
        });
        if (res.status !== 200 || !res.data.token) {
            throw new Error(`Login failed: ${JSON.stringify(res.data)}`);
        }
        sharedContext.mfrToken = res.data.token;
    });

    await runTest('POST /api/manufacturer/batch/create (Create Medicine Batch)', async () => {
        const res = await axios.post(
            `${MFR_URL}/api/manufacturer/batch/create`,
            {
                medicineName: 'Amoxicillin & Potassium Clavulanate 625mg',
                genericName: 'Amoxicillin Clavulanate',
                brandName: 'Augmentin 625 Duo',
                dosageForm: 'Tablet',
                strength: '625mg',
                composition: 'Amoxicillin 500mg + Clavulanic Acid 125mg',
                storageConditions: 'Store below 25°C in a dry place',
                manufacturingDate: '2026-08-01',
                expiryDate: '2028-12-31',
                mrp: 210.50,
                quantity: 5,
            },
            { headers: { Authorization: `Bearer ${sharedContext.mfrToken}` } }
        );
        if (res.status !== 201 || !res.data.data.systemBatchId) {
            throw new Error(`Batch creation failed: ${JSON.stringify(res.data)}`);
        }
        sharedContext.mfrBatchId = res.data.data.systemBatchId;
        logData('Created Batch', { systemBatchId: sharedContext.mfrBatchId });
    });

    await runTest('GET /api/manufacturer/batch (List Batches with Pagination)', async () => {
        const res = await axios.get(`${MFR_URL}/api/manufacturer/batch`, {
            headers: { Authorization: `Bearer ${sharedContext.mfrToken}` }
        });
        if (res.status !== 200 || !Array.isArray(res.data.data)) {
            throw new Error(`List batches failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('GET /api/manufacturer/batch/:batchId (Query Batch Metadata)', async () => {
        const res = await axios.get(`${MFR_URL}/api/manufacturer/batch/${sharedContext.mfrBatchId}`, {
            headers: { Authorization: `Bearer ${sharedContext.mfrToken}` }
        });
        if (res.status !== 200) throw new Error(`Get batch failed: ${JSON.stringify(res.data)}`);
    });

    await runTest('POST /api/manufacturer/batch/:batchId/mint (Trigger Async Minting)', async () => {
        const res = await axios.post(
            `${MFR_URL}/api/manufacturer/batch/${sharedContext.mfrBatchId}/mint`,
            {},
            { headers: { Authorization: `Bearer ${sharedContext.mfrToken}` } }
        );
        if (res.status !== 202 && res.status !== 200) {
            throw new Error(`Mint trigger failed: ${JSON.stringify(res.data)}`);
        }
    });

    // Poll until MINTED
    await runTest('Poll Batch Mint Status until MINTED', async () => {
        let batchDoc = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 600));
            const check = await axios.get(`${MFR_URL}/api/manufacturer/batch/${sharedContext.mfrBatchId}`, {
                headers: { Authorization: `Bearer ${sharedContext.mfrToken}` }
            });
            const status = check.data.data?.mintStatus || check.data.data?.batch?.mintStatus;
            if (status === 'MINTED') {
                batchDoc = check.data.data?.batch || check.data.data;
                break;
            }
        }
        if (!batchDoc || batchDoc.mintStatus !== 'MINTED') {
            throw new Error('Batch minting timed out or did not complete');
        }
        sharedContext.mintedBatch = batchDoc;
    });

    await runTest('GET /api/manufacturer/batch/:batchId/preview (Preview Minted QR Packs)', async () => {
        const res = await axios.get(
            `${MFR_URL}/api/manufacturer/batch/${sharedContext.mfrBatchId}/preview?page=1&limit=5`,
            { headers: { Authorization: `Bearer ${sharedContext.mfrToken}` } }
        );
        if (res.status !== 200 || !Array.isArray(res.data.packs) || res.data.packs.length === 0) {
            throw new Error(`Preview failed: ${JSON.stringify(res.data)}`);
        }
        sharedContext.mfrSamplePack = res.data.packs[0];
        logData('Sample Minted Pack from Manufacturer', {
            packHash: sharedContext.mfrSamplePack.packHash,
            tokenExcerpt: sharedContext.mfrSamplePack.signedToken.slice(0, 35) + '...',
        });
    });

    await runTest('GET /api/manufacturer/batch/:batchId/packs (S3 Download URL Info)', async () => {
        const res = await axios.get(`${MFR_URL}/api/manufacturer/batch/${sharedContext.mfrBatchId}/packs`, {
            headers: { Authorization: `Bearer ${sharedContext.mfrToken}` }
        });
        if (res.status !== 200) throw new Error(`Packs info failed: ${JSON.stringify(res.data)}`);
    });

    await runTest('GET /api/manufacturer/batch/public/:batchId (Public Medicine Details)', async () => {
        const res = await axios.get(`${MFR_URL}/api/manufacturer/batch/public/${sharedContext.mfrBatchId}`);
        if (res.status !== 200 || !res.data.data?.medicineName) {
            throw new Error(`Public batch details failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('GET /api/manufacturer/batch/pack/lookup/:identifier (Universal Search)', async () => {
        const res = await axios.get(`${MFR_URL}/api/manufacturer/batch/pack/lookup/${sharedContext.mfrBatchId}`, {
            headers: { Authorization: `Bearer ${sharedContext.mfrToken}` }
        });
        if (res.status !== 200) throw new Error(`Lookup failed: ${JSON.stringify(res.data)}`);
    });

    await runTest('POST /api/manufacturer/auth/logout (Session Invalidation)', async () => {
        const res = await axios.post(`${MFR_URL}/api/manufacturer/auth/logout`);
        if (res.status !== 204 && res.status !== 200) throw new Error('Logout failed');
    });


    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 3: SHOPKEEPER SERVICE (Port 3002)
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`\n${colors.bold}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}  SECTION 3: SHOPKEEPER DOMAIN SERVICE (${SHOP_URL})                              ${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

    logStep(8, 10, 'shopkeeper: Health, Registration, KYC & Authentication Suite');
    await runTest('GET /healthz & /readyz (shopkeeper-service)', async () => {
        const [h, r] = await Promise.all([
            axios.get(`${SHOP_URL}/healthz`),
            axios.get(`${SHOP_URL}/readyz`),
        ]);
        if (h.status !== 200 || r.status !== 200) throw new Error('Health check failed');
    });

    const shopTs = Date.now();
    const shopEmail = `apollo_${shopTs}@pharmacy.com`;
    const shopPhone = `9${shopTs.toString().slice(-9)}`;
    const shopLicense = `KA-APOLLO-${shopTs.toString().slice(-5)}`;

    await runTest('POST /api/shopkeeper/register (New Pharmacy Registration)', async () => {
        const res = await axios.post(`${SHOP_URL}/api/shopkeeper/register`, {
            shopName: 'Apollo Care Pharmacy 24/7',
            shopPhone,
            shopEmail,
            address: '123 Brigade Road',
            city: 'Bengaluru',
            state: 'Karnataka',
            pincode: '560025',
            ownerName: 'Anil Kumar',
            ownerPhone: shopPhone,
            ownerEmail: shopEmail,
            drugLicenseNumber: shopLicense,
            licenseType: 'RETAIL_20B_21B',
            issuingAuthority: 'Drugs Control Department Karnataka',
            licenseIssueDate: '2024-01-01',
            licenseExpiryDate: '2029-12-31',
            password: 'ShopkeeperPassword123!',
        });
        if (res.status !== 201 || !res.data.data.shopId) {
            throw new Error(`Shopkeeper registration failed: ${JSON.stringify(res.data)}`);
        }
        sharedContext.shopId = res.data.data.shopId;
        logData('Registered Shopkeeper', { shopId: sharedContext.shopId, email: shopEmail });
    });

    // Pre-KYC Login & Status Check
    let pendingToken = null;
    await runTest('POST /api/shopkeeper/login (Pre-KYC Pending Account Login)', async () => {
        const res = await axios.post(`${SHOP_URL}/api/shopkeeper/login`, {
            identifier: shopEmail,
            password: 'ShopkeeperPassword123!',
        });
        if (res.status !== 200 || !res.data.accessToken) {
            throw new Error(`Expected login to succeed for status check, got ${res.status}`);
        }
        pendingToken = res.data.accessToken;
    });

    await runTest('Security Check: Block Protected Operations Before KYC Approval (HTTP 403)', async () => {
        try {
            await axios.get(`${SHOP_URL}/api/shopkeeper/inventory`, {
                headers: { Authorization: `Bearer ${pendingToken}` }
            });
            throw new Error('Unverified shopkeeper was able to access inventory');
        } catch (e) {
            if (e.response?.status !== 403) throw new Error(`Expected 403 Forbidden, got ${e.response?.status}`);
        }
    });

    await runTest('POST /api/shopkeeper/auth/kyc/approve (Admin KYC Verification)', async () => {
        const res = await axios.post(
            `${SHOP_URL}/api/shopkeeper/auth/kyc/approve`,
            { shopkeeperId: sharedContext.shopId },
            { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
        );
        if (res.status !== 200 || res.data.status !== 'success') {
            throw new Error(`KYC approval failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('POST /api/shopkeeper/login (Post-KYC Issue Access & Refresh Tokens)', async () => {
        const res = await axios.post(`${SHOP_URL}/api/shopkeeper/login`, {
            identifier: shopEmail,
            password: 'ShopkeeperPassword123!',
        });
        if (res.status !== 200 || (!res.data.accessToken && !res.data.data?.accessToken)) {
            throw new Error(`Shopkeeper login failed: ${JSON.stringify(res.data)}`);
        }
        sharedContext.shopToken = res.data.accessToken || res.data.data?.accessToken;
        sharedContext.shopRefreshToken = res.data.refreshToken || res.data.data?.refreshToken;
    });

    await runTest('GET /api/shopkeeper/auth/verification-status (Check Verified Status)', async () => {
        const res = await axios.get(`${SHOP_URL}/api/shopkeeper/auth/verification-status`, {
            headers: { Authorization: `Bearer ${sharedContext.shopToken}` }
        });
        if (res.status !== 200 || res.data.data.shopId !== sharedContext.shopId) {
            throw new Error(`Verification status check failed: ${JSON.stringify(res.data)}`);
        }
    });

    if (sharedContext.shopRefreshToken) {
        await runTest('POST /api/shopkeeper/auth/refresh (Rotate Tokens)', async () => {
            const res = await axios.post(`${SHOP_URL}/api/shopkeeper/auth/refresh`, {
                refreshToken: sharedContext.shopRefreshToken,
            });
            if (res.status !== 200 || !res.data.accessToken) {
                throw new Error(`Token refresh failed: ${JSON.stringify(res.data)}`);
            }
            sharedContext.shopToken = res.data.accessToken;
            if (res.data.refreshToken) sharedContext.shopRefreshToken = res.data.refreshToken;
        });
    }

    await runTest('POST /api/shopkeeper/auth/forgot-password & reset-password flow', async () => {
        const forgotRes = await axios.post(`${SHOP_URL}/api/shopkeeper/auth/forgot-password`, {
            identifier: shopEmail,
        });
        if (forgotRes.status !== 200) throw new Error('Forgot password request failed');

        const resetToken = forgotRes.data._devResetToken;
        if (resetToken) {
            const resetRes = await axios.post(`${SHOP_URL}/api/shopkeeper/auth/reset-password`, {
                token: resetToken,
                password: 'NewShopkeeperPassword123!',
            });
            if (resetRes.status !== 200) throw new Error('Reset password failed');

            // Re-login with new password
            const newLogin = await axios.post(`${SHOP_URL}/api/shopkeeper/login`, {
                identifier: shopEmail,
                password: 'NewShopkeeperPassword123!',
            });
            sharedContext.shopToken = newLogin.data.accessToken || newLogin.data.data?.accessToken;
        }
    });

    logStep(9, 10, 'shopkeeper: Dashboard, Inventory, Scans & Idempotent Transactions');
    await runTest('GET & PATCH /api/shopkeeper/profile (Profile Management)', async () => {
        const getRes = await axios.get(`${SHOP_URL}/api/shopkeeper/profile`, {
            headers: { Authorization: `Bearer ${sharedContext.shopToken}` }
        });
        if (getRes.status !== 200) throw new Error('Get profile failed');

        const patchRes = await axios.patch(
            `${SHOP_URL}/api/shopkeeper/profile`,
            { city: 'Bengaluru Central' },
            { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }
        );
        if (patchRes.status !== 200 || patchRes.data.data.shopkeeper.city !== 'Bengaluru Central') {
            throw new Error('Patch profile failed');
        }
    });

    await runTest('POST /api/shopkeeper/scan/intake (Intake Genuine Pack into Inventory)', async () => {
        const sampleToken = sharedContext.mfrSamplePack?.signedToken;
        if (!sampleToken) throw new Error('No sample pack token available from manufacturer mint');

        const res = await axios.post(
            `${SHOP_URL}/api/shopkeeper/scan/intake`,
            { signedToken: sampleToken },
            { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }
        );
        if (res.status !== 200 || res.data.status !== 'success') {
            throw new Error(`Intake scan failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('Security Check: Prevent Duplicate Pack Intake (HTTP 409 Conflict)', async () => {
        try {
            await axios.post(
                `${SHOP_URL}/api/shopkeeper/scan/intake`,
                { signedToken: sharedContext.mfrSamplePack.signedToken },
                { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }
            );
            throw new Error('Duplicate intake should have returned HTTP 409');
        } catch (e) {
            if (e.response?.status !== 409) throw new Error(`Expected 409 Conflict, got ${e.response?.status}`);
        }
    });

    await runTest('GET /api/shopkeeper/inventory (Query Available Stock)', async () => {
        const res = await axios.get(`${SHOP_URL}/api/shopkeeper/inventory`, {
            headers: { Authorization: `Bearer ${sharedContext.shopToken}` }
        });
        if (res.status !== 200 || !Array.isArray(res.data.data?.inventory)) {
            throw new Error(`Inventory query failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('POST /api/medicine/scan (Authenticated Pre-Sale Scan)', async () => {
        const res = await axios.post(
            `${SHOP_URL}/api/medicine/scan`,
            { signedToken: sharedContext.mfrSamplePack.signedToken },
            { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }
        );
        if (res.status !== 200 || res.data.valid !== true) {
            throw new Error(`Pre-sale scan validation failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('POST /api/v1/scan/customer (Public Consumer Scan on Shopkeeper)', async () => {
        const res = await axios.post(`${SHOP_URL}/api/v1/scan/customer`, {
            signedToken: sharedContext.mfrSamplePack.signedToken,
        });
        if (res.status !== 200 || res.data.valid !== true) {
            throw new Error(`Customer scan failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('POST /api/shopkeeper/scan/sale (Confirm Sale & Decrement Inventory)', async () => {
        const res = await axios.post(
            `${SHOP_URL}/api/shopkeeper/scan/sale`,
            { signedToken: sharedContext.mfrSamplePack.signedToken },
            { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }
        );
        if (res.status !== 200 || res.data.status !== 'success') {
            throw new Error(`Sale scan failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('GET /api/shopkeeper/stats & /api/shopkeeper/medicine/history', async () => {
        const [statsRes, histRes] = await Promise.all([
            axios.get(`${SHOP_URL}/api/shopkeeper/stats`, { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }),
            axios.get(`${SHOP_URL}/api/shopkeeper/medicine/history`, { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }),
        ]);
        if (statsRes.status !== 200 || histRes.status !== 200) {
            throw new Error('Stats or history query failed');
        }
    });

    // Idempotent Supply Chain Transactions
    const testPackId = `PACK-TEST-${Date.now().toString().slice(-5)}`;
    const idemKey = `IDEM-KEY-${Date.now()}`;
    await runTest('POST /api/transactions/receive (Idempotent Stock Receipt)', async () => {
        const res1 = await axios.post(
            `${SHOP_URL}/api/transactions/receive`,
            { packId: testPackId },
            {
                headers: {
                    Authorization: `Bearer ${sharedContext.shopToken}`,
                    'Idempotency-Key': idemKey,
                }
            }
        );
        if (res1.status !== 201 || res1.data.data.status !== 'RECEIVED') {
            throw new Error(`Transaction receive failed: ${JSON.stringify(res1.data)}`);
        }

        // Duplicate call with same idempotency key
        const res2 = await axios.post(
            `${SHOP_URL}/api/transactions/receive`,
            { packId: testPackId },
            {
                headers: {
                    Authorization: `Bearer ${sharedContext.shopToken}`,
                    'Idempotency-Key': idemKey,
                }
            }
        );
        if (res2.status !== 201 || res2.data.data.transactionId !== res1.data.data.transactionId) {
            throw new Error('Idempotent response mismatch');
        }
    });

    await runTest('POST /api/transactions/sell & /api/transactions/return (Supply Chain Ops)', async () => {
        const sellRes = await axios.post(
            `${SHOP_URL}/api/transactions/sell`,
            { packId: testPackId, customerPhone: '9988776655' },
            { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }
        );
        if (sellRes.status !== 201 || sellRes.data.data.status !== 'SOLD') {
            throw new Error(`Transaction sell failed: ${JSON.stringify(sellRes.data)}`);
        }

        const returnRes = await axios.post(
            `${SHOP_URL}/api/transactions/return`,
            { packId: testPackId, reason: 'CUSTOMER_RETURN' },
            { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }
        );
        if (returnRes.status !== 201 || returnRes.data.data.status !== 'RETURNED') {
            throw new Error(`Transaction return failed: ${JSON.stringify(returnRes.data)}`);
        }

        // Negative check: invalid reason
        try {
            await axios.post(
                `${SHOP_URL}/api/transactions/return`,
                { packId: testPackId, reason: 'INVALID_REASON_CODE' },
                { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }
            );
            throw new Error('Invalid return reason should fail');
        } catch (e) {
            if (e.response?.status !== 422) throw new Error(`Expected 422, got ${e.response?.status}`);
        }
    });

    await runTest('POST /api/shopkeeper/auth/logout (Shopkeeper Logout)', async () => {
        const res = await axios.post(
            `${SHOP_URL}/api/shopkeeper/auth/logout`,
            {},
            { headers: { Authorization: `Bearer ${sharedContext.shopToken}` } }
        );
        if (res.status !== 204 && res.status !== 200) throw new Error('Logout failed');
    });


    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 4: CONSUMER SERVICE (Port 3003)
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`\n${colors.bold}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}  SECTION 4: CONSUMER STATELESS VERIFICATION SERVICE (${CONS_URL})                ${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

    logStep(10, 10, 'consumer: Public Stateless Verification & Counterfeit Reporting');
    await runTest('GET /healthz & /readyz (consumer-service)', async () => {
        const [h, r] = await Promise.all([
            axios.get(`${CONS_URL}/healthz`),
            axios.get(`${CONS_URL}/readyz`),
        ]);
        if (h.status !== 200 || r.status !== 200) throw new Error('Health check failed');
    });

    await runTest('POST /api/consumer/verify (Full QR URL Verification)', async () => {
        const fullUrl = `https://pharmachain.gov.in/verify/${sharedContext.mfrSamplePack.packHash}?token=${sharedContext.mfrSamplePack.signedToken}`;
        const res = await axios.post(`${CONS_URL}/api/consumer/verify`, { qrData: fullUrl });
        if (res.status !== 200 || res.data.valid !== true) {
            throw new Error(`QR URL verification failed: ${JSON.stringify(res.data)}`);
        }
        logData('Verified Consumer Payload', {
            valid: res.data.valid,
            uiState: res.data.uiState,
            medicine: res.data.payload?.medicineName,
        });
    });

    await runTest('POST /api/consumer/verify (Raw Token Verification)', async () => {
        const res = await axios.post(`${CONS_URL}/api/consumer/verify`, {
            token: sharedContext.mfrSamplePack.signedToken,
        });
        if (res.status !== 200 || res.data.valid !== true) {
            throw new Error(`Raw token verification failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('GET /api/consumer/verify?token=... (Query Parameter Format)', async () => {
        const res = await axios.get(`${CONS_URL}/api/consumer/verify?token=${encodeURIComponent(sharedContext.mfrSamplePack.signedToken)}`);
        if (res.status !== 200 || res.data.valid !== true) {
            throw new Error(`GET query verification failed: ${JSON.stringify(res.data)}`);
        }
    });

    const counterfeitToken = sharedContext.mfrSamplePack.signedToken.slice(0, -6) + '999999';
    await runTest('POST /api/consumer/verify (Detect Counterfeit Signature -> COUNTERFEIT)', async () => {
        const res = await axios.post(`${CONS_URL}/api/consumer/verify`, {
            qrData: counterfeitToken,
        });
        if (res.status !== 200 || res.data.valid !== false || res.data.uiState !== 'COUNTERFEIT') {
            throw new Error(`Counterfeit detection failed: ${JSON.stringify(res.data)}`);
        }
    });

    await runTest('POST /api/consumer/report (Submit Counterfeit Incident Report)', async () => {
        const res = await axios.post(`${CONS_URL}/api/consumer/report`, {
            qrToken: counterfeitToken,
            location: 'Apollo Pharmacy, Indiranagar 100ft Road',
            notes: 'Hologram sticker appeared scratched, QR code failed official verification.',
            photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        });
        if (res.status !== 201 || res.data.status !== 'success' || !res.data.reportId) {
            throw new Error(`Counterfeit report submission failed: ${JSON.stringify(res.data)}`);
        }
        logData('Submitted Incident Report', { reportId: res.data.reportId, status: res.data.status });
    });


    // ──────────────────────────────────────────────────────────────────────────
    // FINAL TEST REPORT & SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`\n${colors.bold}${colors.blue}═══════════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.blue}  PHARMACHAIN TEST SUITE EXECUTION SUMMARY                                             ${colors.reset}`);
    console.log(`${colors.bold}${colors.blue}═══════════════════════════════════════════════════════════════════════════════════════${colors.reset}\n`);

    const passRate = totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(1) : 0;
    console.log(`  • Total Tests Executed: ${colors.bold}${totalCount}${colors.reset}`);
    console.log(`  • Passed Tests:         ${colors.green}${colors.bold}${passedCount}${colors.reset}`);
    console.log(`  • Failed Tests:         ${failedCount > 0 ? colors.red + colors.bold : colors.gray}${failedCount}${colors.reset}`);
    console.log(`  • Success Rate:         ${passRate === '100.0' ? colors.green : colors.yellow}${colors.bold}${passRate}%${colors.reset}\n`);

    if (failedCount > 0) {
        console.log(`${colors.red}${colors.bold}Failed Test Details:${colors.reset}`);
        testResults.filter(r => r.status === 'FAIL').forEach((f, idx) => {
            console.log(`  ${idx + 1}. ${f.name} — ${f.error}`);
        });
        console.log(`\n${colors.red}${colors.bold}❌ TEST SUITE FAILED${colors.reset}\n`);
        process.exit(1);
    } else {
        console.log(`${colors.green}${colors.bold}🎉 ALL ${passedCount}/${totalCount} API TESTS PASSED FLAWLESSLY ACROSS ALL 4 SERVICES!${colors.reset}\n`);
        process.exit(0);
    }
}

// Execute suite and handle unexpected unhandled rejections
executeFullApiTestSuite().catch((fatalErr) => {
    console.error(`\n${colors.red}${colors.bold}💥 Fatal Uncaught Error:${colors.reset}`, fatalErr);
    process.exit(1);
});
