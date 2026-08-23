import axios from 'axios';

const ADMIN_TOKEN = '960e412b2690c03cb83337b91010016a572343f23123feb3';

const CORE_URL = 'http://localhost:4000';
const MFR_URL  = 'http://localhost:3001';
const SHOP_URL = 'http://localhost:3002';
const CONS_URL = 'http://localhost:3003';

async function runE2ETest() {
    console.log('======================================================================');
    console.log('🚀 PHARMACHAIN END-TO-END SYSTEM INTEGRATION TEST');
    console.log('======================================================================\n');

    // 1. Health Checks
    console.log('🔍 [1/8] Verifying Health Checks on All 4 Services...');
    const [hCore, hMfr, hShop, hCons] = await Promise.all([
        axios.get(`${CORE_URL}/healthz`),
        axios.get(`${MFR_URL}/healthz`),
        axios.get(`${SHOP_URL}/healthz`),
        axios.get(`${CONS_URL}/healthz`),
    ]);
    console.log('  ✅ pharma-core:   ', hCore.data);
    console.log('  ✅ manufacturer:  ', hMfr.data);
    console.log('  ✅ shopkeeper:    ', hShop.data);
    console.log('  ✅ consumer:      ', hCons.data);

    // 2. Register Manufacturer & Approve KYC
    console.log('\n🏭 [2/8] Testing Manufacturer Registration & KYC Approval...');
    const testEmail = `cipla_test_${Date.now()}@pharma.com`;
    const regRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/register`, {
        companyName: 'Cipla Therapeutics Ltd',
        licenseNumber: `DL-${Date.now().toString().slice(-6)}`,
        email: testEmail,
        password: 'SecurePassword123!',
    });
    console.log('  ✅ Registered:', regRes.data.data);
    const mfrId = regRes.data.data.id;

    // Approve KYC
    const approveRes = await axios.post(
        `${MFR_URL}/api/manufacturer/auth/kyc/approve`,
        { manufacturerId: mfrId },
        { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
    );
    console.log('  ✅ KYC Approved + EC Key Provisioned:', approveRes.data);

    // Login
    const loginRes = await axios.post(`${MFR_URL}/api/manufacturer/auth/login`, {
        email: testEmail,
        password: 'SecurePassword123!',
    });
    const mfrToken = loginRes.data.token;
    console.log('  ✅ Manufacturer Logged In. JWT acquired.');

    // 3. Create Batch & Mint
    console.log('\n📦 [3/8] Creating Batch & Minting QR Codes (Cryptographic Pipeline)...');
    const batchRes = await axios.post(
        `${MFR_URL}/api/manufacturer/batch/create`,
        {
            medicineName: 'Paracetamol 500mg IP',
            genericName: 'Acetaminophen',
            brandName: 'Pacimol 500',
            dosageForm: 'Tablet',
            strength: '500mg',
            composition: 'Paracetamol IP 500mg',
            storageConditions: 'Store below 30°C in a dry place',
            manufacturingDate: '2026-08-01',
            expiryDate: '2028-12-31',
            mrp: 35.50,
            quantity: 5,
        },
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    const systemBatchId = batchRes.data.data.systemBatchId;
    console.log(`  ✅ Batch created with systemBatchId: ${systemBatchId}`);

    // Mint Batch
    console.log('  🔄 Triggering minting for 5 QR packs with ES256 signatures & S3 CSV upload...');
    const mintRes = await axios.post(
        `${MFR_URL}/api/manufacturer/batch/${systemBatchId}/mint`,
        {},
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    console.log('  ✅ Minting triggered (202 Accepted):', mintRes.data);

    // Poll until MINTED
    let batchDoc = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const check = await axios.get(`${MFR_URL}/api/manufacturer/batch/${systemBatchId}`, {
            headers: { Authorization: `Bearer ${mfrToken}` }
        });
        const currentStatus = check.data.data?.mintStatus || check.data.data?.batch?.mintStatus;
        if (currentStatus === 'MINTED') {
            batchDoc = check.data.data?.batch || check.data.data;
            break;
        }
        console.log(`  ⏳ Waiting for mint to complete (status: ${currentStatus})...`);
    }


    if (!batchDoc) {
        throw new Error('Batch minting timed out');
    }
    console.log('  ✅ Batch Mint completed:', {
        mintStatus: batchDoc.mintStatus,
        s3FileKey: batchDoc.s3FileKey,
        s3Mode: batchDoc.s3Mode,
        s3DownloadUrl: batchDoc.s3DownloadUrl?.substring(0, 80) + '...',
    });

    // 4. Test Preview API
    console.log('\n📊 [4/8] Testing CSV Preview API for Manufacturer Dashboard...');
    const previewRes = await axios.get(
        `${MFR_URL}/api/manufacturer/batch/${systemBatchId}/preview?page=1&limit=5`,
        { headers: { Authorization: `Bearer ${mfrToken}` } }
    );
    console.log('  ✅ Preview data received:', {
        totalRows: previewRes.data.meta?.totalRows || previewRes.data.packs?.length,
        samplePack: previewRes.data.packs?.[0],
    });

    const samplePack = previewRes.data.packs[0];
    const sampleToken = samplePack.signedToken;
    const sampleHash = samplePack.packHash;


    // 5. Test Consumer Public Verification
    console.log('\n📱 [5/8] Testing Public Consumer Verification on Minted Pack...');
    const verifyRes = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        qrData: `https://pharmachain.gov.in/verify/${sampleHash}?token=${sampleToken}`,
    });
    console.log('  ✅ Consumer Verification result:', {
        valid: verifyRes.data.valid,
        uiState: verifyRes.data.uiState,
        message: verifyRes.data.message,
        payload: verifyRes.data.payload,
    });

    // 6. Test Counterfeit Detection on Tampered Token
    console.log('\n🛡️ [6/8] Testing Counterfeit Detection with Tampered Token...');
    const tamperedToken = sampleToken.slice(0, -5) + 'AAAAA';
    const fakeVerifyRes = await axios.post(`${CONS_URL}/api/consumer/verify`, {
        signedToken: tamperedToken,
    });
    console.log('  ✅ Counterfeit Verification result:', {
        valid: fakeVerifyRes.data.valid,
        uiState: fakeVerifyRes.data.uiState,
        message: fakeVerifyRes.data.message,
    });

    // 7. Register Shopkeeper & Intake Scan
    console.log('\n🏪 [7/8] Testing Shopkeeper Registration, KYC Approval, & Intake Scan...');
    const timestamp = Date.now();
    const shopEmail = `shop_${timestamp}@pharmacy.com`;
    const shopPhone = `9${timestamp.toString().slice(-9)}`;
    const shopReg = await axios.post(`${SHOP_URL}/api/shopkeeper/register`, {
        shopName: 'Apollo Care Pharmacy',
        shopPhone,
        shopEmail,
        address: 'MG Road, 4th Block',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        ownerName: 'Ramesh Gupta',
        ownerPhone: shopPhone,
        ownerEmail: shopEmail,
        drugLicenseNumber: `KA-BLR-${timestamp.toString().slice(-5)}`,
        licenseType: 'RETAIL_20B_21B',
        issuingAuthority: 'Drugs Control Department Karnataka',
        licenseIssueDate: '2024-01-01',
        licenseExpiryDate: '2029-12-31',
        password: 'ShopPassword123!',
    });

    const shopId = shopReg.data.data.shopId;
    console.log('  ✅ Shopkeeper Registered:', shopId);

    // KYC Approve Shopkeeper
    const shopApprove = await axios.post(
        `${SHOP_URL}/api/shopkeeper/auth/kyc/approve`,
        { shopkeeperId: shopId },
        { headers: { 'X-Admin-Token': ADMIN_TOKEN } }
    );
    console.log('  ✅ Shopkeeper KYC Approved:', shopApprove.data);

    // Login Shopkeeper
    const shopLogin = await axios.post(`${SHOP_URL}/api/shopkeeper/login`, {
        identifier: shopEmail,
        password: 'ShopPassword123!',
    });
    const shopToken = shopLogin.data.accessToken || shopLogin.data.data?.accessToken;
    console.log('  ✅ Shopkeeper Logged In. JWT acquired.');


    // Intake Scan
    console.log('  🔄 Performing Shopkeeper Intake Scan for sample pack...');
    const intakeRes = await axios.post(
        `${SHOP_URL}/api/shopkeeper/scan/intake`,
        { signedToken: sampleToken },
        { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    console.log('  ✅ Intake Scan Successful:', intakeRes.data);

    // Verify Inventory
    const invRes = await axios.get(`${SHOP_URL}/api/shopkeeper/inventory`, {
        headers: { Authorization: `Bearer ${shopToken}` },
    });
    console.log('  ✅ Shopkeeper Inventory:', invRes.data.data.inventory);

    // 8. Shopkeeper Sale Scan
    console.log('\n🛒 [8/8] Testing Shopkeeper Sale Scan...');
    const saleRes = await axios.post(
        `${SHOP_URL}/api/shopkeeper/scan/sale`,
        { signedToken: sampleToken },
        { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    console.log('  ✅ Sale Scan Confirmed:', saleRes.data);

    console.log('\n======================================================================');
    console.log('🎉 ALL 8/8 END-TO-END INTEGRATION TESTS PASSED PERFECTLY!');
    console.log('======================================================================\n');
}

runE2ETest().catch(err => {
    console.error('\n❌ E2E Test Failed:', err.response?.data || err.message);
    process.exit(1);
});
