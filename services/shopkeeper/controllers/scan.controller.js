import { verifyToken, getPackStatus, recordIntake, recordSale } from '../services/coreClient.service.js';
import { PackEvent, Inventory, EVENT_TYPE } from '../models/inventory.model.js';

// ── URL & Token Parser Helper ──────────────────────────────────────────────────
const extractTokenAndHash = (input) => {
    if (!input || typeof input !== 'string') return { token: '', hash: '' };
    
    const raw = input.trim();
    let token = raw;
    let hash  = '';

    if (raw.includes('/verify/')) {
        const afterVerify = raw.split('/verify/')[1];
        if (afterVerify) {
            hash = afterVerify.split('?')[0].split('/')[0];
        }
    }

    if (raw.includes('token=')) {
        try {
            const urlObj = new URL(raw.startsWith('http') ? raw : `https://pharmachain.gov.in/${raw}`);
            token = urlObj.searchParams.get('token') || raw;
        } catch {
            const match = raw.match(/[?&]token=([^&]+)/);
            if (match && match[1]) token = decodeURIComponent(match[1]);
        }
    }

    return { token, hash };
};

// ── Controllers ───────────────────────────────────────────────────────────────

export const intakeScanController = async (req, res) => {
    try {
        const rawInput = req.body.signedToken || req.body.qrData || req.body.token;
        const shopkeeperId = req.user.id;
        const operatorId   = req.user.id;

        if (!rawInput) {
            return res.status(400).json({ status: 'error', message: 'signedToken or qrData is required' });
        }

        const { token: signedToken, hash: scannedHash } = extractTokenAndHash(rawInput);

        // ── Tier 1: Cryptographic signature verification ───────────────────────
        const verifyResult = await verifyToken(signedToken);
        if (!verifyResult.valid) {
            return res.status(400).json({
                status: 'error',
                code: 'INVALID_SIGNATURE',
                message: 'Invalid QR code — cryptographic signature verification failed',
                scannedHash: scannedHash || null,
            });
        }

        const { payload, packHash } = verifyResult;
        const { batchId, expiryDate, manufacturerId, medicineName, batchNo } = payload;

        if (new Date(expiryDate) < new Date()) {
            return res.status(400).json({
                success: false,
                error: { code: 'EXPIRED', message: `Medicine expired on ${expiryDate}` },
            });
        }

        const alreadyIntaken = await PackEvent.exists({ shopkeeperId, packHash, eventType: 'INTAKE' });
        if (alreadyIntaken) {
            return res.status(409).json({
                success: false,
                error: { code: 'DUPLICATE_INTAKE', message: 'This pack has already been received into your inventory.' },
            });
        }

        await recordIntake({ packHash, shopId: shopkeeperId, operatorId, manufacturerId });
        await PackEvent.create({ shopkeeperId, packHash, packId: packHash, batchId, eventType: 'INTAKE', operatorId, medicineName, batchNo, expDate: expiryDate ? new Date(expiryDate) : null, scanStatus: 'Verified' });
        await Inventory.findOneAndUpdate(
            { shopkeeperId, batchId },
            {
                $inc: { packCount: 1 },
                $setOnInsert: { shopkeeperId, batchId },
            },
            { upsert: true, new: true },
        );

        console.log(`[shopkeeper-service Scan] Intake accepted — pack ${packHash} at shop ${shopkeeperId}`);

        return res.status(200).json({
            success: true,
            code:    'ACCEPTED',
            message: 'Stock added successfully',
            data:    { packHash, batchId, expiryDate, manufacturerId },
        });
    } catch (err) {
        console.error('[shopkeeper-service Scan] intakeScanController:', err.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
};

// ── (Existing) Sale Scan ─────────────────────────────────────────────────────
export const saleScanController = async (req, res) => {
    try {
        const rawInput = req.body.signedToken || req.body.qrData || req.body.token;
        const shopkeeperId = req.user.id;
        const operatorId = req.user.id;

        if (!rawInput) {
            return res.status(400).json({ status: 'error', message: 'signedToken or qrData is required' });
        }

        const { token: signedToken, hash: scannedHash } = extractTokenAndHash(rawInput);

        // ── Tier 1: Cryptographic signature verification ───────────────────────
        const verifyResult = await verifyToken(signedToken);
        if (!verifyResult.valid) {
            return res.status(400).json({
                status: 'error',
                code: 'INVALID_SIGNATURE',
                message: 'Invalid QR code — cryptographic signature verification failed',
                scannedHash: scannedHash || null,
            });
        }

        const { payload, packHash } = verifyResult;
        const { batchId, expiryDate } = payload;

        const statusResult = await getPackStatus(packHash, batchId);
        const { status }   = statusResult;

        if (status === 'Recalled') {
            return res.status(409).json({ success: false, error: { code: 'RECALLED', message: 'CRITICAL: This batch has been recalled. Do not sell.' } });
        }
        if (status === 'Sold') {
            return res.status(409).json({ success: false, error: { code: 'ALREADY_SOLD', message: 'This pack has already been sold.' } });
        }
        if (status !== 'AtShop') {
            return res.status(400).json({ success: false, error: { code: 'PACK_NOT_AT_SHOP', message: `Pack cannot be sold — current status: ${status}. Complete intake scan first.` } });
        }

        await recordSale({ packHash, shopId: shopkeeperId, operatorId });

        // ── Persist sale event and decrement inventory ────────────────────────
        await PackEvent.create({ shopkeeperId, packHash, batchId, eventType: 'SOLD', operatorId });

        await Inventory.findOneAndUpdate(
            { shopkeeperId, batchId },
            { $inc: { currentStock: -1 } },
        );

        console.log(`[shopkeeper-service Scan] Sale confirmed — pack ${packHash} at shop ${shopkeeperId}`);

        return res.status(200).json({
            success: true,
            code:    'SOLD',
            message: 'Sale confirmed — hand medicine to consumer',
            data:    { packHash, batchId, soldAt: new Date().toISOString() },
        });
    } catch (err) {
        console.error('[shopkeeper-service Scan] saleScanController:', err.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
};
