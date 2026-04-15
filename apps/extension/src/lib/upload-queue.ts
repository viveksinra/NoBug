import { extensionDb, type UploadType, type UploadStatus } from './db';
import { getAuthState } from './auth';

/** Exponential backoff intervals in milliseconds: 1min, 5min, 30min, 2hr, 2hr */
const BACKOFF_INTERVALS_MS = [
  1 * 60 * 1000,    // 1 minute
  5 * 60 * 1000,    // 5 minutes
  30 * 60 * 1000,   // 30 minutes
  2 * 60 * 60 * 1000, // 2 hours
  2 * 60 * 60 * 1000, // 2 hours (max)
];

const MAX_RETRIES = 5;

/** Whether a queue processing run is currently active */
let isProcessing = false;

export interface QueueStatus {
  pending: number;
  uploading: number;
  failed: number;
}

/**
 * Add an upload to the retry queue in IndexedDB.
 */
export async function enqueueUpload(
  type: UploadType,
  data: string,
  captureId: string,
): Promise<number> {
  const id = await extensionDb.pendingUploads.add({
    type,
    data,
    captureId,
    createdAt: new Date(),
    retryCount: 0,
    lastRetryAt: null,
    status: 'pending',
  } as any);

  // Update badge after enqueue
  await updateBadgeCount();

  return id as number;
}

/**
 * Process all pending and failed uploads that are ready for retry.
 * Idempotent — safe to call multiple times; concurrent calls are serialized.
 */
export async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Get all items eligible for processing
    const items = await extensionDb.pendingUploads
      .where('status')
      .anyOf(['pending', 'failed'] as UploadStatus[])
      .toArray();

    for (const item of items) {
      // Check if enough time has passed since last retry (backoff)
      if (item.lastRetryAt && item.retryCount > 0) {
        const backoffMs =
          BACKOFF_INTERVALS_MS[
            Math.min(item.retryCount - 1, BACKOFF_INTERVALS_MS.length - 1)
          ];
        const nextRetryAt = item.lastRetryAt.getTime() + backoffMs;
        if (Date.now() < nextRetryAt) {
          continue; // Not ready for retry yet
        }
      }

      // Mark as uploading
      await extensionDb.pendingUploads.update(item.id, {
        status: 'uploading' as UploadStatus,
      });

      try {
        await performUpload(item.type, item.data, item.captureId);
        // Success — remove from queue
        await extensionDb.pendingUploads.delete(item.id);
      } catch (err) {
        const newRetryCount = item.retryCount + 1;
        if (newRetryCount >= MAX_RETRIES) {
          // Max retries exceeded — mark as permanently failed
          await extensionDb.pendingUploads.update(item.id, {
            status: 'failed' as UploadStatus,
            retryCount: newRetryCount,
            lastRetryAt: new Date(),
          });
          console.warn(
            `[NoBug] Upload ${item.id} permanently failed after ${MAX_RETRIES} retries`,
            err,
          );
        } else {
          // Mark as failed for retry later
          await extensionDb.pendingUploads.update(item.id, {
            status: 'failed' as UploadStatus,
            retryCount: newRetryCount,
            lastRetryAt: new Date(),
          });
          console.warn(
            `[NoBug] Upload ${item.id} failed (attempt ${newRetryCount}/${MAX_RETRIES})`,
            err,
          );
        }
      }
    }
  } finally {
    isProcessing = false;
    await updateBadgeCount();
  }
}

/**
 * Get the current queue status counts.
 */
export async function getQueueStatus(): Promise<QueueStatus> {
  const [pending, uploading, failed] = await Promise.all([
    extensionDb.pendingUploads.where('status').equals('pending').count(),
    extensionDb.pendingUploads.where('status').equals('uploading').count(),
    extensionDb.pendingUploads
      .where('status')
      .equals('failed')
      .filter((item) => item.retryCount >= MAX_RETRIES)
      .count(),
  ]);

  return { pending, uploading, failed };
}

/**
 * Remove a permanently failed upload from the queue.
 */
export async function removeFailedUpload(id: number): Promise<void> {
  await extensionDb.pendingUploads.delete(id);
  await updateBadgeCount();
}

/**
 * Clear all permanently failed uploads.
 */
export async function clearFailedUploads(): Promise<void> {
  const failed = await extensionDb.pendingUploads
    .where('status')
    .equals('failed')
    .filter((item) => item.retryCount >= MAX_RETRIES)
    .primaryKeys();
  await extensionDb.pendingUploads.bulkDelete(failed);
  await updateBadgeCount();
}

/**
 * Update the extension icon badge with the count of pending/failed uploads.
 */
async function updateBadgeCount(): Promise<void> {
  try {
    const totalPending = await extensionDb.pendingUploads
      .where('status')
      .anyOf(['pending', 'failed', 'uploading'] as UploadStatus[])
      .count();

    if (totalPending > 0) {
      await browser.action.setBadgeText({ text: String(totalPending) });
      await browser.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } else {
      // Only clear badge if there's no active recording
      // (recording badge is handled separately in background.ts)
      const currentBadge = await browser.action.getBadgeText({});
      if (currentBadge && !['REC', '!'].includes(currentBadge)) {
        await browser.action.setBadgeText({ text: '' });
      }
    }
  } catch {
    // Badge API may not be available in all contexts
  }
}

/**
 * Perform the actual upload to the server.
 * This is where the presigned URL flow happens.
 */
async function performUpload(
  type: UploadType,
  data: string,
  captureId: string,
): Promise<void> {
  const authState = await getAuthState();
  if (!authState) {
    throw new Error('Not authenticated — cannot upload');
  }

  const baseUrl =
    (await browser.storage.local.get('nobug_api_base_url')).nobug_api_base_url ||
    'http://localhost:3000';

  // Request a presigned upload URL from the server
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authState.apiKey) {
    headers['Authorization'] = `Bearer ${authState.apiKey}`;
  } else if (authState.sessionToken) {
    headers['Cookie'] = `better-auth.session_token=${authState.sessionToken}`;
  }

  const uploadRes = await fetch(`${baseUrl}/api/extension/upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      captureId,
      type,
      contentType: type === 'screenshot' ? 'image/png' : 'application/json',
    }),
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload request failed: ${uploadRes.status} ${uploadRes.statusText}`);
  }

  const { uploadUrl } = await uploadRes.json();

  // Upload the data directly to S3 via presigned URL
  const contentType = type === 'screenshot' ? 'image/png' : 'application/json';
  const uploadBody =
    type === 'screenshot' ? base64ToBlob(data, 'image/png') : data;

  const s3Res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: uploadBody,
  });

  if (!s3Res.ok) {
    throw new Error(`S3 upload failed: ${s3Res.status} ${s3Res.statusText}`);
  }
}

/**
 * Convert a base64 data URL or raw base64 string to a Blob.
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const raw = base64.startsWith('data:')
    ? base64.split(',')[1]
    : base64;
  const bytes = atob(raw);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    arr[i] = bytes.charCodeAt(i);
  }
  return new Blob([arr], { type: mimeType });
}
