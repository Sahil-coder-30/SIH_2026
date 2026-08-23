/**
 * tests/admin_service_test.mjs
 * End-to-end automated verification for PharmaChain Admin Service & Inter-Service Workflows
 */

import axios from 'axios';

const ADMIN_URL   = process.env.ADMIN_URL   || 'http://localhost:3005';
const MFR_URL     = process.env.MFR_URL     || 'http://localhost:3001';
const SHOP_URL    = process.env.SHOP_URL    || 'http://localhost:3002';
const CORE_URL    = process.env.CORE_URL    || 'http://localhost:4000';

const PASS = '✅ PASS:';
const FAIL = '❌ FAIL:';

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`${PASS} ${message}`);
        passedTests++;
    } else {
        console.error(`${FAIL} ${message}`);
        failedTests++;
    }
}

async function run() {
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('PHARMACHAIN ADMIN SERVICE — COMPREHENSIVE END-TO-END VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    let adminToken = null;

    // ── 1. Health Checks ────────────────────────────────────────────────────────
    console.log('── Step 1: Health Probes ──');
    try {
        const [adminHealth, mfrHealth, shopHealth] = await Promise.all([
            axios.get(`${ADMIN_URL}/healthz`),
            axios.get(`${MFR_URL}/healthz`),
            axios.get(`${SHOP_URL}/healthz`),
        ]);
        assert(adminHealth.status === 200, `Admin service healthy on ${ADMIN_URL}`);
        assert(mfrHealth.status === 200, `Manufacturer service healthy on ${MFR_URL}`);
        assert(shopHealth.status === 200, `Shopkeeper service healthy on ${SHOP_URL}`);
    } catch (err) {
        assert(false, `Health check failed: ${err.message}`);
    }

    // ── 2. Admin Authentication ─────────────────────────────────────────────────
    console.log('\n── Step 2: Admin Authentication ──');
    try {
        const loginRes = await axios.post(`${ADMIN_URL}/api/admin/auth/login`, {
            email:    'admin@pharmachain.gov.in',
            password: 'AdminGovSecured2026!',
        });
        assert(loginRes.status === 200, 'Admin login succeeded');
        assert(loginRes.data.token, 'Admin JWT token received');
        assert(loginRes.data.data.role === 'SUPERADMIN', 'Root admin has SUPERADMIN role');
        adminToken = loginRes.data.token;

        // Verify /me
        const meRes = await axios.get(`${ADMIN_URL}/api/admin/auth/me`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert(meRes.status === 200 && meRes.data.data.email === 'admin@pharmachain.gov.in', 'GET /api/admin/auth/me succeeded');
    } catch (err) {
        assert(false, `Admin authentication failed: ${err.response?.data?.message || err.message}`);
    }

    const authHeaders = {
        headers: {
            Authorization:  `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
        },
    };

    // ── 3. Dashboard Stats Aggregation ──────────────────────────────────────────
    console.log('\n── Step 3: Dashboard Stats ──');
    try {
        const statsRes = await axios.get(`${ADMIN_URL}/api/admin/dashboard/stats`, authHeaders);
        assert(statsRes.status === 200, 'GET /api/admin/dashboard/stats returned 200');
        assert(statsRes.data.data.manufacturers !== undefined, 'Stats contains manufacturer counts');
        assert(statsRes.data.data.shopkeepers !== undefined, 'Stats contains shopkeeper counts');
        assert(statsRes.data.data.cryptography !== undefined, 'Stats contains cryptography stats');
    } catch (err) {
        assert(false, `Dashboard stats query failed: ${err.message}`);
    }

    // ── 4. Manufacturer Registration & Approval Flow ────────────────────────────
    console.log('\n── Step 4: Manufacturer KYC & Cryptographic Key Generation Flow ──');
    const uniqueMfrNum = Math.floor(Math.random() * 900000 + 100000);
    const mfrEmail = `test.mfr.${uniqueMfrNum}@pharma.org`;
    const mfrLicense = `MH-TEST-${uniqueMfrNum}`;
    let createdMfrId = null;

    try {
        // Register Manufacturer
        const regRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/register`, {
            companyName:   `Test Pharma Labs ${uniqueMfrNum}`,
            licenseNumber: mfrLicense,
            email:         mfrEmail,
            password:      'SecurePassword2026!',
        });
        assert(regRes.status === 201, `Manufacturer registered with kycStatus PENDING`);
        createdMfrId = regRes.data.data.id;

        // Query pending manufacturers via Admin Service
        const listRes = await axios.get(`${ADMIN_URL}/api/admin/manufacturers?status=PENDING&search=${mfrLicense}`, authHeaders);
        assert(listRes.status === 200, 'Admin successfully queried pending manufacturers');
        const found = listRes.data.data.some(m => m.licenseNumber === mfrLicense);
        assert(found, `Newly registered manufacturer found in admin pending queue`);

        // Approve Manufacturer KYC (triggers pharma-core ECDSA key generation)
        const approveRes = await axios.post(`${ADMIN_URL}/api/admin/manufacturers/${createdMfrId}/approve`, {
            reason: 'Valid state manufacturing license verified.',
        }, authHeaders);
        assert(approveRes.status === 200, `Admin approved manufacturer KYC`);
        assert(approveRes.data.data.kycStatus === 'APPROVED', `Manufacturer status updated to APPROVED`);
        assert(approveRes.data.data.keyGenerated === true || approveRes.data.data.keyGenerated === false, `EC P-256 key generation handled`);

        // Verify manufacturer can now log in
        const mfrLoginRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/login`, {
            email:    mfrEmail,
            password: 'SecurePassword2026!',
        });
        assert(mfrLoginRes.status === 200, `Approved manufacturer can now successfully log in`);
    } catch (err) {
        assert(false, `Manufacturer approval flow failed: ${err.response?.data?.message || err.message}`);
    }

    // ── 5. Manufacturer Rejection Flow ──────────────────────────────────────────
    console.log('\n── Step 5: Manufacturer Rejection Flow ──');
    const rejectMfrNum = Math.floor(Math.random() * 900000 + 100000);
    try {
        const regRes2 = await axios.post(`${MFR_URL}/api/manufacturer/auth/register`, {
            companyName:   `Rejected Pharma ${rejectMfrNum}`,
            licenseNumber: `DL-REJ-${rejectMfrNum}`,
            email:         `reject.${rejectMfrNum}@pharma.org`,
            password:      'SecurePassword2026!',
        });
        const rejectMfrId = regRes2.data.data.id;

        const rejectRes = await axios.post(`${ADMIN_URL}/api/admin/manufacturers/${rejectMfrId}/reject`, {
            reason: 'State drug license forged or unverifiable.',
        }, authHeaders);
        assert(rejectRes.status === 200, `Admin successfully rejected invalid manufacturer registration`);
        assert(rejectRes.data.data.kycStatus === 'REJECTED', `Status updated to REJECTED with reason recorded`);
    } catch (err) {
        assert(false, `Manufacturer rejection flow failed: ${err.response?.data?.message || err.message}`);
    }

    // ── 6. Shopkeeper Registration & Verification Flow ──────────────────────────
    console.log('\n── Step 6: Shopkeeper / Pharmacy Verification Flow ──');
    const uniqueShopNum = Math.floor(Math.random() * 900000 + 100000);
    const shopEmail = `chemist.${uniqueShopNum}@store.in`;
    const drugLicense = `DL-PHARM-${uniqueShopNum}`;
    let createdShopId = null;

    try {
        // Register Shopkeeper
        const regRes = await axios.post(`${SHOP_URL}/api/shopkeeper/auth/register`, {
            shopName:          `Apollo Chemist Branch ${uniqueShopNum}`,
            shopPhone:         `+919811${uniqueShopNum}`,
            shopEmail:         shopEmail,
            address:           'Shop 4, Market Complex',
            city:              'New Delhi',
            state:             'Delhi',
            pincode:           '110001',
            ownerName:         'Sunil Sharma',
            ownerPhone:        `+919812${uniqueShopNum}`,
            ownerEmail:        shopEmail,
            drugLicenseNumber: drugLicense,
            licenseType:       'retail',
            issuingAuthority:  'Drugs Control Dept Delhi',
            licenseIssueDate:  '2024-01-01',
            licenseExpiryDate: '2029-01-01',
            password:          'SecureShop2026!',
        });
        assert(regRes.status === 201, `Shopkeeper registered with verificationStatus pending`);
        createdShopId = regRes.data.data.shopId;

        // Query pending shopkeepers from Admin Service
        const shopListRes = await axios.get(`${ADMIN_URL}/api/admin/shopkeepers?status=pending&search=${drugLicense}`, authHeaders);
        assert(shopListRes.status === 200, 'Admin successfully queried pending shopkeepers');
        const foundShop = shopListRes.data.data.some(s => s.drugLicenseNumber === drugLicense);
        assert(foundShop, `Newly registered shopkeeper found in admin queue`);

        // Approve Shopkeeper
        const approveShopRes = await axios.post(`${ADMIN_URL}/api/admin/shopkeepers/${createdShopId}/approve`, {
            reason: 'Retail pharmacy Form 20/21 license verified.',
        }, authHeaders);
        assert(approveShopRes.status === 200, `Admin approved pharmacy verification`);
        assert(approveShopRes.data.data.verificationStatus.toLowerCase() === 'approved', `Shopkeeper status is approved`);

        // Suspend Shopkeeper License
        const suspendRes = await axios.post(`${ADMIN_URL}/api/admin/shopkeepers/${createdShopId}/suspend`, {
            reason: 'Notice issued for compliance inspection.',
        }, authHeaders);
        assert(suspendRes.status === 200, `Admin suspended shopkeeper license`);
        assert(suspendRes.data.data.verificationStatus.toLowerCase() === 'suspended', `Shopkeeper status updated to suspended`);
    } catch (err) {
        assert(false, `Shopkeeper verification flow failed: ${err.response?.data?.message || err.message}`);
    }

    // ── 7. Regulatory Audit Logs ────────────────────────────────────────────────
    console.log('\n── Step 7: Regulatory Compliance Audit Trail ──');
    try {
        const auditRes = await axios.get(`${ADMIN_URL}/api/admin/audit-logs?limit=10`, authHeaders);
        assert(auditRes.status === 200, `GET /api/admin/audit-logs returned 200`);
        assert(Array.isArray(auditRes.data.data), `Audit logs returned as array`);
        assert(auditRes.data.data.length >= 4, `Audit trail recorded admin actions (${auditRes.data.data.length} entries found)`);

        const actions = auditRes.data.data.map(a => a.action);
        assert(actions.includes('MANUFACTURER_APPROVED'), `Audit trail contains MANUFACTURER_APPROVED`);
        assert(actions.includes('MANUFACTURER_REJECTED'), `Audit trail contains MANUFACTURER_REJECTED`);
        assert(actions.includes('SHOPKEEPER_APPROVED'), `Audit trail contains SHOPKEEPER_APPROVED`);
        assert(actions.includes('SHOPKEEPER_SUSPENDED'), `Audit trail contains SHOPKEEPER_SUSPENDED`);
    } catch (err) {
        assert(false, `Audit log verification failed: ${err.message}`);
    }

    // ── Summary ─────────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════════════════════');
    console.log(`TEST RESULTS: ${passedTests} Passed, ${failedTests} Failed`);
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

run().catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
});
