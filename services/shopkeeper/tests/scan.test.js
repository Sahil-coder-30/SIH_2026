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

describe('Medicine Scan Endpoints', () => {

    describe('POST /api/v1/scan/customer (Public Consumer Scan)', () => {
        it('should return 400 when qrData is missing', async () => {
            const res = await request(app)
                .post('/api/v1/scan/customer')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.status).toBe('error');
        });

        it('should return Counterfeit status for invalid/unverifiable token', async () => {
            const res = await request(app)
                .post('/api/v1/scan/customer')
                .send({ qrData: 'invalid-qr-token-string' });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.scanStatus).toBe('Counterfeit');
            expect(res.body.data.trustScore).toBe(0);
        });
    });

    describe('POST /api/medicine/scan (Authenticated Chemist Scan)', () => {
        it('should return 401 without auth token', async () => {
            const res = await request(app)
                .post('/api/medicine/scan')
                .send({ qrData: 'some-qr-token' });

            expect(res.status).toBe(401);
            expect(res.body.status).toBe('error');
        });

        it('should return scan result for verified shopkeeper', async () => {
            const token = await setupVerifiedShopkeeper();

            const res = await request(app)
                .post('/api/medicine/scan')
                .set('Authorization', `Bearer ${token}`)
                .send({ qrData: 'some-qr-token' });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.scanStatus).toBeDefined();
        });
    });
});
