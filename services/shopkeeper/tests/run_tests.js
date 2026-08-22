import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../app/app.js';

let server;
let baseUrl;

test.before((t, done) => {
    process.env.JWT_SECRET = 'test-jwt-secret-key-12345';
    process.env.NODE_ENV = 'test';
    server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[TEST SERVER] Running on port ${port}`);
        done();
    });
});

test.after((t, done) => {
    if (server) server.close(done);
});

// Helper for HTTP requests
const request = (path, method = 'GET', body = null, headers = {}) => {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const reqHeaders = { 'Content-Type': 'application/json', ...headers };
        const req = http.request(url, { method, headers: reqHeaders }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, headers: res.headers, body: parsed });
                } catch {
                    resolve({ status: res.statusCode, headers: res.headers, raw: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
};

test('GET /healthz — returns 200 OK', async () => {
    const res = await request('/healthz');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'shopkeeper-service');
});

test('GET /readyz — returns 200 OK', async () => {
    const res = await request('/readyz');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
});

test('POST /api/shopkeeper/register — validation missing fields returns 400', async () => {
    const res = await request('/api/shopkeeper/register', 'POST', { shopName: 'Incomplete' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.match(res.body.message, /Missing required fields/);
});

test('POST /api/shopkeeper/login — missing fields returns 400', async () => {
    const res = await request('/api/shopkeeper/login', 'POST', {});
    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
});

test('POST /api/v1/scan/customer — missing qrData returns 400', async () => {
    const res = await request('/api/v1/scan/customer', 'POST', {});
    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
});

test('POST /api/v1/scan/customer — invalid qr token returns Counterfeit', async () => {
    const res = await request('/api/v1/scan/customer', 'POST', { qrData: 'invalid-qr-token' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.scanStatus, 'Counterfeit');
    assert.equal(res.body.data.trustScore, 0);
});

test('POST /api/medicine/scan — unauthenticated returns 401', async () => {
    const res = await request('/api/medicine/scan', 'POST', { qrData: 'test' });
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
});

test('GET /api/shopkeeper/stats — unauthenticated returns 401', async () => {
    const res = await request('/api/shopkeeper/stats');
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
});

test('GET /api/shopkeeper/inventory — unauthenticated returns 401', async () => {
    const res = await request('/api/shopkeeper/inventory');
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
});

test('POST /api/transactions/receive — unauthenticated returns 401', async () => {
    const res = await request('/api/transactions/receive', 'POST', { packId: 'PACK-1' });
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
});

test('POST /api/transactions/sell — unauthenticated returns 401', async () => {
    const res = await request('/api/transactions/sell', 'POST', { packId: 'PACK-1' });
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
});

test('POST /api/transactions/return — unauthenticated returns 401', async () => {
    const res = await request('/api/transactions/return', 'POST', { packId: 'PACK-1', reason: 'EXPIRED' });
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
});

test('GET /unknown-route — 404 handler returns error status', async () => {
    const res = await request('/unknown-route');
    assert.equal(res.status, 404);
    assert.equal(res.body.status, 'error');
});
