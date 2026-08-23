import { extractTokenAndHash } from '../utils/qrParser.util.js';
import { verifyToken, getPackStatus, recordIntake, recordSale } from '../services/coreClient.service.js';
import { getPublicBatchMetadata } from '../services/manufacturerClient.service.js';
import { PackEvent, Inventory } from '../models/inventory.model.js';

// ── Intake Scan — POST /api/shopkeeper/scan/intake ────────────────────────────
export const intakeScanController = async (req, res) => {
    try {
        const rawInput     = req.body.signedToken || req.body.qrData || req.body.token;
        const shopkeeperId = req.user.id;
        const operatorId   = req.user.id;

        if (!rawInput) {
            return res.status(400).json({ status: 'error', message: 'signedToken, qrData, or token is required.' });
        }

        const { token: signedToken, hash: scannedHash } = extractTokenAndHash(rawInput);

        // Tier 1: ES256 cryptographic signature
        const verifyResult = await verifyToken(signedToken);
        if (!verifyResult.valid) {
            return res.status(200).json({
                status:      'error',
                code:        'INVALID_SIGNATURE',
                message:     'Invalid QR code — cryptographic signature verification failed. Pack may be counterfeit.',
                scannedHash: scannedHash || null,
            });
        }

        const { payload, packHash } = verifyResult;
        const { batchId, expiryDate, manufacturerId, serial } = payload;

        // Expiry check
        if (expiryDate && new Date(expiryDate) < new Date()) {
            return res.status(400).json({
                status:  'error',
                code:    'EXPIRED',
                message: `Medicine expired on ${expiryDate}. Cannot intake expired stock.`,
            });
        }

        // Duplicate intake guard
        const alreadyIntaken = await PackEvent.exists({ packHash, eventType: 'INTAKE' });
        if (alreadyIntaken) {
            return res.status(409).json({
                status:  'error',
                code:    'DUPLICATE_INTAKE',
                message: 'This pack has already been received into inventory. Duplicate intake rejected.',
            });
        }

        // Fabric transition MINTED → AT_SHOP (non-fatal)
        await recordIntake({ packHash, shopId: shopkeeperId, operatorId, manufacturerId })
            .catch(err => console.warn(`[shopkeeper-service Scan] Fabric intake failed (non-fatal): ${err.message}`));

        // Fetch medicine name from manufacturer-service (not in JWT payload)
        const batchMeta    = await getPublicBatchMetadata(batchId);
        const medicineName = batchMeta?.medicineName || batchMeta?.batch?.medicineName || `Batch ${batchId}`;
        const expiryAsDate = expiryDate ? new Date(expiryDate) : null;

        // Write audit trail
        await PackEvent.create({
            shopkeeperId,
            packHash,
            packId:      packHash,
            batchId,
            eventType:   'INTAKE',
            operatorId,
            medicineName,
            batchNo:     batchId,
            expDate:     expiryAsDate,
            scanStatus:  'Verified',
            manufacturer: manufacturerId || null,
        });

        // Upsert inventory — $setOnInsert supplies all required fields on first insert
        await Inventory.findOneAndUpdate(
            { shopkeeperId, batchId },
            {
                $inc: { currentStock: 1 },
                $setOnInsert: {
                    shopkeeperId,
                    batchId,
                    medicineName,
                    expiryDate:  expiryAsDate,
                    manufacturer: manufacturerId || null,
                    status:      'AVAILABLE',
                },
            },
            { upsert: true, new: true },
        );

        console.log(`[shopkeeper-service Scan] Intake accepted — pack ${packHash} serial ${serial || '?'} → shop ${shopkeeperId}`);

        return res.status(200).json({
            status:  'success',
            message: 'Stock added successfully ✅',
            data:    { packHash, batchId, serial: serial || null, expiryDate, manufacturerId, medicineName },
        });
    } catch (err) {
        console.error('[shopkeeper-service Scan] intakeScanController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── Sale Scan — POST /api/shopkeeper/scan/sale ────────────────────────────────
export const saleScanController = async (req, res) => {
    try {
        const rawInput     = req.body.signedToken || req.body.qrData || req.body.token;
        const shopkeeperId = req.user.id;
        const operatorId   = req.user.id;

        if (!rawInput) {
            return res.status(400).json({ status: 'error', message: 'signedToken, qrData, or token is required.' });
        }

        const { token: signedToken, hash: scannedHash } = extractTokenAndHash(rawInput);

        // Tier 1: ES256 signature
        const verifyResult = await verifyToken(signedToken);
        if (!verifyResult.valid) {
            return res.status(200).json({
                status:      'error',
                code:        'INVALID_SIGNATURE',
                message:     'Invalid QR code — cryptographic signature failed. Do not sell.',
                scannedHash: scannedHash || null,
            });
        }

        const { payload, packHash } = verifyResult;
        const { batchId, expiryDate, serial } = payload;

        // Expiry before sale
        if (expiryDate && new Date(expiryDate) < new Date()) {
            return res.status(400).json({
                status:  'error',
                code:    'EXPIRED',
                message: `Medicine expired on ${expiryDate}. Sale blocked.`,
            });
        }

        // Tier 2: Fabric ledger state check
        const statusResult = await getPackStatus(packHash, batchId);
        const ledgerStatus = statusResult.status || statusResult.custodyState || 'NOT_FOUND';

        if (ledgerStatus === 'RECALLED' || ledgerStatus === 'Recalled') {
            return res.status(409).json({ status: 'error', code: 'RECALLED', message: 'CRITICAL: This batch has been recalled. Sale blocked.' });
        }
        if (ledgerStatus === 'SOLD' || ledgerStatus === 'Sold') {
            return res.status(409).json({ status: 'error', code: 'ALREADY_SOLD', message: 'This pack has already been sold. Possible duplicate or counterfeit.' });
        }
        if (ledgerStatus !== 'AT_SHOP' && ledgerStatus !== 'AtShop' && ledgerStatus !== 'NOT_FOUND') {
            return res.status(400).json({
                status:  'error',
                code:    'NOT_RECEIVED_AT_SHOP',
                message: `Pack cannot be sold — ledger status: ${ledgerStatus}. Complete intake scan first.`,
            });
        }

        // Fabric transition AT_SHOP → SOLD (non-fatal)
        await recordSale({ packHash, shopId: shopkeeperId, operatorId })
            .catch(err => console.warn(`[shopkeeper-service Scan] Fabric sale failed (non-fatal): ${err.message}`));

        // Write audit trail + decrement inventory
        await PackEvent.create({
            shopkeeperId,
            packHash,
            packId:    packHash,
            batchId,
            eventType: 'SOLD',
            operatorId,
            scanStatus: 'Verified',
        });

        await Inventory.findOneAndUpdate(
            { shopkeeperId, batchId },
            { $inc: { currentStock: -1 } },
        );

        console.log(`[shopkeeper-service Scan] Sale confirmed — pack ${packHash} serial ${serial || '?'} → shop ${shopkeeperId}`);

        return res.status(200).json({
            status:  'success',
            message: 'Sale confirmed — hand medicine to consumer 🛒',
            data:    { packHash, batchId, serial: serial || null, soldAt: new Date().toISOString() },
        });
    } catch (err) {
        console.error('[shopkeeper-service Scan] saleScanController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── Authenticated Medicine Scan — POST /api/medicine/scan ────────────────────
// Read-only verification for a logged-in shopkeeper (no SOLD transition committed).
export const authenticatedScanController = async (req, res) => {
    try {
        const rawInput = req.body.signedToken || req.body.qrData || req.body.token;
        if (!rawInput) {
            return res.status(400).json({ status: 'error', message: 'signedToken, qrData, or token is required.' });
        }

        const { token: signedToken, hash: scannedHash } = extractTokenAndHash(rawInput);

        const verifyResult = await verifyToken(signedToken);
        if (!verifyResult.valid) {
            return res.status(200).json({
                status:      'error',
                code:        'INVALID_SIGNATURE',
                message:     'Invalid QR — signature failed.',
                scannedHash: scannedHash || null,
            });
        }

        const { payload, packHash } = verifyResult;
        const { batchId, expiryDate } = payload;

        if (expiryDate && new Date(expiryDate) < new Date()) {
            return res.status(200).json({ status: 'error', code: 'EXPIRED', message: `Expired on ${expiryDate}.`, valid: true, payload });
        }

        const statusResult = await getPackStatus(packHash, batchId);
        const ledgerStatus = statusResult.status || 'NOT_FOUND';

        return res.status(200).json({
            status: 'success',
            valid:  true,
            packHash,
            payload,
            ledgerStatus,
            detail: statusResult.detail || null,
        });
    } catch (err) {
        console.error('[shopkeeper-service Scan] authenticatedScanController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── Public Customer Scan — POST /api/v1/scan/customer ─────────────────────────
// Public consumer verification endpoint exposed by shopkeeper service
export const customerScanController = async (req, res) => {
    try {
        const rawInput = req.body.signedToken || req.body.qrData || req.body.token;
        if (!rawInput) {
            return res.status(400).json({ status: 'error', message: 'signedToken, qrData, or token is required.' });
        }

        const { token: signedToken, hash: scannedHash } = extractTokenAndHash(rawInput);

        const verifyResult = await verifyToken(signedToken);
        if (!verifyResult.valid) {
            return res.status(200).json({
                status:      'error',
                code:        'INVALID_SIGNATURE',
                uiState:     'COUNTERFEIT',
                message:     'Invalid QR code — cryptographic signature failed. Do not consume.',
                scannedHash: scannedHash || null,
            });
        }

        const { payload, packHash } = verifyResult;
        const { batchId, expiryDate } = payload;

        if (expiryDate && new Date(expiryDate) < new Date()) {
            return res.status(200).json({
                status:  'error',
                code:    'EXPIRED',
                uiState: 'EXPIRED',
                message: `Medicine expired on ${expiryDate}.`,
                valid:   true,
                payload,
            });
        }

        const statusResult = await getPackStatus(packHash, batchId);
        const ledgerStatus = statusResult.status || 'NOT_FOUND';

        let uiState = 'GENUINE';
        if (ledgerStatus === 'Recalled' || ledgerStatus === 'RECALLED') uiState = 'RECALLED';
        else if (ledgerStatus === 'Sold' || ledgerStatus === 'SOLD') uiState = 'ALREADY_SOLD';
        else if (ledgerStatus === 'AtShop' || ledgerStatus === 'AT_SHOP') uiState = 'AT_SHOP';

        return res.status(200).json({
            status: 'success',
            valid:  true,
            uiState,
            packHash,
            payload,
            ledgerStatus,
            detail: statusResult.detail || null,
        });
    } catch (err) {
        console.error('[shopkeeper-service Scan] customerScanController:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

