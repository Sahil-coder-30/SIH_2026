import Batch, { MINT_STATUS } from '../models/batch.model.js';
import Pack from '../models/pack.model.js';
import { mintBatchViaPharmaCore, recallBatchViaPharmaCore } from '../services/coreClient.service.js';
import crypto from 'crypto';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_QUANTITY        = 100_000; // 1 lakh packs
const MIN_QUANTITY        = 1;
const PACK_INSERT_CHUNK   = 1_000;   // MongoDB insertMany in batches of 1k

// ── In-memory background job state ────────────────────────────────────────────
// Tracks active minting jobs so the server can accept new requests immediately
// and let the frontend poll for progress. V1 in-process store; V2 = Redis.
const _mintingJobs = new Map(); // batchId → { status, progress, error }

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generates the official PharmaChain System Batch ID.
 * Distinct prefix "PC-BATCH-" guarantees identification as a platform-generated standard ID.
 *
 * Format: PC-BATCH-{MFR_PREFIX6}-{YYYYMMDD}-{6_HEX_RANDOM}
 * Example: "PC-BATCH-CIPLA0-20260822-7D3A1F"
 *
 * @param {string} manufacturerId - e.g. "MFR_CIPLA_001"
 * @returns {string} The standardized PharmaChain System Batch ID.
 */
const generateSystemBatchId = (manufacturerId) => {
    const prefix  = manufacturerId.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randHex = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex characters
    return `PC-BATCH-${prefix}-${dateStr}-${randHex}`;
};

// ── BACKGROUND MINT JOB ───────────────────────────────────────────────────────

/**
 * Runs the actual minting in the background after the HTTP response is sent.
 *
 * Flow:
 *   1. Call pharma-core to sign all N packs (single scrypt + N EC signs)
 *   2. Receive { packs: [{serial, packHash, signedToken}] }
 *   3. Bulk-insert packs into MongoDB in chunks of 1000
 *   4. Update batch mintStatus → 'MINTED'
 */
const runMintJob = async (batchId, manufacturerId, expiryDate, totalQuantity) => {
    const job = { status: 'SIGNING', progress: 0, error: null };
    _mintingJobs.set(batchId, job);

    try {
        console.log(`[manufacturer-service Batch] 🚀 Background mint job started — ${batchId} (${totalQuantity} packs)`);

        // ── Step 1: Call pharma-core to sign all packs ─────────────────────────
        const mintResult = await mintBatchViaPharmaCore({
            batchId,
            manufacturerId,
            expiryDate,
            quantity: totalQuantity,
        });

        console.log(`[manufacturer-service Batch] pharma-core signed ${mintResult.totalPacks} packs for ${batchId}`);
        job.status = 'INSERTING';

        // ── Step 2: Bulk-insert packs into MongoDB in chunks of 1000 ──────────
        const packDocs = mintResult.packs.map((p) => ({
            batchId,
            serialNumber: p.serial,
            packHash:     p.packHash,
            signedToken:  p.signedToken,
        }));

        let inserted = 0;
        const totalChunks = Math.ceil(packDocs.length / PACK_INSERT_CHUNK);

        for (let i = 0; i < packDocs.length; i += PACK_INSERT_CHUNK) {
            const chunk    = packDocs.slice(i, i + PACK_INSERT_CHUNK);
            const chunkNum = Math.floor(i / PACK_INSERT_CHUNK) + 1;

            await Pack.insertMany(chunk, { ordered: false });
            inserted += chunk.length;

            const progress = Math.round((inserted / packDocs.length) * 100);
            job.progress   = progress;

            if (chunkNum % 10 === 0 || chunkNum === totalChunks) {
                await Batch.updateOne({ batchId }, { mintedPacksCount: inserted });
            }

            console.log(
                `[manufacturer-service Batch] Inserted chunk ${chunkNum}/${totalChunks}` +
                ` (${inserted}/${packDocs.length} packs, ${progress}%)`,
            );
        }

        // ── Step 3: Mark batch as fully minted ────────────────────────────────
        await Batch.updateOne({ batchId }, {
            mintStatus:       'MINTED',
            mintedPacksCount: inserted,
        });

        job.status   = 'DONE';
        job.progress = 100;

        console.log(
            `[manufacturer-service Batch] ✅ Mint job complete — ${batchId}` +
            ` | ${inserted} packs | blockchain: ${mintResult.backendSubmitted ? 'submitted' : 'deferred'}` +
            (mintResult.partialBlockchainSubmit ? ' (partial)' : ''),
        );
    } catch (err) {
        job.status = 'FAILED';
        job.error  = err.message;

        await Batch.updateOne({ batchId }, {
            mintStatus: 'PENDING', // Reset to PENDING so operator can retry
            mintError:  err.message,
        });

        console.error(`[manufacturer-service Batch] ❌ Mint job FAILED for ${batchId}:`, err.message);
    }
};

