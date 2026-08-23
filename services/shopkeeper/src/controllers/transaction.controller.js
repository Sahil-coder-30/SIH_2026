import crypto from 'crypto';
import Transaction from '../models/transaction.model.js';
import { PackEvent, Inventory } from '../models/inventory.model.js';
import { verifyPackId, recordIntake, recordSale, recordReturn } from '../services/coreClient.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const generateTxnId = (prefix) =>
    `TXN-${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}${Date.now().toString(36).toUpperCase()}`;

/**
 * Shared idempotency check — if the key already exists, return the previous result.
 */
const checkIdempotency = async (idempotencyKey, res) => {
    if (!idempotencyKey) return null;

    const existing = await Transaction.findOne({ idempotencyKey }).lean();
    if (existing) {
        res.status(201).json({
            status: 'success',
            message: `[Idempotent] ${existing.status.charAt(0) + existing.status.slice(1).toLowerCase()} previously processed.`,
            data: {
                transactionId: existing.transactionId,
                packId:        existing.packId,
                status:        existing.status,
                timestamp:     existing.createdAt,
            },
        });
        return existing;
    }

    return null;
};

// ── 3.1 Receive Medicine Stock ────────────────────────────────────────────────
export const receiveController = async (req, res) => {
    try {
        const shopkeeperId   = req.user.id;
        const idempotencyKey = req.headers['idempotency-key'] || null;
        const { packId }     = req.body;

        if (!packId) {
            return res.status(400).json({ status: 'error', message: 'packId is required.' });
        }

        const cached = await checkIdempotency(idempotencyKey, res);
        if (cached) return;

        let packInfo = {};
        try {
            packInfo = await verifyPackId(packId, req.authToken);
        } catch {
            console.warn(`[shopkeeper-service Txn] pharma-core unreachable — using packId fallback for ${packId}`);
            packInfo = { medicineId: packId, name: 'Unknown Medicine', batchNo: packId, manufacturer: null, mfgDate: null, expDate: null, status: 'Verified', trustScore: null, packHash: packId };
        }

        const txnId  = generateTxnId('REC');
        const isoKey = idempotencyKey || txnId;

        try {
            await recordIntake({
                packHash:       packInfo.packHash || packId,
                shopId:         shopkeeperId,
                operatorId:     shopkeeperId,
                manufacturerId: packInfo.manufacturerId || null,
            });
        } catch (e) {
            console.warn(`[shopkeeper-service Txn] Blockchain intake record failed: ${e.message}`);
        }

        const txn = await Transaction.create({
            transactionId:    txnId,
            idempotencyKey:   isoKey,
            shopkeeperId,
            packId,
            type:             'RECEIVE',
            status:           'RECEIVED',
            medicineId:       packInfo.medicineId || null,
            medicineName:     packInfo.name        || null,
            batchNo:          packInfo.batchNo     || null,
            mfgDate:          packInfo.mfgDate     ? new Date(packInfo.mfgDate)  : null,
            expDate:          packInfo.expDate      ? new Date(packInfo.expDate)   : null,
            manufacturer:     packInfo.manufacturer || null,
            scanStatus:       packInfo.status       || 'Verified',
            trustScore:       packInfo.trustScore   || null,
            blockchainTxHash: packInfo.blockchainTxHash || null,
        });

        await PackEvent.create({
            shopkeeperId,
            packHash:    packInfo.packHash || packId,
            packId,
            batchId:     packInfo.batchNo  || packId,
            eventType:   'INTAKE',
            operatorId:  shopkeeperId,
            medicineName:packInfo.name        || null,
            batchNo:     packInfo.batchNo     || null,
            expDate:     packInfo.expDate      ? new Date(packInfo.expDate) : null,
            scanStatus:  packInfo.status       || 'Verified',
            trustScore:  packInfo.trustScore   || null,
            manufacturer:packInfo.manufacturer || null,
            mfgDate:     packInfo.mfgDate      ? new Date(packInfo.mfgDate) : null,
        }).catch(() => {});

        await Inventory.findOneAndUpdate(
            { shopkeeperId, batchId: packInfo.batchNo || packId },
            {
                $inc: { currentStock: 1 },
                $setOnInsert: {
                    medicineName: packInfo.name || `Pack ${packId}`,
                    batchNo:      packInfo.batchNo || null,
                    expiryDate:   packInfo.expDate ? new Date(packInfo.expDate) : new Date('2099-01-01'),
                    manufacturer: packInfo.manufacturer || null,
                    status:       'RECEIVED',
                },
            },
            { upsert: true },
        );

        return res.status(201).json({
            status:  'success',
            message: 'Medicine successfully received into shop inventory.',
            data: {
                transactionId: txn.transactionId,
                packId,
                status:    'RECEIVED',
                timestamp: txn.createdAt,
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service Txn] receiveController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── 3.2 Sell Medicine ─────────────────────────────────────────────────────────
export const sellController = async (req, res) => {
    try {
        const shopkeeperId   = req.user.id;
        const idempotencyKey = req.headers['idempotency-key'] || null;
        const { packId, customerPhone } = req.body;

        if (!packId) {
            return res.status(400).json({ status: 'error', message: 'packId is required.' });
        }

        const cached = await checkIdempotency(idempotencyKey, res);
        if (cached) return;

        let packInfo = {};
        try {
            packInfo = await verifyPackId(packId, req.authToken);
        } catch {
            packInfo = { packHash: packId, name: 'Unknown Medicine', batchNo: packId, status: 'Verified', trustScore: null };
        }

        const txnId  = generateTxnId('SELL');
        const isoKey = idempotencyKey || txnId;

        try {
            await recordSale({
                packHash:  packInfo.packHash || packId,
                shopId:    shopkeeperId,
                operatorId:shopkeeperId,
            });
        } catch (e) {
            console.warn(`[shopkeeper-service Txn] Blockchain sale record failed: ${e.message}`);
        }

        const txn = await Transaction.create({
            transactionId:  txnId,
            idempotencyKey: isoKey,
            shopkeeperId,
            packId,
            type:           'SELL',
            status:         'SOLD',
            customerPhone:  customerPhone || null,
            medicineId:     packInfo.medicineId || null,
            medicineName:   packInfo.name        || null,
            batchNo:        packInfo.batchNo     || null,
            expDate:        packInfo.expDate      ? new Date(packInfo.expDate) : null,
            manufacturer:   packInfo.manufacturer || null,
            scanStatus:     packInfo.status       || 'Verified',
            trustScore:     packInfo.trustScore   || null,
        });

        await PackEvent.create({
            shopkeeperId,
            packHash:    packInfo.packHash || packId,
            packId,
            batchId:     packInfo.batchNo  || packId,
            eventType:   'SALE',
            operatorId:  shopkeeperId,
            medicineName:packInfo.name    || null,
            batchNo:     packInfo.batchNo  || null,
            expDate:     packInfo.expDate   ? new Date(packInfo.expDate) : null,
            scanStatus:  packInfo.status    || 'Verified',
        }).catch(() => {});

        await Inventory.findOneAndUpdate(
            { shopkeeperId, batchId: packInfo.batchNo || packId },
            { $inc: { currentStock: -1 } },
        );

        return res.status(201).json({
            status:  'success',
            message: 'Medicine sale registered successfully.',
            data: {
                transactionId: txn.transactionId,
                packId,
                status:    'SOLD',
                timestamp: txn.createdAt,
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service Txn] sellController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── 3.3 Return Medicine ───────────────────────────────────────────────────────
export const returnController = async (req, res) => {
    try {
        const shopkeeperId   = req.user.id;
        const idempotencyKey = req.headers['idempotency-key'] || null;
        const { packId, reason } = req.body;

        const VALID_REASONS = ['CUSTOMER_RETURN', 'DAMAGED_PACKAGING', 'EXPIRED'];

        if (!packId || !reason) {
            return res.status(400).json({ status: 'error', message: 'packId and reason are required.' });
        }

        if (!VALID_REASONS.includes(reason)) {
            return res.status(422).json({
                status: 'error',
                message: `reason must be one of: ${VALID_REASONS.join(', ')}`,
            });
        }

        const cached = await checkIdempotency(idempotencyKey, res);
        if (cached) return;

        let packInfo = {};
        try {
            packInfo = await verifyPackId(packId, req.authToken);
        } catch {
            packInfo = { packHash: packId, name: 'Unknown Medicine', batchNo: packId, status: 'Verified', trustScore: null };
        }

        const txnId  = generateTxnId('RET');
        const isoKey = idempotencyKey || txnId;

        try {
            await recordReturn({
                packHash:  packInfo.packHash || packId,
                shopId:    shopkeeperId,
                operatorId:shopkeeperId,
                reason,
            });
        } catch (e) {
            console.warn(`[shopkeeper-service Txn] Blockchain return record failed: ${e.message}`);
        }

        const txn = await Transaction.create({
            transactionId:  txnId,
            idempotencyKey: isoKey,
            shopkeeperId,
            packId,
            type:           'RETURN',
            status:         'RETURNED',
            returnReason:   reason,
            medicineId:     packInfo.medicineId || null,
            medicineName:   packInfo.name        || null,
            batchNo:        packInfo.batchNo     || null,
            scanStatus:     packInfo.status       || 'Verified',
        });

        await PackEvent.create({
            shopkeeperId,
            packHash:    packInfo.packHash || packId,
            packId,
            batchId:     packInfo.batchNo  || packId,
            eventType:   'RETURN',
            operatorId:  shopkeeperId,
            medicineName:packInfo.name || null,
            scanStatus:  packInfo.status || 'Verified',
        }).catch(() => {});

        await Inventory.findOneAndUpdate(
            { shopkeeperId, batchId: packInfo.batchNo || packId },
            { $inc: { currentStock: 1 } },
        );

        return res.status(201).json({
            status:  'success',
            message: 'Medicine return registered successfully.',
            data: {
                transactionId: txn.transactionId,
                packId,
                status:    'RETURNED',
                timestamp: txn.createdAt,
            },
        });
    } catch (err) {
        console.error('[shopkeeper-service Txn] returnController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
