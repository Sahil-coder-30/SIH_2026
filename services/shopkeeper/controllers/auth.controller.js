import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Shopkeeper from '../models/shopkeeper.model.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES  = process.env.ACCESS_TOKEN_EXPIRES  || '15m';
const REFRESH_TOKEN_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES || '30d';
const MAX_FAILED_ATTEMPTS   = 10;
const LOCK_DURATION_MS      = 30 * 60 * 1000; // 30 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────
const generateShopId = () =>
    `SHOP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const signAccessToken = (shopkeeper) =>
    jwt.sign(
        { id: shopkeeper.shopId, email: shopkeeper.authentication.email, role: 'SHOPKEEPER' },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_EXPIRES },
    );

const signRefreshToken = (shopkeeper) =>
    jwt.sign(
        { id: shopkeeper.shopId, type: 'refresh' },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: REFRESH_TOKEN_EXPIRES },
    );

// ── 1.2 Register ─────────────────────────────────────────────────────────────
export const registerController = async (req, res) => {
    try {
        const {
            shopName, shopPhone, shopEmail, address, city, state, pincode,
            ownerName, ownerPhone, ownerEmail,
            drugLicenseNumber, licenseType, issuingAuthority, licenseIssueDate, licenseExpiryDate,
            licenseDocument,
            password,
        } = req.body;

        // ── Required field validation
        const required = { shopName, shopPhone, shopEmail, address, city, state, pincode,
                           ownerName, ownerPhone, ownerEmail,
                           drugLicenseNumber, licenseType, issuingAuthority,
                           licenseIssueDate, licenseExpiryDate, password };

        const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
        if (missing.length) {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_FIELDS', message: `Missing required fields: ${missing.join(', ')}` },
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' },
            });
        }

        // ── Duplicate check
        const emailLower = ownerEmail.toLowerCase().trim();
        const shopEmailLower = shopEmail.toLowerCase().trim();

        const existing = await Shopkeeper.findOne({
            $or: [
                { 'authentication.email': emailLower },
                { 'license.drugLicenseNumber': drugLicenseNumber.trim() },
                { 'shop.email': shopEmailLower },
            ],
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                error: {
                    code: 'DUPLICATE_REGISTRATION',
                    message: 'A pharmacy with this Drug License Number or email already exists.',
                },
            });
        }

        // ── Hash password & create
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const shopId = generateShopId();

        const shopkeeper = await Shopkeeper.create({
            shopId,
            authentication: {
                email: emailLower,
                phone: ownerPhone.trim(),
                passwordHash,
            },
            shop: {
                name: shopName,
                phone: shopPhone,
                email: shopEmailLower,
                address,
                city,
                state,
                pincode,
            },
            owner: {
                name:  ownerName,
                phone: ownerPhone,
                email: emailLower,
            },
            license: {
                drugLicenseNumber: drugLicenseNumber.trim(),
                licenseType,
                issuingAuthority,
                issueDate:  new Date(licenseIssueDate),
                expiryDate: new Date(licenseExpiryDate),
                documentUrl: null,
                documentMeta: licenseDocument
                    ? { name: licenseDocument.name, size: licenseDocument.size, mimeType: licenseDocument.mimeType }
                    : null,
            },
        });

        console.log(`[shopkeeper-service Auth] Registered: ${shopId}`);

        return res.status(201).json({
            success: true,
            message: 'Your pharmacy registration was submitted successfully.',
            shopId: shopkeeper.shopId,
            shopkeeper: {
                shopId:             shopkeeper.shopId,
                shopName:           shopkeeper.shop.name,
                ownerName:          shopkeeper.owner.name,
                verificationStatus: shopkeeper.verificationStatus,
                role:               'SHOPKEEPER',
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] registerController:', err.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
};

// ── 1.1 Login ─────────────────────────────────────────────────────────────────
export const loginController = async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_FIELDS', message: 'identifier and password are required.' },
            });
        }

        const id = identifier.toLowerCase().trim();

        // Find by email or phone
        const shopkeeper = await Shopkeeper.findOne({
            $or: [{ 'authentication.email': id }, { 'authentication.phone': id }],
        });

        if (!shopkeeper) {
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email/mobile or password.' },
            });
        }

        // ── Account lock check
        if (shopkeeper.security.lockUntil && shopkeeper.security.lockUntil > new Date()) {
            const remaining = Math.ceil((shopkeeper.security.lockUntil - Date.now()) / 60000);
            return res.status(429).json({
                success: false,
                error: {
                    code: 'ACCOUNT_LOCKED',
                    message: `Account temporarily locked. Try again in ${remaining} minutes.`,
                },
            });
        }

        // ── Password verification
        const isValid = await bcrypt.compare(password, shopkeeper.authentication.passwordHash);
        if (!isValid) {
            // Increment failed attempts
            const attempts = (shopkeeper.security.failedLoginAttempts || 0) + 1;
            const update = { 'security.failedLoginAttempts': attempts };
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                update['security.lockUntil'] = new Date(Date.now() + LOCK_DURATION_MS);
            }
            await Shopkeeper.updateOne({ shopId: shopkeeper.shopId }, { $set: update });

            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email/mobile or password.' },
            });
        }

        // ── Reset failed login counter
        await Shopkeeper.updateOne(
            { shopId: shopkeeper.shopId },
            { $set: { 'security.failedLoginAttempts': 0, 'security.lockUntil': null, 'security.lastLoginAt': new Date() } },
        );

        // ── Issue tokens
        const accessToken  = signAccessToken(shopkeeper);
        const refreshToken = signRefreshToken(shopkeeper);
        const refreshHash  = await bcrypt.hash(refreshToken, 8);

        await Shopkeeper.updateOne(
            { shopId: shopkeeper.shopId },
            { $set: { 'authentication.refreshTokenHash': refreshHash } },
        );

        console.log(`[shopkeeper-service Auth] Login: ${shopkeeper.shopId} | status: ${shopkeeper.verificationStatus}`);

        return res.status(200).json({
            success:      true,
            accessToken,
            refreshToken,
            shopkeeper:   shopkeeper.toPublicProfile(),
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] loginController:', err.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
};

// ── 1.3 Verification Status ───────────────────────────────────────────────────
export const verificationStatusController = async (req, res) => {
    try {
        const shopkeeper = await Shopkeeper.findOne({ shopId: req.user.id }).lean();
        if (!shopkeeper) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shopkeeper not found.' } });
        }

        return res.status(200).json({
            success:            true,
            verificationStatus: shopkeeper.verificationStatus,
            shopId:             shopkeeper.shopId,
            shopName:           shopkeeper.shop.name,
            rejectionReason:    shopkeeper.rejectionReason || null,
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] verificationStatusController:', err.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
};

// ── 1.4 Refresh Token ─────────────────────────────────────────────────────────
export const refreshController = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_TOKEN', message: 'refreshToken is required.' },
            });
        }

        // Verify JWT structure first
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_SECRET, { algorithms: ['HS256'] });
        } catch {
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token.' },
            });
        }

        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_TOKEN', message: 'Token is not a refresh token.' },
            });
        }

        // Validate against stored hash
        const shopkeeper = await Shopkeeper.findOne({ shopId: decoded.id });
        if (!shopkeeper || !shopkeeper.authentication.refreshTokenHash) {
            return res.status(401).json({
                success: false,
                error: { code: 'TOKEN_REVOKED', message: 'Refresh token has been revoked or account not found.' },
            });
        }

        const isValid = await bcrypt.compare(refreshToken, shopkeeper.authentication.refreshTokenHash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: { code: 'TOKEN_MISMATCH', message: 'Refresh token does not match stored record.' },
            });
        }

        // Issue new token pair (rotation)
        const newAccessToken  = signAccessToken(shopkeeper);
        const newRefreshToken = signRefreshToken(shopkeeper);
        const newRefreshHash  = await bcrypt.hash(newRefreshToken, 8);

        await Shopkeeper.updateOne(
            { shopId: shopkeeper.shopId },
            { $set: { 'authentication.refreshTokenHash': newRefreshHash } },
        );

        return res.status(200).json({
            success:      true,
            accessToken:  newAccessToken,
            refreshToken: newRefreshToken,
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] refreshController:', err.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
};

// ── 1.5 Forgot Password ───────────────────────────────────────────────────────
export const forgotPasswordController = async (req, res) => {
    try {
        const { identifier } = req.body;
        if (!identifier) {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_FIELDS', message: 'identifier is required.' },
            });
        }

        const id = identifier.toLowerCase().trim();
        const shopkeeper = await Shopkeeper.findOne({
            $or: [{ 'authentication.email': id }, { 'authentication.phone': id }],
        });

        // Always return 200 to prevent enumeration
        if (!shopkeeper) {
            return res.status(200).json({
                success: true,
                message: 'Password reset instructions have been sent to your registered email or mobile.',
            });
        }

        // Generate single-use reset token (expires in 15 min)
        const resetToken   = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 15 * 60 * 1000);

        await Shopkeeper.updateOne(
            { shopId: shopkeeper.shopId },
            {
                $set: {
                    'authentication.passwordResetToken':   resetToken,
                    'authentication.passwordResetExpires': resetExpires,
                },
            },
        );

        console.log(`[shopkeeper-service Auth] Password reset token generated for: ${shopkeeper.shopId}`);

        // TODO: Send token via email/SMS in production
        // In prototype/dev mode, include token in response for testability
        const isDev = process.env.NODE_ENV !== 'production';
        return res.status(200).json({
            success: true,
            message: 'Password reset instructions have been sent to your registered email or mobile.',
            ...(isDev && { _devResetToken: resetToken }),
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] forgotPasswordController:', err.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
};

// ── 1.6 Reset Password ────────────────────────────────────────────────────────
export const resetPasswordController = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_FIELDS', message: 'token and password are required.' },
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' },
            });
        }

        const shopkeeper = await Shopkeeper.findOne({
            'authentication.passwordResetToken':   token,
            'authentication.passwordResetExpires': { $gt: new Date() },
        });

        if (!shopkeeper) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_TOKEN', message: 'Reset token is invalid or has expired.' },
            });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        await Shopkeeper.updateOne(
            { shopId: shopkeeper.shopId },
            {
                $set: {
                    'authentication.passwordHash':          passwordHash,
                    'authentication.refreshTokenHash':      null,  // Invalidate all sessions
                    'authentication.passwordResetToken':    null,
                    'authentication.passwordResetExpires':  null,
                    'security.lastPasswordChangeAt':        new Date(),
                    'security.failedLoginAttempts':         0,
                    'security.lockUntil':                   null,
                },
            },
        );

        console.log(`[shopkeeper-service Auth] Password reset for: ${shopkeeper.shopId}`);

        return res.status(200).json({
            success: true,
            message: 'Your password has been reset successfully.',
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] resetPasswordController:', err.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
};

// ── 1.7 Logout ────────────────────────────────────────────────────────────────
export const logoutController = async (req, res) => {
    try {
        await Shopkeeper.updateOne(
            { shopId: req.user.id },
            { $set: { 'authentication.refreshTokenHash': null } },
        );

        res.clearCookie('shop_token');

        return res.status(200).json({
            success: true,
            message: 'Logged out successfully.',
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] logoutController:', err.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
};
