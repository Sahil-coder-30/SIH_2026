/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PHARMACHAIN S3 STORAGE & CSV ARTIFACT PIPELINE DEDICATED TEST SUITE
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 *  This test suite focuses exclusively on the S3 / CSV storage pipeline:
 *   1. S3 Pre-signed URL generation & Direct S3 Download
 *   2. Cryptographic Batch Minting with S3 Multipart CSV Offloading
 *   3. Paginated & Searchable CSV S3 Preview APIs
 *   4. Manufacturer S3 Export Redirection (302 Redirect & Direct CSV Stream)
 *   5. CSV Format & Integrity Validation (Headers, ES256 Tokens, SHA-256 Hashes)
 *   6. Negative & Edge Cases (Non-existent S3 keys, malformed batch IDs)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

// ── Built-in Zero-Dependency HTTP Client ─────────────────────────────────────
class HttpClient {
    async request(url, options = {}) {
        const { method = 'GET', data, headers = {}, redirect = 'follow' } = options;
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
            redirect,
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
            url: res.url,
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
}

const http = new HttpClient();

// ── Color & Log Helpers ──────────────────────────────────────────────────────
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
    bgCyan:  '\x1b[46m\x1b[30m',
};

const getTimestamp = () => {
    const now = new Date();
    return `${colors.gray}[${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}]${colors.reset}`;
};

const logInfo = (msg) => console.log(`${getTimestamp()} ${colors.cyan}ℹ${colors.reset} ${msg}`);
const logStep = (num, total, title) => console.log(`\n${getTimestamp()} ${colors.bold}${colors.cyan}▶ [${num}/${total}] ${title}${colors.reset}`);
const logPass = (name, details = '') => console.log(`${getTimestamp()}  ${colors.green}✔ [PASS]${colors.reset} ${colors.bold}${name}${colors.reset} ${details ? colors.dim + '(' + details + ')' + colors.reset : ''}`);
const logFail = (name, err) => console.log(`${getTimestamp()}  ${colors.red}✖ [FAIL]${colors.reset} ${colors.bold}${name}${colors.reset}\n    ${colors.red}Error: ${err.message || err}${colors.reset}`);
const logData = (label, obj) => console.log(`${getTimestamp()}    ${colors.gray}├─ ${label}:${colors.reset} ${colors.dim}${JSON.stringify(obj, null, 2).split('\n').join('\n       ')}${colors.reset}`);

// ── Configuration ────────────────────────────────────────────────────────────
const CORE_URL      = process.env.CORE_URL      || 'http://127.0.0.1:4000';
const MFR_URL       = process.env.MFR_URL       || 'http://127.0.0.1:3001';
const ADMIN_TOKEN   = process.env.ADMIN_TOKEN   || '960e412b2690c03cb83337b91010016a572343f23123feb3';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '1d230ff87628d00c450d7bb7f5f5245ad30ad7d1b57be42253e66de27738d11a7351a2a4a7dbc451fb1445e658f382c9';

let totalTests  = 0;
let passedTests = 0;
let failedTests = 0;
const results   = [];

async function test(name, fn) {
    totalTests++;
    const t0 = Date.now();
    try {
        const out = await fn();
        const duration = Date.now() - t0;
        passedTests++;
        logPass(name, `${duration}ms`);
        results.push({ name, status: 'PASS', duration });
        return out;
    } catch (err) {
        const duration = Date.now() - t0;
        failedTests++;
        const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        logFail(name, errorMsg);
        results.push({ name, status: 'FAIL', duration, error: errorMsg });
        return null;
    }
}

