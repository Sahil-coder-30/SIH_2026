import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import axios from 'axios';
import Manufacturer from '../models/manufacturer.model.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS   = 12;
const JWT_SECRET      = process.env.JWT_SECRET;
const JWT_EXPIRES_IN  = process.env.JWT_EXPIRES_IN || '7d';
const PHARMA_CORE_URL = process.env.PHARMA_CORE_URL || 'http://pharma-core-service:80';
const SERVICE_TOKEN   = process.env.SERVICE_TOKEN   || 'pharma-cluster-internal-secret-token-change-in-prod';

// ── Helpers ───────────────────────────────────────────────────────────────────
const generateManufacturerId = (licenseNumber) =>
    `MFR_${licenseNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// ── Controllers ───────────────────────────────────────────────────────────────

// POST /api/manufacturer/auth/register
export const registerController = async (req, res) => {
    try {
        const { companyName, licenseNumber, email, password } = req.body;

        if (!companyName || !licenseNumber || !email || !password) {
            return res.status(400).json({
                status:  'error',
                message: 'companyName, licenseNumber, email, and password are required',
            });
        }
        if (password.length < 8) {
            return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters' });
        }

        const existing = await Manufacturer.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ status: 'error', message: 'Email already registered' });
        }

        const passwordHash   = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const manufacturerId = generateManufacturerId(licenseNumber);

        const manufacturer = await Manufacturer.create({
            manufacturerId,
            companyName,
            licenseNumber,
            email: email.toLowerCase(),
            passwordHash,
        });

        console.log(`[manufacturer-service Auth] Registered: ${manufacturerId}`);

        return res.status(201).json({
            status:  'success',
            message: 'Registration successful. KYC review is pending.',
            data: {
                id:          manufacturer.manufacturerId,
                companyName: manufacturer.companyName,
                email:       manufacturer.email,
                kycStatus:   manufacturer.kycStatus,
            },
        });
    } catch (error) {
        console.error('[manufacturer-service Auth] registerController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

// POST /api/manufacturer/auth/login
export const loginController = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'email and password are required' });
        }

        const manufacturer = await Manufacturer.findOne({ email: email.toLowerCase() });
        if (!manufacturer) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, manufacturer.passwordHash);
        if (!isValid) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }

        if (manufacturer.kycStatus !== 'APPROVED') {
            return res.status(403).json({
                status:    'error',
                code:      'KYC_PENDING',
                message:   'Account pending KYC approval. Contact administrator.',
                kycStatus: manufacturer.kycStatus,
            });
        }

        if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');

        const token = jwt.sign(
            { id: manufacturer.manufacturerId, email: manufacturer.email, companyName: manufacturer.companyName },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN },
        );

        console.log(`[manufacturer-service Auth] Login: ${manufacturer.manufacturerId}`);

        res.cookie('mfr_token', token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge:   7 * 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            status: 'success',
            token,
            data: {
                id:          manufacturer.manufacturerId,
                email:       manufacturer.email,
                companyName: manufacturer.companyName,
            },
        });
    } catch (error) {
        console.error('[manufacturer-service Auth] loginController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

// ── KYC Approve — POST /api/manufacturer/auth/kyc/approve ─────────────────────
//
// Admin-only. Guarded by X-Admin-Token header.
// Sets kycStatus = 'APPROVED' and calls pharma-core to provision EC P-256 signing key.
// Idempotent — calling twice is safe (pharma-core returns 409 if key exists).
//
// Body: { manufacturerId } OR { email }
// Header: X-Admin-Token: <value of ADMIN_TOKEN env var>
//
export const kycApproveController = async (req, res) => {
    // Fail closed — if ADMIN_TOKEN is not set, the endpoint is disabled
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN) {
        console.error('[manufacturer-service Auth] ADMIN_TOKEN env var not set — KYC endpoint disabled');
        return res.status(500).json({ status: 'error', message: 'Admin token not configured on server' });
    }

    const presented = req.headers['x-admin-token'];
    if (!presented || presented !== ADMIN_TOKEN) {
        return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Invalid or missing X-Admin-Token' });
    }

    try {
        const { manufacturerId, email } = req.body;
        if (!manufacturerId && !email) {
            return res.status(400).json({ status: 'error', message: 'manufacturerId or email is required' });
        }

        const query = manufacturerId ? { manufacturerId } : { email: email.toLowerCase() };
        const manufacturer = await Manufacturer.findOne(query);

        if (!manufacturer) {
            return res.status(404).json({ status: 'error', message: 'Manufacturer not found' });
        }

        // ── Provision EC P-256 signing key via pharma-core ────────────────────
        // 409 means key already exists — safe to ignore.
        let keyGenerated = false;
        try {
            await axios.post(
                `${PHARMA_CORE_URL}/core/keys/generate`,
                { manufacturerId: manufacturer.manufacturerId },
                {
                    headers: {
                        'Authorization':  `Bearer ${SERVICE_TOKEN}`,
                        'X-Service-Token': SERVICE_TOKEN,
                        'Content-Type':   'application/json',
                    },
                    timeout: 15_000,
                },
            );
            keyGenerated = true;
            console.log(`[manufacturer-service Auth] EC P-256 key generated for ${manufacturer.manufacturerId}`);
        } catch (keyErr) {
            if (keyErr.response?.status === 409) {
                console.log(`[manufacturer-service Auth] EC key already exists for ${manufacturer.manufacturerId}`);
            } else {
                console.error(`[manufacturer-service Auth] Key generation failed (non-fatal): ${keyErr.message}`);
            }
        }

        // ── Set KYC status ────────────────────────────────────────────────────
        manufacturer.kycStatus = 'APPROVED';
        manufacturer.rejectionReason = null;
        manufacturer.verifiedAt = new Date();
        await manufacturer.save();

        console.log(`[manufacturer-service Auth] KYC approved: ${manufacturer.manufacturerId}`);

        return res.status(200).json({
            status:         'success',
            message:        `${manufacturer.companyName} approved. They can now log in and mint batches.`,
            manufacturerId: manufacturer.manufacturerId,
            companyName:    manufacturer.companyName,
            kycStatus:      'APPROVED',
            keyGenerated,
            verifiedAt:     manufacturer.verifiedAt,
        });
    } catch (error) {
        console.error('[manufacturer-service Auth] kycApproveController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

// ── KYC Reject — POST /api/manufacturer/auth/kyc/reject ───────────────────────
export const kycRejectController = async (req, res) => {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN) {
        return res.status(500).json({ status: 'error', message: 'Admin token not configured on server' });
    }

    const presented = req.headers['x-admin-token'];
    if (!presented || presented !== ADMIN_TOKEN) {
        return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Invalid or missing X-Admin-Token' });
    }

    try {
        const { manufacturerId, email, reason } = req.body;
        if (!manufacturerId && !email) {
            return res.status(400).json({ status: 'error', message: 'manufacturerId or email is required' });
        }

        const query = manufacturerId ? { manufacturerId } : { email: email.toLowerCase() };
        const manufacturer = await Manufacturer.findOne(query);

        if (!manufacturer) {
            return res.status(404).json({ status: 'error', message: 'Manufacturer not found' });
        }

        manufacturer.kycStatus = 'REJECTED';
        manufacturer.rejectionReason = reason || 'KYC application rejected by regulatory authority.';
        await manufacturer.save();

        console.log(`[manufacturer-service Auth] KYC rejected: ${manufacturer.manufacturerId}`);

        return res.status(200).json({
            status:          'success',
            message:         `${manufacturer.companyName} registration rejected.`,
            manufacturerId:  manufacturer.manufacturerId,
            companyName:     manufacturer.companyName,
            kycStatus:       'REJECTED',
            rejectionReason: manufacturer.rejectionReason,
        });
    } catch (error) {
        console.error('[manufacturer-service Auth] kycRejectController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

// ── Internal List — GET /api/manufacturer/internal/list ───────────────────────
export const internalListController = async (req, res) => {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN) {
        return res.status(500).json({ status: 'error', message: 'Admin token not configured on server' });
    }

    const presented = req.headers['x-admin-token'];
    if (!presented || presented !== ADMIN_TOKEN) {
        return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Invalid or missing X-Admin-Token' });
    }

    try {
        const { status, search, page = 1, limit = 10 } = req.query;
        const query = {};

        if (status && status.toUpperCase() !== 'ALL') {
            query.kycStatus = status.toUpperCase();
        }

        if (search) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { companyName: regex },
                { licenseNumber: regex },
                { email: regex },
                { manufacturerId: regex },
            ];
        }

        const pageNum  = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
        const skip     = (pageNum - 1) * limitNum;

        const [records, total] = await Promise.all([
            Manufacturer.find(query)
                .select('-passwordHash')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Manufacturer.countDocuments(query),
        ]);

        const data = records.map(r => ({
            ...r,
            hasSigningKey: !!r.publicKeyPem,
        }));

        return res.status(200).json({
            status: 'success',
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
            data,
        });
    } catch (error) {
        console.error('[manufacturer-service Auth] internalListController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

// ── Internal Detail — GET /api/manufacturer/internal/:id ──────────────────────
export const internalDetailController = async (req, res) => {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN) {
        return res.status(500).json({ status: 'error', message: 'Admin token not configured on server' });
    }

    const presented = req.headers['x-admin-token'];
    if (!presented || presented !== ADMIN_TOKEN) {
        return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Invalid or missing X-Admin-Token' });
    }

    try {
        const { id } = req.params;
        const manufacturer = await Manufacturer.findOne({
            $or: [{ manufacturerId: id }, { email: id.toLowerCase() }],
        }).select('-passwordHash').lean();

        if (!manufacturer) {
            return res.status(404).json({ status: 'error', message: 'Manufacturer not found' });
        }

        return res.status(200).json({
            status: 'success',
            data: {
                ...manufacturer,
                hasSigningKey: !!manufacturer.publicKeyPem,
            },
        });
    } catch (error) {
        console.error('[manufacturer-service Auth] internalDetailController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

// ── Internal Stats — GET /api/manufacturer/internal/stats ─────────────────────
export const internalStatsController = async (req, res) => {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN) {
        return res.status(500).json({ status: 'error', message: 'Admin token not configured on server' });
    }

    const presented = req.headers['x-admin-token'];
    if (!presented || presented !== ADMIN_TOKEN) {
        return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Invalid or missing X-Admin-Token' });
    }

    try {
        const [total, pending, approved, rejected] = await Promise.all([
            Manufacturer.countDocuments({}),
            Manufacturer.countDocuments({ kycStatus: 'PENDING' }),
            Manufacturer.countDocuments({ kycStatus: 'APPROVED' }),
            Manufacturer.countDocuments({ kycStatus: 'REJECTED' }),
        ]);

        return res.status(200).json({
            status: 'success',
            data: {
                total,
                pending,
                approved,
                rejected,
            },
        });
    } catch (error) {
        console.error('[manufacturer-service Auth] internalStatsController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

// ── Logout — POST /api/manufacturer/auth/logout ───────────────────────────────
export const logoutController = (_req, res) => {
    res.clearCookie('mfr_token', {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    });
    return res.status(204).send();
};

