import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import AdminUser from '../models/adminUser.model.js';

export const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MONGO_URI is not set in environment');
        }

        const conn = await mongoose.connect(uri);
        console.log(`[admin-service DB] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);

        // ── Seed initial root Superadmin if database is empty ─────────────────
        await bootstrapAdmin();
    } catch (error) {
        console.error('[admin-service DB] Connection error:', error.message);
        process.exit(1);
    }
};

const bootstrapAdmin = async () => {
    try {
        const count = await AdminUser.countDocuments({});
        if (count === 0) {
            const email    = process.env.BOOTSTRAP_ADMIN_EMAIL    || 'admin@pharmachain.gov.in';
            const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'AdminGovSecured2026!';
            const fullName = process.env.BOOTSTRAP_ADMIN_NAME     || 'National Drug Regulator (CDSCO)';

            const passwordHash = await bcrypt.hash(password, 12);
            await AdminUser.create({
                adminId:    'ADM_CDSCO_ROOT_01',
                email:      email.toLowerCase(),
                fullName,
                department: 'Central Drugs Standard Control Organisation (CDSCO)',
                passwordHash,
                role:       'SUPERADMIN',
                isActive:   true,
            });

            console.log(`[admin-service DB] Bootstrapped default Superadmin: ${email}`);
        }
    } catch (err) {
        console.error('[admin-service DB] bootstrapAdmin error:', err.message);
    }
};
