import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadType =
  | 'recordings'
  | 'console-logs'
  | 'network-logs'
  | 'screenshots'
  | 'annotated-screenshots';

export interface GenerateUploadUrlParams {
  companyId: string;
  type: UploadType;
  fileId: string;
  extension: string;
  contentType: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

const UPLOAD_URL_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour

/**
 * Returns true when all required S3 env vars are set.
 */
export function isS3Configured(): boolean {
  return !!(AWS_REGION && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && S3_BUCKET_NAME);
}

// ---------------------------------------------------------------------------
// Singleton S3 client
// ---------------------------------------------------------------------------

let _client: S3Client | null = null;

function getClient(): S3Client | null {
  if (!isS3Configured()) return null;
  if (!_client) {
    _client = new S3Client({
      region: AWS_REGION!,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID!,
        secretAccessKey: AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Content-Type / Content-Encoding helpers
// ---------------------------------------------------------------------------

const GZIP_TYPES = new Set<UploadType>([
  'recordings',
  'console-logs',
  'network-logs',
]);

function shouldGzip(type: UploadType): boolean {
  return GZIP_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

function getEnvPrefix(): string {
  return process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
}

/**
 * Build the S3 object key.
 * Pattern: `{env}/{company_id}/{type}/{id}.{ext}`
 */
export function buildObjectKey(
  companyId: string,
  type: UploadType,
  fileId: string,
  extension: string,
): string {
  const ext = shouldGzip(type) ? `${extension}.gz` : extension;
  return `${getEnvPrefix()}/${companyId}/${type}/${fileId}.${ext}`;
}

// ---------------------------------------------------------------------------
// Presigned URL generation
// ---------------------------------------------------------------------------

/**
 * Generate a presigned PUT URL for direct upload from the client.
 * Returns null if S3 is not configured (local dev).
 */
export async function generateUploadUrl(
  params: GenerateUploadUrlParams,
): Promise<{ uploadUrl: string; key: string } | null> {
  const client = getClient();
  if (!client || !S3_BUCKET_NAME) return null;

  const key = buildObjectKey(
    params.companyId,
    params.type,
    params.fileId,
    params.extension,
  );

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: params.contentType,
    ...(shouldGzip(params.type) ? { ContentEncoding: 'gzip' } : {}),
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
  });

  return { uploadUrl, key };
}

/**
 * Generate a presigned GET URL for downloading a stored file.
 * Returns null if S3 is not configured.
 */
export async function generateDownloadUrl(
  key: string,
): Promise<string | null> {
  const client = getClient();
  if (!client || !S3_BUCKET_NAME) return null;

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(client, command, {
    expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS,
  });
}

/**
 * Get a public URL for a key (for Quick Capture viewer with public-read ACL).
 * Returns null if S3 is not configured.
 */
export function getPublicUrl(key: string): string | null {
  if (!S3_BUCKET_NAME || !AWS_REGION) return null;
  return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
}
