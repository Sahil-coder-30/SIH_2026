import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Shopkeeper from '../models/shopkeeper.model.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS      = 12;
const JWT_SECRET         = process.env.JWT_SECRET;
const ACCESS_EXPIRES     = process.env.ACCESS_TOKEN_EXPIRES  || '15m';
const REFRESH_EXPIRES    = process.env.REFRESH_TOKEN_EXPIRES || '30d';
const MAX_FAILED         = 10;
const LOCK_DURATION_MS   = 30 * 60 * 1000; // 30 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────
const generateShopId = () =>
    `SHOP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const signAccessToken = (shopkeeper) =>
    jwt.sign(
        { id: shopkeeper.shopId, email: shopkeeper.authentication.email, role: 'SHOPKEEPER' },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: ACCESS_EXPIRES },
    );

const signRefreshToken = (shopkeeper) =>
    jwt.sign(
        { id: shopkeeper.shopId, type: 'refresh' },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: REFRESH_EXPIRES },
    );

// ── Controllers ───────────────────────────────────────────────────────────────

// POST /api/shopkeeper/register
export const registerController = async (req, res) => {
    try {
        const {
            shopName, shopPhone, shopEmail, address, city, state, pincode,
            ownerName, ownerPhone, ownerEmail,
            drugLicenseNumber, licenseType, issuingAuthority, licenseIssueDate, licenseExpiryDate,
            licenseDocument, password,
        } = req.body;

        const effectiveShopEmail   = (shopEmail || ownerEmail || '').toLowerCase().trim();
        const effectiveOwnerEmail  = (ownerEmail || shopEmail || '').toLowerCase().trim();
        const effectiveShopPhone   = (shopPhone || ownerPhone || '').trim();
        const effectiveOwnerPhone  = (ownerPhone || shopPhone || '').trim();
        const effectiveLicenseType = licenseType || 'retail';
        const effectiveAuthority   = issuingAuthority || 'State Drug Control Department';
        const effectiveIssueDate   = licenseIssueDate || new Date().toISOString();
        const effectiveExpiryDate  = licenseExpiryDate || new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString();

        // ── Required field validation
        const required = {
            shopName,
            shopPhone: effectiveShopPhone,
            shopEmail: effectiveShopEmail,
            address,
            city,
            state,
            pincode,
            ownerName,
            ownerPhone: effectiveOwnerPhone,
            ownerEmail: effectiveOwnerEmail,
            drugLicenseNumber,
            password,
        };
        const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
        if (missing.length) {
            return res.status(400).json({
                status: 'error',
                message: `Missing required fields: ${missing.join(', ')}`,
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters.' });
        }

        // ── Duplicate check
        const existing = await Shopkeeper.findOne({
            $or: [
                { 'authentication.email': effectiveOwnerEmail },
                { 'license.drugLicenseNumber': drugLicenseNumber.trim() },
                { 'shop.email': effectiveShopEmail },
            ],
        });

        if (existing) {
            return res.status(409).json({
                status: 'error',
                message: 'A pharmacy with this Drug License Number or email already exists.',
            });
        }

        // ── Create account
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const shopId       = generateShopId();

        const shopkeeper = await Shopkeeper.create({
            shopId,
            authentication: { email: effectiveOwnerEmail, phone: effectiveOwnerPhone, passwordHash },
            shop:  { name: shopName, phone: effectiveShopPhone, email: effectiveShopEmail, address, city, state, pincode },
            owner: { name: ownerName, phone: effectiveOwnerPhone, email: effectiveOwnerEmail },
            license: {
                drugLicenseNumber: drugLicenseNumber.trim(),
                licenseType: effectiveLicenseType,
                issuingAuthority: effectiveAuthority,
                issueDate:  new Date(effectiveIssueDate),
                expiryDate: new Date(effectiveExpiryDate),
                documentUrl: null,
                documentMeta: licenseDocument
                    ? { name: licenseDocument.name, size: licenseDocument.size, mimeType: licenseDocument.mimeType }
                    : null,
            },
        });

        console.log(`[shopkeeper-service Auth] Registered: ${shopId}`);

        return res.status(201).json({
            status:  'success',
            message: 'Registration submitted. Your account is pending KYC review.',
            data: {
                shopId:             shopkeeper.shopId,
                shopName:           shopkeeper.shop.name,
                ownerName:          shopkeeper.owner.name,
                verificationStatus: shopkeeper.verificationStatus,
                role:               'SHOPKEEPER',
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] registerController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/shopkeeper/login
export const loginController = async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({ status: 'error', message: 'identifier and password are required.' });
        }

        const id = identifier.toLowerCase().trim();
        const shopkeeper = await Shopkeeper.findOne({
            $or: [{ 'authentication.email': id }, { 'authentication.phone': id }],
        });

        if (!shopkeeper) {
            return res.status(401).json({ status: 'error', message: 'Invalid email/mobile or password.' });
        }

        // ── Account lock check
        if (shopkeeper.security.lockUntil && shopkeeper.security.lockUntil > new Date()) {
            const mins = Math.ceil((shopkeeper.security.lockUntil - Date.now()) / 60000);
            return res.status(429).json({ status: 'error', message: `Account locked. Try again in ${mins} minutes.` });
        }

        // ── Password verification
        const isValid = await bcrypt.compare(password, shopkeeper.authentication.passwordHash);
        if (!isValid) {
            const attempts = (shopkeeper.security.failedLoginAttempts || 0) + 1;
            const update   = { 'security.failedLoginAttempts': attempts };
            if (attempts >= MAX_FAILED) {
                update['security.lockUntil'] = new Date(Date.now() + LOCK_DURATION_MS);
            }
            await Shopkeeper.updateOne({ shopId: shopkeeper.shopId }, { $set: update });
            return res.status(401).json({ status: 'error', message: 'Invalid email/mobile or password.' });
        }

        // ── Reset lock counters
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
            status:       'success',
            accessToken,
            refreshToken,
            data:         shopkeeper.toPublicProfile(),
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] loginController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/shopkeeper/verification-status
export const verificationStatusController = async (req, res) => {
    try {
        const shopkeeper = await Shopkeeper.findOne({ shopId: req.user.id }).lean();
        if (!shopkeeper) {
            return res.status(404).json({ status: 'error', message: 'Shopkeeper not found.' });
        }

        return res.status(200).json({
            status: 'success',
            data: {
                verificationStatus: shopkeeper.verificationStatus,
                shopId:             shopkeeper.shopId,
                shopName:           shopkeeper.shop.name,
                rejectionReason:    shopkeeper.rejectionReason || null,
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] verificationStatusController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/shopkeeper/refresh
export const refreshController = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ status: 'error', message: 'refreshToken is required.' });
        }

        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_SECRET, { algorithms: ['HS256'] });
        } catch {
            return res.status(401).json({ status: 'error', message: 'Invalid or expired refresh token.' });
        }

        if (decoded.type !== 'refresh') {
            return res.status(401).json({ status: 'error', message: 'Token is not a refresh token.' });
        }

        const shopkeeper = await Shopkeeper.findOne({ shopId: decoded.id });
        if (!shopkeeper || !shopkeeper.authentication.refreshTokenHash) {
            return res.status(401).json({ status: 'error', message: 'Refresh token has been revoked.' });
        }

        const isValid = await bcrypt.compare(refreshToken, shopkeeper.authentication.refreshTokenHash);
        if (!isValid) {
            return res.status(401).json({ status: 'error', message: 'Refresh token does not match stored record.' });
        }

        // ── Issue rotated token pair
        const newAccessToken  = signAccessToken(shopkeeper);
        const newRefreshToken = signRefreshToken(shopkeeper);
        const newRefreshHash  = await bcrypt.hash(newRefreshToken, 8);

        await Shopkeeper.updateOne(
            { shopId: shopkeeper.shopId },
            { $set: { 'authentication.refreshTokenHash': newRefreshHash } },
        );

        return res.status(200).json({
            status:       'success',
            accessToken:  newAccessToken,
            refreshToken: newRefreshToken,
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] refreshController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/shopkeeper/forgot-password
export const forgotPasswordController = async (req, res) => {
    try {
        const { identifier } = req.body;
        if (!identifier) {
            return res.status(400).json({ status: 'error', message: 'identifier is required.' });
        }

        const id = identifier.toLowerCase().trim();
        const shopkeeper = await Shopkeeper.findOne({
            $or: [{ 'authentication.email': id }, { 'authentication.phone': id }],
        });

        // Always 200 to prevent enumeration
        if (!shopkeeper) {
            return res.status(200).json({
                status:  'success',
                message: 'If this account exists, reset instructions have been sent.',
            });
        }

        const resetToken   = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 15 * 60 * 1000);

        await Shopkeeper.updateOne(
            { shopId: shopkeeper.shopId },
            { $set: { 'authentication.passwordResetToken': resetToken, 'authentication.passwordResetExpires': resetExpires } },
        );

        console.log(`[shopkeeper-service Auth] Password reset token generated for: ${shopkeeper.shopId}`);

        const isDev = process.env.NODE_ENV !== 'production';
        return res.status(200).json({
            status:  'success',
            message: 'If this account exists, reset instructions have been sent.',
            ...(isDev && { _devResetToken: resetToken }),
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] forgotPasswordController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/shopkeeper/reset-password
export const resetPasswordController = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ status: 'error', message: 'token and password are required.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters.' });
        }

        const shopkeeper = await Shopkeeper.findOne({
            'authentication.passwordResetToken':   token,
            'authentication.passwordResetExpires': { $gt: new Date() },
        });

        if (!shopkeeper) {
            return res.status(400).json({ status: 'error', message: 'Reset token is invalid or has expired.' });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        await Shopkeeper.updateOne(
            { shopId: shopkeeper.shopId },
            {
                $set: {
                    'authentication.passwordHash':         passwordHash,
                    'authentication.refreshTokenHash':     null,
                    'authentication.passwordResetToken':   null,
                    'authentication.passwordResetExpires': null,
                    'security.lastPasswordChangeAt':       new Date(),
                    'security.failedLoginAttempts':        0,
                    'security.lockUntil':                  null,
                },
            },
        );

        console.log(`[shopkeeper-service Auth] Password reset for: ${shopkeeper.shopId}`);

        return res.status(200).json({ status: 'success', message: 'Password reset successfully.' });
    } catch (err) {
        console.error('[shopkeeper-service Auth] resetPasswordController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── KYC Approve — POST /api/shopkeeper/auth/kyc/approve ──────────────────────
//
// Admin-only. Guarded by X-Admin-Token header.
// Sets verificationStatus = 'APPROVED' (shopkeeper field) and kycStatus = 'APPROVED'.
// Shopkeepers do NOT get a signing key — only manufacturers need EC P-256 keys.
//
// Body: { shopkeeperId } OR { email }
// Header: X-Admin-Token: <value of ADMIN_TOKEN env var>
//
export const kycApproveController = async (req, res) => {
    // Fail closed — disabled if ADMIN_TOKEN not configured
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN) {
        console.error('[shopkeeper-service Auth] ADMIN_TOKEN env var not set — KYC endpoint disabled');
        return res.status(500).json({ status: 'error', message: 'Admin token not configured on server' });
    }

    const presented = req.headers['x-admin-token'];
    if (!presented || presented !== ADMIN_TOKEN) {
        return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Invalid or missing X-Admin-Token' });
    }

    try {
        const { shopkeeperId, email } = req.body;
        if (!shopkeeperId && !email) {
            return res.status(400).json({ status: 'error', message: 'shopkeeperId or email is required' });
        }

        // Build query — email is nested under authentication.email in shopkeeper model
        const query = shopkeeperId
            ? { shopId: shopkeeperId }
            : { 'authentication.email': email.toLowerCase() };

        const shopkeeper = await Shopkeeper.findOne(query);
        if (!shopkeeper) {
            return res.status(404).json({ status: 'error', message: 'Shopkeeper not found' });
        }

        // Update both verificationStatus (shopkeeper-specific) and kycStatus (shared field)
        shopkeeper.verificationStatus = 'approved';
        if (shopkeeper.kycStatus !== undefined) shopkeeper.kycStatus = 'approved';
        shopkeeper.verifiedAt = new Date();
        shopkeeper.rejectionReason = null;
        await shopkeeper.save();

        console.log(`[shopkeeper-service Auth] KYC approved: ${shopkeeper.shopId}`);

        return res.status(200).json({
            status:             'success',
            message:            `${shopkeeper.shop?.name || shopkeeper.shopId} approved. They can now log in.`,
            shopkeeperId:       shopkeeper.shopId,
            shopName:           shopkeeper.shop?.name || null,
            verificationStatus: 'approved',
            verifiedAt:         shopkeeper.verifiedAt,
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] kycApproveController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── KYC Reject — POST /api/shopkeeper/auth/kyc/reject ─────────────────────────
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
        const { shopkeeperId, email, reason } = req.body;
        if (!shopkeeperId && !email) {
            return res.status(400).json({ status: 'error', message: 'shopkeeperId or email is required' });
        }

        const query = shopkeeperId
            ? { shopId: shopkeeperId }
            : { 'authentication.email': email.toLowerCase() };

        const shopkeeper = await Shopkeeper.findOne(query);
        if (!shopkeeper) {
            return res.status(404).json({ status: 'error', message: 'Shopkeeper not found' });
        }

        shopkeeper.verificationStatus = 'rejected';
        shopkeeper.rejectionReason = reason || 'License verification rejected by regulatory authority.';
        await shopkeeper.save();

        console.log(`[shopkeeper-service Auth] KYC rejected: ${shopkeeper.shopId}`);

        return res.status(200).json({
            status:             'success',
            message:            `${shopkeeper.shop?.name || shopkeeper.shopId} rejected.`,
            shopkeeperId:       shopkeeper.shopId,
            shopName:           shopkeeper.shop?.name || null,
            verificationStatus: 'rejected',
            rejectionReason:    shopkeeper.rejectionReason,
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] kycRejectController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── Suspend License — POST /api/shopkeeper/auth/kyc/suspend ───────────────────
export const kycSuspendController = async (req, res) => {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN) {
        return res.status(500).json({ status: 'error', message: 'Admin token not configured on server' });
    }

    const presented = req.headers['x-admin-token'];
    if (!presented || presented !== ADMIN_TOKEN) {
        return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Invalid or missing X-Admin-Token' });
    }

    try {
        const { shopkeeperId, email, reason } = req.body;
        if (!shopkeeperId && !email) {
            return res.status(400).json({ status: 'error', message: 'shopkeeperId or email is required' });
        }

        const query = shopkeeperId
            ? { shopId: shopkeeperId }
            : { 'authentication.email': email.toLowerCase() };

        const shopkeeper = await Shopkeeper.findOne(query);
        if (!shopkeeper) {
            return res.status(404).json({ status: 'error', message: 'Shopkeeper not found' });
        }

        shopkeeper.verificationStatus = 'suspended';
        shopkeeper.rejectionReason = reason || 'License suspended by regulatory authority.';
        await shopkeeper.save();

        console.log(`[shopkeeper-service Auth] KYC suspended: ${shopkeeper.shopId}`);

        return res.status(200).json({
            status:             'success',
            message:            `${shopkeeper.shop?.name || shopkeeper.shopId} suspended.`,
            shopkeeperId:       shopkeeper.shopId,
            shopName:           shopkeeper.shop?.name || null,
            verificationStatus: 'suspended',
            rejectionReason:    shopkeeper.rejectionReason,
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] kycSuspendController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── Internal List — GET /api/shopkeeper/internal/list ─────────────────────────
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
        const { status, licenseType, city, search, page = 1, limit = 10 } = req.query;
        const query = {};

        if (status && status.toLowerCase() !== 'all') {
            query.verificationStatus = new RegExp(`^${status.trim()}$`, 'i');
        }

        if (licenseType && licenseType.toLowerCase() !== 'all') {
            query['license.licenseType'] = licenseType.toLowerCase().trim();
        }

        if (city) {
            query['shop.city'] = new RegExp(city.trim(), 'i');
        }

        if (search) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { 'shop.name': regex },
                { 'owner.name': regex },
                { 'license.drugLicenseNumber': regex },
                { 'authentication.email': regex },
                { 'shop.email': regex },
                { 'shop.city': regex },
                { shopId: regex },
            ];
        }

        const pageNum  = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
        const skip     = (pageNum - 1) * limitNum;

        const [records, total] = await Promise.all([
            Shopkeeper.find(query)
                .select('-authentication.passwordHash -authentication.refreshTokenHash -authentication.passwordResetToken')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Shopkeeper.countDocuments(query),
        ]);

        const data = records.map(r => ({
            shopId:             r.shopId,
            shopName:           r.shop?.name,
            shopPhone:          r.shop?.phone,
            shopEmail:          r.shop?.email,
            address:            r.shop?.address,
            city:               r.shop?.city,
            state:              r.shop?.state,
            pincode:            r.shop?.pincode,
            ownerName:          r.owner?.name,
            ownerPhone:         r.owner?.phone,
            ownerEmail:         r.owner?.email,
            drugLicenseNumber:  r.license?.drugLicenseNumber,
            licenseType:        r.license?.licenseType,
            issuingAuthority:   r.license?.issuingAuthority,
            licenseIssueDate:   r.license?.issueDate,
            licenseExpiryDate:  r.license?.expiryDate,
            documentUrl:        r.license?.documentUrl,
            documentMeta:       r.license?.documentMeta,
            verificationStatus: r.verificationStatus,
            rejectionReason:    r.rejectionReason,
            verifiedAt:         r.verifiedAt,
            createdAt:          r.createdAt,
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
    } catch (err) {
        console.error('[shopkeeper-service Auth] internalListController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── Internal Detail — GET /api/shopkeeper/internal/:id ────────────────────────
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
        const r = await Shopkeeper.findOne({
            $or: [{ shopId: id }, { 'authentication.email': id.toLowerCase() }],
        }).select('-authentication.passwordHash -authentication.refreshTokenHash').lean();

        if (!r) {
            return res.status(404).json({ status: 'error', message: 'Shopkeeper not found' });
        }

        return res.status(200).json({
            status: 'success',
            data: {
                shopId:             r.shopId,
                shopName:           r.shop?.name,
                shopPhone:          r.shop?.phone,
                shopEmail:          r.shop?.email,
                address:            r.shop?.address,
                city:               r.shop?.city,
                state:              r.shop?.state,
                pincode:            r.shop?.pincode,
                ownerName:          r.owner?.name,
                ownerPhone:         r.owner?.phone,
                ownerEmail:         r.owner?.email,
                drugLicenseNumber:  r.license?.drugLicenseNumber,
                licenseType:        r.license?.licenseType,
                issuingAuthority:   r.license?.issuingAuthority,
                licenseIssueDate:   r.license?.issueDate,
                licenseExpiryDate:  r.license?.expiryDate,
                documentUrl:        r.license?.documentUrl,
                documentMeta:       r.license?.documentMeta,
                verificationStatus: r.verificationStatus,
                rejectionReason:    r.rejectionReason,
                verifiedAt:         r.verifiedAt,
                createdAt:          r.createdAt,
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] internalDetailController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── Internal Stats — GET /api/shopkeeper/internal/stats ───────────────────────
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
        const [total, pending, approved, rejected, suspended] = await Promise.all([
            Shopkeeper.countDocuments({}),
            Shopkeeper.countDocuments({ verificationStatus: { $in: ['pending', 'PENDING'] } }),
            Shopkeeper.countDocuments({ verificationStatus: { $in: ['approved', 'APPROVED', 'verified', 'VERIFIED'] } }),
            Shopkeeper.countDocuments({ verificationStatus: { $in: ['rejected', 'REJECTED'] } }),
            Shopkeeper.countDocuments({ verificationStatus: { $in: ['suspended', 'SUSPENDED'] } }),
        ]);

        return res.status(200).json({
            status: 'success',
            data: {
                total,
                pending,
                approved,
                rejected,
                suspended,
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service Auth] internalStatsController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/shopkeeper/logout
export const logoutController = async (req, res) => {
    try {
        await Shopkeeper.updateOne(
            { shopId: req.user.id },
            { $set: { 'authentication.refreshTokenHash': null } },
        );
        res.clearCookie('shop_token', {
            httpOnly: true,
            secure:   process.env.NODE_ENV === 'production',
            sameSite: 'strict',
        });
        return res.status(204).send();
    } catch (err) {
        console.error('[shopkeeper-service Auth] logoutController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
