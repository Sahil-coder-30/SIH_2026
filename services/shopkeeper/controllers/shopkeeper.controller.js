import Shopkeeper from '../models/shopkeeper.model.js';
import { PackEvent, Inventory } from '../models/inventory.model.js';
import Transaction from '../models/transaction.model.js';

// ── 4.1 Dashboard Stats ───────────────────────────────────────────────────────
export const statsController = async (req, res) => {
    try {
        const shopkeeperId = req.user.id;

        const [totalScans, verifiedCount, suspiciousCount, counterfeitCount, todaySales] =
            await Promise.all([
                PackEvent.countDocuments({ shopkeeperId }),
                PackEvent.countDocuments({ shopkeeperId, scanStatus: 'Verified' }),
                PackEvent.countDocuments({ shopkeeperId, scanStatus: 'Suspicious' }),
                PackEvent.countDocuments({ shopkeeperId, scanStatus: 'Counterfeit' }),
                Transaction.countDocuments({
                    shopkeeperId,
                    type: 'SELL',
                    createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                }),
            ]);

        return res.status(200).json({
            status: 'success',
            data: {
                totalScans,
                verifiedCount,
                suspiciousCount,
                counterfeitCount,
                todaySalesCount: todaySales,
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service] statsController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── 4.2 Transaction & Scan History ───────────────────────────────────────────
export const historyController = async (req, res) => {
    try {
        const shopkeeperId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;

        const filter = { shopkeeperId };
        if (status) filter.scanStatus = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const lim  = parseInt(limit);

        const [events, total] = await Promise.all([
            PackEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
            PackEvent.countDocuments(filter),
        ]);

        const history = events.map((e) => ({
            id:           e._id.toString(),
            medicineName: e.medicineName || null,
            batchNo:      e.batchNo || null,
            packId:       e.packId || null,
            timestamp:    e.createdAt,
            status:       e.scanStatus || 'Verified',
            action:       e.eventType === 'INTAKE' ? 'RECEIVE'
                          : e.eventType === 'SALE'   ? 'SALE'
                          : e.eventType === 'RETURN' ? 'RETURN'
                          : 'SCAN_ONLY',
        }));

        return res.status(200).json({
            status: 'success',
            data: {
                history,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages:  Math.ceil(total / lim),
                    totalItems:  total,
                },
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service] historyController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── 4.3 Shop Inventory ────────────────────────────────────────────────────────
export const inventoryController = async (req, res) => {
    try {
        const shopkeeperId = req.user.id;
        const { status } = req.query;

        const filter = { shopkeeperId, currentStock: { $gt: 0 } };
        if (status) filter.status = status;

        const items = await Inventory.find(filter).sort({ expiryDate: 1 }).lean();

        const inventory = items.map((item) => ({
            id:           item._id.toString(),
            medicineName: item.medicineName,
            batchNo:      item.batchNo || null,
            packId:       item.batchId,
            expiryDate:   item.expiryDate,
            receivedDate: item.receivedDate,
            status:       item.status || 'AVAILABLE',
            currentStock: item.currentStock,
        }));

        return res.status(200).json({
            status: 'success',
            data: { inventory },
        });
    } catch (err) {
        console.error('[shopkeeper-service] inventoryController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── 5.1 Get Profile ───────────────────────────────────────────────────────────
export const getProfileController = async (req, res) => {
    try {
        const shopkeeper = await Shopkeeper.findOne({ shopId: req.user.id }).lean();
        if (!shopkeeper) {
            return res.status(404).json({ status: 'error', message: 'Shopkeeper not found.' });
        }

        return res.status(200).json({
            status: 'success',
            data: {
                shopkeeper: {
                    shopId:            shopkeeper.shopId,
                    shopName:          shopkeeper.shop.name,
                    ownerName:         shopkeeper.owner.name,
                    ownerEmail:        shopkeeper.owner.email,
                    ownerPhone:        shopkeeper.owner.phone,
                    shopEmail:         shopkeeper.shop.email,
                    shopPhone:         shopkeeper.shop.phone,
                    address:           shopkeeper.shop.address,
                    city:              shopkeeper.shop.city,
                    state:             shopkeeper.shop.state,
                    pincode:           shopkeeper.shop.pincode,
                    drugLicenseNumber: shopkeeper.license.drugLicenseNumber,
                    licenseType:       shopkeeper.license.licenseType,
                    issuingAuthority:  shopkeeper.license.issuingAuthority,
                    licenseExpiryDate: shopkeeper.license.expiryDate,
                    verificationStatus:shopkeeper.verificationStatus,
                },
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service] getProfileController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── 5.2 Update Profile ────────────────────────────────────────────────────────
const ALLOWED_PATCH_FIELDS = ['shopName', 'shopPhone', 'shopEmail', 'address', 'city', 'state', 'pincode'];

export const updateProfileController = async (req, res) => {
    try {
        const shopkeeperId = req.user.id;
        const updates = {};

        if (req.body.shopName)   updates['shop.name']    = req.body.shopName;
        if (req.body.shopPhone)  updates['shop.phone']   = req.body.shopPhone;
        if (req.body.shopEmail)  updates['shop.email']   = req.body.shopEmail.toLowerCase().trim();
        if (req.body.address)    updates['shop.address'] = req.body.address;
        if (req.body.city)       updates['shop.city']    = req.body.city;
        if (req.body.state)      updates['shop.state']   = req.body.state;
        if (req.body.pincode)    updates['shop.pincode'] = req.body.pincode;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                status: 'error',
                message: `Allowed updatable fields: ${ALLOWED_PATCH_FIELDS.join(', ')}`,
            });
        }

        const updated = await Shopkeeper.findOneAndUpdate(
            { shopId: shopkeeperId },
            { $set: updates },
            { new: true },
        );

        if (!updated) {
            return res.status(404).json({ status: 'error', message: 'Shopkeeper not found.' });
        }

        return res.status(200).json({
            status: 'success',
            message: 'Profile updated successfully.',
            data: {
                shopkeeper: {
                    shopId:    updated.shopId,
                    shopName:  updated.shop.name,
                    shopPhone: updated.shop.phone,
                    shopEmail: updated.shop.email,
                    address:   updated.shop.address,
                    city:      updated.shop.city,
                    state:     updated.shop.state,
                    pincode:   updated.shop.pincode,
                },
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service] updateProfileController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
