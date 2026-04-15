'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import type { RRWebEvent } from '@/components/replay/ReplayViewer';
import {
  Lock,
  Video,
  Terminal,
  Globe,
  Image as ImageIcon,
  Monitor,
  Eye,
  Calendar,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { ReplayViewer } from '@/components/replay/ReplayViewer';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'recording' | 'console' | 'network' | 'screenshot' | 'environment';

interface ConsoleEntry {
  level: string;
  message: string;
  timestamp: number;
  args?: unknown[];
}

interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  duration?: number;
  timestamp: number;
  responseHeaders?: Record<string, string>;
  requestHeaders?: Record<string, string>;
  size?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'recording', label: 'Recording', icon: Video },
  { key: 'console', label: 'Console', icon: Terminal },
  { key: 'network', label: 'Network', icon: Globe },
  { key: 'screenshot', label: 'Screenshot', icon: ImageIcon },
  { key: 'environment', label: 'Environment', icon: Monitor },
];

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CONSOLE_LEVEL_COLORS: Record<string, string> = {
  log: 'text-neutral-300',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-neutral-500',
};

const STATUS_COLORS: Record<string, string> = {
  '2': 'text-green-400',
  '3': 'text-blue-400',
  '4': 'text-yellow-400',
  '5': 'text-red-400',
};

function getStatusColor(status: number): string {
  return STATUS_COLORS[String(status)[0]] ?? 'text-neutral-400';
}

/**
 * Fetch JSON data from a URL, handling gzip decompression.
 */
async function fetchJsonFromUrl<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

  const contentEncoding = response.headers.get('content-encoding');

  if (contentEncoding === 'gzip' && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const decompressedStream = response.body!.pipeThrough(ds);
    const reader = decompressedStream.getReader();
    const chunks: BlobPart[] = [];
    let done = false;
    while (!done) {
      const result = await reader.read();
      if (result.done) done = true;
      else chunks.push(result.value as unknown as BlobPart);
    }
    const blob = new Blob(chunks);
    const text = await blob.text();
    return JSON.parse(text);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PasswordPrompt({ onSubmit }: { onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex flex-col items-center gap-3">
          <Lock className="h-8 w-8 text-neutral-400" />
          <h2 className="text-lg font-semibold text-white">Password Protected</h2>
          <p className="text-center text-sm text-neutral-400">
            This capture is protected. Enter the password to view it.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password) onSubmit(password);
          }}
          className="space-y-3"
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={!password}>
            View Capture
          </Button>
        </form>
      </div>
    </div>
  );
}

function ConsolePanel({ entries }: { entries: ConsoleEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-500">
        No console logs captured
      </div>
    );
  }

  return (
    <div className="max-h-[600px] overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 font-mono text-xs">
      {entries.map((entry, i) => (
        <div
          key={i}
          className="flex gap-2 border-b border-neutral-900 px-3 py-1.5 hover:bg-neutral-900/50"
        >
          <span className={`shrink-0 uppercase ${CONSOLE_LEVEL_COLORS[entry.level] ?? 'text-neutral-400'}`}>
            [{entry.level}]
          </span>
          <span className="flex-1 whitespace-pre-wrap break-all text-neutral-300">
            {typeof entry.message === 'string' ? entry.message : JSON.stringify(entry.message)}
          </span>
        </div>
      ))}
    </div>
  );
}

