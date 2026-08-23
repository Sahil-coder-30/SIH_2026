import Batch, { MINT_STATUS } from '../models/batch.model.js';
import { mintBatchViaPharmaCore, recallBatchViaPharmaCore, fetchBatchPreviewViaPharmaCore } from '../services/coreClient.service.js';
import crypto from 'crypto';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_QUANTITY = 100_000; // 1 lakh packs
const MIN_QUANTITY = 1;
// NOTE: Pack MongoDB collection is no longer used.
// pharma-core streams the signed CSV directly to AWS S3 and returns only a pre-signed download URL.
// manufacturer-service stores only { s3FileKey, s3DownloadUrl, s3UrlExpiresAt } on the Batch document.

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
 * Runs the S3 pipeline minting job in the background after the HTTP 202 is sent.
 *
 * S3 Pipeline Flow:
 *   1. Call pharma-core POST /core/batch/mint
 *      → pharma-core signs all N JWTs in memory (1 scrypt + N EC signs)
 *      → pharma-core builds CSV in one pass
 *      → pharma-core streams CSV to AWS S3 (or local fallback in dev)
 *      → pharma-core generates pre-signed download URL
 *      → pharma-core commits MINTED transitions to Hyperledger Fabric
 *   2. Receive lightweight response: { totalPacks, s3DownloadUrl, s3FileKey, s3UrlExpiresAt, s3Mode }
 *   3. Save S3 fields on Batch document — no Pack documents are created
 *
 * @param {string} batchId
 * @param {string} manufacturerId
 * @param {string} expiryDate
 * @param {number} totalQuantity
 * @param {string} medicineName    - Passed to pharma-core for CSV metadata
 */