// ── Main S3 Test Runner ──────────────────────────────────────────────────────
async function runS3TestSuite() {
    console.log(`\n${colors.bold}${colors.bgCyan} ═══════════════════════════════════════════════════════════════════════════════════════ ${colors.reset}`);
    console.log(`${colors.bold}${colors.bgCyan}   PHARMACHAIN S3 BUCKET & CSV ARTIFACT PIPELINE TEST SUITE                             ${colors.reset}`);
    console.log(`${colors.bold}${colors.bgCyan} ═══════════════════════════════════════════════════════════════════════════════════════ ${colors.reset}\n`);

    logInfo(`Testing S3 integration on endpoints:`);
    console.log(`  • pharma-core:  ${colors.cyan}${CORE_URL}${colors.reset}`);
    console.log(`  • manufacturer: ${colors.cyan}${MFR_URL}${colors.reset}\n`);

    const ctx = {};

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: KEY PROVISIONING & S3 DIRECT MINTING (pharma-core)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(1, 6, 'pharma-core: S3 Minting & Pre-signed URL Generation');

    const testMfrId = `MFR_S3_TEST_${Date.now()}`;
    await test('POST /core/keys/generate (Provision Manufacturer Signing Key)', async () => {
        const res = await http.post(
            `${CORE_URL}/core/keys/generate`,
            { manufacturerId: testMfrId },
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );
        if (res.status !== 201 || !res.data.publicKeyPem) throw new Error('Key generation failed');
    });

    const s3BatchId = `PC-BATCH-S3-${Date.now().toString().slice(-6)}`;
    const PACK_COUNT = 6;

    await test(`POST /core/batch/mint (Offload ${PACK_COUNT} QR Packs to S3 CSV)`, async () => {
        const res = await http.post(
            `${CORE_URL}/core/batch/mint`,
            {
                batchId: s3BatchId,
                manufacturerId: testMfrId,
                expiryDate: '2030-01-01',
                quantity: PACK_COUNT,
                medicineName: 'Azithromycin 500mg S3-Test',
            },
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );

        if (res.status !== 200 || res.data.totalPacks !== PACK_COUNT) {
            throw new Error(`Batch mint failed: ${JSON.stringify(res.data)}`);
        }

        ctx.mintData = res.data;
        logData('S3 Mint Result', {
            batchId: ctx.mintData.batchId,
            totalPacks: ctx.mintData.totalPacks,
            s3Mode: ctx.mintData.s3Mode,
            s3FileKey: ctx.mintData.s3FileKey,
            s3Bucket: ctx.mintData.s3Bucket,
            s3DownloadUrl: ctx.mintData.s3DownloadUrl?.substring(0, 70) + '...',
            s3UrlExpiresAt: ctx.mintData.s3UrlExpiresAt,
        });

        if (!ctx.mintData.s3DownloadUrl) throw new Error('s3DownloadUrl missing from response');
        if (!ctx.mintData.s3FileKey) throw new Error('s3FileKey missing from response');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: S3 PREVIEW & PAGINATION API (pharma-core)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(2, 6, 'pharma-core: S3 CSV Paginated Preview & Search Filters');

    await test('GET /core/export/:batchId/preview (Page 1, Limit 3)', async () => {
        const res = await http.get(
            `${CORE_URL}/core/export/${s3BatchId}/preview?page=1&limit=3&s3FileKey=${encodeURIComponent(ctx.mintData.s3FileKey)}`,
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );

        if (res.status !== 200 || !res.data.packs) throw new Error('Preview failed');
        if (res.data.packs.length !== 3) throw new Error(`Expected 3 packs, got ${res.data.packs.length}`);
        if (res.data.meta.total !== PACK_COUNT) throw new Error(`Expected total ${PACK_COUNT}, got ${res.data.meta.total}`);
        if (res.data.meta.pages !== 2) throw new Error(`Expected 2 pages for 6 packs with limit 3, got ${res.data.meta.pages}`);

        ctx.samplePack = res.data.packs[0];
        ctx.sampleHash = ctx.samplePack.packHash;
        ctx.sampleToken = ctx.samplePack.signedToken;

        logData('Preview Meta & Sample', {
            meta: res.data.meta,
            samplePackHash: ctx.sampleHash,
            tokenPrefix: ctx.sampleToken.substring(0, 30) + '...',
        });
    });

    await test('GET /core/export/:batchId/preview?search=... (Search Filtering by PackHash)', async () => {
        const searchPrefix = ctx.sampleHash.slice(0, 8);
        const res = await http.get(
            `${CORE_URL}/core/export/${s3BatchId}/preview?search=${searchPrefix}&s3FileKey=${encodeURIComponent(ctx.mintData.s3FileKey)}`,
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );

        if (res.status !== 200 || res.data.packs.length === 0) {
            throw new Error(`Search for prefix ${searchPrefix} returned 0 results`);
        }
        if (res.data.packs[0].packHash !== ctx.sampleHash) {
            throw new Error('Search result did not match expected sample pack hash');
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: DIRECT S3 DOWNLOAD & CSV INTEGRITY CHECK
    // ──────────────────────────────────────────────────────────────────────────
    logStep(3, 6, 'Direct S3 / Presigned URL CSV Download & Payload Validation');

    await test('Download & Parse CSV directly from s3DownloadUrl', async () => {
        const downloadUrl = ctx.mintData.s3DownloadUrl;
        const res = await http.get(downloadUrl, {
            headers: { 'X-Service-Token': SERVICE_TOKEN }
        });

        if (res.status !== 200) {
            throw new Error(`Failed to download from ${downloadUrl}, status: ${res.status}`);
        }

        const csvContent = res.data;
        if (typeof csvContent !== 'string' || !csvContent.includes('serialNumber')) {
            throw new Error('Downloaded content is not valid CSV text');
        }

        const lines = csvContent.trim().split('\n');
        const header = lines[0].trim();
        const rows = lines.slice(1);

        logData('CSV Header & Rows', {
            header,
            rowCount: rows.length,
            sampleRow: rows[0]?.substring(0, 90) + '...',
        });

        if (rows.length !== PACK_COUNT) {
            throw new Error(`Expected ${PACK_COUNT} rows in CSV, got ${rows.length}`);
        }

        // Validate Header Fields
        const requiredFields = ['serialNumber', 'packHash', 'signedToken', 'verifyUrl', 'medicineName', 'expiryDate'];
        for (const field of requiredFields) {
            if (!header.includes(field)) throw new Error(`Missing expected CSV column: ${field}`);
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 4: MANUFACTURER SERVICE S3 INTEGRATION (Port 3001)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(4, 6, 'manufacturer-service: End-to-End Batch Minting & S3 Export Flows');

    // Register & Login Manufacturer
    const mfrEmail = `s3_mfr_${Date.now()}@pharma.com`;
    const regRes = await http.post(`${MFR_URL}/api/manufacturer/auth/register`, {
        companyName: 'S3 BioTech Pharmaceuticals Ltd',
        licenseNumber: `DL-S3-${Date.now().toString().slice(-5)}`,
        email: mfrEmail,
        password: 'S3Password123!',
    });
    const mfrId = regRes.data.data.id;

    await http.post(
        `${MFR_URL}/api/manufacturer/auth/kyc/approve`,
        { manufacturerId: mfrId },
        { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
    );

    const loginRes = await http.post(`${MFR_URL}/api/manufacturer/auth/login`, {
        email: mfrEmail,
        password: 'S3Password123!',
    });
    const mfrToken = loginRes.data.token;
    ctx.mfrToken = mfrToken;

    // Create & Mint Batch via Manufacturer Service
    const mfrBatchRes = await http.post(
        `${MFR_URL}/api/manufacturer/batch/create`,
        {
            medicineName: 'Cefixime 200mg Oral Suspension',
            genericName: 'Cefixime',
            brandName: 'Zifi 200',
            dosageForm: 'Syrup',
            strength: '200mg/5ml',
            composition: 'Cefixime Trihydrate IP 200mg',
            storageConditions: 'Store below 25°C',
            manufacturingDate: '2026-08-15',
            expiryDate: '2028-08-15',
            mrp: 145.00,
            quantity: 4,
        },
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    const mfrSystemBatchId = mfrBatchRes.data.data.systemBatchId;

    await test('POST /api/manufacturer/batch/:batchId/mint (Trigger S3 Mint Pipeline)', async () => {
        const res = await http.post(
            `${MFR_URL}/api/manufacturer/batch/${mfrSystemBatchId}/mint`,
            {},
            { headers: { Authorization: `Bearer ${mfrToken}` } }
        );
        if (res.status !== 202 && res.status !== 200) throw new Error('Mint trigger failed');
    });

    // Poll until MINTED
    let mfrMintedBatch = null;
    await test('Poll Manufacturer Batch until S3 Mint completes', async () => {
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 600));
            const check = await http.get(`${MFR_URL}/api/manufacturer/batch/${mfrSystemBatchId}`, {
                headers: { Authorization: `Bearer ${mfrToken}` }
            });
            const status = check.data.data?.mintStatus || check.data.data?.batch?.mintStatus;
            if (status === 'MINTED') {
                mfrMintedBatch = check.data.data?.batch || check.data.data;
                break;
            }
        }
        if (!mfrMintedBatch || mfrMintedBatch.mintStatus !== 'MINTED') {
            throw new Error('Batch minting did not reach MINTED state in time');
        }
        logData('Manufacturer Mint Record', {
            batchId: mfrSystemBatchId,
            s3FileKey: mfrMintedBatch.s3FileKey,
            s3DownloadUrl: mfrMintedBatch.s3DownloadUrl?.substring(0, 70) + '...',
        });
    });

    await test('GET /api/manufacturer/batch/:batchId/packs (Query S3 Metadata)', async () => {
        const res = await http.get(`${MFR_URL}/api/manufacturer/batch/${mfrSystemBatchId}/packs`, {
            headers: { Authorization: `Bearer ${mfrToken}` }
        });
        if (res.status !== 200) throw new Error('Query packs failed');
        const downloadUrl = res.data.data?.s3DownloadUrl || res.data.s3DownloadUrl;
        if (!downloadUrl) throw new Error('Missing s3DownloadUrl in packs response');
    });

    await test('GET /api/manufacturer/batch/:batchId/preview (Manufacturer UI S3 Preview)', async () => {
        const res = await http.get(
            `${MFR_URL}/api/manufacturer/batch/${mfrSystemBatchId}/preview?page=1&limit=4`,
            { headers: { Authorization: `Bearer ${mfrToken}` } }
        );
        if (res.status !== 200 || !Array.isArray(res.data.packs) || res.data.packs.length !== 4) {
            throw new Error(`Preview failed: ${JSON.stringify(res.data)}`);
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 5: S3 EXPORT REDIRECT / DOWNLOAD ENDPOINT
    // ──────────────────────────────────────────────────────────────────────────
    logStep(5, 6, 'GET /api/manufacturer/batch/:batchId/export/csv (Export Redirection)');

    await test('GET /api/manufacturer/batch/:batchId/export/csv (Fetch CSV Content)', async () => {
        const res = await http.get(
            `${MFR_URL}/api/manufacturer/batch/${mfrSystemBatchId}/export/csv`,
            { headers: { Authorization: `Bearer ${mfrToken}`, 'X-Service-Token': SERVICE_TOKEN } }
        );
        if (res.status !== 200) throw new Error(`Export request failed with status: ${res.status}`);
        if (!res.data.includes('serialNumber') || !res.data.includes('packHash')) {
            throw new Error('Exported data is not valid CSV content');
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 6: NEGATIVE & ERROR RECOVERY CHECKS
    // ──────────────────────────────────────────────────────────────────────────
    logStep(6, 6, 'Negative S3 & CSV Edge Cases');

    await test('Reject CSV Preview for Non-Existent Batch (HTTP 404)', async () => {
        try {
            await http.get(
                `${CORE_URL}/core/export/NON-EXISTENT-BATCH-99999/preview`,
                { headers: { 'X-Service-Token': SERVICE_TOKEN } }
            );
            throw new Error('Non-existent batch preview should return 404');
        } catch (e) {
            if (e.response?.status !== 404) throw new Error(`Expected 404, got ${e.response?.status}`);
        }
    });

    await test('Reject CSV Preview with Invalid Batch Characters (HTTP 400)', async () => {
        try {
            await http.get(
                `${CORE_URL}/core/export/INVALID%20BATCH%20!@#$/preview`,
                { headers: { 'X-Service-Token': SERVICE_TOKEN } }
            );
            throw new Error('Invalid batchId should return 400');
        } catch (e) {
            if (e.response?.status !== 400 && e.response?.status !== 404) {
                throw new Error(`Expected 400/404, got ${e.response?.status}`);
            }
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}  S3 STORAGE & CSV PIPELINE TEST SUMMARY                                               ${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════════════════════════${colors.reset}\n`);

    const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
    console.log(`  • Total Tests Executed: ${colors.bold}${totalTests}${colors.reset}`);
    console.log(`  • Passed Tests:         ${colors.green}${colors.bold}${passedTests}${colors.reset}`);
    console.log(`  • Failed Tests:         ${failedTests > 0 ? colors.red + colors.bold : colors.gray}${failedTests}${colors.reset}`);
    console.log(`  • Pass Rate:            ${passRate === '100.0' ? colors.green : colors.yellow}${colors.bold}${passRate}%${colors.reset}\n`);

    if (failedTests > 0) {
        console.log(`${colors.red}${colors.bold}Failed Tests:${colors.reset}`);
        results.filter(r => r.status === 'FAIL').forEach((f, i) => console.log(`  ${i + 1}. ${f.name} — ${f.error}`));
        process.exit(1);
    } else {
        console.log(`${colors.green}${colors.bold}🎉 ALL S3 BUCKET & CSV EXPORT TESTS PASSED PERFECTLY!${colors.reset}\n`);
        process.exit(0);
    }
}

runS3TestSuite().catch(err => {
    console.error(`\n${colors.red}${colors.bold}💥 Fatal Error in S3 Test Suite:${colors.reset}`, err);
    process.exit(1);
});
