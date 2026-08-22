import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Manufacturer from '../models/manufacturer.model.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ── Helpers ───────────────────────────────────────────────────────────────────
const generateManufacturerId = (licenseNumber) =>
    `MFR_${licenseNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// ── Controllers ───────────────────────────────────────────────────────────────

export const registerController = async (req, res) => {
    try {
        const { companyName, licenseNumber, email, password } = req.body;

        // ── Input validation ──────────────────────────────────────────────────
        if (!companyName || !licenseNumber || !email || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'companyName, licenseNumber, email, and password are required',
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters' });
        }

        // ── Check for duplicate email ─────────────────────────────────────────
        const existing = await Manufacturer.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ status: 'error', message: 'Email already registered' });
        }

        // ── Hash password and create record ───────────────────────────────────
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const manufacturerId = generateManufacturerId(licenseNumber);

        const manufacturer = await Manufacturer.create({
            manufacturerId,
            companyName,
            licenseNumber,
            email,
            passwordHash,
        });

        console.log(`[manufacturer-service Auth] Registered new manufacturer: ${manufacturerId}`);

        return res.status(201).json({
            status: 'success',
            message: 'Registration successful. KYC review is pending.',
            data: {
                id: manufacturer.manufacturerId,
                companyName: manufacturer.companyName,
                email: manufacturer.email,
                kycStatus: manufacturer.kycStatus,
            },
        });
    } catch (error) {
        console.error('[manufacturer-service Auth] registerController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const loginController = async (req, res) => {
    try {
        const { email, password } = req.body;

        // ── Input validation ──────────────────────────────────────────────────
        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'email and password are required' });
        }

        // ── Find manufacturer ─────────────────────────────────────────────────
        const manufacturer = await Manufacturer.findOne({ email: email.toLowerCase() });
        if (!manufacturer) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }

        // ── Verify password ───────────────────────────────────────────────────
        const isValid = await bcrypt.compare(password, manufacturer.passwordHash);
        if (!isValid) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }

        // ── KYC gate ──────────────────────────────────────────────────────────
        if (manufacturer.kycStatus !== 'APPROVED') {
            return res.status(403).json({
                status: 'error',
                code: 'KYC_PENDING',
                message: 'Account pending KYC approval. Contact administrator.',
            });
        }

        // ── Sign HS256 JWT ────────────────────────────────────────────────────
        if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');

        const token = jwt.sign(
            {
                id: manufacturer.manufacturerId,
                email: manufacturer.email,
                companyName: manufacturer.companyName,
            },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN },
        );

        console.log(`[manufacturer-service Auth] Login successful for ${manufacturer.manufacturerId}`);

        res.cookie('mfr_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            status: 'success',
            token,
            data: {
                id: manufacturer.manufacturerId,
                email: manufacturer.email,
                companyName: manufacturer.companyName,
            },
        });
    } catch (error) {
        console.error('[manufacturer-service Auth] loginController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