const runMintJob = async (batchId, manufacturerId, expiryDate, totalQuantity, medicineName) => {
    const job = { status: 'SIGNING', progress: 0, error: null };
    _mintingJobs.set(batchId, job);

    try {
        console.log(
            `[manufacturer-service Batch] 🚀 S3 Pipeline mint job started — ` +
            `${batchId} (${totalQuantity} packs)`,
        );

        // ── Step 1: Call pharma-core — sign, build CSV, upload to S3 ──────────
        // pharma-core returns only the S3 artifact metadata, never the raw packs array.
        // This keeps the inter-service HTTP payload at ~200 bytes regardless of batch size.
        const mintResult = await mintBatchViaPharmaCore({
            batchId,
            manufacturerId,
            expiryDate,
            quantity:    totalQuantity,
            medicineName,
        });

        job.status   = 'UPLOADING';
        job.progress = 90;

        console.log(
            `[manufacturer-service Batch] pharma-core completed mint for ${batchId}:` +
            ` ${mintResult.totalPacks} packs | s3Mode: ${mintResult.s3Mode}` +
            ` | blockchain: ${mintResult.backendSubmitted ? 'submitted' : 'deferred'}`,
        );

        // ── Step 2: Persist S3 artifact metadata on Batch document ────────────
        // This is the ONLY database write for the entire minting flow.
        // No Pack documents are inserted. MongoDB stays lean.
        await Batch.updateOne({ batchId }, {
            mintStatus:       'MINTED',
            mintedPacksCount: mintResult.totalPacks,
            s3FileKey:        mintResult.s3FileKey,
            s3DownloadUrl:    mintResult.s3DownloadUrl,
            s3UrlExpiresAt:   mintResult.s3UrlExpiresAt || null,
            s3Mode:           mintResult.s3Mode,
            mintError:        null,
        });

        job.status   = 'DONE';
        job.progress = 100;

        console.log(
            `[manufacturer-service Batch] ✅ S3 Mint complete — ${batchId}` +
            ` | ${mintResult.totalPacks} packs | ${mintResult.s3Mode === 'aws' ? '☁️  S3' : '💾 local'}` +
            ` | blockchain: ${mintResult.backendSubmitted ? 'submitted' : 'deferred'}` +
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
        const medicineName       = req.body.medicineName;
        const manufacturingDate  = req.body.manufacturingDate || new Date().toISOString().split('T')[0];
        const expiryDate         = req.body.expiryDate;
        const rawQty             = req.body.totalQuantity != null ? req.body.totalQuantity : req.body.quantity;

        if (!medicineName || !expiryDate || rawQty == null) {
            return res.status(400).json({
                code:    'MISSING_FIELDS',
                message: 'medicineName, expiryDate, and totalQuantity (or quantity) are required',
            });
        }

        const totalQuantity = rawQty;


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

        // Kick off S3 pipeline background job using the canonical systemBatchId
        runMintJob(
            batch.batchId,
            manufacturerId,
            batch.expiryDate.toISOString().split('T')[0],
            batch.totalQuantity,
            batch.medicineName,
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

        // ── 3. EXPORT INDIVIDUAL PACKS CSV (Default) ─────────────────────────
        // S3 Pipeline: Individual pack records are no longer stored in MongoDB.
        // pharma-core uploaded the signed CSV directly to S3 during minting.
        // We redirect the factory operator (or dashboard) to the pre-signed S3 download URL.
        if (!batch.s3DownloadUrl) {
            return res.status(404).json({
                code:    'CSV_NOT_AVAILABLE',
                message: `Pack CSV is not yet available for batch ${batchId}. ` +
                         `Ensure the batch has been minted (current status: ${batch.mintStatus}).`,
            });
        }

        // Log the redirect for audit trail
        console.log(
            `[manufacturer-service Batch] CSV export redirect — ${sysBatchId}` +
            ` → ${batch.s3Mode === 'aws' ? '☁️ S3' : '💾 local'}: ${batch.s3DownloadUrl.slice(0, 80)}...`,
        );

        // 302 Redirect: browser / printer / curl will follow this to the S3 pre-signed URL
        // or to http://localhost:4000/core/export/:batchId in local dev mode.
        return res.redirect(302, batch.s3DownloadUrl);
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
 * S3 Pipeline: Individual pack records are no longer stored in MongoDB.
 * pharma-core uploads the complete signed CSV directly to S3 during minting.
 * This endpoint returns the batch S3 download URL for factory operators to retrieve all packs.
 *
 * For a paginated in-dashboard pack browser, the UI should parse the CSV from S3.
 */
export const listBatchPacksController = async (req, res) => {
    try {
        const { batchId }    = req.params;
        const manufacturerId = req.user.id;

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

        return res.status(200).json({
            status:  'success',
            message: 'Individual pack records are stored in S3 as a signed CSV (not in MongoDB). ' +
                     'Download the full pack CSV using the s3DownloadUrl below.',
            data: {
                batchId:                 batch.batchId,
                systemBatchId:           batch.systemBatchId,
                manufacturerBatchNumber: batch.manufacturerBatchNumber,
                medicineName:            batch.medicineName,
                mintStatus:              batch.mintStatus,
                totalQuantity:           batch.totalQuantity,
                mintedPacksCount:        batch.mintedPacksCount,
                s3DownloadUrl:           batch.s3DownloadUrl || null,
                s3FileKey:               batch.s3FileKey     || null,
                s3UrlExpiresAt:          batch.s3UrlExpiresAt || null,
                s3Mode:                  batch.s3Mode         || null,
                exportUrl:               batch.batchId
                    ? `/api/manufacturer/batch/${batch.batchId}/export/csv`
                    : null,
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
 * S3 Pipeline: Individual pack documents are no longer stored in MongoDB.
 * To look up a specific pack, download the batch's signed CSV from S3 and search locally,
 * or use pharma-core's hash verification endpoint (POST /core/hash/verify) which
 * verifies the JWT signature and queries Hyperledger Fabric world state.
 *
 * This endpoint now extracts batchId from a packHash or JWT and returns
 * the batch-level S3 download URL + Fabric verification guidance.
 */
export const lookupPackGlobalController = async (req, res) => {
    try {
        const { identifier } = req.params;
        const manufacturerId = req.user.id;

        if (!identifier) {
            return res.status(400).json({ code: 'MISSING_IDENTIFIER', message: 'identifier is required' });
        }

        return res.status(200).json({
            status:  'info',
            message: 'Individual pack records are not stored in MongoDB in the S3 pipeline architecture. ' +
                     'To verify a specific pack, use pharma-core\'s hash verification endpoint. ' +
                     'To browse all packs in a batch, download the batch CSV from the s3DownloadUrl.',
            guidance: {
                verifyPack:        'POST /core/hash/verify  — { token: "<signedJWT>" }',
                downloadBatchCsv:  'GET /api/manufacturer/batch/:batchId/export/csv  → 302 redirect to S3 URL',
                listBatchDetails:  'GET /api/manufacturer/batch/:batchId',
            },
            providedIdentifier: identifier,
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] lookupPackGlobalController error:', error.message);
        return res.status(500).json({ code: 'PACK_LOOKUP_ERROR', message: error.message });
    }
};

// ── BATCH PACK PREVIEW (Dashboard UI Table) ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/manufacturer/batch/:batchId/preview
 *
 * Returns paginated, searchable pack data from the batch's signed CSV.
 * This is the API that powers the "Batch Preview" page on the manufacturer dashboard —
 * the rich table shown after minting completes, displaying all QR codes and signed tokens.
 *
 * Architecture:
 *   manufacturer-service → calls pharma-core GET /core/export/:batchId/preview
 *   pharma-core reads CSV (local disk or S3) → parses → paginates → returns JSON
 *   manufacturer-service enriches response with full Batch metadata → returns to dashboard
 *
 * Query Parameters:
 *   - page:   number  (default: 1)
 *   - limit:  number  (default: 50, max: 200)
 *   - search: string  (optional — filter by serial number, pack hash prefix, or medicine name)
 *
 * Response:
 * {
 *   status: 'success',
 *   batch: { batchId, medicineName, dosage, expiryDate, mintStatus, totalQuantity,
 *            s3DownloadUrl, s3Mode, exportUrl, ... },
 *   stats: { totalPacks, filteredPacks, csvSizeBytes },
 *   meta:  { page, limit, pages, total },
 *   packs: [{ serialNumber, packHash, signedToken, verifyUrl, qrPreviewUrl, medicineName, expiryDate }]
 * }
 */
export const previewBatchPacksController = async (req, res) => {
    try {
        const { batchId }    = req.params;
        const manufacturerId = req.user.id;
        const page           = Math.max(1, parseInt(req.query.page  || '1',  10));
        const limit          = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
        const search         = (req.query.search || '').trim();

        // ── 1. Verify batch ownership ─────────────────────────────────────────
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

        // ── 2. Batch must be fully minted before preview is available ─────────
        if (batch.mintStatus !== 'MINTED' && batch.mintStatus !== 'RECALLED') {
            return res.status(400).json({
                code:    'BATCH_NOT_MINTED',
                message: `Preview is only available after minting is complete. Current status: ${batch.mintStatus}`,
                data: {
                    mintStatus: batch.mintStatus,
                    pollUrl:    `/api/manufacturer/batch/${batch.batchId}`,
                },
            });
        }

        // ── 3. Must have a CSV artifact (s3FileKey set after S3 pipeline mint) ─
        if (!batch.s3FileKey) {
            return res.status(404).json({
                code:    'CSV_NOT_AVAILABLE',
                message: `No CSV artifact found for batch ${batchId}. The batch may have been minted before the S3 pipeline upgrade.`,
            });
        }

        // ── 4. Proxy preview request to pharma-core ───────────────────────────
        // pharma-core reads the CSV (local or S3), parses it, paginates, returns JSON.
        const previewData = await fetchBatchPreviewViaPharmaCore({
            batchId:   batch.batchId,
            s3FileKey: batch.s3FileKey,
            page,
            limit,
            search,
        });

        // ── 5. Enrich with full batch metadata for dashboard ──────────────────
        return res.status(200).json({
            status: 'success',
            batch: {
                // Identifiers
                batchId:                 batch.batchId,
                systemBatchId:           batch.systemBatchId,
                manufacturerBatchNumber: batch.manufacturerBatchNumber,
                // Product
                medicineName:            batch.medicineName,
                genericName:             batch.genericName,
                brandName:               batch.brandName,
                dosage:                  batch.dosage,
                strength:                batch.strength,
                form:                    batch.form,
                composition:             batch.composition,
                therapeuticCategory:     batch.therapeuticCategory,
                // Dates
                expiryDate:              batch.expiryDate,
                manufacturingDate:       batch.manufacturingDate,
                // Regulatory
                manufacturingLicenseNo:  batch.manufacturingLicenseNo,
                cdscoApprovalNo:         batch.cdscoApprovalNo,
                drugSchedule:            batch.drugSchedule,
                // Status
                mintStatus:              batch.mintStatus,
                totalQuantity:           batch.totalQuantity,
                mintedPacksCount:        batch.mintedPacksCount,
                // S3 Artifact
                s3Mode:                  batch.s3Mode,
                s3DownloadUrl:           batch.s3DownloadUrl,
                s3FileKey:               batch.s3FileKey,
                s3UrlExpiresAt:          batch.s3UrlExpiresAt,
                // Convenience URL for factory printer download (redirects to S3 URL)
                exportUrl:               `/api/manufacturer/batch/${batch.batchId}/export/csv`,
            },
            // CSV stats from pharma-core
            stats: previewData.stats,
            // Pagination
            meta:  previewData.meta,
            // Paginated pack rows for the UI table
            packs: previewData.packs,
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] previewBatchPacksController error:', error.message);

        // If pharma-core is unreachable, return helpful error with fallback download URL
        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED') {
            return res.status(503).json({
                code:    'PHARMA_CORE_UNAVAILABLE',
                message: 'Unable to reach pharma-core to fetch pack preview. Download the CSV directly using the batch exportUrl.',
            });
        }

        return res.status(500).json({ code: 'PREVIEW_ERROR', message: error.message });
    }
};
