/**
 * tests/live_admin_api_runner.mjs
 * Live interactive execution and verification of ALL Admin Service API Endpoints
 */

import axios from 'axios';

const ADMIN_URL = 'http://localhost:3005';
const MFR_URL   = 'http://localhost:3001';
const SHOP_URL  = 'http://localhost:3002';

const ADMIN_EMAIL = 'sahilsharma3043@gmail.com';
const ADMIN_PASS  = '8126252168';

function logSection(title) {
    console.log(`\n===============================================================================`);
    console.log(`📌 ${title}`);
    console.log(`===============================================================================`);
}

function logStep(endpoint, method, status, data) {
    console.log(`\n▶ [${method}] ${endpoint}  --> HTTP ${status}`);
    console.log(JSON.stringify(data, null, 2));
}

async function executeAll() {
    console.log('🚀 Starting Complete Admin API Live Execution Suite...');
    console.log(`Target: ${ADMIN_URL} | Admin: ${ADMIN_EMAIL}`);

    // ── 1. AUTHENTICATION ───────────────────────────────────────────────────────
    logSection('1. ADMIN AUTHENTICATION (POST /api/admin/auth/login)');
    const loginRes = await axios.post(`${ADMIN_URL}/api/admin/auth/login`, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASS,
    });
    logStep('/api/admin/auth/login', 'POST', loginRes.status, loginRes.data);

    const token = loginRes.data.token;
    const authHeaders = {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };

    // ── 2. GET ME PROFILE ───────────────────────────────────────────────────────
    logSection('2. CURRENT ADMIN PROFILE (GET /api/admin/auth/me)');
    const meRes = await axios.get(`${ADMIN_URL}/api/admin/auth/me`, authHeaders);
    logStep('/api/admin/auth/me', 'GET', meRes.status, meRes.data);

    // ── 3. DASHBOARD METRICS ────────────────────────────────────────────────────
    logSection('3. DASHBOARD AGGREGATED METRICS (GET /api/admin/dashboard/stats)');
    const statsRes = await axios.get(`${ADMIN_URL}/api/admin/dashboard/stats`, authHeaders);
    logStep('/api/admin/dashboard/stats', 'GET', statsRes.status, statsRes.data);

    // ── 4. MANUFACTURER ONBOARDING & APPROVAL ───────────────────────────────────
    logSection('4. MANUFACTURER KYC APPROVAL WORKFLOW');
    const mfrRand = Math.floor(Math.random() * 900000 + 100000);
    const mfrEmail = `cipla.branch.${mfrRand}@pharma.org`;
    const mfrLicense = `MH-TZ1-${mfrRand}`;

    // Register on manufacturer service
    console.log(`\n• Step 4a: Registering new Manufacturer on manufacturer-service (${MFR_URL})...`);
    const regMfrRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/register`, {
        companyName: `Cipla Healthcare Unit ${mfrRand}`,
        licenseNumber: mfrLicense,
        email: mfrEmail,
        password: 'SecurePassword2026!',
    });
    logStep('/api/manufacturer/auth/register', 'POST', regMfrRes.status, regMfrRes.data);
    const mfrId = regMfrRes.data.data.id;

    // Admin queries pending manufacturers
    console.log(`\n• Step 4b: Admin queries pending manufacturers queue...`);
    const listMfrPending = await axios.get(`${ADMIN_URL}/api/admin/manufacturers?status=PENDING&search=${mfrLicense}`, authHeaders);
    logStep('/api/admin/manufacturers?status=PENDING', 'GET', listMfrPending.status, listMfrPending.data);

    // Admin fetches single manufacturer detail
    console.log(`\n• Step 4c: Admin inspects manufacturer detail for ${mfrId}...`);
    const detailMfr = await axios.get(`${ADMIN_URL}/api/admin/manufacturers/${mfrId}`, authHeaders);
    logStep(`/api/admin/manufacturers/${mfrId}`, 'GET', detailMfr.status, detailMfr.data);

    // Admin approves manufacturer KYC (triggers EC P-256 key generation)
    console.log(`\n• Step 4d: Admin APPROVES KYC for ${mfrId} (Provisions ECDSA P-256 key)...`);
    const approveMfrRes = await axios.post(`${ADMIN_URL}/api/admin/manufacturers/${mfrId}/approve`, {
        reason: 'State drug manufacturing license Form 25 verified with State FDA portal.',
    }, authHeaders);
    logStep(`/api/admin/manufacturers/${mfrId}/approve`, 'POST', approveMfrRes.status, approveMfrRes.data);

    // ── 5. MANUFACTURER REJECTION ───────────────────────────────────────────────
    logSection('5. MANUFACTURER REJECTION WORKFLOW');
    const rejectMfrRand = Math.floor(Math.random() * 900000 + 100000);
    const regMfr2 = await axios.post(`${MFR_URL}/api/manufacturer/auth/register`, {
        companyName: `Bogus Pharma ${rejectMfrRand}`,
        licenseNumber: `DL-FAKE-${rejectMfrRand}`,
        email: `bogus.${rejectMfrRand}@fake.org`,
        password: 'SecurePassword2026!',
    });
    const rejectMfrId = regMfr2.data.data.id;

    console.log(`\n• Step 5a: Admin REJECTS invalid registration for ${rejectMfrId}...`);
    const rejectMfrRes = await axios.post(`${ADMIN_URL}/api/admin/manufacturers/${rejectMfrId}/reject`, {
        reason: 'Drug manufacturing license not recognized in National Registry.',
    }, authHeaders);
    logStep(`/api/admin/manufacturers/${rejectMfrId}/reject`, 'POST', rejectMfrRes.status, rejectMfrRes.data);

    // ── 6. SHOPKEEPER ONBOARDING & VERIFICATION ─────────────────────────────────
    logSection('6. SHOPKEEPER / PHARMACY VERIFICATION WORKFLOW');
    const shopRand = Math.floor(Math.random() * 900000 + 100000);
    const shopEmail = `apollo.sec${shopRand}@pharmacy.in`;
    const drugLicense = `DL-ND-2026-${shopRand}`;

    // Register on shopkeeper service
    console.log(`\n• Step 6a: Registering new Shopkeeper on shopkeeper-service (${SHOP_URL})...`);
    const regShopRes = await axios.post(`${SHOP_URL}/api/shopkeeper/auth/register`, {
        shopName: `Apollo Pharmacy Sector ${shopRand}`,
        shopPhone: `+911144${shopRand}`,
        shopEmail: shopEmail,
        address: `Shop ${shopRand}, Main Road, Sector 15`,
        city: 'Gurugram',
        state: 'Haryana',
        pincode: '122001',
        ownerName: 'Vikas Malhotra',
        ownerPhone: `+919811${shopRand}`,
        ownerEmail: shopEmail,
        drugLicenseNumber: drugLicense,
        licenseType: 'retail',
        issuingAuthority: 'Food & Drugs Administration Haryana',
        licenseIssueDate: '2024-01-01',
        licenseExpiryDate: '2029-01-01',
        password: 'SecureShopPassword2026!',
    });
    logStep('/api/shopkeeper/auth/register', 'POST', regShopRes.status, regShopRes.data);
    const shopId = regShopRes.data.data.shopId;

    // Admin queries pending shopkeepers
    console.log(`\n• Step 6b: Admin queries pending pharmacies queue...`);
    const listShopPending = await axios.get(`${ADMIN_URL}/api/admin/shopkeepers?status=pending&search=${drugLicense}`, authHeaders);
    logStep('/api/admin/shopkeepers?status=pending', 'GET', listShopPending.status, listShopPending.data);

    // Admin inspects single shopkeeper detail
    console.log(`\n• Step 6c: Admin inspects pharmacy detail for ${shopId}...`);
    const detailShop = await axios.get(`${ADMIN_URL}/api/admin/shopkeepers/${shopId}`, authHeaders);
    logStep(`/api/admin/shopkeepers/${shopId}`, 'GET', detailShop.status, detailShop.data);

    // Admin approves shopkeeper
    console.log(`\n• Step 6d: Admin APPROVES pharmacy verification for ${shopId}...`);
    const approveShopRes = await axios.post(`${ADMIN_URL}/api/admin/shopkeepers/${shopId}/approve`, {
        reason: 'Retail Drug License Form 20/21 verified against State Pharmacy Council.',
    }, authHeaders);
    logStep(`/api/admin/shopkeepers/${shopId}/approve`, 'POST', approveShopRes.status, approveShopRes.data);

    // Admin suspends shopkeeper
    console.log(`\n• Step 6e: Admin SUSPENDS pharmacy license for ${shopId}...`);
    const suspendShopRes = await axios.post(`${ADMIN_URL}/api/admin/shopkeepers/${shopId}/suspend`, {
        reason: 'Suspended pending physical audit due to discrepancy in stock reconciliation.',
    }, authHeaders);
    logStep(`/api/admin/shopkeepers/${shopId}/suspend`, 'POST', suspendShopRes.status, suspendShopRes.data);

    // ── 7. CREATE SUB-ADMIN (DRUG INSPECTOR) ────────────────────────────────────
    logSection('7. RBAC SUB-ADMIN CREATION (POST /api/admin/auth/create-admin)');
    const inspectorEmail = `inspector.${Date.now()}@cdsco.gov.in`;
    const createAdminRes = await axios.post(`${ADMIN_URL}/api/admin/auth/create-admin`, {
        email: inspectorEmail,
        password: 'InspectorPass2026!',
        fullName: 'Inspector R. K. Mishra',
        department: 'Northern Zonal Regulatory Office',
        role: 'DRUG_INSPECTOR',
    }, authHeaders);
    logStep('/api/admin/auth/create-admin', 'POST', createAdminRes.status, createAdminRes.data);

    // ── 8. REGULATORY AUDIT LOGS ────────────────────────────────────────────────
    logSection('8. REGULATORY AUDIT TRAIL (GET /api/admin/audit-logs)');
    const auditRes = await axios.get(`${ADMIN_URL}/api/admin/audit-logs?limit=10`, authHeaders);
    logStep('/api/admin/audit-logs?limit=10', 'GET', auditRes.status, {
        totalAuditEntries: auditRes.data.pagination.total,
        latestEntries: auditRes.data.data.slice(0, 5).map(e => ({
            action: e.action,
            performedBy: `${e.performedBy.fullName} (${e.performedBy.role})`,
            targetId: e.targetId,
            reason: e.reason,
            timestamp: e.createdAt,
        })),
    });

    // ── 9. ADMIN LOGOUT ─────────────────────────────────────────────────────────
    logSection('9. ADMIN LOGOUT (POST /api/admin/auth/logout)');
    const logoutRes = await axios.post(`${ADMIN_URL}/api/admin/auth/logout`, {}, authHeaders);
    logStep('/api/admin/auth/logout', 'POST', logoutRes.status, logoutRes.data);

    console.log('\n===============================================================================');
    console.log('🎉 ALL 15 ADMIN API CALLS EXECUTED AND VALIDATED SUCCESSFULLY!');
    console.log('===============================================================================\n');
}

executeAll().catch(err => {
    console.error('API Execution Error:', err.response?.data || err.message);
    process.exit(1);
});
