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

describe('Shopkeeper Auth Endpoints', () => {

    describe('POST /api/shopkeeper/register', () => {
        it('should register a new shopkeeper successfully with pending status', async () => {
            const res = await request(app)
                .post('/api/shopkeeper/register')
                .send(sampleShopkeeper);

            expect(res.status).toBe(201);
            expect(res.body.status).toBe('success');
            expect(res.body.data.shopName).toBe('Apollo Pharmacy');
            expect(res.body.data.verificationStatus).toBe('pending');
            expect(res.body.data.role).toBe('SHOPKEEPER');
        });

        it('should return 400 for missing required fields', async () => {
            const res = await request(app)
                .post('/api/shopkeeper/register')
                .send({ shopName: 'Incomplete' });

            expect(res.status).toBe(400);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toContain('Missing required fields');
        });

        it('should return 409 for duplicate email/license', async () => {
            await request(app).post('/api/shopkeeper/register').send(sampleShopkeeper);

            const res = await request(app)
                .post('/api/shopkeeper/register')
                .send(sampleShopkeeper);

            expect(res.status).toBe(409);
            expect(res.body.status).toBe('error');
        });
    });

    describe('POST /api/shopkeeper/login', () => {
        beforeEach(async () => {
            await request(app).post('/api/shopkeeper/register').send(sampleShopkeeper);
        });

        it('should authenticate user and return accessToken & refreshToken', async () => {
            const res = await request(app)
                .post('/api/shopkeeper/login')
                .send({ identifier: 'rahul@apollo.com', password: 'Password123!' });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.accessToken).toBeDefined();
            expect(res.body.refreshToken).toBeDefined();
            expect(res.body.data.shopName).toBe('Apollo Pharmacy');
        });

        it('should return 401 for incorrect password', async () => {
            const res = await request(app)
                .post('/api/shopkeeper/login')
                .send({ identifier: 'rahul@apollo.com', password: 'WrongPassword!' });

            expect(res.status).toBe(401);
            expect(res.body.status).toBe('error');
        });
    });

    describe('GET /api/shopkeeper/verification-status', () => {
        it('should return verification status for logged in shopkeeper', async () => {
            await request(app).post('/api/shopkeeper/register').send(sampleShopkeeper);
            const loginRes = await request(app)
                .post('/api/shopkeeper/login')
                .send({ identifier: 'rahul@apollo.com', password: 'Password123!' });

            const token = loginRes.body.accessToken;

            const res = await request(app)
                .get('/api/shopkeeper/verification-status')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.verificationStatus).toBe('pending');
        });

        it('should return 401 without auth token', async () => {
            const res = await request(app).get('/api/shopkeeper/verification-status');
            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/shopkeeper/refresh', () => {
        it('should issue new access and refresh tokens', async () => {
            await request(app).post('/api/shopkeeper/register').send(sampleShopkeeper);
            const loginRes = await request(app)
                .post('/api/shopkeeper/login')
                .send({ identifier: 'rahul@apollo.com', password: 'Password123!' });

            const refreshToken = loginRes.body.refreshToken;

            const res = await request(app)
                .post('/api/shopkeeper/refresh')
                .send({ refreshToken });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.accessToken).toBeDefined();
            expect(res.body.refreshToken).toBeDefined();
        });
    });

    describe('POST /api/shopkeeper/forgot-password & reset-password', () => {
        it('should generate reset token and allow password update', async () => {
            await request(app).post('/api/shopkeeper/register').send(sampleShopkeeper);

            const forgotRes = await request(app)
                .post('/api/shopkeeper/forgot-password')
                .send({ identifier: 'rahul@apollo.com' });

            expect(forgotRes.status).toBe(200);
            const resetToken = forgotRes.body._devResetToken;
            expect(resetToken).toBeDefined();

            const resetRes = await request(app)
                .post('/api/shopkeeper/reset-password')
                .send({ token: resetToken, password: 'NewPassword123!' });

            expect(resetRes.status).toBe(200);
            expect(resetRes.body.status).toBe('success');

            // Login with new password
            const loginRes = await request(app)
                .post('/api/shopkeeper/login')
                .send({ identifier: 'rahul@apollo.com', password: 'NewPassword123!' });

            expect(loginRes.status).toBe(200);
        });
    });

    describe('POST /api/shopkeeper/logout', () => {
        it('should invalidate refresh token on logout', async () => {
            await request(app).post('/api/shopkeeper/register').send(sampleShopkeeper);
            const loginRes = await request(app)
                .post('/api/shopkeeper/login')
                .send({ identifier: 'rahul@apollo.com', password: 'Password123!' });

            const token = loginRes.body.accessToken;

            const res = await request(app)
                .post('/api/shopkeeper/logout')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
        });
    });
});
