import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream, mkdirSync, existsSync } from 'fs';
import { Readable } from 'stream';
import path from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────
const LOCAL_EXPORT_DIR     = './data/exports';
const DEFAULT_EXPIRY_SECS  = 604_800; // 7 days
const S3_CSV_PREFIX        = 'batches';  // s3://{bucket}/batches/{batchId}.csv

// ── S3 Client (lazy — only created when AWS creds are present) ─────────────────

let _s3Client = null;

/**
 * Returns a singleton S3Client if AWS credentials are configured, else null.
 * This allows the service to detect the "local fallback" mode at runtime.
 * @returns {S3Client|null}
 */
const getS3Client = () => {
    if (_s3Client) return _s3Client;

    const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION } = process.env;

    if (!AWS_ACCESS_KEY_ID || AWS_ACCESS_KEY_ID === 'YOUR_AWS_ACCESS_KEY_ID_HERE') {
        return null; // Local fallback mode
    }

    _s3Client = new S3Client({
        region:      AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId:     AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_SECRET_ACCESS_KEY,
        },
    });

    console.log('[pharma-core S3] S3Client initialized — region:', AWS_REGION || 'us-east-1');
    return _s3Client;
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns whether pharma-core is in S3 mode or local-file fallback mode.
 * Used by controllers and crypto.service to branch upload logic.
 * @returns {boolean}
 */
export const isS3Configured = () => getS3Client() !== null;

/**
 * Uploads a CSV string (or Buffer) to AWS S3 using multipart upload.
 * The file is stored at: s3://{S3_BUCKET_NAME}/batches/{batchId}.csv
 *
 * Uses @aws-sdk/lib-storage Upload which automatically handles:
 *   - Multipart threshold: 5MB (splits large files automatically)
 *   - Retry with exponential backoff
 *   - Stream piping without buffering full file in RAM
 *
 * @param {string} batchId     - PharmaChain system batch ID (used as S3 key)
 * @param {string} csvContent  - Full CSV file content as a string
 * @param {string} medicineName - Used in S3 metadata for human readability
 * @returns {Promise<{ s3FileKey: string, s3Bucket: string }>}
 */
export const uploadCsvToS3 = async (batchId, csvContent, medicineName = '') => {
    const s3Client  = getS3Client();
    const bucket    = process.env.S3_BUCKET_NAME;

    if (!s3Client || !bucket) {
        throw new Error('[pharma-core S3] uploadCsvToS3 called but S3 is not configured');
    }

    // S3 object key: batches/PC-BATCH-CIPLA0-20260822-7D3A1F.csv
    const s3FileKey  = `${S3_CSV_PREFIX}/${batchId}.csv`;

    // Convert string content to a readable stream (avoids full buffer in memory for large CSVs)
    const csvStream  = Readable.from([csvContent]);

    console.log(`[pharma-core S3] Uploading CSV to s3://${bucket}/${s3FileKey}`);

    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket:      bucket,
            Key:         s3FileKey,
            Body:        csvStream,
            ContentType: 'text/csv',
            // S3 metadata — visible in S3 console for human operators
            Metadata: {
                batchId,
                medicineName,
                uploadedBy:  'pharma-core',
                uploadedAt:  new Date().toISOString(),
            },
        },
        queueSize:    4, // Parallel part uploads
        partSize:     5 * 1024 * 1024, // 5MB per part (S3 minimum)
        leavePartsOnError: false,
    });

    await upload.done();

    console.log(`[pharma-core S3] ✅ Upload complete: s3://${bucket}/${s3FileKey}`);
    return { s3FileKey, s3Bucket: bucket };
};

/**
 * Generates a pre-signed GET URL for an existing S3 object.
 * The URL is valid for S3_URL_EXPIRY_SECONDS (default: 7 days / 604800s).
 * After expiry, the factory must request a new URL via the manufacturer dashboard.
 *
 * Pre-signed URL security model:
 *   - No AWS credentials are exposed to the factory operator.
 *   - The URL is cryptographically signed by pharma-core's AWS credentials.
 *   - Possession of the URL is sufficient to download — share only with authorized parties.
 *
 * @param {string} s3FileKey - e.g. "batches/PC-BATCH-CIPLA0-20260822-7D3A1F.csv"
 * @returns {Promise<{ s3DownloadUrl: string, s3UrlExpiresAt: string }>}
 */
export const generatePresignedUrl = async (s3FileKey) => {
    const s3Client   = getS3Client();
    const bucket     = process.env.S3_BUCKET_NAME;
    const expirySecs = parseInt(process.env.S3_URL_EXPIRY_SECONDS || String(DEFAULT_EXPIRY_SECS), 10);

    const command = new GetObjectCommand({
        Bucket: bucket,
        Key:    s3FileKey,
    });

    const s3DownloadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: expirySecs,
    });

    // Calculate exact expiry timestamp so manufacturer-service can refresh before it lapses
    const s3UrlExpiresAt = new Date(Date.now() + expirySecs * 1000).toISOString();

    console.log(
        `[pharma-core S3] Pre-signed URL generated for ${s3FileKey}` +
        ` (expires: ${s3UrlExpiresAt})`,
    );

    return { s3DownloadUrl, s3UrlExpiresAt };
};

/**
 * LOCAL FALLBACK: Writes CSV content to ./data/exports/{batchId}.csv on disk.
 * Used when AWS credentials are not configured (local development / offline mode).
 *
 * @param {string} batchId     - Used as the filename.
 * @param {string} csvContent  - Full CSV file content.
 * @returns {{ localFilePath: string, s3DownloadUrl: string, s3FileKey: string, s3UrlExpiresAt: null }}
 */
export const saveLocalCsvFallback = async (batchId, csvContent) => {
    // Ensure export directory exists
    if (!existsSync(LOCAL_EXPORT_DIR)) {
        mkdirSync(LOCAL_EXPORT_DIR, { recursive: true });
    }

    const filename      = `${batchId}.csv`;
    const localFilePath = path.join(LOCAL_EXPORT_DIR, filename);

    // Write file synchronously to ensure it's on disk before we return the URL
    await new Promise((resolve, reject) => {
        const stream = createWriteStream(localFilePath);
        stream.on('finish', resolve);
        stream.on('error', reject);
        stream.write(csvContent);
        stream.end();
    });

    const PORT             = process.env.PORT || 4000;
    const s3DownloadUrl    = `http://localhost:${PORT}/core/export/${batchId}`;
    const s3FileKey        = `local:exports/${filename}`;

    console.log(
        `[pharma-core S3] ⚠️  LOCAL FALLBACK MODE — CSV saved to: ${localFilePath}` +
        ` | Download: ${s3DownloadUrl}`,
    );

    return {
        localFilePath,
        s3DownloadUrl,
        s3FileKey,
        s3UrlExpiresAt: null, // Local files don't expire
    };
};

/**
 * Returns the absolute file path for a locally-saved CSV export.
 * Used by the local fallback download controller (GET /core/export/:batchId).
 * @param {string} batchId
 * @returns {string}
 */
export const getLocalExportPath = (batchId) =>
    path.resolve(LOCAL_EXPORT_DIR, `${batchId}.csv`);
