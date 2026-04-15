import { useState, useEffect, useCallback } from 'react';
import type { QueueStatus } from './upload-queue';

const REFRESH_INTERVAL_MS = 10_000; // 10 seconds

/**
 * React hook that returns the current upload queue status.
 * Auto-refreshes on an interval by querying the service worker.
 */
export function useUploadQueue() {
  const [status, setStatus] = useState<QueueStatus>({
    pending: 0,
    uploading: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'QUEUE_STATUS',
      });
      if (response && typeof response === 'object') {
        setStatus(response as QueueStatus);
      }
    } catch {
      // Service worker may not be ready
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    refresh();

    // Poll on interval
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const total = status.pending + status.uploading + status.failed;
  const hasFailures = status.failed > 0;

  return {
    ...status,
    total,
    hasFailures,
    loading,
    refresh,
  };
}
