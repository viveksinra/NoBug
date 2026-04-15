import Dexie, { type EntityTable } from 'dexie';

/** Upload types that can be queued for retry */
export type UploadType = 'recording' | 'console' | 'network' | 'screenshot';

/** Status of a pending upload */
export type UploadStatus = 'pending' | 'uploading' | 'failed';

/** Capture type for history entries */
export type CaptureType = 'quick' | 'full';

/** A queued upload awaiting retry */
export interface PendingUpload {
  id: number;
  type: UploadType;
  /** Serialized JSON string or base64 data */
  data: string;
  captureId: string;
  createdAt: Date;
  retryCount: number;
  lastRetryAt: Date | null;
  status: UploadStatus;
}

/** History entry for past captures shown in popup */
export interface CaptureHistoryEntry {
  id: number;
  slug: string;
  title: string;
  shareUrl: string;
  screenshotThumb: string | null;
  createdAt: Date;
  type: CaptureType;
}

const MAX_HISTORY_ENTRIES = 50;

class NoBugDatabase extends Dexie {
  pendingUploads!: EntityTable<PendingUpload, 'id'>;
  captureHistory!: EntityTable<CaptureHistoryEntry, 'id'>;

  constructor() {
    super('nobug_extension');

    this.version(1).stores({
      pendingUploads: '++id, type, captureId, status, createdAt',
      captureHistory: '++id, slug, createdAt',
    });
  }
}

/** Singleton database instance */
export const extensionDb = new NoBugDatabase();

/**
 * Add a capture to history, auto-pruning to keep max 50 entries.
 */
export async function addCaptureHistory(
  entry: Omit<CaptureHistoryEntry, 'id'>,
): Promise<number> {
  const id = await extensionDb.captureHistory.add(entry as CaptureHistoryEntry);

  // Auto-prune oldest entries beyond the max
  const count = await extensionDb.captureHistory.count();
  if (count > MAX_HISTORY_ENTRIES) {
    const excess = count - MAX_HISTORY_ENTRIES;
    const oldest = await extensionDb.captureHistory
      .orderBy('createdAt')
      .limit(excess)
      .primaryKeys();
    await extensionDb.captureHistory.bulkDelete(oldest);
  }

  return id as number;
}

/**
 * Get recent capture history, newest first.
 */
export async function getCaptureHistory(
  limit = 20,
): Promise<CaptureHistoryEntry[]> {
  return extensionDb.captureHistory
    .orderBy('createdAt')
    .reverse()
    .limit(limit)
    .toArray();
}
