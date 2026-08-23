import axios from 'axios';

// ── Configuration ─────────────────────────────────────────────────────────────
const ADMIN_TOKEN   = '960e412b2690c03cb83337b91010016a572343f23123feb3';
const SERVICE_TOKEN = '1d230ff87628d00c450d7bb7f5f5245ad30ad7d1b57be42253e66de27738d11a7351a2a4a7dbc451fb1445e658f382c9';

// When running through Ingress, all services share the root host http://localhost
const INGRESS_HOST = process.env.INGRESS_HOST || 'http://localhost';

const CORE_URL = process.env.CORE_URL || INGRESS_HOST;
const MFR_URL  = process.env.MFR_URL  || INGRESS_HOST;
const SHOP_URL = process.env.SHOP_URL || INGRESS_HOST;
const CONS_URL = process.env.CONS_URL || INGRESS_HOST;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ [PASS] ${testName}`);
    } else {
        failedTests++;
        console.error(`  ❌ [FAIL] ${testName} — ${details}`);
    }
}

async function runK8sUrlSuite() {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║         PHARMACHAIN KUBERNETES URL & INGRESS END-TO-END TEST SUITE           ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    console.log(`Target Ingress / Kubernetes Endpoint: ${INGRESS_HOST}\n`);

    // ──────────────────────────────────────────────────────────────────────────
    // 1. PHARMA-CORE SERVICE (Ingress Route: /core, /.well-known, /jwks.json)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 ══════════════════════════════════════════════════════════════════');
    console.log('  1. PHARMA-CORE VIA KUBERNETES ROUTE (/core, /.well-known, /jwks.json)');
    console.log('══════════════════════════════════════════════════════════════════════');

    // 1.1 Core Health
    const coreHealth = await axios.get(`${CORE_URL}/core/health`);
    assert(coreHealth.status === 200 && coreHealth.data.rsaKeyReady === true, 'GET /core/health (Crypto & Keystore Ready)');

    // 1.2 JWKS Discovery Endpoints
    const jwksRes = await axios.get(`${CORE_URL}/.well-known/jwks.json`);
    assert(jwksRes.status === 200 && Array.isArray(jwksRes.data.keys), 'GET /.well-known/jwks.json');
    assert(jwksRes.data.keys.some(k => k.kty === 'RSA'), 'JWKS includes RSA-4096 platform signing key');

    const jwksDirect = await axios.get(`${CORE_URL}/jwks.json`);
    assert(jwksDirect.status === 200 && jwksDirect.data.keys?.length > 0, 'GET /jwks.json');

    // 1.3 Key Management via Kubernetes URL
    const testMfrId = `MFR_K8S_${Date.now()}`;
    const keyGenRes = await axios.post(
        `${CORE_URL}/core/keys/generate`,
        { manufacturerId: testMfrId },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(keyGenRes.status === 201 && keyGenRes.data.status === 'success', 'POST /core/keys/generate provisions EC P-256 key');
    assert(keyGenRes.data.publicKeyPem?.includes('PUBLIC KEY'), 'Generated key contains valid PEM');

    const pubKeyRes = await axios.get(`${CORE_URL}/core/keys/public/${testMfrId}`, {
        headers: { 'X-Service-Token': SERVICE_TOKEN }
    });
    assert(pubKeyRes.status === 200 && pubKeyRes.data.publicKeyPem?.includes('PUBLIC KEY'), 'GET /core/keys/public/:mfrId');

    const keyStatsRes = await axios.get(`${CORE_URL}/core/keys/stats`, {
        headers: { 'X-Service-Token': SERVICE_TOKEN }
    });
    assert(keyStatsRes.status === 200 && keyStatsRes.data.totalKeys > 0, 'GET /core/keys/stats');

    // 1.4 Minting via Ingress
    const k8sBatchId = `PC-BATCH-K8S-${Date.now().toString().slice(-6)}`;
    const coreMintRes = await axios.post(
        `${CORE_URL}/core/batch/mint`,
        {
            batchId: k8sBatchId,
            manufacturerId: testMfrId,
            expiryDate: '2029-01-01',
            quantity: 3,
            medicineName: 'Paracetamol 650mg IP',
        },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(coreMintRes.status === 200 && coreMintRes.data.totalPacks === 3, 'POST /core/batch/mint');

    // 1.5 CSV Preview via Ingress
    const previewRes = await axios.get(
        `${CORE_URL}/core/export/${k8sBatchId}/preview?page=1&limit=3&s3FileKey=${encodeURIComponent(coreMintRes.data.s3FileKey)}`,
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(previewRes.status === 200 && previewRes.data.packs?.length === 3, 'GET /core/export/:batchId/preview');
    const samplePack = previewRes.data.packs[0];

    // 1.6 Hash verification via Ingress
    const verifyGenuine = await axios.post(
        `${CORE_URL}/core/hash/verify`,
        { signedToken: samplePack.signedToken },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(verifyGenuine.status === 200 && verifyGenuine.data.valid === true, 'POST /core/hash/verify (Genuine Token)');

    const verifyTampered = await axios.post(
        `${CORE_URL}/core/hash/verify`,
        { signedToken: samplePack.signedToken.slice(0, -6) + 'XXXXXX' },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(verifyTampered.status === 200 && verifyTampered.data.valid === false, 'POST /core/hash/verify (Counterfeit Token flagged)');

    // ──────────────────────────────────────────────────────────────────────────
    // 2. MANUFACTURER SERVICE (Ingress Route: /api/manufacturer)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🏭 ══════════════════════════════════════════════════════════════════');
    console.log('  2. MANUFACTURER SERVICE VIA KUBERNETES ROUTE (/api/manufacturer)');
    console.log('══════════════════════════════════════════════════════════════════════');

    const mfrEmail = `cipla_k8s_${Date.now()}@cipla.com`;
    const mfrRegRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/register`, {
        companyName: 'Cipla Therapeutics Ltd',
        licenseNumber: `DL-CIPLA-${Date.now().toString().slice(-5)}`,
        email: mfrEmail,
        password: 'CiplaPassword123!',
    });
    assert(mfrRegRes.status === 201 && mfrRegRes.data.data.kycStatus === 'PENDING', 'POST /api/manufacturer/auth/register');
    const mfrId = mfrRegRes.data.data.id;

    // Approve KYC
    const mfrKycRes = await axios.post(
        `${MFR_URL}/api/manufacturer/auth/kyc/approve`,
        { manufacturerId: mfrId },
        { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
    );
    assert(mfrKycRes.status === 200 && mfrKycRes.data.kycStatus === 'APPROVED', 'POST /api/manufacturer/auth/kyc/approve');

    // Login
    const mfrLoginRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/login`, {
        email: mfrEmail,
        password: 'CiplaPassword123!',
    });
    assert(mfrLoginRes.status === 200 && mfrLoginRes.data.token != null, 'POST /api/manufacturer/auth/login');
    const mfrToken = mfrLoginRes.data.token;

    // Create Batch
    const mfrBatchRes = await axios.post(
        `${MFR_URL}/api/manufacturer/batch`,
        {
            medicineName: 'Ciprofloxacin 500mg',
            genericName: 'Ciprofloxacin',
            brandName: 'Ciplox 500',
            dosageForm: 'Tablet',
            strength: '500mg',
            composition: 'Ciprofloxacin Hydrochloride IP 500mg',
            storageConditions: 'Store in a cool dry place',
            manufacturingDate: '2026-08-01',
            expiryDate: '2028-08-01',
            totalQuantity: 3,
            mrp: 95.50,
        },
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    assert(mfrBatchRes.status === 201 && mfrBatchRes.data.data.systemBatchId.startsWith('PC-BATCH-'), 'POST /api/manufacturer/batch');
    const mfrBatchId = mfrBatchRes.data.data.systemBatchId;

    // Trigger Mint
    const mfrMintRes = await axios.post(
        `${MFR_URL}/api/manufacturer/batch/${mfrBatchId}/mint`,
        {},
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    assert(mfrMintRes.status === 202, 'POST /api/manufacturer/batch/:batchId/mint (Async 202 Accepted)');

    // Poll until MINTED
    let mintedMfrBatch = null;
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 600));
        const check = await axios.get(`${MFR_URL}/api/manufacturer/batch/${mfrBatchId}`, {
            headers: { Authorization: `Bearer ${mfrToken}` }
        });
        if (check.data.data?.mintStatus === 'MINTED') {
            mintedMfrBatch = check.data.data;
            break;
        }
    }
    assert(mintedMfrBatch != null && mintedMfrBatch.mintStatus === 'MINTED', 'Batch mint completes in Kubernetes pod');

    // UI Table Preview
    const mfrPreviewRes = await axios.get(`${MFR_URL}/api/manufacturer/batch/${mfrBatchId}/preview?page=1&limit=3`, {
        headers: { Authorization: `Bearer ${mfrToken}` }
    });
    assert(mfrPreviewRes.status === 200 && mfrPreviewRes.data.packs?.length === 3, 'GET /api/manufacturer/batch/:batchId/preview');
    const mfrSamplePack = mfrPreviewRes.data.packs[0];

    // Public lookup
    const pubBatchRes = await axios.get(`${MFR_URL}/api/manufacturer/batch/public/${mfrBatchId}`);
    assert(pubBatchRes.status === 200 && pubBatchRes.data.data.medicineName === 'Ciprofloxacin 500mg', 'GET /api/manufacturer/batch/public/:batchId');

    // ──────────────────────────────────────────────────────────────────────────
    // 3. SHOPKEEPER SERVICE (Ingress Route: /api/shopkeeper, /api/medicine, /api/v1)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🏪 ══════════════════════════════════════════════════════════════════');
    console.log('  3. SHOPKEEPER SERVICE VIA KUBERNETES ROUTE (/api/shopkeeper)');
    console.log('══════════════════════════════════════════════════════════════════════');

    const shopTs = Date.now();
    const shopEmail = `apollo_${shopTs}@apollo.com`;
    const shopPhone = `8${shopTs.toString().slice(-9)}`;
    const shopRegRes = await axios.post(`${SHOP_URL}/api/shopkeeper/register`, {
        shopName: 'Apollo Pharmacy Central',
        shopPhone,
        shopEmail,
        address: 'Banjara Hills Road No 2',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500034',
        ownerName: 'Dr. Ramesh Reddy',
        ownerPhone: shopPhone,
        ownerEmail: shopEmail,
        drugLicenseNumber: `TS-HYD-${shopTs.toString().slice(-5)}`,
        licenseType: 'RETAIL_20B_21B',
        issuingAuthority: 'Drugs Control Administration Telangana',
        licenseIssueDate: '2024-01-01',
        licenseExpiryDate: '2029-12-31',
        password: 'ApolloPassword123!',
    });
    assert(shopRegRes.status === 201 && shopRegRes.data.data.shopId != null, 'POST /api/shopkeeper/register');
    const shopId = shopRegRes.data.data.shopId;

    // Approve KYC
    const shopKycRes = await axios.post(
        `${SHOP_URL}/api/shopkeeper/auth/kyc/approve`,
        { shopkeeperId: shopId },
        { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
    );
    assert(shopKycRes.status === 200 && shopKycRes.data.status === 'success', 'POST /api/shopkeeper/auth/kyc/approve');

    // Login
    const shopLoginRes = await axios.post(`${SHOP_URL}/api/shopkeeper/login`, {
        identifier: shopEmail,
        password: 'ApolloPassword123!',
    });
    assert(shopLoginRes.status === 200 && shopLoginRes.data.accessToken != null, 'POST /api/shopkeeper/login');
    const shopToken = shopLoginRes.data.accessToken;

    // Intake Scan
    const intakeRes = await axios.post(
        `${SHOP_URL}/api/shopkeeper/scan/intake`,
        { signedToken: mfrSamplePack.signedToken },
        { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    assert(intakeRes.status === 200 && intakeRes.data.status === 'success', 'POST /api/shopkeeper/scan/intake (Inventory Stock Added)');

    // Inventory listing
    const invRes = await axios.get(`${SHOP_URL}/api/shopkeeper/inventory`, {
        headers: { Authorization: `Bearer ${shopToken}` }
    });
    assert(invRes.status === 200 && invRes.data.data.inventory.length > 0, 'GET /api/shopkeeper/inventory');

    // Sale Scan
    const saleRes = await axios.post(
        `${SHOP_URL}/api/shopkeeper/scan/sale`,
        { signedToken: mfrSamplePack.signedToken },
        { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    assert(saleRes.status === 200 && saleRes.data.status === 'success', 'POST /api/shopkeeper/scan/sale (Stock Decremented)');

    // ──────────────────────────────────────────────────────────────────────────
    // 4. CONSUMER SERVICE (Ingress Route: /api/consumer)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n📱 ══════════════════════════════════════════════════════════════════');
    console.log('  4. CONSUMER SERVICE VIA KUBERNETES ROUTE (/api/consumer)');
    console.log('══════════════════════════════════════════════════════════════════════');

    // Verification by URL
    const consUrlVerify = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        qrData: `https://pharmachain.gov.in/verify/${mfrSamplePack.packHash}?token=${mfrSamplePack.signedToken}`,
    });
    assert(consUrlVerify.status === 200 && consUrlVerify.data.valid === true, 'POST /api/consumer/verify (QR URL format)');

    // Verification by Raw Token
    const consTokenVerify = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        token: mfrSamplePack.signedToken,
    });
    assert(consTokenVerify.status === 200 && consTokenVerify.data.valid === true, 'POST /api/consumer/verify (Raw Token format)');

    // Verification by GET Query Param
    const consGetVerify = await axios.get(`${CONS_URL}/api/consumer/verify?token=${encodeURIComponent(mfrSamplePack.signedToken)}`);
    assert(consGetVerify.status === 200 && consGetVerify.data.valid === true, 'GET /api/consumer/verify?token=...');

    // Counterfeit Flagging
    const counterfeitToken = mfrSamplePack.signedToken.slice(0, -6) + '999999';
    const consFakeRes = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        qrData: counterfeitToken,
    });
    assert(consFakeRes.status === 200 && consFakeRes.data.uiState === 'COUNTERFEIT' && consFakeRes.data.valid === false, 'POST /api/consumer/verify flags COUNTERFEIT');

    // Incident Reporting
    const reportRes = await axios.post(`${CONS_URL}/api/consumer/report`, {
        qrToken: counterfeitToken,
        location: 'Hyderabad Banjara Hills',
        notes: 'Counterfeit detected during Kubernetes Ingress validation test.',
    });
    assert(reportRes.status === 201 && reportRes.data.status === 'success', 'POST /api/consumer/report');

    // ──────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n======================================================================');
    console.log(`📊 KUBERNETES URL TEST SUMMARY: ${passedTests}/${totalTests} Tests Passed (${failedTests} Failed)`);
    console.log('======================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runK8sUrlSuite().catch(err => {
    console.error('Fatal error during Kubernetes URL test suite:', err.response?.data || err.message);
    process.exit(1);
});
