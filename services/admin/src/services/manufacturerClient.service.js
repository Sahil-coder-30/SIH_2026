import axios from 'axios';

const getClient = () => {
    const baseURL     = process.env.MANUFACTURER_SERVICE_URL || 'http://localhost:3001';
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '960e412b2690c03cb83337b91010016a572343f23123feb3';


    return axios.create({
        baseURL,
        headers: {
            'X-Admin-Token': ADMIN_TOKEN,
            'Content-Type':  'application/json',
        },
        timeout: 15_000,
    });
};

export const fetchManufacturers = async (params = {}) => {
    const client = getClient();
    const res = await client.get('/api/manufacturer/internal/list', { params });
    return res.data;
};

export const fetchManufacturerById = async (id) => {
    const client = getClient();
    const res = await client.get(`/api/manufacturer/internal/${encodeURIComponent(id)}`);
    return res.data;
};

export const approveManufacturerKYC = async (manufacturerId) => {
    const client = getClient();
    const res = await client.post('/api/manufacturer/auth/kyc/approve', { manufacturerId });
    return res.data;
};

export const rejectManufacturerKYC = async (manufacturerId, reason) => {
    const client = getClient();
    const res = await client.post('/api/manufacturer/auth/kyc/reject', { manufacturerId, reason });
    return res.data;
};

export const fetchManufacturerStats = async () => {
    const client = getClient();
    const res = await client.get('/api/manufacturer/internal/stats');
    return res.data;
};
