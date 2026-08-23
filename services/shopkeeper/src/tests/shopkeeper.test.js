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

describe('Shopkeeper Dashboard & Profile Endpoints', () => {

    describe('GET /api/shopkeeper/stats', () => {
        it('should return dashboard scan and sales statistics', async () => {
            const token = await setupVerifiedShopkeeper();

            const res = await request(app)
                .get('/api/shopkeeper/stats')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.totalScans).toBeDefined();
            expect(res.body.data.todaySalesCount).toBeDefined();
        });
    });

    describe('GET /api/shopkeeper/inventory', () => {
        it('should return shop inventory list', async () => {
            const token = await setupVerifiedShopkeeper();

            const res = await request(app)
                .get('/api/shopkeeper/inventory')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(Array.isArray(res.body.data.inventory)).toBe(true);
        });
    });

    describe('GET & PATCH /api/shopkeeper/profile', () => {
        it('should return shopkeeper profile data', async () => {
            const token = await setupVerifiedShopkeeper();

            const res = await request(app)
                .get('/api/shopkeeper/profile')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.shopkeeper.shopName).toBe('Apollo Pharmacy');
        });

        it('should update updatable profile fields', async () => {
            const token = await setupVerifiedShopkeeper();

            const res = await request(app)
                .patch('/api/shopkeeper/profile')
                .set('Authorization', `Bearer ${token}`)
                .send({ shopName: 'Apollo MedPlus Pharmacy', city: 'Pune' });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.shopkeeper.shopName).toBe('Apollo MedPlus Pharmacy');
            expect(res.body.data.shopkeeper.city).toBe('Pune');
        });
    });
});
