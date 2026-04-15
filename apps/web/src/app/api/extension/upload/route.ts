import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@nobug/db';
import { validateApiKey } from '@/server/routers/api-key';
import {
  MAX_RECORDING_SIZE_BYTES,
  MAX_SCREENSHOT_SIZE_BYTES,
} from '@nobug/shared';
import {
  generateUploadUrl,
  generateDownloadUrl,
  isS3Configured,
  type UploadType,
} from '@/lib/s3';

const VALID_TYPES: UploadType[] = [
  'recordings',
  'console-logs',
  'network-logs',
  'screenshots',
  'annotated-screenshots',
];

function getMaxSize(type: UploadType): number {
  switch (type) {
    case 'screenshots':
    case 'annotated-screenshots':
      return MAX_SCREENSHOT_SIZE_BYTES;
    case 'recordings':
    case 'console-logs':
    case 'network-logs':
      return MAX_RECORDING_SIZE_BYTES;
  }
}

function extensionFromContentType(contentType: string): string {
  if (contentType.startsWith('image/png')) return 'png';
  if (contentType.startsWith('image/jpeg')) return 'jpg';
  if (contentType.startsWith('image/webp')) return 'webp';
  if (contentType.includes('json')) return 'json';
  return 'bin';
}

/**
 * POST /api/extension/upload
 *
 * Generate a presigned upload URL for the browser extension.
 * Auth: session cookie or API key Bearer token.
 *
 * Body: { type, filename, contentType, size, companyId }
 * Returns: { uploadUrl, key, downloadUrl }
 */
export async function POST(req: NextRequest) {
  // -----------------------------------------------------------------------
  // Auth: API key or session
  // -----------------------------------------------------------------------
  let companyIdFromKey: string | null = null;

  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer nb_key_')) {
    const rawKey = authHeader.slice(7);
    const result = await validateApiKey(db, rawKey);
    if (!result) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }
    companyIdFromKey = result.apiKey.company_id;
  } else {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
  }

  // -----------------------------------------------------------------------
  // Validate S3 configuration
  // -----------------------------------------------------------------------
  if (!isS3Configured()) {
    return NextResponse.json(
      { error: 'S3 is not configured on this server.' },
      { status: 503 },
    );
  }

  // -----------------------------------------------------------------------
  // Parse and validate body
  // -----------------------------------------------------------------------
  let body: {
    type: string;
    filename: string;
    contentType: string;
    size: number;
    companyId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, filename, contentType, size, companyId: bodyCompanyId } = body;

  if (!type || !VALID_TYPES.includes(type as UploadType)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  if (!filename || !contentType || !size || size <= 0) {
    return NextResponse.json(
      { error: 'Missing required fields: filename, contentType, size' },
      { status: 400 },
    );
  }

  const uploadType = type as UploadType;
  const companyId = companyIdFromKey ?? bodyCompanyId;

  if (!companyId) {
    return NextResponse.json(
      { error: 'companyId is required' },
      { status: 400 },
    );
  }

  // Validate size
  const maxSize = getMaxSize(uploadType);
  if (size > maxSize) {
    return NextResponse.json(
      {
        error: `File too large. Max ${Math.round(maxSize / (1024 * 1024))}MB for ${uploadType}.`,
      },
      { status: 413 },
    );
  }

  // -----------------------------------------------------------------------
  // Generate presigned URL
  // -----------------------------------------------------------------------
  const ext = extensionFromContentType(contentType);
  const fileId = crypto.randomUUID();

  const result = await generateUploadUrl({
    companyId,
    type: uploadType,
    fileId,
    extension: ext,
    contentType,
  });

  if (!result) {
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 },
    );
  }

  const downloadUrl = await generateDownloadUrl(result.key);

  return NextResponse.json({
    uploadUrl: result.uploadUrl,
    key: result.key,
    downloadUrl,
  });
}