function NetworkPanel({ entries }: { entries: NetworkEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-500">
        No network requests captured
      </div>
    );
  }

  return (
    <div className="max-h-[600px] overflow-auto rounded-lg border border-neutral-800 bg-neutral-950">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-neutral-900 text-left">
          <tr className="border-b border-neutral-800">
            <th className="px-3 py-2 font-medium text-neutral-400">Status</th>
            <th className="px-3 py-2 font-medium text-neutral-400">Method</th>
            <th className="px-3 py-2 font-medium text-neutral-400">URL</th>
            <th className="px-3 py-2 text-right font-medium text-neutral-400">Duration</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={i} className="border-b border-neutral-900 hover:bg-neutral-900/50">
              <td className={`px-3 py-1.5 font-mono ${getStatusColor(entry.status)}`}>
                {entry.status || '---'}
              </td>
              <td className="px-3 py-1.5 font-mono text-neutral-300">{entry.method}</td>
              <td className="max-w-sm truncate px-3 py-1.5 text-neutral-400" title={entry.url}>
                {entry.url}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-neutral-500">
                {entry.duration != null ? `${entry.duration}ms` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScreenshotPanel({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-500">
        No screenshot available
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800">
      <img
        src={url}
        alt="Bug screenshot"
        className="w-full"
        loading="lazy"
      />
    </div>
  );
}

function EnvironmentPanel({ env }: { env: Record<string, unknown> | null }) {
  if (!env || Object.keys(env).length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-500">
        No environment info available
      </div>
    );
  }

  const entries = Object.entries(env);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950">
      {entries.map(([key, value], i) => (
        <div
          key={key}
          className={`flex items-baseline gap-4 px-4 py-2.5 ${
            i < entries.length - 1 ? 'border-b border-neutral-900' : ''
          }`}
        >
          <span className="shrink-0 text-xs font-medium text-neutral-500">{key}</span>
          <span className="text-sm text-neutral-300">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function QuickCaptureViewerPage() {
  const params = useParams<{ slug: string }>();
  const [password, setPassword] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<Tab>('recording');

  // Recording events state
  const [events, setEvents] = useState<RRWebEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Console/network logs state
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [networkLogs, setNetworkLogs] = useState<NetworkEntry[]>([]);

  // Screenshot URL state
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  // Fetch capture data
  const {
    data,
    isLoading: captureLoading,
    error: captureError,
  } = trpc.quickCapture.getBySlug.useQuery(
    { slug: params.slug, password },
    { retry: false },
  );

  const capture = data?.capture;

  // Fetch recording events from S3 when available
  useEffect(() => {
    if (!capture?.recording_url) return;

    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);

    // For S3 keys, we need to go through the download URL endpoint
    // But since this is a public page, fetch directly if it looks like a URL
    const url = capture.recording_url;
    const fetchUrl = url.startsWith('http') ? url : `/api/public/download?key=${encodeURIComponent(url)}`;

    fetchJsonFromUrl<RRWebEvent[]>(fetchUrl)
      .then((evts) => {
        if (!cancelled) {
          setEvents(evts);
          setEventsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEventsError(err instanceof Error ? err.message : 'Failed to load recording');
          setEventsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [capture?.recording_url]);

  // Fetch console logs
  useEffect(() => {
    if (!capture?.console_logs_url) return;
    const url = capture.console_logs_url;
    const fetchUrl = url.startsWith('http') ? url : `/api/public/download?key=${encodeURIComponent(url)}`;
    fetchJsonFromUrl<ConsoleEntry[]>(fetchUrl)
      .then(setConsoleLogs)
      .catch(() => setConsoleLogs([]));
  }, [capture?.console_logs_url]);

  // Fetch network logs
  useEffect(() => {
    if (!capture?.network_logs_url) return;
    const url = capture.network_logs_url;
    const fetchUrl = url.startsWith('http') ? url : `/api/public/download?key=${encodeURIComponent(url)}`;
    fetchJsonFromUrl<NetworkEntry[]>(fetchUrl)
      .then(setNetworkLogs)
      .catch(() => setNetworkLogs([]));
  }, [capture?.network_logs_url]);

  // Set screenshot URL
  useEffect(() => {
    if (!capture?.screenshot_url) return;
    const url = capture.screenshot_url;
    setScreenshotUrl(url.startsWith('http') ? url : `/api/public/download?key=${encodeURIComponent(url)}`);
  }, [capture?.screenshot_url]);

  // Handle password prompt
  const handlePassword = useCallback((pw: string) => {
    setPassword(pw);
  }, []);

  // Determine available tabs
  const availableTabs = TABS.filter((tab) => {
    if (!capture) return tab.key === 'recording';
    switch (tab.key) {
      case 'recording':
        return !!capture.recording_url;
      case 'console':
        return !!capture.console_logs_url;
      case 'network':
        return !!capture.network_logs_url;
      case 'screenshot':
        return !!capture.screenshot_url;
      case 'environment':
        return !!capture.environment_json && Object.keys(capture.environment_json as object).length > 0;
      default:
        return false;
    }
  });

  // Password prompt
  if (data?.requiresPassword && !password) {
    return <PasswordPrompt onSubmit={handlePassword} />;
  }

  // Loading
  if (captureLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  // Error
  if (captureError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <span className="text-sm text-red-400">
            {captureError.message === 'Capture not found'
              ? 'This capture was not found or has expired.'
              : captureError.message}
          </span>
        </div>
      </div>
    );
  }

  if (!capture) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-neutral-500" />
          <span className="text-sm text-neutral-500">No capture data available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
              <Video className="h-4 w-4 text-indigo-400" />
            </div>
            <h1 className="text-lg font-semibold text-white">
              {capture.title || 'Bug Capture'}
            </h1>
          </div>
          {capture.description && (
            <p className="text-sm text-neutral-400">{capture.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(capture.created_at)}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {capture.view_count} views
            </span>
            {capture.expires_at && (
              <span>
                Expires {formatDate(capture.expires_at)}
              </span>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        {availableTabs.length > 1 && (
          <div className="flex gap-1 rounded-lg border border-neutral-800 bg-neutral-900/50 p-1">
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-400 hover:text-neutral-300'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Tab content */}
        <div>
          {activeTab === 'recording' && (
            <ReplayViewer events={events} loading={eventsLoading} error={eventsError} />
          )}
          {activeTab === 'console' && <ConsolePanel entries={consoleLogs} />}
          {activeTab === 'network' && <NetworkPanel entries={networkLogs} />}
          {activeTab === 'screenshot' && <ScreenshotPanel url={screenshotUrl} />}
          {activeTab === 'environment' && (
            <EnvironmentPanel env={capture.environment_json as Record<string, unknown> | null} />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-800 pt-4 text-center text-xs text-neutral-600">
          Captured with BugDetector
        </div>
      </div>
    </div>
  );
}
