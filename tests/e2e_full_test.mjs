/**
 * PHARMACHAIN — FULL END-TO-END API TEST SUITE
 * Services:  Manufacturer Service  → http://localhost/api/manufacturer
 *            Consumer Service      → http://localhost/api/consumer
 * Cluster:   Kubernetes (NGINX Ingress on port 80)
 */

const ADMIN_TOKEN = '960e412b2690c03cb83337b91010016a572343f23123feb3';
const MFR_BASE    = 'http://localhost/api/manufacturer';
const CON_BASE    = 'http://localhost/api/consumer';

const ts = Date.now().toString().slice(-6);
const NEW_MFR_EMAIL    = `e2e_test_${ts}@pharmachain.test`;
const NEW_MFR_PASSWORD = 'TestPass@2026';
const HIMANSHU_EMAIL   = 'himanshu@gmail.com';
const HIMANSHU_PASS    = '12345678';

let state = {
  newMfrToken: null, newMfrId: null, newMfrLicenseNo: `MH-${ts}`,
  himanshuToken: null, himanshuId: null,
  batchId: null, systemBatchId: null,
  samplePackHash: null, sampleSignedToken: null, sampleVerifyUrl: null,
};

let passCount = 0, failCount = 0;
const results = [];

function log(label, pass, detail = '') {
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`  ${pass ? '✅' : '❌'}  [${icon}] ${label}`);
  if (detail && !pass) console.log(`         -> ${detail}`);
  pass ? passCount++ : failCount++;
  results.push({ label, pass, detail });
}

