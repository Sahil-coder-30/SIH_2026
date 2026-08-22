import request from 'supertest';
import app from '../app/app.js';
import Shopkeeper from '../models/shopkeeper.model.js';
import { connectTestDb, closeTestDb, clearTestDb } from './setup.js';

process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.NODE_ENV = 'test';

beforeAll(async () => {
    await connectTestDb();
});

afterAll(async () => {
    await closeTestDb();
});

afterEach(async () => {
    await clearTestDb();
});

const sampleShopkeeper = {
    shopName: 'Apollo Pharmacy',
    shopPhone: '9876543210',
    shopEmail: 'apollo@pharmacy.com',
    address: '123 Main St',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    ownerName: 'Rahul Sharma',
    ownerPhone: '9876543210',
    ownerEmail: 'rahul@apollo.com',
    drugLicenseNumber: 'DL-12345-MH',
    licenseType: 'retail',
    issuingAuthority: 'FDA Maharashtra',
    licenseIssueDate: '2024-01-01',
    licenseExpiryDate: '2029-01-01',
    password: 'Password123!',
};

const setupVerifiedShopkeeper = async () => {
    await request(app).post('/api/shopkeeper/register').send(sampleShopkeeper);
    await Shopkeeper.updateOne({ 'authentication.email': 'rahul@apollo.com' }, { $set: { verificationStatus: 'verified' } });
    const loginRes = await request(app)
        .post('/api/shopkeeper/login')
        .send({ identifier: 'rahul@apollo.com', password: 'Password123!' });
    return loginRes.body.accessToken;
};

describe('Supply Chain Transactions Endpoints', () => {

    describe('POST /api/transactions/receive', () => {
        it('should process stock receipt and return 201', async () => {
            const token = await setupVerifiedShopkeeper();

            const res = await request(app)
                .post('/api/transactions/receive')
                .set('Authorization', `Bearer ${token}`)
                .send({ packId: 'PACK-PARACETAMOL-001' });

            expect(res.status).toBe(201);
            expect(res.body.status).toBe('success');
            expect(res.body.data.status).toBe('RECEIVED');
            expect(res.body.data.transactionId).toBeDefined();
        });

        it('should return idempotent cached result when same Idempotency-Key is provided', async () => {
            const token = await setupVerifiedShopkeeper();
            const idempotencyKey = 'IDEM-KEY-REC-1001';

            const res1 = await request(app)
                .post('/api/transactions/receive')
                .set('Authorization', `Bearer ${token}`)
                .set('Idempotency-Key', idempotencyKey)
                .send({ packId: 'PACK-PARACETAMOL-001' });

            const res2 = await request(app)
                .post('/api/transactions/receive')
                .set('Authorization', `Bearer ${token}`)
                .set('Idempotency-Key', idempotencyKey)
                .send({ packId: 'PACK-PARACETAMOL-001' });

            expect(res1.status).toBe(201);
            expect(res2.status).toBe(201);
            expect(res1.body.data.transactionId).toBe(res2.body.data.transactionId);
            expect(res2.body.message).toContain('[Idempotent]');
        });

        it('should return 403 for unverified shopkeeper', async () => {
            await request(app).post('/api/shopkeeper/register').send(sampleShopkeeper);
            const loginRes = await request(app)
                .post('/api/shopkeeper/login')
                .send({ identifier: 'rahul@apollo.com', password: 'Password123!' });

            const token = loginRes.body.accessToken;

            const res = await request(app)
                .post('/api/transactions/receive')
                .set('Authorization', `Bearer ${token}`)
                .send({ packId: 'PACK-001' });

            expect(res.status).toBe(403);
            expect(res.body.status).toBe('error');
            expect(res.body.code).toBe('ACCOUNT_PENDING');
        });
    });

    describe('POST /api/transactions/sell', () => {
        it('should register medicine sale', async () => {
            const token = await setupVerifiedShopkeeper();

            const res = await request(app)
                .post('/api/transactions/sell')
                .set('Authorization', `Bearer ${token}`)
                .send({ packId: 'PACK-PARACETAMOL-001', customerPhone: '9998887770' });

            expect(res.status).toBe(201);
            expect(res.body.status).toBe('success');
            expect(res.body.data.status).toBe('SOLD');
        });
    });

    describe('POST /api/transactions/return', () => {
        it('should register medicine return with valid reason', async () => {
            const token = await setupVerifiedShopkeeper();

            const res = await request(app)
                .post('/api/transactions/return')
                .set('Authorization', `Bearer ${token}`)
                .send({ packId: 'PACK-PARACETAMOL-001', reason: 'CUSTOMER_RETURN' });

            expect(res.status).toBe(201);
            expect(res.body.status).toBe('success');
            expect(res.body.data.status).toBe('RETURNED');
        });

        it('should return 422 for invalid return reason', async () => {
            const token = await setupVerifiedShopkeeper();

            const res = await request(app)
                .post('/api/transactions/return')
                .set('Authorization', `Bearer ${token}`)
                .send({ packId: 'PACK-PARACETAMOL-001', reason: 'DONT_LIKE_PACKAGING' });

            expect(res.status).toBe(422);
            expect(res.body.status).toBe('error');
        });
    });
});
