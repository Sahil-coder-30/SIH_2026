import axios from 'axios';

const getClient = () => {
    const baseURL       = process.env.PHARMA_CORE_URL || 'http://localhost:4000';
    const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

    return axios.create({
        baseURL,
        headers: {
            'Authorization':  `Bearer ${SERVICE_TOKEN}`,
            'X-Service-Token': SERVICE_TOKEN,
            'Content-Type':   'application/json',
        },
        timeout: 10_000,
    });
};

export const fetchKeyStats = async () => {
    try {
        const client = getClient();
        const res = await client.get('/core/keys/stats');
        return res.data;
    } catch (err) {
        console.error('[admin-service PharmaCoreClient] fetchKeyStats fallback:', err.message);
        return { status: 'fallback', totalKeys: 0, manufacturersCount: 0 };
    }
};

export const fetchPublicKey = async (manufacturerId) => {
    try {
        const client = getClient();
        const res = await client.get(`/core/keys/public/${encodeURIComponent(manufacturerId)}`);
        return res.data;
    } catch (err) {
        return null;
    }
};