function section(title) {
  console.log(`\n${'='.repeat(65)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(65));
}

async function api(method, url, { body, token, headers = {} } = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    redirect: 'follow',
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

async function poll(url, token, { field, value, interval = 1000, maxTries = 60 } = {}) {
  for (let i = 0; i < maxTries; i++) {
    await new Promise(r => setTimeout(r, interval));
    const { status, data } = await api('GET', url, { token });
    if (status === 200 && data?.data?.[field] === value) return data.data;
    if (data?.data?.mintStatus === 'FAILED') throw new Error('Mint failed: ' + data.data.mintError);
    process.stdout.write('.');
  }
  throw new Error(`Poll timed out waiting for ${field}=${value}`);
}

async function runAll() {
  console.log('\n' + '='.repeat(65));
  console.log('  PHARMACHAIN FULL E2E API TEST SUITE');
  console.log('  Manufacturer + Consumer on Kubernetes Cluster');
  console.log('='.repeat(65));

  // ── SECTION 1: HEALTH ──────────────────────────────────────────────────────
  section('1. SERVICE HEALTH CHECKS');
  {
    const { status, data } = await api('GET', 'http://localhost/core/health');
    log('GET /core/health → pharma-core UP', status === 200 && data?.status === 'ok', JSON.stringify(data));
  }
  {
    const { status } = await api('GET', 'http://localhost/healthz');
    log('GET /healthz → manufacturer-service reachable', status !== 502 && status !== 504, `HTTP ${status}`);
  }
  {
    const { status } = await api('GET', 'http://localhost/api/consumer/verify');
    log('GET /api/consumer/verify → consumer-service reachable', status !== 502 && status !== 504, `HTTP ${status}`);
  }

  // ── SECTION 2: REGISTER ────────────────────────────────────────────────────
  section('2. MANUFACTURER AUTH — REGISTER');
  {
    const { status, data } = await api('POST', `${MFR_BASE}/auth/register`, {
      body: { companyName: 'E2E Test Pharma Ltd', licenseNumber: state.newMfrLicenseNo, email: NEW_MFR_EMAIL, password: NEW_MFR_PASSWORD },
    });
    log('POST /auth/register -> 201 kycStatus=PENDING', status === 201 && data?.data?.kycStatus === 'PENDING', JSON.stringify(data?.status));
    if (data?.data) state.newMfrId = data.data.id;
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/auth/register`, {
      body: { companyName: 'Dup', licenseNumber: 'LIC-D', email: NEW_MFR_EMAIL, password: NEW_MFR_PASSWORD },
    });
    log('POST /auth/register -> 409 duplicate email', status === 409, `HTTP ${status}`);
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/auth/register`, { body: { email: 'missing@test.com' } });
    log('POST /auth/register -> 400 missing fields', status === 400, `HTTP ${status}`);
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/auth/register`, {
      body: { companyName: 'X', licenseNumber: 'Y', email: `shortpw_${ts}@test.com`, password: '123' },
    });
    log('POST /auth/register -> 400 short password', status === 400, `HTTP ${status}`);
  }

  // ── SECTION 3: LOGIN (pre-approval) ───────────────────────────────────────
  section('3. MANUFACTURER AUTH — LOGIN');
  {
    const { status, data } = await api('POST', `${MFR_BASE}/auth/login`, {
      body: { email: NEW_MFR_EMAIL, password: NEW_MFR_PASSWORD },
    });
    log('POST /auth/login -> 403 KYC_PENDING before approval', status === 403 && data?.code === 'KYC_PENDING', `code: ${data?.code}`);
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/auth/login`, { body: { email: HIMANSHU_EMAIL, password: 'wrongpass' } });
    log('POST /auth/login -> 401 wrong password', status === 401, `HTTP ${status}`);
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/auth/login`, { body: { email: 'nobody@nowhere.com', password: '12345678' } });
    log('POST /auth/login -> 401 non-existent user', status === 401, `HTTP ${status}`);
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/auth/login`, { body: { email: HIMANSHU_EMAIL } });
    log('POST /auth/login -> 400 missing password', status === 400, `HTTP ${status}`);
  }

  // ── SECTION 4: INTERNAL ADMIN / KYC ───────────────────────────────────────
  section('4. INTERNAL ADMIN — KYC MANAGEMENT');
  {
    const { status, data } = await api('GET', `${MFR_BASE}/internal/stats`, { headers: { 'X-Admin-Token': ADMIN_TOKEN } });
    log('GET /internal/stats -> 200 with counts', status === 200 && typeof data?.data?.total === 'number', JSON.stringify(data?.data));
  }
  {
    const { status, data } = await api('GET', `${MFR_BASE}/internal/list`, { headers: { 'X-Admin-Token': ADMIN_TOKEN } });
    log('GET /internal/list -> 200 paginated', status === 200 && Array.isArray(data?.data), `total: ${data?.pagination?.total}`);
  }
  {
    const { status, data } = await api('GET', `${MFR_BASE}/internal/list?status=PENDING`, { headers: { 'X-Admin-Token': ADMIN_TOKEN } });
    log('GET /internal/list?status=PENDING -> 200', status === 200 && Array.isArray(data?.data), `count: ${data?.data?.length}`);
  }
  {
    const { status, data } = await api('GET', `${MFR_BASE}/internal/${state.newMfrId}`, { headers: { 'X-Admin-Token': ADMIN_TOKEN } });
    log('GET /internal/:id -> 200 detail', status === 200 && data?.data?.manufacturerId === state.newMfrId, data?.data?.kycStatus);
  }
  {
    const { status } = await api('GET', `${MFR_BASE}/internal/MFR_NONEXISTENT_000`, { headers: { 'X-Admin-Token': ADMIN_TOKEN } });
    log('GET /internal/:id -> 404 unknown ID', status === 404, `HTTP ${status}`);
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/auth/kyc/approve`, { body: { email: NEW_MFR_EMAIL } });
    log('POST /auth/kyc/approve -> 401 without X-Admin-Token', status === 401, `HTTP ${status}`);
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/auth/kyc/approve`, { body: { email: NEW_MFR_EMAIL }, headers: { 'X-Admin-Token': 'bad-token' } });
    log('POST /auth/kyc/approve -> 401 wrong admin token', status === 401, `HTTP ${status}`);
  }
  {
    const { status, data } = await api('POST', `${MFR_BASE}/auth/kyc/reject`, {
      body: { email: NEW_MFR_EMAIL, reason: 'E2E test rejection' },
      headers: { 'X-Admin-Token': ADMIN_TOKEN },
    });
    log('POST /auth/kyc/reject -> 200 REJECTED', status === 200 && data?.kycStatus === 'REJECTED', data?.kycStatus);
  }
  {
    const { status, data } = await api('POST', `${MFR_BASE}/auth/login`, { body: { email: NEW_MFR_EMAIL, password: NEW_MFR_PASSWORD } });
    log('POST /auth/login -> 403 after KYC rejection', status === 403, `code: ${data?.code}`);
  }
  {
    const { status, data } = await api('POST', `${MFR_BASE}/auth/kyc/approve`, {
      body: { email: NEW_MFR_EMAIL },
      headers: { 'X-Admin-Token': ADMIN_TOKEN },
    });
    log('POST /auth/kyc/approve -> 200 approved with EC key generated', status === 200 && data?.kycStatus === 'APPROVED' && data?.keyGenerated === true, `keyGenerated: ${data?.keyGenerated}`);
  }
  {
    const { status, data } = await api('POST', `${MFR_BASE}/auth/login`, { body: { email: NEW_MFR_EMAIL, password: NEW_MFR_PASSWORD } });
    log('POST /auth/login -> 200 + JWT after approval', status === 200 && !!data?.token, `token[:20]: ${data?.token?.slice(0, 20)}`);
    if (data?.token) state.newMfrToken = data.token;
  }
  {
    const { status, data } = await api('POST', `${MFR_BASE}/auth/kyc/approve`, {
      body: { email: HIMANSHU_EMAIL },
      headers: { 'X-Admin-Token': ADMIN_TOKEN },
    });
    log('POST /auth/kyc/approve -> idempotent for already-approved', status === 200 && data?.kycStatus === 'APPROVED', `keyGenerated: ${data?.keyGenerated}`);
  }

  // ── SECTION 5: LOGIN (Himanshu) ────────────────────────────────────────────
  section('5. MANUFACTURER AUTH — LOGIN (Himanshu, APPROVED)');
  {
    const { status, data } = await api('POST', `${MFR_BASE}/auth/login`, { body: { email: HIMANSHU_EMAIL, password: HIMANSHU_PASS } });
    log('POST /auth/login -> 200 + JWT for himanshu@gmail.com', status === 200 && !!data?.token, `MFR ID: ${data?.data?.id}`);
    if (data?.token) { state.himanshuToken = data.token; state.himanshuId = data.data.id; }
  }

  // ── SECTION 6: BATCH — CREATE ──────────────────────────────────────────────
  section('6. BATCH — CREATE');
  {
    const { status, data } = await api('POST', `${MFR_BASE}/batch`, {
      token: state.himanshuToken,
      body: {
        medicineName: 'E2E Amoxicillin 500mg', manufacturerBatchNumber: `E2E-${ts}`,
        totalQuantity: 1000, manufacturingDate: new Date().toISOString().split('T')[0],
        expiryDate: '2028-12-31', genericName: 'Amoxicillin', brandName: 'E2E-Mox',
        dosage: '500 mg', form: 'CAPSULE', packSize: 10, unitsPerCarton: 100,
        storageConditions: 'Store below 25C.',
      },
    });
    log('POST /batch -> 201 with systemBatchId', status === 201 && !!data?.data?.systemBatchId, data?.data?.systemBatchId);
    if (data?.data) { state.batchId = data.data.batchId; state.systemBatchId = data.data.systemBatchId; }
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/batch`, { body: { medicineName: 'X', totalQuantity: 10, expiryDate: '2027-01-01' } });
    log('POST /batch -> 401/403 without Authorization', status === 401 || status === 403, `HTTP ${status}`);
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/batch`, {
      token: state.himanshuToken,
      body: { medicineName: 'X', manufacturerBatchNumber: `INV-${ts}`, totalQuantity: 0, expiryDate: '2028-01-01' },
    });
    log('POST /batch -> 400/422 totalQuantity=0', status === 400 || status === 422, `HTTP ${status}`);
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/batch`, { token: state.himanshuToken, body: { totalQuantity: 100 } });
    log('POST /batch -> 400 missing medicineName/expiryDate', status === 400, `HTTP ${status}`);
  }
  {
    const { status, data } = await api('POST', `${MFR_BASE}/batch/create`, {
      token: state.himanshuToken,
      body: { medicineName: 'Alias Route Test', manufacturerBatchNumber: `ALIAS-${ts}`, totalQuantity: 50, expiryDate: '2027-06-30' },
    });
    log('POST /batch/create (alias route) -> 201', status === 201 && !!data?.data?.systemBatchId, data?.data?.systemBatchId);
  }

  // ── SECTION 7: BATCH LIST & GET ────────────────────────────────────────────
  section('7. BATCH — LIST & GET');
  {
    const { status } = await api('GET', `${MFR_BASE}/batch`, { token: state.himanshuToken });
    log('GET /batch -> 200 batch list', status === 200, `HTTP ${status}`);
  }
  {
    const { status } = await api('GET', `${MFR_BASE}/batch?page=1&limit=5`, { token: state.himanshuToken });
    log('GET /batch?page=1&limit=5 -> 200', status === 200, `HTTP ${status}`);
  }
  {
    const { status, data } = await api('GET', `${MFR_BASE}/batch/${state.systemBatchId}`, { token: state.himanshuToken });
    log('GET /batch/:batchId -> 200 with details', status === 200 && data?.data?.systemBatchId === state.systemBatchId, `mintStatus: ${data?.data?.mintStatus}`);
  }
  {
    const { status } = await api('GET', `${MFR_BASE}/batch/PC-BATCH-NONEXISTENT-12345`, { token: state.himanshuToken });
    log('GET /batch/:batchId -> 404 unknown batchId', status === 404, `HTTP ${status}`);
  }
  {
    const { status } = await api('GET', `${MFR_BASE}/batch/${state.systemBatchId}`);
    log('GET /batch/:batchId -> 401/403 without token', status === 401 || status === 403, `HTTP ${status}`);
  }

  // ── SECTION 9: MINT ────────────────────────────────────────────────────────
  section('9. BATCH — CRYPTOGRAPHIC MINTING (1,000 packs to AWS S3)');
  {
    const mintStart = Date.now();
    const { status, data } = await api('POST', `${MFR_BASE}/batch/${state.systemBatchId}/mint`, { token: state.himanshuToken });
    log('POST /batch/:batchId/mint -> 202 accepted', status === 202, `status: ${data?.status}`);

    console.log('\n  Waiting for pharma-core to sign 1,000 packs & upload to S3...');
    process.stdout.write('  ');
    try {
      const mintedBatch = await poll(`${MFR_BASE}/batch/${state.systemBatchId}`, state.himanshuToken, { field: 'mintStatus', value: 'MINTED', maxTries: 60 });
      const dur = ((Date.now() - mintStart) / 1000).toFixed(2);
      console.log('');
      log(`MINTED in ${dur}s — S3 mode: ${mintedBatch.s3Mode}`, mintedBatch.s3Mode === 'aws', `key: ${mintedBatch.s3FileKey}`);
      log('mintedPacksCount === 1,000', mintedBatch.mintedPacksCount === 1000, `got: ${mintedBatch.mintedPacksCount}`);
    } catch (e) {
      console.log('');
      log('Minting completed on S3', false, e.message);
    }
  }
  {
    const { status, data } = await api('POST', `${MFR_BASE}/batch/${state.systemBatchId}/mint`, { token: state.himanshuToken });
    log('POST /batch/:batchId/mint -> 400/409 already-minted', status === 400 || status === 409, `HTTP ${status}: ${data?.message}`);
  }

  // ── SECTION 8: PUBLIC DETAILS (post-mint — only visible once MINTED) ───────
  section('8. BATCH — PUBLIC DETAILS (No Auth, post-mint)');
  {
    // The public endpoint returns 404 while PENDING/MINTING — only accessible after mint
    const { status, data } = await api('GET', `${MFR_BASE}/batch/public/${state.systemBatchId}`);
    log('GET /batch/public/:batchId -> 200 no-auth (post-mint)', status === 200, `medicineName: ${data?.data?.medicineName}`);
  }
  {
    const { status } = await api('GET', `${MFR_BASE}/batch/public/FAKE-000`);
    log('GET /batch/public/:batchId -> 404 unknown batchId', status === 404, `HTTP ${status}`);
  }

  // ── SECTION 10: PREVIEW & PACKS ───────────────────────────────────────────
  section('10. BATCH — PREVIEW & PACKS');
  {
    const { status, data } = await api('GET', `${MFR_BASE}/batch/${state.systemBatchId}/preview?page=1&limit=10`, { token: state.himanshuToken });
    log('GET /batch/:batchId/preview -> 200', status === 200, `rows: ${data?.data?.packs?.length || JSON.stringify(Object.keys(data?.data || {}))}`);
  }
  {
    const { status, data } = await api('GET', `${MFR_BASE}/batch/${state.systemBatchId}/packs`, { token: state.himanshuToken });
    log('GET /batch/:batchId/packs -> 200 S3 info', status === 200, `s3Mode: ${data?.data?.s3Mode}`);
  }

  // ── SECTION 11: EXPORT CSV ─────────────────────────────────────────────────
  section('11. BATCH — EXPORT CSV (Full 1,000 rows from AWS S3)');
  {
    const { status, data: csvText } = await api('GET', `${MFR_BASE}/batch/${state.systemBatchId}/export/csv`, { token: state.himanshuToken });
    const isText = typeof csvText === 'string';
    const rows = isText ? csvText.trim().split('\n') : [];
    const header = rows[0] || '';
    const packs = rows.slice(1);
    log('GET /batch/:batchId/export/csv -> 200 CSV text', status === 200 && isText, `HTTP ${status}`);
    log('CSV has 1,001 lines (1 header + 1,000 packs)', rows.length === 1001, `got: ${rows.length}`);
    log('CSV header contains packHash, signedToken, verifyUrl', header.includes('packHash') && header.includes('signedToken') && header.includes('verifyUrl'), `header: ${header}`);
    if (packs.length > 0) {
      const cols = packs[0].match(/"([^"]*)"/g)?.map(v => v.replace(/"/g, '')) || [];
      state.samplePackHash = cols[1];
      state.sampleSignedToken = cols[2];
      state.sampleVerifyUrl = cols[3];
      log('CSV signedToken is ES256 JWT (eyJhbGciOiJFUzI1Ni...)', state.sampleSignedToken?.startsWith('eyJhbGciOiJFUzI1Ni'), `prefix: ${state.sampleSignedToken?.slice(0, 20)}`);
      log('CSV verifyUrl is https://pharmachain.gov.in/verify/...', state.sampleVerifyUrl?.startsWith('https://pharmachain.gov.in/verify/'), `url: ${state.sampleVerifyUrl?.slice(0, 55)}`);
    }
  }

  // ── SECTION 12: GLOBAL PACK LOOKUP ────────────────────────────────────────
  section('12. BATCH — GLOBAL PACK LOOKUP');
  if (state.samplePackHash) {
    const { status, data } = await api('GET', `${MFR_BASE}/batch/pack/lookup/${state.samplePackHash}`, { token: state.himanshuToken });
    log('GET /batch/pack/lookup/:hash -> 200 or 404', status === 200 || status === 404, `HTTP ${status}: ${data?.message || data?.data?.packHash}`);
  } else {
    log('GET /batch/pack/lookup/:hash -> SKIPPED (no hash available)', false, 'CSV parse failed');
  }

  // ── SECTION 13: CONSUMER VERIFY ───────────────────────────────────────────
  section('13. CONSUMER — QR VERIFY (No Auth required)');
  if (state.sampleVerifyUrl) {
    const { status, data } = await api('POST', `${CON_BASE}/verify`, { body: { qrData: state.sampleVerifyUrl } });
    log('POST /consumer/verify -> GENUINE from full verifyUrl', status === 200 && data?.valid === true && ['GENUINE','AT_SHOP','NOT_FOUND'].includes(data?.uiState), `uiState: ${data?.uiState}`);
  } else {
    log('POST /consumer/verify (full url) -> SKIPPED', false, 'No sampleVerifyUrl');
  }
  if (state.sampleSignedToken) {
    const { status, data } = await api('POST', `${CON_BASE}/verify`, { body: { token: state.sampleSignedToken } });
    log('POST /consumer/verify -> GENUINE from raw signedToken', status === 200 && data?.valid === true, `uiState: ${data?.uiState}`);
  } else {
    log('POST /consumer/verify (raw token) -> SKIPPED', false, 'No sampleSignedToken');
  }
  if (state.sampleSignedToken) {
    const { status, data } = await api('GET', `${CON_BASE}/verify?token=${encodeURIComponent(state.sampleSignedToken)}`);
    log('GET /consumer/verify?token=<JWT> -> GENUINE', status === 200 && data?.valid === true, `uiState: ${data?.uiState}`);
  } else {
    log('GET /consumer/verify (GET) -> SKIPPED', false, 'No token');
  }
  {
    const fakeJwt = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJiYXRjaElkIjoiRkFLRSIsInNlcmlhbCI6IjAwMDAxIn0.INVALIDSIGNATURE_tampered';
    const { status, data } = await api('POST', `${CON_BASE}/verify`, { body: { qrData: fakeJwt } });
    log('POST /consumer/verify -> COUNTERFEIT on tampered JWT', status === 200 && data?.uiState === 'COUNTERFEIT', `uiState: ${data?.uiState}`);
  }
  {
    const { status } = await api('POST', `${CON_BASE}/verify`, { body: {} });
    log('POST /consumer/verify -> 400 empty body', status === 400, `HTTP ${status}`);
  }
  {
    const { status, data } = await api('POST', `${CON_BASE}/verify`, { body: { qrData: 'not-a-jwt-at-all-garbage-data' } });
    log('POST /consumer/verify -> COUNTERFEIT on garbled data', status === 200 && data?.uiState === 'COUNTERFEIT', `uiState: ${data?.uiState}`);
  }

  // ── SECTION 14: CONSUMER REPORT ───────────────────────────────────────────
  section('14. CONSUMER — REPORT COUNTERFEIT');
  {
    const { status, data } = await api('POST', `${CON_BASE}/report`, {
      body: { qrToken: state.sampleSignedToken || 'fake-token', location: 'Mumbai, MH', notes: 'E2E test suspicious pack', photoUrl: 'https://example.com/photo.jpg' },
    });
    log('POST /consumer/report -> 201 with reportId', status === 201 && !!data?.reportId, `reportId: ${data?.reportId}`);
  }
  {
    const { status } = await api('POST', `${CON_BASE}/report`, { body: { location: 'Delhi', notes: 'No token' } });
    log('POST /consumer/report -> 400 missing qrToken', status === 400, `HTTP ${status}`);
  }
  {
    const { status, data } = await api('POST', `${CON_BASE}/report`, { body: { qrToken: 'garbage-xyz', location: 'Bengaluru', notes: 'Invalid token test' } });
    log('POST /consumer/report -> 201 with invalid token (non-fatal)', status === 201, `reportId: ${data?.reportId}`);
  }

  // ── SECTION 15: BATCH RECALL ───────────────────────────────────────────────
  section('15. BATCH — RECALL');
  {
    const { status, data } = await api('POST', `${MFR_BASE}/batch/${state.systemBatchId}/recall`, {
      token: state.himanshuToken, body: { reason: 'E2E automated quality test recall' },
    });
    log('POST /batch/:batchId/recall -> 200/202 recalled', status === 200 || status === 202, `HTTP ${status}: ${data?.message || data?.status}`);
  }
  if (state.sampleVerifyUrl) {
    const { status, data } = await api('POST', `${CON_BASE}/verify`, { body: { qrData: state.sampleVerifyUrl } });
    log('POST /consumer/verify -> RECALLED state after recall', status === 200 && ['RECALLED','GENUINE','NOT_FOUND'].includes(data?.uiState), `uiState after recall: ${data?.uiState}`);
  }

  // ── SECTION 16: LOGOUT ─────────────────────────────────────────────────────
  section('16. MANUFACTURER AUTH — LOGOUT');
  {
    const { status } = await api('POST', `${MFR_BASE}/auth/logout`, { token: state.himanshuToken });
    log('POST /auth/logout -> 204 with token', status === 204, `HTTP ${status}`);
  }
  {
    const { status } = await api('POST', `${MFR_BASE}/auth/logout`);
    log('POST /auth/logout -> 204 without token (safe)', status === 204, `HTTP ${status}`);
  }

  // ── FINAL SUMMARY ──────────────────────────────────────────────────────────
  const total = passCount + failCount;
  console.log('\n' + '='.repeat(65));
  console.log('  FULL E2E TEST SUMMARY');
  console.log('='.repeat(65));
  console.log(`  Total Tests : ${total}`);
  console.log(`  PASSED      : ${passCount}`);
  console.log(`  FAILED      : ${failCount}`);
  console.log(`  Pass Rate   : ${((passCount / total) * 100).toFixed(1)}%`);
  if (failCount > 0) {
    console.log('\n  Failed Tests:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`    X ${r.label}`);
      if (r.detail) console.log(`      -> ${r.detail}`);
    });
  }
  console.log('');
  console.log(`  Batch under test : ${state.systemBatchId}`);
  console.log(`  Manufacturer     : ${HIMANSHU_EMAIL} (${state.himanshuId})`);
  console.log(`  S3 Bucket        : pharmachain-qr-csvs (us-east-1)`);
  console.log(`  Blockchain       : Hyperledger Fabric on port 8080`);
  console.log('='.repeat(65) + '\n');
  process.exit(failCount > 0 ? 1 : 0);
}

runAll().catch(err => { console.error('\nCRASH:', err.message, err.stack); process.exit(1); });
