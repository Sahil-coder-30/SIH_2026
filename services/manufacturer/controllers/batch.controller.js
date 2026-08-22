import crypto from 'crypto';
import Batch, { MINT_STATUS } from '../models/batch.model.js';
import Pack from '../models/pack.model.js';
import { mintBatchViaPharmaCore, recallBatchViaPharmaCore } from '../services/coreClient.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const generateBatchId = (medicineName) =>
    `BATCH-${medicineName.replace(/\s+/g, '').toUpperCase().slice(0, 8)}-${Date.now()}`;

// ── Controllers ───────────────────────────────────────────────────────────────

export const createBatchController = async (req, res) => {
    try {
        const { medicineName, composition, manufacturingDate, expiryDate, totalQuantity } = req.body;
        const manufacturerId = req.user.id;

        if (!medicineName || !manufacturingDate || !expiryDate || !totalQuantity) {
            return res.status(400).json({
                status: 'error',
                message: 'medicineName, manufacturingDate, expiryDate, and totalQuantity are required',
            });
        }

        if (totalQuantity < 1 || totalQuantity > 10000) {
            return res.status(400).json({ status: 'error', message: 'totalQuantity must be between 1 and 10,000' });
        }

        const batchId = generateBatchId(medicineName);

        const batch = await Batch.create({
            batchId,
            manufacturerId,
            medicineName,
            composition: composition || null,
            manufacturingDate,
            expiryDate,
            totalQuantity,
        });

        console.log(`[manufacturer-service Batch] Created batch ${batchId} for manufacturer ${manufacturerId}`);

        return res.status(201).json({ status: 'success', data: batch });
    } catch (error) {
        console.error('[manufacturer-service Batch] createBatchController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const listBatchesController = async (req, res) => {
    try {
        const manufacturerId = req.user.id;
        const batches = await Batch.find({ manufacturerId }).sort({ createdAt: -1 });
        return res.status(200).json({ status: 'success', data: batches });
    } catch (error) {
        console.error('[manufacturer-service Batch] listBatchesController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const getBatchController = async (req, res) => {
    try {
        const { batchId } = req.params;
        const manufacturerId = req.user.id;

        const batch = await Batch.findOne({ batchId, manufacturerId });
        if (!batch) {
            return res.status(404).json({ status: 'error', message: 'Batch not found' });
        }

        return res.status(200).json({ status: 'success', data: batch });
    } catch (error) {
        console.error('[manufacturer-service Batch] getBatchController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const mintBatchController = async (req, res) => {
    try {
        const { batchId } = req.params;
        const manufacturerId = req.user.id;

        const batch = await Batch.findOne({ batchId, manufacturerId });
        if (!batch) {
            return res.status(404).json({ status: 'error', message: 'Batch not found' });
        }

        if (batch.mintStatus !== 'PENDING') {
            return res.status(409).json({
                status: 'error',
                message: `Batch is already in status: ${batch.mintStatus}`,
            });
        }

        // ── Mark as MINTING ───────────────────────────────────────────────────
        await Batch.updateOne({ batchId }, { mintStatus: 'MINTING' });

        // ── Call pharma-core to mint all packs ────────────────────────────────
        const mintResult = await mintBatchViaPharmaCore({
            batchId,
            manufacturerId,
            expiryDate: batch.expiryDate.toISOString().split('T')[0],
            quantity: batch.totalQuantity,
        });

        // ── Bulk insert packs into MongoDB ────────────────────────────────────
        const packDocs = mintResult.packs.map((p) => ({
            batchId,
            serialNumber: p.serial,
            packHash: p.packHash,
            signedToken: p.signedToken,
        }));

        await Pack.insertMany(packDocs, { ordered: false });
        await Batch.updateOne({ batchId }, { mintStatus: 'MINTED' });

        console.log(`[manufacturer-service Batch] Minted batch ${batchId} — ${mintResult.totalPacks} packs`);

        return res.status(200).json({
            status: 'success',
            message: 'Batch minted successfully',
            data: { batchId, totalPacks: mintResult.totalPacks },
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] mintBatchController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const recallBatchController = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { reason } = req.body;
        const manufacturerId = req.user.id;

        if (!reason) {
            return res.status(400).json({ status: 'error', message: 'reason is required for recall' });
        }

        const batch = await Batch.findOne({ batchId, manufacturerId });
        if (!batch) {
            return res.status(404).json({ status: 'error', message: 'Batch not found' });
        }

        if (batch.mintStatus === 'RECALLED') {
            return res.status(409).json({ status: 'error', message: 'Batch already recalled' });
        }

        await Batch.updateOne({ batchId }, { mintStatus: 'RECALLED', recallReason: reason });
        await recallBatchViaPharmaCore({ batchId, manufacturerId, reason });

        console.log(`[manufacturer-service Batch] Recall initiated for batch ${batchId}: ${reason}`);

        return res.status(200).json({
            status: 'success',
            message: 'Batch recalled across entire supply chain',
            data: { batchId, reason },
        });
    } catch (error) {
        console.error('[manufacturer-service Batch] recallBatchController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
