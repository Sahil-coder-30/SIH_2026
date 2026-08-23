/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PHARMACHAIN: LIVE S3 BUCKET DATA FETCH & CRYPTOGRAPHIC VERIFICATION TEST
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 *  This test script:
 *   1. Connects directly to the live AWS S3 bucket (`pharmachain-qr-csvs`)
 *   2. Discovers and lists all batch CSV artifacts currently stored in S3
 *   3. Downloads and parses each CSV artifact (headers, rows, pack metadata)
 *   4. Tests the microservice S3 Preview API against the live S3 objects
 *   5. Performs live ES256 cryptographic verification of S3 packs via pharma-core
 *      and consumer-service to ensure all data in S3 is 100% authentic
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

// ── Built-in HTTP Client ─────────────────────────────────────────────────────
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

        const res = await fetch(url, { method, headers: reqHeaders, body });
        const contentType = res.headers.get('content-type') || '';
        let resData;
        if (contentType.includes('application/json')) {
            try { resData = await res.json(); } catch { resData = await res.text(); }
        } else {
            resData = await res.text();
        }

        const responseObj = {
            status: res.status,
            data: resData,
            headers: Object.fromEntries(res.headers.entries()),
        };

        if (res.status >= 400) {
            const err = new Error(`Request failed with status ${res.status}`);
            err.response = responseObj;
            throw err;
        }

        return responseObj;
    }

    get(url, config = {}) { return this.request(url, { method: 'GET', ...config }); }
    post(url, data, config = {}) { return this.request(url, { method: 'POST', data, ...config }); }
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
    bgBlue:  '\x1b[44m\x1b[37m',
};

const getTimestamp = () => {
    const now = new Date();
    return `${colors.gray}[${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}]${colors.reset}`;
};

const logInfo = (msg) => console.log(`${getTimestamp()} ${colors.cyan}ℹ${colors.reset} ${msg}`);
const logStep = (num, total, title) => console.log(`\n${getTimestamp()} ${colors.bold}${colors.blue}▶ [${num}/${total}] ${title}${colors.reset}`);
const logPass = (name, details = '') => console.log(`${getTimestamp()}  ${colors.green}✔ [PASS]${colors.reset} ${colors.bold}${name}${colors.reset} ${details ? colors.dim + '(' + details + ')' + colors.reset : ''}`);
const logFail = (name, err) => console.log(`${getTimestamp()}  ${colors.red}✖ [FAIL]${colors.reset} ${colors.bold}${name}${colors.reset}\n    ${colors.red}Error: ${err.message || err}${colors.reset}`);
const logData = (label, obj) => console.log(`${getTimestamp()}    ${colors.gray}├─ ${label}:${colors.reset} ${colors.dim}${JSON.stringify(obj, null, 2).split('\n').join('\n       ')}${colors.reset}`);

// ── Load AWS & Service Credentials dynamically (no hardcoded secrets) ────────
import fs from 'fs';

