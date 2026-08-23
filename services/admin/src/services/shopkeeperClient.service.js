import axios from 'axios';

const getClient = () => {
    const baseURL     = process.env.SHOPKEEPER_SERVICE_URL || 'http://localhost:3002';
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

    return axios.create({
        baseURL,
        headers: {
            'X-Admin-Token': ADMIN_TOKEN,
            'Content-Type':  'application/json',
        },
        timeout: 15_000,
    });
};

export const fetchShopkeepers = async (params = {}) => {
    const client = getClient();
    const res = await client.get('/api/shopkeeper/internal/list', { params });
    return res.data;
};

export const fetchShopkeeperById = async (id) => {
    const client = getClient();
    const res = await client.get(`/api/shopkeeper/internal/${encodeURIComponent(id)}`);
    return res.data;
};

export const approveShopkeeperKYC = async (shopkeeperId) => {
    const client = getClient();
    const res = await client.post('/api/shopkeeper/auth/kyc/approve', { shopkeeperId });
    return res.data;
};

export const rejectShopkeeperKYC = async (shopkeeperId, reason) => {
    const client = getClient();
    const res = await client.post('/api/shopkeeper/auth/kyc/reject', { shopkeeperId, reason });
    return res.data;
};

export const suspendShopkeeper = async (shopkeeperId, reason) => {
    const client = getClient();
    const res = await client.post('/api/shopkeeper/auth/kyc/suspend', { shopkeeperId, reason });
    return res.data;
};

export const fetchShopkeeperStats = async () => {
    const client = getClient();
    const res = await client.get('/api/shopkeeper/internal/stats');
    return res.data;
};
