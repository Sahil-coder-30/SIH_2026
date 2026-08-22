import { extractTokenAndHash } from '../utils/qrParser.util.js';
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
        const parsed = parseQrInput(req.body);
        if (!parsed) {
            return res.status(400).json({ status: 'error', message: 'signedToken, qrData, or verifyUrl is required.' });
        }

        const shopkeeperId = req.user.id;
        const operatorId   = req.user.id;
        const { signedToken } = parsed;

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
        const { batchId, expiryDate, manufacturerId, serial } = payload;

        // ── Step 2: Expiry check
        if (new Date(expiryDate) < new Date()) {
            return res.status(400).json({ status: 'error', message: `Medicine expired on ${expiryDate}. Cannot intake expired stock.` });
        }

        // ── Step 3: Duplicate Intake Guard (local DB)
        const alreadyIntaken = await PackEvent.exists({ packHash, eventType: 'INTAKE' });
        if (alreadyIntaken) {
            return res.status(409).json({
                status: 'error',
                code:   'DUPLICATE_INTAKE',
                message: 'This pack has already been received into inventory (possibly at another shop). Duplicate intake rejected.',
            });
        }

        // ── Step 4: Record INTAKE transition (MINTED → AT_SHOP) on Fabric
        await recordIntake({ packHash, shopId: shopkeeperId, operatorId, manufacturerId });

        // ── Step 5: Record local audit trail + upsert inventory
        const batchMeta = await getPublicBatchMetadata(batchId).catch(() => null);
        const medicineName = batchMeta?.medicineName || payload.medicineName || `Batch ${batchId}`;

        await PackEvent.create({
            shopkeeperId, packHash, packId: packHash, batchId,
            eventType: 'INTAKE', operatorId,
            medicineName, batchNo: batchId, expDate: new Date(expiryDate),
            scanStatus: 'Verified',
        });

        await Inventory.findOneAndUpdate(
            { shopkeeperId, batchId },
            {
                $inc: { packCount: 1 },
                $setOnInsert: { shopkeeperId, batchId },
            },
            { upsert: true, new: true },
        );

        console.log(`[shopkeeper-service Scan] Intake accepted — pack ${packHash} serial ${serial} at shop ${shopkeeperId}`);

        return res.status(200).json({
            status:  'success',
            message: 'Stock added successfully ✅',
            data:    { packHash, batchId, serial, expiryDate, manufacturerId, medicineName },
        });
    } catch (err) {
        console.error('[shopkeeper-service Scan] intakeScanController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── Sale Scan — POST /api/shopkeeper/scan/sale ────────────────────────────────
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
        const { batchId, serial } = payload;

        // ── Step 2: Strict custody enforcement — check ledger state
        const statusResult = await getPackStatus(packHash, batchId);
        const ledgerStatus = statusResult.status;

        if (ledgerStatus === 'RECALLED' || ledgerStatus === 'Recalled') {
            return res.status(409).json({
                status: 'error',
                code:   'RECALLED',
                message: 'CRITICAL: This batch has been recalled by the manufacturer. Sale blocked.',
            });
        }
        if (ledgerStatus === 'SOLD' || ledgerStatus === 'Sold') {
            return res.status(409).json({
                status: 'error',
                code:   'ALREADY_SOLD',
                message: 'This pack has already been sold. Possible duplicate or counterfeit.',
            });
        }
        if (ledgerStatus !== 'AT_SHOP' && ledgerStatus !== 'AtShop') {
            return res.status(400).json({
                status: 'error',
                code:   'NOT_RECEIVED_AT_SHOP',
                message: `Pack cannot be sold — current ledger status: ${ledgerStatus}. Complete intake scan first.`,
            });
        }

        // ── Step 3: Record SALE transition (AT_SHOP → SOLD) on Fabric
        await recordSale({ packHash, shopId: shopkeeperId, operatorId });

        // ── Persist sale event and decrement inventory ────────────────────────
        await PackEvent.create({ shopkeeperId, packHash, batchId, eventType: 'SOLD', operatorId });

        await Inventory.findOneAndUpdate(
            { shopkeeperId, batchId },
            { $inc: { currentStock: -1 } },
        );

        console.log(`[shopkeeper-service Scan] Sale confirmed — pack ${packHash} serial ${serial} at shop ${shopkeeperId}`);

        return res.status(200).json({
            status:  'success',
            message: 'Sale confirmed — hand medicine to consumer 🛒',
            data:    { packHash, batchId, serial, soldAt: new Date().toISOString() },
        });
    } catch (err) {
        console.error('[shopkeeper-service Scan] saleScanController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
