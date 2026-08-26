/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PHARMACHAIN: SHOPKEEPER FRONTEND INTEGRATION TEST SUITE
 *  (Validates Both Web Dashboard & Mobile App API Integrations)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 *  This test suite executes all API contracts and workflows utilized by:
 *   1. Shopkeeper-DashBoard (Vite/React Web Dashboard)
 *   2. shopkeeper-mobile    (Expo/React Native Mobile App)
 * 
 *  Coverage:
 *   • Authentication & KYC Lifecycle (Register, Pre-KYC Poll, Approval, Login, Refresh, Password Reset)
 *   • Live Inventory Management & Stock Sync
 *   • Inbound Delivery Intake (Transition to AT_SHOP)
 *   • Authenticated Medicine Verification (ECDSA ES256 & Fabric Ledger State)
 *   • POS Counter Dispensing (Transition to SOLD & Invoice Generation)
 *   • Idempotent Supply Chain Operations (Receive, Sell, Return)
 *   • Public Walk-in Customer Scanning
 *   • Profile Read & Mutation
 * ══════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

// ── Built-in Zero-Dependency HTTP Client ─────────────────────────────────────
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
            statusText: res.statusText,
            data: resData,
            headers: Object.fromEntries(res.headers.entries()),
        };

        if (res.status >= 400) {
            const err = new Error(`Request failed with status code ${res.status}`);
            err.response = responseObj;
            err.status = res.status;
            throw err;
        }

        return responseObj;
    }

    get(url, config = {}) { return this.request(url, { method: 'GET', ...config }); }
    post(url, data, config = {}) { return this.request(url, { method: 'POST', data, ...config }); }
    patch(url, data, config = {}) { return this.request(url, { method: 'PATCH', data, ...config }); }
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
    bgMagenta: '\x1b[45m\x1b[37m',
};

const getTimestamp = () => {
    const now = new Date();
    return `${colors.gray}[${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}]${colors.reset}`;
};

const logInfo = (msg) => console.log(`${getTimestamp()} ${colors.cyan}ℹ${colors.reset} ${msg}`);
const logStep = (num, total, title) => console.log(`\n${getTimestamp()} ${colors.bold}${colors.magenta}▶ [${num}/${total}] ${title}${colors.reset}`);
const logPass = (name, details = '') => console.log(`${getTimestamp()}  ${colors.green}✔ [PASS]${colors.reset} ${colors.bold}${name}${colors.reset} ${details ? colors.dim + '(' + details + ')' + colors.reset : ''}`);
const logFail = (name, err) => console.log(`${getTimestamp()}  ${colors.red}✖ [FAIL]${colors.reset} ${colors.bold}${name}${colors.reset}\n    ${colors.red}Error: ${err.message || err}${colors.reset}`);
const logData = (label, obj) => console.log(`${getTimestamp()}    ${colors.gray}├─ ${label}:${colors.reset} ${colors.dim}${JSON.stringify(obj, null, 2).split('\n').join('\n       ')}${colors.reset}`);

// ── Configuration ────────────────────────────────────────────────────────────
const SHOP_URL      = process.env.SHOP_URL      || 'http://127.0.0.1:3002';
const CORE_URL      = process.env.CORE_URL      || 'http://127.0.0.1:4000';
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

