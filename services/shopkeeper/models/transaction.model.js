import mongoose from 'mongoose';

// ── Constants ─────────────────────────────────────────────────────────────────
export const TXN_TYPE = ['RECEIVE', 'SELL', 'RETURN'];
export const TXN_STATUS = ['RECEIVED', 'SOLD', 'RETURNED'];

// ── Schema ────────────────────────────────────────────────────────────────────
const TransactionSchema = new mongoose.Schema(
    {
        transactionId: { type: String, required: true, unique: true },
        idempotencyKey: { type: String, required: true, unique: true },

        shopkeeperId: { type: String, required: true, index: true },
        packId:       { type: String, required: true },
        type:         { type: String, enum: TXN_TYPE, required: true },
        status:       { type: String, enum: TXN_STATUS, required: true },

        // Extra fields for scan / sell
        customerPhone: { type: String, default: null },
        returnReason:  { type: String, default: null }, // CUSTOMER_RETURN | DAMAGED_PACKAGING | EXPIRED

        // Linked medicine data (resolved at scan time)
        medicineId:    { type: String, default: null },
        medicineName:  { type: String, default: null },
        batchNo:       { type: String, default: null },
        mfgDate:       { type: Date, default: null },
        expDate:       { type: Date, default: null },
        manufacturer:  { type: String, default: null },

        // Blockchain reference
        blockchainTxHash: { type: String, default: null },

        // Scan result at time of transaction
        scanStatus:   { type: String, default: 'Verified' }, // Verified | Suspicious | Counterfeit | Expired | Recalled
        trustScore:   { type: Number, default: null },
    },
    { timestamps: true },
);

TransactionSchema.index({ shopkeeperId: 1, createdAt: -1 });
TransactionSchema.index({ packId: 1 });
// Note: idempotencyKey unique:true field already creates the unique index

const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction;
