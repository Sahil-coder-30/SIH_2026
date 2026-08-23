import axios from 'axios';

// ── Configuration ─────────────────────────────────────────────────────────────
const ADMIN_TOKEN    = '960e412b2690c03cb83337b91010016a572343f23123feb3';
const SERVICE_TOKEN  = '1d230ff87628d00c450d7bb7f5f5245ad30ad7d1b57be42253e66de27738d11a7351a2a4a7dbc451fb1445e658f382c9';

const CORE_URL = process.env.CORE_URL || 'http://127.0.0.1:4000';
const MFR_URL  = process.env.MFR_URL  || 'http://127.0.0.1:3001';
const SHOP_URL = process.env.SHOP_URL || 'http://127.0.0.1:3002';
const CONS_URL = process.env.CONS_URL || 'http://127.0.0.1:3003';


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

async function runComprehensiveSuite() {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║        PHARMACHAIN COMPREHENSIVE END-TO-END MICROSERVICES API TEST SUITE     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 1: PHARMA-CORE CRYPTO VAULT SERVICE (Port 4000)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 ══════════════════════════════════════════════════════════════════');
    console.log('  SECTION 1: PHARMA-CORE CRYPTO VAULT & JWKS (Port 4000)');
    console.log('══════════════════════════════════════════════════════════════════════');

    // 1.1 Health & Readiness Probes
    const coreHealthz = await axios.get(`${CORE_URL}/healthz`);
    assert(coreHealthz.status === 200 && coreHealthz.data.status === 'ok', 'GET /healthz');

    const coreReadyz = await axios.get(`${CORE_URL}/readyz`);
    assert(coreReadyz.status === 200 && coreReadyz.data.status === 'ok', 'GET /readyz');

    const coreHealth = await axios.get(`${CORE_URL}/core/health`);
    assert(coreHealth.status === 200 && coreHealth.data.rsaKeyReady === true, 'GET /core/health (RSA & Keystore ready)');

    // 1.2 JWKS Endpoints
    const jwksWellKnown = await axios.get(`${CORE_URL}/.well-known/jwks.json`);
    assert(jwksWellKnown.status === 200 && Array.isArray(jwksWellKnown.data.keys), 'GET /.well-known/jwks.json returns JWKS');
    assert(jwksWellKnown.data.keys.some(k => k.kty === 'RSA'), 'JWKS contains valid RSA key specification');

    const jwksDirect = await axios.get(`${CORE_URL}/jwks.json`);
    assert(jwksDirect.status === 200 && jwksDirect.data.keys?.length > 0, 'GET /jwks.json alias');

    // 1.3 Key Management
    const testMfrId = `MFR_SUITE_${Date.now()}`;
    const keyGenRes = await axios.post(
        `${CORE_URL}/core/keys/generate`,
        { manufacturerId: testMfrId },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(keyGenRes.status === 201 && keyGenRes.data.status === 'success', 'POST /core/keys/generate provisions EC P-256 key');
    assert(keyGenRes.data.publicKeyPem?.includes('PUBLIC KEY'), 'Generated key includes valid PEM');

    const jwksAfterGen = await axios.get(`${CORE_URL}/.well-known/jwks.json`);
    assert(jwksAfterGen.data.keys.some(k => k.kty === 'EC'), 'JWKS dynamically includes newly provisioned EC P-256 key');



    const pubKeyRes = await axios.get(`${CORE_URL}/core/keys/public/${testMfrId}`, {
        headers: { 'X-Service-Token': SERVICE_TOKEN }
    });
    assert(pubKeyRes.status === 200 && pubKeyRes.data.publicKeyPem?.includes('PUBLIC KEY'), 'GET /core/keys/public/:manufacturerId');

    const keyStatsRes = await axios.get(`${CORE_URL}/core/keys/stats`, {
        headers: { 'X-Service-Token': SERVICE_TOKEN }
    });
    assert(keyStatsRes.status === 200 && keyStatsRes.data.totalKeys > 0, 'GET /core/keys/stats returns keystore metrics');

    // 1.4 Minting directly via pharma-core
    const coreBatchId = `PC-BATCH-CORETEST-${Date.now().toString().slice(-6)}`;
    const coreMintRes = await axios.post(
        `${CORE_URL}/core/batch/mint`,
        {
            batchId: coreBatchId,
            manufacturerId: testMfrId,
            expiryDate: '2029-01-01',
            quantity: 3,
            medicineName: 'Amoxicillin 500mg',
        },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(coreMintRes.status === 200 && coreMintRes.data.totalPacks === 3, 'POST /core/batch/mint signs packs in memory');
    assert(coreMintRes.data.s3DownloadUrl != null, 'Batch mint includes S3 download URL');

    // 1.5 CSV Preview & Download via pharma-core
    const corePreviewRes = await axios.get(
        `${CORE_URL}/core/export/${coreBatchId}/preview?page=1&limit=5&s3FileKey=${encodeURIComponent(coreMintRes.data.s3FileKey)}`,
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(corePreviewRes.status === 200 && corePreviewRes.data.packs?.length === 3, 'GET /core/export/:batchId/preview parses CSV');

    const coreSamplePack = corePreviewRes.data.packs[0];

    // 1.6 Hash verification & Status
    const coreVerifyValid = await axios.post(
        `${CORE_URL}/core/hash/verify`,
        { signedToken: coreSamplePack.signedToken },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(coreVerifyValid.status === 200 && coreVerifyValid.data.valid === true, 'POST /core/hash/verify accepts genuine JWT');
    assert(coreVerifyValid.data.packHash === coreSamplePack.packHash, 'Verified packHash matches sample packHash');

    const coreVerifyFake = await axios.post(
        `${CORE_URL}/core/hash/verify`,
        { signedToken: coreSamplePack.signedToken.slice(0, -6) + 'XXXXXX' },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(coreVerifyFake.status === 200 && coreVerifyFake.data.valid === false, 'POST /core/hash/verify returns HTTP 200 valid:false for tampered token');

    const coreHashStatus = await axios.get(`${CORE_URL}/core/hash/status/${coreSamplePack.packHash}`, {
        headers: { 'X-Service-Token': SERVICE_TOKEN }
    });
    assert(coreHashStatus.status === 200 && coreHashStatus.data.status != null, 'GET /core/hash/status/:hash returns ledger status');

    // 1.7 Supply Chain Chaincode Transitions
    const intakeTransitionRes = await axios.post(
        `${CORE_URL}/core/chain/intake`,
        {
            packHash: coreSamplePack.packHash,
            shopId: 'SHOP-TEST-001',
            operatorId: 'OP-TEST-001',
            manufacturerId: testMfrId,
        },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(intakeTransitionRes.status === 200 && intakeTransitionRes.data.status === 'success', 'POST /core/chain/intake');

    const saleTransitionRes = await axios.post(
        `${CORE_URL}/core/chain/sale`,
        {
            packHash: coreSamplePack.packHash,
            shopId: 'SHOP-TEST-001',
            operatorId: 'OP-TEST-001',
        },
        { headers: { 'X-Service-Token': SERVICE_TOKEN } }
    );
    assert(saleTransitionRes.status === 200 && saleTransitionRes.data.status === 'success', 'POST /core/chain/sale');

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 2: MANUFACTURER SERVICE (Port 3001)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🏭 ══════════════════════════════════════════════════════════════════');
    console.log('  SECTION 2: MANUFACTURER DOMAIN SERVICE (Port 3001)');
    console.log('══════════════════════════════════════════════════════════════════════');

    // 2.1 Health
    const mfrHealthz = await axios.get(`${MFR_URL}/healthz`);
    assert(mfrHealthz.status === 200 && mfrHealthz.data.status === 'ok', 'GET /healthz');

    const mfrReadyz = await axios.get(`${MFR_URL}/readyz`);
    assert(mfrReadyz.status === 200 && mfrReadyz.data.status === 'ok', 'GET /readyz');

    // 2.2 Registration, KYC, Login
    const mfrEmail = `sun_pharma_${Date.now()}@pharma.com`;
    const mfrRegRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/register`, {
        companyName: 'Sun Pharma Industries',
        licenseNumber: `DL-SUN-${Date.now().toString().slice(-5)}`,
        email: mfrEmail,
        password: 'SunPassword123!',
    });
    assert(mfrRegRes.status === 201 && mfrRegRes.data.data.kycStatus === 'PENDING', 'POST /api/manufacturer/auth/register creates PENDING account');
    const mfrId = mfrRegRes.data.data.id;

    // Reject login prior to KYC
    try {
        await axios.post(`${MFR_URL}/api/manufacturer/auth/login`, {
            email: mfrEmail,
            password: 'SunPassword123!',
        });
        assert(false, 'Login before KYC should be blocked');
    } catch (e) {
        assert(e.response?.status === 403, 'POST /api/manufacturer/auth/login returns 403 for unverified manufacturer');
    }

    // Approve KYC
    const mfrKycRes = await axios.post(
        `${MFR_URL}/api/manufacturer/auth/kyc/approve`,
        { manufacturerId: mfrId },
        { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
    );
    assert(mfrKycRes.status === 200 && mfrKycRes.data.kycStatus === 'APPROVED', 'POST /api/manufacturer/auth/kyc/approve sets APPROVED & provisions key');

    // Login
    const mfrLoginRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/login`, {
        email: mfrEmail,
        password: 'SunPassword123!',
    });
    assert(mfrLoginRes.status === 200 && mfrLoginRes.data.token != null, 'POST /api/manufacturer/auth/login issues JWT');
    const mfrToken = mfrLoginRes.data.token;

    // 2.3 Batch Management
    const mfrBatchRes = await axios.post(
        `${MFR_URL}/api/manufacturer/batch`,
        {
            medicineName: 'Azithromycin 500mg USP',
            genericName: 'Azithromycin',
            brandName: 'Azee 500',
            dosageForm: 'Tablet',
            strength: '500mg',
            composition: 'Azithromycin Dihydrate IP 500mg',
            storageConditions: 'Store below 25°C',
            manufacturingDate: '2026-08-10',
            expiryDate: '2028-08-10',
            totalQuantity: 4,
            mrp: 120.00,
        },
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    assert(mfrBatchRes.status === 201 && mfrBatchRes.data.data.systemBatchId.startsWith('PC-BATCH-'), 'POST /api/manufacturer/batch creates batch record');
    const mfrBatchId = mfrBatchRes.data.data.systemBatchId;

    // List Batches
    const listBatchesRes = await axios.get(`${MFR_URL}/api/manufacturer/batch`, {
        headers: { Authorization: `Bearer ${mfrToken}` }
    });
    assert(listBatchesRes.status === 200 && listBatchesRes.data.data?.length > 0, 'GET /api/manufacturer/batch lists batches');

    // Get Single Batch
    const getBatchRes = await axios.get(`${MFR_URL}/api/manufacturer/batch/${mfrBatchId}`, {
        headers: { Authorization: `Bearer ${mfrToken}` }
    });
    assert(getBatchRes.status === 200 && getBatchRes.data.data.batchId === mfrBatchId, 'GET /api/manufacturer/batch/:batchId retrieves metadata');

    // Mint Batch
    const mfrMintTrigger = await axios.post(
        `${MFR_URL}/api/manufacturer/batch/${mfrBatchId}/mint`,
        {},
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    assert(mfrMintTrigger.status === 202 && mfrMintTrigger.data.status === 'accepted', 'POST /api/manufacturer/batch/:batchId/mint returns 202 Accepted');

    // Poll until MINTED
    let mintedBatch = null;
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 600));
        const check = await axios.get(`${MFR_URL}/api/manufacturer/batch/${mfrBatchId}`, {
            headers: { Authorization: `Bearer ${mfrToken}` }
        });
        if (check.data.data?.mintStatus === 'MINTED') {
            mintedBatch = check.data.data;
            break;
        }
    }
    assert(mintedBatch != null && mintedBatch.mintStatus === 'MINTED', 'Async minting job completes successfully');

    // 2.4 Preview, Packs Info, Public Lookup
    const mfrPreviewRes = await axios.get(`${MFR_URL}/api/manufacturer/batch/${mfrBatchId}/preview?page=1&limit=4`, {
        headers: { Authorization: `Bearer ${mfrToken}` }
    });
    assert(mfrPreviewRes.status === 200 && mfrPreviewRes.data.packs?.length === 4, 'GET /api/manufacturer/batch/:batchId/preview');
    const mfrSamplePack = mfrPreviewRes.data.packs[0];

    const mfrPacksInfo = await axios.get(`${MFR_URL}/api/manufacturer/batch/${mfrBatchId}/packs`, {
        headers: { Authorization: `Bearer ${mfrToken}` }
    });
    assert(mfrPacksInfo.status === 200 && (mfrPacksInfo.data.data?.s3DownloadUrl != null || mfrPacksInfo.data.s3DownloadUrl != null), 'GET /api/manufacturer/batch/:batchId/packs');


    const publicBatchRes = await axios.get(`${MFR_URL}/api/manufacturer/batch/public/${mfrBatchId}`);
    assert(publicBatchRes.status === 200 && publicBatchRes.data.data.medicineName === 'Azithromycin 500mg USP', 'GET /api/manufacturer/batch/public/:batchId (Unauthenticated)');

    const globalLookupRes = await axios.get(`${MFR_URL}/api/manufacturer/batch/pack/lookup/${mfrBatchId}`, {
        headers: { Authorization: `Bearer ${mfrToken}` }
    });
    assert(globalLookupRes.status === 200, 'GET /api/manufacturer/batch/pack/lookup/:identifier');

    // Logout
    const mfrLogoutRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/logout`);
    assert(mfrLogoutRes.status === 204, 'POST /api/manufacturer/auth/logout clears cookie');

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 3: SHOPKEEPER SERVICE (Port 3002)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🏪 ══════════════════════════════════════════════════════════════════');
    console.log('  SECTION 3: SHOPKEEPER DOMAIN SERVICE (Port 3002)');
    console.log('══════════════════════════════════════════════════════════════════════');

    // 3.1 Health
    const shopHealthz = await axios.get(`${SHOP_URL}/healthz`);
    assert(shopHealthz.status === 200 && shopHealthz.data.status === 'ok', 'GET /healthz');

    const shopReadyz = await axios.get(`${SHOP_URL}/readyz`);
    assert(shopReadyz.status === 200 && shopReadyz.data.status === 'ok', 'GET /readyz');

    // 3.2 Registration, KYC, Login
    const shopTs = Date.now();
    const shopEmail = `medplus_${shopTs}@pharmacy.com`;
    const shopPhone = `9${shopTs.toString().slice(-9)}`;
    const shopRegRes = await axios.post(`${SHOP_URL}/api/shopkeeper/register`, {
        shopName: 'MedPlus Pharmacy',
        shopPhone,
        shopEmail,
        address: '100 Feet Road, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        ownerName: 'Vikas Sharma',
        ownerPhone: shopPhone,
        ownerEmail: shopEmail,
        drugLicenseNumber: `KA-MED-${shopTs.toString().slice(-5)}`,
        licenseType: 'RETAIL_20B_21B',
        issuingAuthority: 'Drugs Control Department Karnataka',
        licenseIssueDate: '2024-01-01',
        licenseExpiryDate: '2029-12-31',
        password: 'MedplusPassword123!',
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
        password: 'MedplusPassword123!',
    });
    assert(shopLoginRes.status === 200 && shopLoginRes.data.accessToken != null, 'POST /api/shopkeeper/login issues JWT');
    const shopToken = shopLoginRes.data.accessToken;

    // 3.3 Verification Status & Profile
    const verStatusRes = await axios.get(`${SHOP_URL}/api/shopkeeper/auth/verification-status`, {
        headers: { Authorization: `Bearer ${shopToken}` }
    });
    assert(verStatusRes.status === 200 && verStatusRes.data.data.shopId === shopId, 'GET /api/shopkeeper/auth/verification-status');

    const getProfileRes = await axios.get(`${SHOP_URL}/api/shopkeeper/profile`, {
        headers: { Authorization: `Bearer ${shopToken}` }
    });
    assert(getProfileRes.status === 200 && getProfileRes.data.data.shopkeeper.shopName === 'MedPlus Pharmacy', 'GET /api/shopkeeper/profile');

    const patchProfileRes = await axios.patch(
        `${SHOP_URL}/api/shopkeeper/profile`,
        { city: 'Bengaluru East' },
        { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    assert(patchProfileRes.status === 200 && patchProfileRes.data.data.shopkeeper.city === 'Bengaluru East', 'PATCH /api/shopkeeper/profile');

    // 3.4 Scans: Intake, Inventory, Authenticated Scan, Sale Scan
    const intakeScanRes = await axios.post(
        `${SHOP_URL}/api/shopkeeper/scan/intake`,
        { signedToken: mfrSamplePack.signedToken },
        { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    assert(intakeScanRes.status === 200 && intakeScanRes.data.status === 'success', 'POST /api/shopkeeper/scan/intake adds pack to inventory');

    // Duplicate Intake rejection
    try {
        await axios.post(
            `${SHOP_URL}/api/shopkeeper/scan/intake`,
            { signedToken: mfrSamplePack.signedToken },
            { headers: { Authorization: `Bearer ${shopToken}` } }
        );
        assert(false, 'Duplicate intake should fail');
    } catch (e) {
        assert(e.response?.status === 409, 'POST /api/shopkeeper/scan/intake rejects duplicate intake with HTTP 409');
    }

    // Inventory Query
    const invRes = await axios.get(`${SHOP_URL}/api/shopkeeper/inventory`, {
        headers: { Authorization: `Bearer ${shopToken}` }
    });
    assert(invRes.status === 200 && invRes.data.data.inventory.length > 0, 'GET /api/shopkeeper/inventory lists available stock');

    // Authenticated Pre-Sale Scan
    const medScanRes = await axios.post(
        `${SHOP_URL}/api/medicine/scan`,
        { signedToken: mfrSamplePack.signedToken },
        { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    assert(medScanRes.status === 200 && medScanRes.data.valid === true, 'POST /api/medicine/scan validates pack pre-sale');

    // Public Customer Scan on Shopkeeper Service
    const custScanRes = await axios.post(`${SHOP_URL}/api/v1/scan/customer`, {
        signedToken: mfrSamplePack.signedToken,
    });
    assert(custScanRes.status === 200 && custScanRes.data.valid === true, 'POST /api/v1/scan/customer validates for public consumer');

    // Sale Scan
    const saleScanRes = await axios.post(
        `${SHOP_URL}/api/shopkeeper/scan/sale`,
        { signedToken: mfrSamplePack.signedToken },
        { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    assert(saleScanRes.status === 200 && saleScanRes.data.status === 'success', 'POST /api/shopkeeper/scan/sale confirms sale');

    // Stats & History
    const statsRes = await axios.get(`${SHOP_URL}/api/shopkeeper/stats`, {
        headers: { Authorization: `Bearer ${shopToken}` }
    });
    assert(statsRes.status === 200 && statsRes.data.data.totalScans > 0, 'GET /api/shopkeeper/stats');

    const historyRes = await axios.get(`${SHOP_URL}/api/shopkeeper/medicine/history`, {
        headers: { Authorization: `Bearer ${shopToken}` }
    });
    assert(historyRes.status === 200 && historyRes.data.data.history.length > 0, 'GET /api/shopkeeper/medicine/history');

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 4: CONSUMER SERVICE (Port 3003)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n📱 ══════════════════════════════════════════════════════════════════');
    console.log('  SECTION 4: CONSUMER STATELESS VERIFICATION SERVICE (Port 3003)');
    console.log('══════════════════════════════════════════════════════════════════════');

    // 4.1 Health
    const consHealthz = await axios.get(`${CONS_URL}/healthz`);
    assert(consHealthz.status === 200 && consHealthz.data.status === 'ok', 'GET /healthz');

    const consReadyz = await axios.get(`${CONS_URL}/readyz`);
    assert(consReadyz.status === 200 && consReadyz.data.status === 'ok', 'GET /readyz');

    // 4.2 Genuine Pack Verification
    const consVerifyUrl = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        qrData: `https://pharmachain.gov.in/verify/${mfrSamplePack.packHash}?token=${mfrSamplePack.signedToken}`,
    });
    assert(consVerifyUrl.status === 200 && consVerifyUrl.data.valid === true, 'POST /api/consumer/verify with full QR verify URL');

    const consVerifyRaw = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        token: mfrSamplePack.signedToken,
    });
    assert(consVerifyRaw.status === 200 && consVerifyRaw.data.valid === true, 'POST /api/consumer/verify with raw JWT token');

    const consVerifyGet = await axios.get(`${CONS_URL}/api/consumer/verify?token=${encodeURIComponent(mfrSamplePack.signedToken)}`);
    assert(consVerifyGet.status === 200 && consVerifyGet.data.valid === true, 'GET /api/consumer/verify query param format');

    // 4.3 Counterfeit Detection
    const tampered = mfrSamplePack.signedToken.slice(0, -6) + 'ZZZZZZ';
    const consFakeRes = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        qrData: tampered,
    });
    assert(consFakeRes.status === 200 && consFakeRes.data.uiState === 'COUNTERFEIT' && consFakeRes.data.valid === false, 'POST /api/consumer/verify flags counterfeit signature');

    // 4.4 Counterfeit Incident Reporting
    const reportRes = await axios.post(`${CONS_URL}/api/consumer/report`, {
        qrToken: tampered,
        location: 'MG Road Pharmacy, Indiranagar',
        notes: 'Packaging print was blurry and blister pack was unsealed.',
    });
    assert(reportRes.status === 201 && reportRes.data.status === 'success' && reportRes.data.reportId != null, 'POST /api/consumer/report records incident');

    // ──────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n======================================================================');
    console.log(`📊 TEST SUITE SUMMARY: ${passedTests}/${totalTests} Tests Passed (${failedTests} Failed)`);
    console.log('======================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runComprehensiveSuite().catch(err => {
    console.error('Fatal error during test suite execution:', err.response?.data || err.message);
    process.exit(1);
});