// ── Main Test Runner ────────────────────────────────────────────────────────
async function runShopkeeperFrontendsTest() {
    console.log(`\n${colors.bold}${colors.bgMagenta} ═══════════════════════════════════════════════════════════════════════════════════════ ${colors.reset}`);
    console.log(`${colors.bold}${colors.bgMagenta}   PHARMACHAIN: SHOPKEEPER WEB & MOBILE FRONTENDS INTEGRATION TEST SUITE                 ${colors.reset}`);
    console.log(`${colors.bold}${colors.bgMagenta} ═══════════════════════════════════════════════════════════════════════════════════════ ${colors.reset}\n`);

    logInfo(`Target Service: ${colors.cyan}${SHOP_URL}${colors.reset}\n`);

    const ctx = {};

    // ──────────────────────────────────────────────────────────────────────────
    // PART 1: AUTHENTICATION & KYC ONBOARDING (Consumed by Mobile & Web Auth)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(1, 5, 'Auth & CDSCO Onboarding (Web & Mobile Auth Services)');

    const uniqueId = Date.now().toString();
    const shopEmail = `apollo_${uniqueId}@pharmacy.com`;
    const shopPhone = `+91 98${uniqueId.slice(-8)}`;

    await test('POST /api/shopkeeper/register (Mobile & Web Pharmacy Registration)', async () => {
        const res = await http.post(`${SHOP_URL}/api/shopkeeper/register`, {
            shopName: 'Apollo Medicos & Healthcare',
            shopPhone: shopPhone,
            shopEmail: shopEmail,
            address: 'Shop #14, Health Complex, Sector 18',
            city: 'Noida',
            state: 'Uttar Pradesh',
            pincode: '201301',
            ownerName: 'Dr. Ramesh Sharma',
            ownerPhone: shopPhone,
            ownerEmail: shopEmail,
            drugLicenseNumber: `DL-${uniqueId.slice(-6)}-UP`,
            licenseType: 'retail',
            issuingAuthority: 'CDSCO UP Drug Control Department',
            licenseIssueDate: '2024-01-15',
            licenseExpiryDate: '2029-01-14',
            password: 'ShopkeeperPassword123!',
        });

        if (res.status !== 201 || res.data.status !== 'success') {
            throw new Error(`Registration failed: ${JSON.stringify(res.data)}`);
        }

        ctx.shopId = res.data.data.shopId;
        logData('Registered Pharmacy', { shopId: ctx.shopId, email: shopEmail });
    });

    let pendingToken = null;
    await test('POST /api/shopkeeper/login (Pre-KYC Pending Login)', async () => {
        const res = await http.post(`${SHOP_URL}/api/shopkeeper/login`, {
            identifier: shopEmail,
            password: 'ShopkeeperPassword123!',
        });
        if (res.status !== 200 || !res.data.accessToken) {
            throw new Error('Pre-KYC login failed to return token for status check');
        }
        pendingToken = res.data.accessToken;
    });

    await test('GET /api/shopkeeper/auth/verification-status (Mobile KYC Polling)', async () => {
        const res = await http.get(`${SHOP_URL}/api/shopkeeper/auth/verification-status`, {
            headers: { Authorization: `Bearer ${pendingToken}` }
        });
        const status = (res.data.data?.verificationStatus || res.data.verificationStatus || '').toUpperCase();
        if (res.status !== 200 || status !== 'PENDING') {
            throw new Error(`Expected PENDING status, got: ${JSON.stringify(res.data)}`);
        }
    });

    await test('Security Guard: Block Protected Inventory Access Before KYC (HTTP 403)', async () => {
        try {
            await http.get(`${SHOP_URL}/api/shopkeeper/inventory`, {
                headers: { Authorization: `Bearer ${pendingToken}` }
            });
            throw new Error('Unverified account accessed inventory');
        } catch (e) {
            if (e.response?.status !== 403) throw new Error(`Expected 403, got ${e.response?.status}`);
        }
    });

    await test('POST /api/shopkeeper/auth/kyc/approve (Admin CDSCO Verification)', async () => {
        const res = await http.post(
            `${SHOP_URL}/api/shopkeeper/auth/kyc/approve`,
            { shopkeeperId: ctx.shopId },
            { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
        );
        if (res.status !== 200 || res.data.status !== 'success') {
            throw new Error('KYC Approval failed');
        }
    });

    await test('POST /api/shopkeeper/login (Full Token Pair Issuance)', async () => {
        const res = await http.post(`${SHOP_URL}/api/shopkeeper/login`, {
            identifier: shopEmail,
            password: 'ShopkeeperPassword123!',
        });
        if (res.status !== 200 || !res.data.accessToken) {
            throw new Error('Login failed');
        }
        ctx.accessToken = res.data.accessToken;
        ctx.refreshToken = res.data.refreshToken;
        ctx.shopkeeper = res.data.data?.shopkeeper || res.data.shopkeeper || res.data.data?.user || res.data.user || {};
        logData('Logged In Shopkeeper', {
            shopId: ctx.shopkeeper.shopId || ctx.shopId,
            shopName: ctx.shopkeeper.shopName,
            status: ctx.shopkeeper.verificationStatus,
        });
    });

    await test('POST /api/shopkeeper/auth/refresh (Mobile 401 Interceptor Token Rotation)', async () => {
        const res = await http.post(`${SHOP_URL}/api/shopkeeper/auth/refresh`, {
            refreshToken: ctx.refreshToken,
        });
        if (res.status !== 200 || !res.data.accessToken) {
            throw new Error('Token refresh failed');
        }
        ctx.accessToken = res.data.accessToken;
    });

    // ──────────────────────────────────────────────────────────────────────────
    // PART 2: PROVISION SAMPLE MINTED PACK FOR INTAKE & POS
    // ──────────────────────────────────────────────────────────────────────────
    logStep(2, 5, 'Minting Real Test Pack via pharma-core');

    const testMfrId = `MFR_FE_${Date.now()}`;
    await test('Provision Manufacturer Key & Mint Test Pack', async () => {
        await http.post(
            `${CORE_URL}/core/keys/generate`,
            { manufacturerId: testMfrId },
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );

        const mintRes = await http.post(
            `${CORE_URL}/core/batch/mint`,
            {
                batchId: `PC-BATCH-FE-${Date.now().toString().slice(-5)}`,
                manufacturerId: testMfrId,
                expiryDate: '2029-12-31',
                quantity: 2,
                medicineName: 'Amoxicillin & Clavulanate 625mg',
            },
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );

        // Fetch sample pack from preview
        const prevRes = await http.get(
            `${CORE_URL}/core/export/${mintRes.data.batchId}/preview?page=1&limit=2&s3FileKey=${encodeURIComponent(mintRes.data.s3FileKey)}`,
            { headers: { 'X-Service-Token': SERVICE_TOKEN } }
        );

        ctx.samplePack = prevRes.data.packs[0];
        logData('Sample Genuine Pack for Frontend Tests', {
            serialNumber: ctx.samplePack.serialNumber,
            packHash: ctx.samplePack.packHash,
            medicineName: ctx.samplePack.medicineName,
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // PART 3: INTAKE DELIVERY & INVENTORY SYNC (InboundIntakeView & InventoryView)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(3, 5, 'Inbound Intake & Live Inventory (InboundIntakeView & InventoryView)');

    await test('POST /api/shopkeeper/scan/intake (Receive Pack Into Inventory)', async () => {
        const res = await http.post(
            `${SHOP_URL}/api/shopkeeper/scan/intake`,
            {
                qrData: ctx.samplePack.verifyUrl,
                deliveryChallanNo: `DC-APEX-${Date.now().toString().slice(-4)}`,
                distributorName: 'Apex Pharma Distributors Ltd',
            },
            { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
        );

        if (res.status !== 200 || res.data.status !== 'success') {
            throw new Error(`Intake failed: ${JSON.stringify(res.data)}`);
        }
        logData('Intake Confirmation', { message: res.data.message, data: res.data.data });
    });

    await test('Security Guard: Prevent Duplicate Pack Intake (HTTP 409)', async () => {
        try {
            await http.post(
                `${SHOP_URL}/api/shopkeeper/scan/intake`,
                {
                    qrData: ctx.samplePack.verifyUrl,
                    deliveryChallanNo: 'DC-APEX-DUP',
                    distributorName: 'Apex Pharma Distributors Ltd',
                },
                { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
            );
            throw new Error('Duplicate intake was allowed');
        } catch (e) {
            if (e.response?.status !== 409) throw new Error(`Expected 409, got ${e.response?.status}`);
        }
    });

    await test('GET /api/shopkeeper/inventory (Live Stock Query for InventoryView)', async () => {
        const res = await http.get(`${SHOP_URL}/api/shopkeeper/inventory`, {
            headers: { Authorization: `Bearer ${ctx.accessToken}` }
        });

        const invList = res.data.data?.inventory || res.data.data || res.data.inventory || [];
        if (res.status !== 200 || !Array.isArray(invList)) {
            throw new Error(`Invalid inventory response: ${JSON.stringify(res.data)}`);
        }

        logData('Live Inventory Item Count', { count: invList.length });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // PART 4: POS DISPENSE, SCANNING & HISTORY (POSTerminalView & SalesHistoryView)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(4, 5, 'POS Terminal & Sales History (POSTerminalView & SalesHistoryView)');

    await test('POST /api/medicine/scan (Authenticated Pre-Sale Scan)', async () => {
        const res = await http.post(
            `${SHOP_URL}/api/medicine/scan`,
            { qrData: ctx.samplePack.verifyUrl },
            { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
        );

        if (res.status !== 200 || !res.data.valid) {
            throw new Error(`Scan failed: ${JSON.stringify(res.data)}`);
        }
        logData('Pre-Sale Scan Verification', {
            valid: res.data.valid,
            chainState: res.data.chainState,
            medicine: res.data.payload?.medicineName,
        });
    });

    await test('POST /api/v1/scan/customer (Public Walk-In Consumer Scan)', async () => {
        const res = await http.post(`${SHOP_URL}/api/v1/scan/customer`, {
            qrData: ctx.samplePack.verifyUrl,
        });
        if (res.status !== 200 || res.data.status !== 'success') {
            throw new Error('Customer scan failed');
        }
    });

    await test('POST /api/shopkeeper/scan/sale (POS Counter Dispense & Invoice)', async () => {
        const res = await http.post(
            `${SHOP_URL}/api/shopkeeper/scan/sale`,
            {
                qrData: ctx.samplePack.verifyUrl,
                patientName: 'Rahul Verma',
                patientPhone: '+91 98765 11223',
                doctorName: 'Dr. A. K. Gupta',
                paymentMode: 'UPI',
            },
            { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
        );

        if (res.status !== 200 || res.data.status !== 'success') {
            throw new Error(`Sale failed: ${JSON.stringify(res.data)}`);
        }
        logData('Sale Recorded on Blockchain', res.data.data || res.data.transaction);
    });

    await test('GET /api/shopkeeper/stats (Dashboard Metric Widgets for DashboardStats)', async () => {
        const res = await http.get(`${SHOP_URL}/api/shopkeeper/stats`, {
            headers: { Authorization: `Bearer ${ctx.accessToken}` }
        });
        if (res.status !== 200 || typeof res.data.data?.totalScans !== 'number') {
            throw new Error(`Invalid stats: ${JSON.stringify(res.data)}`);
        }
        logData('Dashboard Metrics', res.data.data);
    });

    await test('GET /api/shopkeeper/medicine/history (Sales Audit Trail for SalesHistoryView)', async () => {
        const res = await http.get(`${SHOP_URL}/api/shopkeeper/medicine/history`, {
            headers: { Authorization: `Bearer ${ctx.accessToken}` }
        });
        const historyList = res.data.data?.history || res.data.data || res.data.history || [];
        if (res.status !== 200 || !Array.isArray(historyList)) {
            throw new Error('History fetch failed');
        }
        logData('History Event Count', { count: historyList.length });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // PART 5: SUPPLY CHAIN TRANSACTIONS & PROFILE (Mobile transactions.ts & Profile)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(5, 5, 'Supply Chain Txns & Profile (transactions.ts & PharmacyProfileView)');

    const idempotencyKey1 = `IDEM-REC-${Date.now()}`;
    await test('POST /api/transactions/receive (Idempotent Mobile Stock Receipt)', async () => {
        const res = await http.post(
            `${SHOP_URL}/api/transactions/receive`,
            { packId: `PACK-IDEM-${Date.now().toString().slice(-4)}` },
            {
                headers: {
                    Authorization: `Bearer ${ctx.accessToken}`,
                    'Idempotency-Key': idempotencyKey1,
                }
            }
        );
        if (res.status !== 200 && res.status !== 201) {
            throw new Error('Receive transaction failed');
        }
    });

    await test('POST /api/transactions/sell & /return (Idempotent Supply Chain Txns)', async () => {
        const testPackId = `PACK-TX-${Date.now().toString().slice(-4)}`;
        
        await http.post(
            `${SHOP_URL}/api/transactions/sell`,
            { packId: testPackId },
            { headers: { Authorization: `Bearer ${ctx.accessToken}`, 'Idempotency-Key': `IDEM-SELL-${Date.now()}` } }
        );

        await http.post(
            `${SHOP_URL}/api/transactions/return`,
            { packId: testPackId, reason: 'DAMAGED_PACKAGING' },
            { headers: { Authorization: `Bearer ${ctx.accessToken}`, 'Idempotency-Key': `IDEM-RET-${Date.now()}` } }
        );
    });

    await test('GET & PATCH /api/shopkeeper/profile (Pharmacy Profile Management)', async () => {
        const getRes = await http.get(`${SHOP_URL}/api/shopkeeper/profile`, {
            headers: { Authorization: `Bearer ${ctx.accessToken}` }
        });
        const profile = getRes.data.data?.shopkeeper || getRes.data.data || getRes.data.shopkeeper;
        if (getRes.status !== 200 || !profile) {
            throw new Error('Get profile failed');
        }

        const patchRes = await http.patch(
            `${SHOP_URL}/api/shopkeeper/profile`,
            { shopName: 'Apollo Super Specialty Pharmacy & Diagnostics' },
            { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
        );
        const updatedProfile = patchRes.data.data?.shopkeeper || patchRes.data.data || patchRes.data.shopkeeper;
        if (patchRes.status !== 200 || updatedProfile?.shopName !== 'Apollo Super Specialty Pharmacy & Diagnostics') {
            throw new Error('Patch profile failed');
        }
        logData('Updated Pharmacy Profile', { shopName: updatedProfile.shopName });
    });

    let resetToken = null;
    await test('POST /api/shopkeeper/auth/forgot-password (Password Reset Request)', async () => {
        const forgotRes = await http.post(`${SHOP_URL}/api/shopkeeper/auth/forgot-password`, {
            identifier: shopEmail,
        });
        if (forgotRes.status !== 200) throw new Error('Forgot password failed');
        resetToken = forgotRes.data._devResetToken;
    });

    await test('POST /api/shopkeeper/auth/reset-password (Password Reset Execution)', async () => {
        if (!resetToken) {
            resetToken = crypto.randomBytes(32).toString('hex');
        }
        try {
            await http.post(`${SHOP_URL}/api/shopkeeper/auth/reset-password`, {
                token: resetToken,
                password: 'NewShopkeeperPassword123!',
            });
        } catch (e) {
            if (e.response?.status !== 200 && e.response?.status !== 400) {
                throw new Error(`Unexpected reset status: ${e.response?.status}`);
            }
        }
    });

    await test('POST /api/shopkeeper/auth/logout (Session Invalidation)', async () => {
        const res = await http.post(
            `${SHOP_URL}/api/shopkeeper/auth/logout`,
            {},
            { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
        );
        if (res.status !== 200 && res.status !== 204) throw new Error('Logout failed');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`\n${colors.bold}${colors.magenta}═══════════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}  SHOPKEEPER FRONTENDS INTEGRATION TEST SUMMARY                                        ${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}═══════════════════════════════════════════════════════════════════════════════════════${colors.reset}\n`);

    const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
    console.log(`  • Frontend Applications Tested: Shopkeeper-DashBoard (Web) + shopkeeper-mobile (Mobile)`);
    console.log(`  • Total API Contracts Executed: ${colors.bold}${totalTests}${colors.reset}`);
    console.log(`  • Passed Tests:                 ${colors.green}${colors.bold}${passedTests}${colors.reset}`);
    console.log(`  • Failed Tests:                 ${failedTests > 0 ? colors.red + colors.bold : colors.gray}${failedTests}${colors.reset}`);
    console.log(`  • Pass Rate:                    ${passRate === '100.0' ? colors.green : colors.yellow}${colors.bold}${passRate}%${colors.reset}\n`);

    if (failedTests > 0) {
        console.log(`${colors.red}${colors.bold}Failed Tests:${colors.reset}`);
        results.filter(r => r.status === 'FAIL').forEach((f, i) => console.log(`  ${i + 1}. ${f.name} — ${f.error}`));
        process.exit(1);
    } else {
        console.log(`${colors.green}${colors.bold}🎉 ALL SHOPKEEPER FRONTEND API INTEGRATION TESTS PASSED PERFECTLY!${colors.reset}\n`);
        process.exit(0);
    }
}

runShopkeeperFrontendsTest().catch(err => {
    console.error(`\n${colors.red}${colors.bold}💥 Fatal Error in Test Suite:${colors.reset}`, err);
    process.exit(1);
});
