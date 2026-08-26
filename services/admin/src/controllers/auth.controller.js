import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import AdminUser from '../models/adminUser.model.js';
import AuditLog from '../models/auditLog.model.js';

const BCRYPT_ROUNDS   = 12;

// POST /api/admin/auth/login
export const loginController = async (req, res) => {
    try {
        const JWT_SECRET     = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'super-secret-jwt-key-for-admin-service-change-in-prod';
        const JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || '8h';

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'Email and password are required' });
        }

        const admin = await AdminUser.findOne({ email: email.toLowerCase().trim() });
        if (!admin || !admin.isActive) {
            return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
        }

        const isValid = await bcrypt.compare(password, admin.passwordHash);
        if (!isValid) {
            return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
        }

        admin.lastLoginAt = new Date();
        await admin.save();

        if (!JWT_SECRET) {
            throw new Error('ADMIN_JWT_SECRET is not configured');
        }

        const token = jwt.sign(
            {
                adminId: admin.adminId,
                email:   admin.email,
                role:    admin.role,
                fullName:admin.fullName,
            },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN }
        );

        // Audit log login
        await AuditLog.create({
            action:      'ADMIN_LOGIN',
            performedBy: {
                adminId:  admin.adminId,
                email:    admin.email,
                fullName: admin.fullName,
                role:     admin.role,
            },
            targetType:  'ADMIN',
            targetId:    admin.adminId,
            targetName:  admin.fullName,
            ipAddress:   req.ip || req.headers['x-forwarded-for'] || 'internal',
        });

        res.cookie('admin_token', token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge:   8 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            status: 'success',
            token,
            data:   admin.toPublicProfile(),
        });
    } catch (error) {
        console.error('[admin-service Auth] loginController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

// GET /api/admin/auth/me
export const getMeController = async (req, res) => {
    return res.status(200).json({
        status: 'success',
        data:   req.admin.toPublicProfile(),
    });
};

// POST /api/admin/auth/logout
export const logoutController = (_req, res) => {
    res.clearCookie('admin_token', {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    });
    return res.status(200).json({ status: 'success', message: 'Logged out successfully' });
};

// POST /api/admin/auth/create-admin (Superadmin only)
export const createAdminController = async (req, res) => {
    try {
        const { email, password, fullName, department, role } = req.body;

        if (!email || !password || !fullName) {
            return res.status(400).json({ status: 'error', message: 'email, password, and fullName are required' });
        }

        const existing = await AdminUser.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            return res.status(409).json({ status: 'error', message: 'An admin with this email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const adminId      = `ADM_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        const newAdmin = await AdminUser.create({
            adminId,
            email:      email.toLowerCase().trim(),
            fullName,
            department: department || 'CDSCO Regulatory Division',
            passwordHash,
            role:       role || 'DRUG_INSPECTOR',
        });

        await AuditLog.create({
            action:      'ADMIN_CREATED',
            performedBy: {
                adminId:  req.admin.adminId,
                email:    req.admin.email,
                fullName: req.admin.fullName,
                role:     req.admin.role,
            },
            targetType:  'ADMIN',
            targetId:    newAdmin.adminId,
            targetName:  newAdmin.fullName,
            reason:      `Created new admin with role: ${newAdmin.role}`,
            ipAddress:   req.ip || 'internal',
        });

        return res.status(201).json({
            status: 'success',
            message: 'Admin account created successfully',
            data:   newAdmin.toPublicProfile(),
        });
    } catch (error) {
        console.error('[admin-service Auth] createAdminController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

// PUT /api/admin/auth/profile
export const updateProfileController = async (req, res) => {
    try {
        const adminId = req.admin.adminId;
        const { fullName, department } = req.body;

        const admin = await AdminUser.findOne({ adminId });
        if (!admin) {
            return res.status(404).json({ status: 'error', message: 'Admin user not found' });
        }

        if (fullName !== undefined && fullName.trim()) {
            admin.fullName = fullName.trim();
        }
        if (department !== undefined && department.trim()) {
            admin.department = department.trim();
        }

        await admin.save();

        await AuditLog.create({
            action:      'ADMIN_PROFILE_UPDATED',
            performedBy: {
                adminId:  admin.adminId,
                email:    admin.email,
                fullName: admin.fullName,
                role:     admin.role,
            },
            targetType:  'ADMIN',
            targetId:    admin.adminId,
            targetName:  admin.fullName,
            reason:      'Admin updated profile details',
            ipAddress:   req.ip || 'internal',
        });

        return res.status(200).json({
            status: 'success',
            message: 'Profile updated successfully',
            data:   admin.toPublicProfile(),
        });
    } catch (error) {
        console.error('[admin-service Auth] updateProfileController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