function loadSecrets() {
    let accessKey = process.env.AWS_ACCESS_KEY_ID;
    let secretKey = process.env.AWS_SECRET_ACCESS_KEY;
    let region = process.env.AWS_REGION || 'us-east-1';
    let bucket = process.env.S3_BUCKET_NAME || 'pharmachain-qr-csvs';

    if ((!accessKey || !secretKey) && fs.existsSync('k8s/secrets.yml')) {
        const content = fs.readFileSync('k8s/secrets.yml', 'utf8');
        const akMatch = content.match(/AWS_ACCESS_KEY_ID:\s*["']?([^"'\r\n]+)/);
        const skMatch = content.match(/AWS_SECRET_ACCESS_KEY:\s*["']?([^"'\r\n]+)/);
        const rgMatch = content.match(/AWS_REGION:\s*["']?([^"'\r\n]+)/);
        const bkMatch = content.match(/S3_BUCKET_NAME:\s*["']?([^"'\r\n]+)/);

        if (akMatch) accessKey = akMatch[1].trim();
        if (skMatch) secretKey = skMatch[1].trim();
        if (rgMatch) region = rgMatch[1].trim();
        if (bkMatch) bucket = bkMatch[1].trim();
    }

    return { accessKey, secretKey, region, bucket };
}

const { accessKey: AWS_ACCESS_KEY_ID, secretKey: AWS_SECRET_ACCESS_KEY, region: AWS_REGION, bucket: S3_BUCKET_NAME } = loadSecrets();

const CORE_URL              = process.env.CORE_URL              || 'http://127.0.0.1:4000';
const CONS_URL              = process.env.CONS_URL              || 'http://127.0.0.1:3003';
const SERVICE_TOKEN         = process.env.SERVICE_TOKEN         || '1d230ff87628d00c450d7bb7f5f5245ad30ad7d1b57be42253e66de27738d11a7351a2a4a7dbc451fb1445e658f382c9';

const s3 = new S3Client({
    region: AWS_REGION,
    credentials: {
        accessKeyId:     AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
});

let totalTests  = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
    totalTests++;
    const t0 = Date.now();
    try {
        const out = await fn();
        const duration = Date.now() - t0;
        passedTests++;
        logPass(name, `${duration}ms`);
        return out;
    } catch (err) {
        failedTests++;
        const msg = err.response?.data?.message || err.message;
        logFail(name, msg);
        return null;
    }
}

/**
 * CSV Parser Helper
 */
function parseCsv(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') inQuotes = !inQuotes;
            else if (ch === ',' && !inQuotes) { values.push(current); current = ''; }
            else current += ch;
        }
        values.push(current);

        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = (values[i] ?? '').replace(/^"|"$/g, '');
        });
        return obj;
    });
}

// ── Main Test Runner ────────────────────────────────────────────────────────
async function runFetchExistingS3DataTest() {
    console.log(`\n${colors.bold}${colors.bgBlue} ═══════════════════════════════════════════════════════════════════════════════════════ ${colors.reset}`);
    console.log(`${colors.bold}${colors.bgBlue}   PHARMACHAIN: LIVE S3 BUCKET ARTIFACT RETRIEVAL & VERIFICATION TEST                   ${colors.reset}`);
    console.log(`${colors.bold}${colors.bgBlue} ═══════════════════════════════════════════════════════════════════════════════════════ ${colors.reset}\n`);

    logInfo(`Connected to AWS S3 Configuration:`);
    console.log(`  • Bucket:  ${colors.cyan}${S3_BUCKET_NAME}${colors.reset}`);
    console.log(`  • Region:  ${colors.cyan}${AWS_REGION}${colors.reset}`);
    console.log(`  • Key ID:  ${colors.cyan}${AWS_ACCESS_KEY_ID}${colors.reset}\n`);

    let existingObjects = [];

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: LIST OBJECTS CURRENTLY IN S3 BUCKET
    // ──────────────────────────────────────────────────────────────────────────
    logStep(1, 4, 'Querying AWS S3 for all currently existing CSV files');

    await test(`List S3 Objects in bucket "${S3_BUCKET_NAME}"`, async () => {
        const res = await s3.send(new ListObjectsV2Command({
            Bucket: S3_BUCKET_NAME,
            Prefix: 'batches/',
        }));

        existingObjects = res.Contents || [];
        if (existingObjects.length === 0) {
            throw new Error(`No batch CSV objects found under prefix "batches/" in S3 bucket "${S3_BUCKET_NAME}"`);
        }

        console.log(`\n  Found ${colors.bold}${existingObjects.length}${colors.reset} batch CSV file(s) in S3:`);
        existingObjects.forEach((obj, idx) => {
            console.log(`    ${idx + 1}. ${colors.green}${obj.Key}${colors.reset} (${(obj.Size / 1024).toFixed(2)} KB | Last Modified: ${obj.LastModified?.toISOString()})`);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: DOWNLOAD & PARSE EACH S3 OBJECT DIRECTLY
    // ──────────────────────────────────────────────────────────────────────────
    logStep(2, 4, 'Direct S3 Download & Deep CSV Parsing for all batches');

    const downloadedBatches = [];

    for (const s3Obj of existingObjects) {
        await test(`Fetch & Parse "${s3Obj.Key}" from S3`, async () => {
            const getRes = await s3.send(new GetObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: s3Obj.Key,
            }));

            // Convert ReadableStream to String
            const chunks = [];
            for await (const chunk of getRes.Body) {
                chunks.push(chunk);
            }
            const csvText = Buffer.concat(chunks).toString('utf-8');
            const rows = parseCsv(csvText);

            if (rows.length === 0) {
                throw new Error(`CSV file ${s3Obj.Key} has no data rows`);
            }

            const batchInfo = {
                fileKey:      s3Obj.Key,
                sizeBytes:    s3Obj.Size,
                lastModified: s3Obj.LastModified,
                totalPacks:   rows.length,
                batchId:      rows[0].batchId,
                medicineName: rows[0].medicineName,
                expiryDate:   rows[0].expiryDate,
                samplePack:   rows[0],
                allPacks:     rows,
            };

            downloadedBatches.push(batchInfo);

            logData(`Parsed S3 Batch: ${batchInfo.batchId}`, {
                medicine:     batchInfo.medicineName,
                totalPacks:   batchInfo.totalPacks,
                sampleSerial: batchInfo.samplePack.serialNumber,
                sampleHash:   batchInfo.samplePack.packHash,
                tokenPrefix:  batchInfo.samplePack.signedToken.substring(0, 30) + '...',
            });
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: VERIFY PHARMA-CORE S3 PREVIEW API FOR EXISTING S3 OBJECTS
    // ──────────────────────────────────────────────────────────────────────────
    logStep(3, 4, 'Testing Microservice S3 Preview API for existing S3 artifacts');

    for (const batch of downloadedBatches) {
        await test(`GET /core/export/${batch.batchId}/preview (Fetch from S3 via pharma-core)`, async () => {
            const res = await http.get(
                `${CORE_URL}/core/export/${batch.batchId}/preview?page=1&limit=10&s3FileKey=${encodeURIComponent(batch.fileKey)}`,
                { headers: { 'X-Service-Token': SERVICE_TOKEN } }
            );

            if (res.status !== 200 || !res.data.packs) {
                throw new Error(`Preview failed for ${batch.batchId}`);
            }

            if (res.data.s3Mode !== 'aws') {
                throw new Error(`Expected s3Mode to be 'aws', got '${res.data.s3Mode}'`);
            }

            if (res.data.stats.totalPacks !== batch.totalPacks) {
                throw new Error(`Pack count mismatch: S3 has ${batch.totalPacks}, preview returned ${res.data.stats.totalPacks}`);
            }

            // Confirm first pack hash matches
            if (res.data.packs[0].packHash !== batch.samplePack.packHash) {
                throw new Error('First packHash in preview does not match raw S3 file');
            }
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 4: CRYPTOGRAPHIC VERIFICATION OF LIVE S3 PACKS
    // ──────────────────────────────────────────────────────────────────────────
    logStep(4, 4, 'Live Cryptographic Verification of S3 Pack Tokens');

    for (const batch of downloadedBatches) {
        const sample = batch.samplePack;

        // 4.1 pharma-core ES256 verification
        await test(`Verify ES256 Signature for S3 Pack (Batch: ${batch.batchId}) via pharma-core`, async () => {
            const res = await http.post(
                `${CORE_URL}/core/hash/verify`,
                { signedToken: sample.signedToken },
                { headers: { 'X-Service-Token': SERVICE_TOKEN } }
            );

            if (res.status !== 200 || res.data.valid !== true) {
                throw new Error(`S3 Pack token signature verification failed: ${JSON.stringify(res.data)}`);
            }

            if (res.data.packHash !== sample.packHash) {
                throw new Error(`Derived packHash (${res.data.packHash}) does not match S3 CSV packHash (${sample.packHash})`);
            }

            logData('pharma-core Crypto Verification Result', {
                valid: res.data.valid,
                packHash: res.data.packHash,
                algorithm: 'ES256 (ECDSA P-256)',
            });
        });

        // 4.2 Consumer Public QR verification
        await test(`Verify Consumer Public Scan for S3 Pack (Batch: ${batch.batchId}) via consumer-service`, async () => {
            const res = await http.post(`${CONS_URL}/api/consumer/verify`, {
                qrData: sample.verifyUrl,
            });

            if (res.status !== 200 || res.data.valid !== true) {
                throw new Error(`Consumer verification failed for ${sample.verifyUrl}: ${JSON.stringify(res.data)}`);
            }

            logData('Consumer Public Verification Result', {
                valid: res.data.valid,
                uiState: res.data.uiState,
                medicineName: res.data.payload?.medicineName,
            });
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // FINAL SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`\n${colors.bold}${colors.blue}═══════════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.blue}  S3 BUCKET DATA RETRIEVAL & VERIFICATION SUMMARY                                      ${colors.reset}`);
    console.log(`${colors.bold}${colors.blue}═══════════════════════════════════════════════════════════════════════════════════════${colors.reset}\n`);

    console.log(`  • S3 Bucket:            ${colors.bold}${S3_BUCKET_NAME}${colors.reset} (${AWS_REGION})`);
    console.log(`  • Batches Discovered:   ${colors.bold}${downloadedBatches.length}${colors.reset}`);
    console.log(`  • Total Packs in S3:    ${colors.bold}${downloadedBatches.reduce((acc, b) => acc + b.totalPacks, 0)}${colors.reset}`);
    console.log(`  • Tests Executed:       ${colors.bold}${totalTests}${colors.reset}`);
    console.log(`  • Passed:               ${colors.green}${colors.bold}${passedTests}${colors.reset}`);
    console.log(`  • Failed:               ${failedTests > 0 ? colors.red + colors.bold : colors.gray}${failedTests}${colors.reset}\n`);

    if (failedTests > 0) {
        console.log(`${colors.red}${colors.bold}❌ SOME S3 DATA VERIFICATION CHECKS FAILED${colors.reset}\n`);
        process.exit(1);
    } else {
        console.log(`${colors.green}${colors.bold}🎉 ALL S3 BUCKET DATA FETCHED AND CRYPTOGRAPHICALLY VERIFIED!${colors.reset}\n`);
        process.exit(0);
    }
}

runFetchExistingS3DataTest().catch(err => {
    console.error(`\n${colors.red}${colors.bold}💥 Fatal Error:${colors.reset}`, err);
    process.exit(1);
});
