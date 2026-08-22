import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Shopkeeper from '../models/shopkeeper.model.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ── Helpers ───────────────────────────────────────────────────────────────────
const generateShopkeeperId = (licenseNo) =>
    `SHOP_${licenseNo.replace(/[^A-Z0-9]/gi, '').toUpperCase()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// ── Controllers ───────────────────────────────────────────────────────────────

export const registerController = async (req, res) => {
    try {
        const { pharmacyName, ownerName, email, password, drugLicenseNo, address } = req.body;

        if (!pharmacyName || !ownerName || !email || !password || !drugLicenseNo || !address) {
            return res.status(400).json({
                status: 'error',
                message: 'pharmacyName, ownerName, email, password, drugLicenseNo, and address are required',
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters' });
        }

        const existing = await Shopkeeper.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ status: 'error', message: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const shopkeeperId = generateShopkeeperId(drugLicenseNo);

        const shopkeeper = await Shopkeeper.create({
            shopkeeperId,
            pharmacyName,
            ownerName,
            email,
            passwordHash,
            drugLicenseNo,
            address,
        });

        console.log(`[shopkeeper-service Auth] Registered new shopkeeper: ${shopkeeperId}`);

        return res.status(201).json({
            status: 'success',
            message: 'Registration successful. KYC review is pending.',
            data: {
                id: shopkeeper.shopkeeperId,
                pharmacyName: shopkeeper.pharmacyName,
                email: shopkeeper.email,
                kycStatus: shopkeeper.kycStatus,
            },
        });
    } catch (error) {
        console.error('[shopkeeper-service Auth] registerController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const loginController = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'email and password are required' });
        }

        const shopkeeper = await Shopkeeper.findOne({ email: email.toLowerCase() });
        if (!shopkeeper) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, shopkeeper.passwordHash);
        if (!isValid) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }

        if (shopkeeper.kycStatus !== 'APPROVED') {
            return res.status(403).json({
                status: 'error',
                code: 'KYC_PENDING',
                message: 'Account pending KYC approval. Contact administrator.',
            });
        }

        if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');

        const token = jwt.sign(
            {
                id: shopkeeper.shopkeeperId,
                email: shopkeeper.email,
                pharmacyName: shopkeeper.pharmacyName,
            },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN },
        );

        console.log(`[shopkeeper-service Auth] Login successful for ${shopkeeper.shopkeeperId}`);

        res.cookie('shop_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            status: 'success',
            token,
            data: {
                id: shopkeeper.shopkeeperId,
                email: shopkeeper.email,
                pharmacyName: shopkeeper.pharmacyName,
            },
        });
    } catch (error) {
        console.error('[shopkeeper-service Auth] loginController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