// ── CONTROLLERS ───────────────────────────────────────────────────────────────

/**
 * POST /api/manufacturer/batch
 *
 * Creates a new batch record with all medicine metadata (Tier 2 data).
 *
 * Identifiers handled:
 *   - systemBatchId / batchId: Standardized PharmaChain identifier (e.g. "PC-BATCH-CIPLA0-20260822-7D3A1F")
 *     generated automatically to guarantee global uniqueness across all manufacturers.
 *   - manufacturerBatchNumber: The manufacturer's internal / legacy printed batch number
 *     (e.g. "AUG-625-AUG26-001", "B.No. 40291") for backwards compatibility.
 */
export const createBatchController = async (req, res) => {
    try {
        const manufacturerId = req.user.id;

        // ── Required fields ─────────────────────────────────────────────────
        const { medicineName, manufacturingDate, expiryDate, totalQuantity } = req.body;

        if (!medicineName || !manufacturingDate || !expiryDate || totalQuantity == null) {
            return res.status(400).json({
                code:    'MISSING_FIELDS',
                message: 'medicineName, manufacturingDate, expiryDate, and totalQuantity are required',
            });
        }

        const qty = parseInt(totalQuantity, 10);
        if (isNaN(qty) || qty < MIN_QUANTITY || qty > MAX_QUANTITY) {
            return res.status(400).json({
                code:    'INVALID_QUANTITY',
                message: `totalQuantity must be between ${MIN_QUANTITY} and ${MAX_QUANTITY.toLocaleString()} (1 lakh)`,
            });
        }

        // ── Dual Batch ID Resolution ─────────────────────────────────────────
        // 1. Manufacturer's custom / legacy internal batch number (e.g. "AUG625-2026-01")
        const manufacturerBatchNumber = (
            req.body.manufacturerBatchNumber ||
            req.body.mfrBatchNumber ||
            req.body.legacyBatchId ||
            req.body.batchNumber ||
            req.body.customBatchId ||
            req.body.batchId ||
            null
        )?.toString().trim();

        // 2. Official PharmaChain System Batch ID (distinct "PC-BATCH-" prefix)
        // Always generated by our backend to guarantee network-wide uniqueness
        let systemBatchId = generateSystemBatchId(manufacturerId);

        // Ensure collision safety in the unlikely event of matching random hex
        let collisionCheck = await Batch.findOne({ systemBatchId });
        while (collisionCheck) {
            systemBatchId = generateSystemBatchId(manufacturerId);
            collisionCheck = await Batch.findOne({ systemBatchId });
        }

        const batchId = systemBatchId;

        // ── Destructure optional fields ─────────────────────────────────────
        const {
            genericName, brandName, therapeuticCategory, drugSchedule, pharmacopoeiaStandard,
            composition, dosage, strength, form, route, color, shape, coating,
            storageConditions, shelfLifeMonths,
            productionSite, productionSiteAddress, manufacturingLicenseNo,
            productionLineId, supervisorId, shiftCode, equipmentBatchId,
            packSize, packType, unitsPerCarton,
            cdscoApprovalNo, gstin, hsn, controlledSubstance, coldChainRequired, temperatureRange,
            qaOfficerId, qaApprovalDate, retestDate, coaReferenceNo,
            microbialTestStatus, dissolutionTestStatus, assayResult,
            internalBatchNotes, tags,
        } = req.body;

        const batch = await Batch.create({
            batchId,
            systemBatchId,
            manufacturerBatchNumber,
            manufacturerId,
            expiryDate,
            totalQuantity: qty,
            medicineName,
            manufacturingDate,
            genericName,
            brandName,
            therapeuticCategory,
            drugSchedule,
            pharmacopoeiaStandard,
            composition,
            dosage,
            strength,
            form,
            route,
            color,
            shape,
            coating,
            storageConditions,
            shelfLifeMonths,
            productionSite,
            productionSiteAddress,
            manufacturingLicenseNo,
            productionLineId,
            supervisorId,
            shiftCode,
            equipmentBatchId,
            packSize,
            packType,
            unitsPerCarton,
            cdscoApprovalNo,
            gstin,
            hsn,
            controlledSubstance,
            coldChainRequired,
            temperatureRange,
            qaOfficerId,
            qaApprovalDate,
            retestDate,
            coaReferenceNo,
            microbialTestStatus,
            dissolutionTestStatus,
            assayResult,
            internalBatchNotes,
            tags,
        });

        console.log(
            `[manufacturer-service Batch] Created batch: PharmaChain ID [${systemBatchId}] | ` +
            `Manufacturer Internal B.No [${manufacturerBatchNumber || 'N/A'}] | ` +
            `MFR: ${manufacturerId} | qty: ${qty}`,
        );

        return res.status(201).json({
            status: 'success',
            data: {
                systemBatchId:           batch.systemBatchId,
                batchId:                 batch.batchId,
                manufacturerBatchNumber: batch.manufacturerBatchNumber,
                manufacturerId:          batch.manufacturerId,
                medicineName:            batch.medicineName,
                totalQuantity:           batch.totalQuantity,
                mintStatus:              batch.mintStatus,
                createdAt:               batch.createdAt,
            },
            message: `Batch created. Official PharmaChain Batch ID: ${systemBatchId}. Call POST /batch/${systemBatchId}/mint to begin signing packs.`,
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] createBatchController error:', error.message);
        if (error.code === 11000) {
            return res.status(409).json({ code: 'BATCH_ID_EXISTS', message: 'Batch ID already exists in database' });
        }
        return res.status(500).json({ code: 'CREATE_ERROR', message: error.message });
    }
};

// ── LIST ──────────────────────────────────────────────────────────────────────

export const listBatchesController = async (req, res) => {
    try {
        const manufacturerId = req.user.id;
        const { status, tag, search, limit = 20, page = 1 } = req.query;

        const filter = { manufacturerId };
        if (status) filter.mintStatus = status.toUpperCase();
        if (tag)    filter.tags = tag.toUpperCase();

        // Search across systemBatchId, manufacturerBatchNumber, or medicineName
        if (search) {
            filter.$or = [
                { systemBatchId:           { $regex: search, $options: 'i' } },
                { batchId:                 { $regex: search, $options: 'i' } },
                { manufacturerBatchNumber: { $regex: search, $options: 'i' } },
                { medicineName:            { $regex: search, $options: 'i' } },
                { brandName:               { $regex: search, $options: 'i' } },
            ];
        }

        const skip    = (parseInt(page) - 1) * parseInt(limit);
        const total   = await Batch.countDocuments(filter);
        const batches = await Batch.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('-internalBatchNotes -supervisorId -shiftCode -equipmentBatchId -__v');

        return res.status(200).json({
            status: 'success',
            data:   batches,
            meta:   { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] listBatchesController error:', error.message);
        return res.status(500).json({ code: 'LIST_ERROR', message: error.message });
    }
};

// ── GET (private — all fields for the owning manufacturer) ────────────────────

export const getBatchController = async (req, res) => {
    try {
        const { batchId }      = req.params;
        const manufacturerId   = req.user.id;

        // Allow lookup by systemBatchId / batchId OR manufacturerBatchNumber
        const batch = await Batch.findOne({
            manufacturerId,
            $or: [
                { batchId },
                { systemBatchId: batchId },
                { manufacturerBatchNumber: batchId },
            ],
        });

        if (!batch) {
            return res.status(404).json({ code: 'BATCH_NOT_FOUND', message: `Batch ${batchId} not found` });
        }

        const job = _mintingJobs.get(batch.batchId);

        return res.status(200).json({
            status: 'success',
            data:   batch,
            ...(job && { mintProgress: job }),
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] getBatchController error:', error.message);
        return res.status(500).json({ code: 'GET_ERROR', message: error.message });
    }
};

// ── GET PUBLIC (no auth — called by consumer-service/shopkeeper after QR scan) ─

export const getPublicBatchDetailsController = async (req, res) => {
    try {
        const { batchId } = req.params;

        // Allow resolving by either PharmaChain systemBatchId OR legacy manufacturerBatchNumber
        const batch = await Batch.findOne({
            $or: [
                { batchId },
                { systemBatchId: batchId },
                { manufacturerBatchNumber: batchId },
            ],
        }).select(
            '-internalBatchNotes -supervisorId -shiftCode -equipmentBatchId' +
            ' -mintError -__v -mintedPacksCount',
        );

        if (!batch) {
            return res.status(404).json({ code: 'BATCH_NOT_FOUND', message: `No batch found for ID: ${batchId}` });
        }

        // Only expose publicly if batch has been minted
        if (batch.mintStatus === 'PENDING' || batch.mintStatus === 'MINTING') {
            return res.status(404).json({ code: 'BATCH_NOT_FOUND', message: `No batch found for ID: ${batchId}` });
        }

        return res.status(200).json({ status: 'success', data: batch });
    } catch (error) {
        console.error('[manufacturer-service Batch] getPublicBatchDetailsController error:', error.message);
        return res.status(500).json({ code: 'GET_ERROR', message: error.message });
    }
};

// ── MINT (async background job) ───────────────────────────────────────────────

export const mintBatchController = async (req, res) => {
    try {
        const { batchId }    = req.params;
        const manufacturerId = req.user.id;

        // Allow mint trigger by either systemBatchId or manufacturerBatchNumber
        const batch = await Batch.findOne({
            manufacturerId,
            $or: [
                { batchId },
                { systemBatchId: batchId },
                { manufacturerBatchNumber: batchId },
            ],
        });

        if (!batch) {
            return res.status(404).json({ code: 'BATCH_NOT_FOUND', message: `Batch ${batchId} not found` });
        }

        if (batch.mintStatus !== 'PENDING') {
            return res.status(409).json({
                code:    'INVALID_MINT_STATE',
                message: `Batch is already in status: ${batch.mintStatus}. Only PENDING batches can be minted.`,
                data:    { currentStatus: batch.mintStatus },
            });
        }

        if (_mintingJobs.has(batch.batchId)) {
            const job = _mintingJobs.get(batch.batchId);
            return res.status(409).json({
                code:        'MINT_ALREADY_RUNNING',
                message:     'A minting job is already in progress for this batch',
                mintProgress: job,
            });
        }

        // ── Mark as MINTING and respond immediately ────────────────────────────
        await Batch.updateOne({ batchId: batch.batchId }, { mintStatus: 'MINTING', mintError: null });

        // Kick off background job using the canonical systemBatchId
        runMintJob(
            batch.batchId,
            manufacturerId,
            batch.expiryDate.toISOString().split('T')[0],
            batch.totalQuantity,
        );

        return res.status(202).json({
            status:  'accepted',
            message: `Minting job started for ${batch.totalQuantity.toLocaleString()} packs. Poll GET /batch/${batch.batchId} for progress.`,
            data: {
                systemBatchId:           batch.systemBatchId,
                batchId:                 batch.batchId,
                manufacturerBatchNumber: batch.manufacturerBatchNumber,
                totalQuantity:           batch.totalQuantity,
                mintStatus:              'MINTING',
                pollUrl:                 `/api/manufacturer/batch/${batch.batchId}`,
            },
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] mintBatchController error:', error.message);
        return res.status(500).json({ code: 'MINT_ERROR', message: error.message });
    }
};

// ── RECALL ────────────────────────────────────────────────────────────────────

export const recallBatchController = async (req, res) => {
    try {
        const { batchId }    = req.params;
        const { reason }     = req.body;
        const manufacturerId = req.user.id;

        if (!reason) {
            return res.status(400).json({ code: 'MISSING_FIELDS', message: 'reason is required for batch recall' });
        }

        const batch = await Batch.findOne({
            manufacturerId,
            $or: [
                { batchId },
                { systemBatchId: batchId },
                { manufacturerBatchNumber: batchId },
            ],
        });

        if (!batch) {
            return res.status(404).json({ code: 'BATCH_NOT_FOUND', message: `Batch ${batchId} not found` });
        }

        if (batch.mintStatus === 'RECALLED') {
            return res.status(409).json({ code: 'ALREADY_RECALLED', message: 'Batch is already recalled' });
        }

        if (batch.mintStatus !== 'MINTED') {
            return res.status(400).json({
                code:    'INVALID_RECALL_STATE',
                message: `Only MINTED batches can be recalled. Current status: ${batch.mintStatus}`,
            });
        }

        await Batch.updateOne({ batchId: batch.batchId }, { mintStatus: 'RECALLED', recallReason: reason });
        await recallBatchViaPharmaCore({ batchId: batch.batchId, manufacturerId, reason });

        console.log(`[manufacturer-service Batch] Recall initiated for batch ${batch.batchId}: ${reason}`);

        return res.status(200).json({
            status:  'success',
            message: 'Batch recalled across entire supply chain. All future QR scans will return RECALLED status.',
            data: {
                systemBatchId:           batch.systemBatchId,
                batchId:                 batch.batchId,
                manufacturerBatchNumber: batch.manufacturerBatchNumber,
                reason,
            },
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] recallBatchController error:', error.message);
        return res.status(500).json({ code: 'RECALL_ERROR', message: error.message });
    }
};

// ── EXPORT CSV (Packs, Boxes, Master Cartons) ─────────────────────────────────

/**
 * GET /api/manufacturer/batch/:batchId/export/csv
 *
 * Streams a formatted CSV file containing QR data for factory packaging laser/inkjet printers.
 *
 * Query parameters:
 *   - type: 'packs' (default) | 'boxes' | 'cartons'
 *
 * Streamed CSV Columns:
 *   - packs:   serialNumber, packHash, signedToken, verifyUrl, systemBatchId, manufacturerBatchNumber, medicineName, expiryDate
 *   - boxes:   boxNumber, boxId, startSerial, endSerial, packCount, systemBatchId, manufacturerBatchNumber, medicineName
 *   - cartons: cartonNumber, cartonId, startBox, endBox, startSerial, endSerial, totalPacks, systemBatchId, medicineName
 */
export const exportBatchCsvController = async (req, res) => {
    try {
        const { batchId }      = req.params;
        const { type = 'packs' } = req.query;
        const manufacturerId   = req.user.id;

        const batch = await Batch.findOne({
            manufacturerId,
            $or: [
                { batchId },
                { systemBatchId: batchId },
                { manufacturerBatchNumber: batchId },
            ],
        });

        if (!batch) {
            return res.status(404).json({ code: 'BATCH_NOT_FOUND', message: `Batch ${batchId} not found` });
        }

        if (batch.mintStatus !== 'MINTED') {
            return res.status(400).json({
                code:    'BATCH_NOT_MINTED',
                message: `Cannot export QR CSV: Batch is currently in "${batch.mintStatus}" status. Batch must be MINTED first.`,
            });
        }

        const mfrBNo       = batch.manufacturerBatchNumber || 'NA';
        const sysBatchId   = batch.systemBatchId || batch.batchId;
        const medNameClean = (batch.medicineName || 'MED').replace(/[^a-zA-Z0-9_-]/g, '_');
        const expDateStr   = batch.expiryDate ? batch.expiryDate.toISOString().split('T')[0] : '';
        const packSize     = batch.packSize || 10;                     // default 10 strips per box
        const unitsPerBox  = batch.unitsPerCarton || 100;              // default 100 boxes per carton
        const packsPerCarton = packSize * unitsPerBox;                 // 10 * 100 = 1,000 packs per carton

        const exportType = type.toLowerCase();

        // ── 1. EXPORT BOXES CSV ───────────────────────────────────────────────
        if (exportType === 'boxes') {
            const totalBoxes = Math.ceil(batch.totalQuantity / packSize);
            const filename   = `${sysBatchId}_BOXES_${totalBoxes}.csv`;

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            res.write('boxNumber,boxId,verifyUrl,startSerial,endSerial,packCount,systemBatchId,manufacturerBatchNumber,medicineName,expiryDate\n');

            for (let b = 1; b <= totalBoxes; b++) {
                const boxNum     = String(b).padStart(4, '0');
                const boxId      = `BOX-${sysBatchId}-${boxNum}`;
                const startIdx   = (b - 1) * packSize + 1;
                const endIdx     = Math.min(b * packSize, batch.totalQuantity);
                const startSerial= String(startIdx).padStart(5, '0');
                const endSerial  = String(endIdx).padStart(5, '0');
                const count      = endIdx - startIdx + 1;
                const boxUrl     = `https://pharmachain.gov.in/verify/box/${boxId}`;

                res.write(`"${boxNum}","${boxId}","${boxUrl}","${startSerial}","${endSerial}",${count},"${sysBatchId}","${mfrBNo}","${medNameClean}","${expDateStr}"\n`);
            }

            return res.end();
        }

        // ── 2. EXPORT MASTER CARTONS CSV ──────────────────────────────────────
        if (exportType === 'cartons') {
            const totalCartons = Math.ceil(batch.totalQuantity / packsPerCarton);
            const filename     = `${sysBatchId}_CARTONS_${totalCartons}.csv`;

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            res.write('cartonNumber,cartonId,verifyUrl,startBox,endBox,startSerial,endSerial,totalPacks,systemBatchId,manufacturerBatchNumber,medicineName,expiryDate\n');

            for (let c = 1; c <= totalCartons; c++) {
                const cartonNum    = String(c).padStart(4, '0');
                const cartonId     = `CARTON-${sysBatchId}-${cartonNum}`;
                const startBoxNum  = (c - 1) * unitsPerBox + 1;
                const endBoxNum    = Math.min(c * unitsPerBox, Math.ceil(batch.totalQuantity / packSize));
                const startSerial  = String((c - 1) * packsPerCarton + 1).padStart(5, '0');
                const endSerial    = String(Math.min(c * packsPerCarton, batch.totalQuantity)).padStart(5, '0');
                const packCount    = Math.min(c * packsPerCarton, batch.totalQuantity) - ((c - 1) * packsPerCarton);
                const cartonUrl    = `https://pharmachain.gov.in/verify/carton/${cartonId}`;

                res.write(`"${cartonNum}","${cartonId}","${cartonUrl}","BOX-${String(startBoxNum).padStart(4, '0')}","BOX-${String(endBoxNum).padStart(4, '0')}","${startSerial}","${endSerial}",${packCount},"${sysBatchId}","${mfrBNo}","${medNameClean}","${expDateStr}"\n`);
            }

            return res.end();
        }

        // ── 3. EXPORT INDIVIDUAL PACKS CSV (Default) ──────────────────────────
        // Streams cursor from MongoDB to handle up to 1 lakh packs with minimal memory usage
        const filename = `${sysBatchId}_PACKS_${batch.totalQuantity}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.write('serialNumber,packHash,signedToken,verifyUrl,systemBatchId,manufacturerBatchNumber,medicineName,expiryDate\n');

        const cursor = Pack.find({ batchId: batch.batchId })
            .sort({ serialNumber: 1 })
            .cursor();

        for await (const pack of cursor) {
            // URL contains the complete hash in the path AND the token in query params.
            // When scanned by a phone camera -> Opens web verification.
            // When scanned by our mobile app  -> Mobile app extracts hash directly from URL path!
            const verifyUrl = `https://pharmachain.gov.in/verify/${pack.packHash}?token=${pack.signedToken}`;
            res.write(`"${pack.serialNumber}","${pack.packHash}","${pack.signedToken}","${verifyUrl}","${sysBatchId}","${mfrBNo}","${medNameClean}","${expDateStr}"\n`);
        }

        return res.end();
    } catch (error) {
        console.error('[manufacturer-service Batch] exportBatchCsvController error:', error.message);
        if (!res.headersSent) {
            return res.status(500).json({ code: 'EXPORT_ERROR', message: error.message });
        }
        res.end();
    }
};

// ── BATCH PACKS BROWSER (Per-Batch Table View) ────────────────────────────────

/**
 * GET /api/manufacturer/batch/:batchId/packs
 *
 * Returns paginated packs for a specific batch (for the Batch Detail drill-down table).
 * Query parameters:
 *   - page: number (default: 1)
 *   - limit: number (default: 50, max: 200)
 *   - search: string (optional serial or hash filter)
 */
export const listBatchPacksController = async (req, res) => {
    try {
        const { batchId }                      = req.params;
        const { page = 1, limit = 50, search } = req.query;
        const manufacturerId                   = req.user.id;

        const batch = await Batch.findOne({
            manufacturerId,
            $or: [
                { batchId },
                { systemBatchId: batchId },
                { manufacturerBatchNumber: batchId },
            ],
        });

        if (!batch) {
            return res.status(404).json({ code: 'BATCH_NOT_FOUND', message: `Batch ${batchId} not found` });
        }

        const filter = { batchId: batch.batchId };

        if (search) {
            const cleanSearch = search.trim();
            filter.$or = [
                { serialNumber: cleanSearch },
                { packHash:     { $regex: cleanSearch, $options: 'i' } },
            ];
        }

        const pageNum  = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
        const skip     = (pageNum - 1) * limitNum;

        const total = await Pack.countDocuments(filter);
        const packs = await Pack.find(filter)
            .sort({ serialNumber: 1 })
            .skip(skip)
            .limit(limitNum);

        return res.status(200).json({
            status: 'success',
            data: packs.map((p) => ({
                serialNumber: p.serialNumber,
                packHash:     p.packHash,
                verifyUrl:    `https://pharmachain.gov.in/verify/${p.packHash}?token=${p.signedToken}`,
                createdAt:    p.createdAt,
            })),
            meta: {
                total,
                page:  pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
                batch: {
                    batchId:                 batch.batchId,
                    systemBatchId:           batch.systemBatchId,
                    manufacturerBatchNumber: batch.manufacturerBatchNumber,
                    medicineName:            batch.medicineName,
                    mintStatus:              batch.mintStatus,
                },
            },
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] listBatchPacksController error:', error.message);
        return res.status(500).json({ code: 'PACK_LIST_ERROR', message: error.message });
    }
};

// ── GLOBAL PACK SEARCH (Universal Header Search) ──────────────────────────────

/**
 * GET /api/manufacturer/batch/pack/lookup/:identifier
 *
 * Universal global search across ALL batches for this manufacturer.
 * Accepts:
 *   - 64-character packHash
 *   - Raw JWT signedToken
 *   - Full verify URL ("https://pharmachain.gov.in/verify/:packHash?token=...")
 */
export const lookupPackGlobalController = async (req, res) => {
    try {
        const { identifier } = req.params;
        const manufacturerId = req.user.id;

        if (!identifier) {
            return res.status(400).json({ code: 'MISSING_IDENTIFIER', message: 'identifier is required' });
        }

        let rawSearch = decodeURIComponent(identifier).trim();
        let targetHash = rawSearch;

        // If user pasted a full verify URL, extract the packHash from path
        if (rawSearch.includes('/verify/')) {
            const afterVerify = rawSearch.split('/verify/')[1];
            if (afterVerify) {
                targetHash = afterVerify.split('?')[0].split('/')[0];
            }
        }

        // Find pack by hash or signedToken
        let pack = await Pack.findOne({
            $or: [
                { packHash: targetHash },
                { signedToken: rawSearch },
            ],
        });

        if (!pack) {
            return res.status(404).json({
                code: 'PACK_NOT_FOUND',
                message: `No pack found matching identifier: ${targetHash}`,
            });
        }

        // Verify this pack belongs to a batch owned by this manufacturer
        const batch = await Batch.findOne({ batchId: pack.batchId, manufacturerId });
        if (!batch) {
            return res.status(403).json({
                code: 'UNAUTHORIZED_PACK',
                message: 'This pack does not belong to your manufacturing account',
            });
        }

        return res.status(200).json({
            status: 'success',
            data: {
                pack: {
                    serialNumber: pack.serialNumber,
                    packHash:     pack.packHash,
                    verifyUrl:    `https://pharmachain.gov.in/verify/${pack.packHash}?token=${pack.signedToken}`,
                    createdAt:    pack.createdAt,
                },
                batch: {
                    batchId:                 batch.batchId,
                    systemBatchId:           batch.systemBatchId,
                    manufacturerBatchNumber: batch.manufacturerBatchNumber,
                    medicineName:            batch.medicineName,
                    genericName:             batch.genericName,
                    dosage:                  batch.dosage,
                    expiryDate:              batch.expiryDate,
                    manufacturingDate:       batch.manufacturingDate,
                    productionSite:          batch.productionSite,
                    manufacturingLicenseNo:  batch.manufacturingLicenseNo,
                    mintStatus:              batch.mintStatus,
                    totalQuantity:           batch.totalQuantity,
                },
            },
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] lookupPackGlobalController error:', error.message);
        return res.status(500).json({ code: 'PACK_LOOKUP_ERROR', message: error.message });
    }
};
