'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { RRWebEvent } from '@/components/replay/ReplayViewer';
import { ArrowLeft, Calendar, Clock, Globe, Hash } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { ReplayViewer } from '@/components/replay/ReplayViewer';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Fetch recording events from S3 URL.
 * Handles both gzipped and plain JSON responses.
 */
async function fetchRecordingEvents(url: string): Promise<RRWebEvent[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch recording: ${response.status}`);
  }

  // Try to use DecompressionStream if the response is gzipped
  const contentEncoding = response.headers.get('content-encoding');
  let data: string;

  if (contentEncoding === 'gzip' && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const decompressedStream = response.body!.pipeThrough(ds);
    const reader = decompressedStream.getReader();
    const chunks: BlobPart[] = [];
    let done = false;

    while (!done) {
      const result = await reader.read();
      if (result.done) {
        done = true;
      } else {
        chunks.push(result.value as unknown as BlobPart);
      }
    }

    const blob = new Blob(chunks);
    data = await blob.text();
  } else {
    data = await response.text();
  }

  const parsed = JSON.parse(data);
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid recording data: expected an array of events');
  }
  return parsed as RRWebEvent[];
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function RecordingViewerPage() {
  const params = useParams<{
    companySlug: string;
    projectKey: string;
    issueNumber: string;
    recordingId: string;
  }>();
  const router = useRouter();

  const [events, setEvents] = useState<RRWebEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch company and project context
  const { data: company } = trpc.company.getBySlug.useQuery({ slug: params.companySlug });
  const { data: issue } = trpc.issue.getByNumber.useQuery(
    {
      companyId: company?.id ?? '',
      projectKey: params.projectKey,
      issueNumber: parseInt(params.issueNumber, 10),
    },
    { enabled: !!company?.id },
  );

  // Find the specific recording
  const recording = issue?.recordings?.find(
    (r: any) => r.id === params.recordingId,
  );

  // Generate download URL for the recording
  const { data: downloadData } = trpc.upload.getDownloadUrl.useQuery(
    { key: recording?.storage_url ?? '' },
    { enabled: !!recording?.storage_url },
  );

  // Fetch recording events from S3
  useEffect(() => {
    if (!downloadData?.downloadUrl) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRecordingEvents(downloadData.downloadUrl)
      .then((evts) => {
        if (!cancelled) {
          setEvents(evts);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load recording');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [downloadData?.downloadUrl]);

  const issueKey = issue
    ? `${params.projectKey}-${params.issueNumber}`
    : '';

  const env = recording?.environment_json as Record<string, unknown> | null | undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            router.push(
              `/${params.companySlug}/${params.projectKey}/issues/${params.issueNumber}`,
            )
          }
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Issue
        </Button>
        {issueKey && (
          <span className="font-mono text-sm text-neutral-500">{issueKey}</span>
        )}
        <h1 className="text-lg font-semibold text-white">Session Recording</h1>
      </div>

      {/* Replay viewer */}
      <ReplayViewer events={events} loading={loading} error={error} />

      {/* Recording metadata */}
      {recording && (
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4 sm:grid-cols-4">
          {recording.duration_ms != null && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-neutral-500" />
              <div>
                <div className="text-xs text-neutral-500">Duration</div>
                <div className="text-sm text-white">
                  {formatDuration(recording.duration_ms)}
                </div>
              </div>
            </div>
          )}

          {events && (
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-neutral-500" />
              <div>
                <div className="text-xs text-neutral-500">Event Count</div>
                <div className="text-sm text-white">{events.length.toLocaleString()}</div>
              </div>
            </div>
          )}

          {typeof env?.pageUrl === 'string' && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-neutral-500" />
              <div>
                <div className="text-xs text-neutral-500">Page URL</div>
                <div className="max-w-48 truncate text-sm text-white" title={String(env.pageUrl)}>
                  {String(env.pageUrl)}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-neutral-500" />
            <div>
              <div className="text-xs text-neutral-500">Recorded</div>
              <div className="text-sm text-white">{formatDate(recording.created_at)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
