'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirroring extension NetworkEntry)
// ---------------------------------------------------------------------------

export interface NetworkEntry {
  id: string;
  wallTime: number;
  timestamp: number;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  requestSize: number;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseSize: number;
  initiator: 'fetch' | 'xhr';
  failed: boolean;
  timing: {
    startTime: number;
    endTime: number;
    duration: number;
  };
}

export interface NetworkPanelProps {
  entries: NetworkEntry[];
  /** Current replay playback time in ms (offset from recording start) */
  currentTime: number;
  /** Recording start timestamp (performance.now origin) */
  recordingStartTime: number;
  /** Called when user clicks a request to seek replay */
  onSeek: (timeMs: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type StatusFilter = 'ALL' | 'success' | 'failed';
type MethodFilter = 'ALL' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'success', 'failed'];
const METHOD_FILTERS: MethodFilter[] = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return '#22c55e';
  if (status >= 300 && status < 400) return '#eab308';
  if (status >= 400) return '#ef4444';
  return '#6b7280';
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return '#3b82f6';
    case 'POST': return '#22c55e';
    case 'PUT': return '#f97316';
    case 'PATCH': return '#eab308';
    case 'DELETE': return '#ef4444';
    default: return '#6b7280';
  }
}

function truncateUrl(url: string, maxLen = 60): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    if (path.length > maxLen) return path.slice(0, maxLen - 3) + '...';
    return path;
  } catch {
    if (url.length > maxLen) return url.slice(0, maxLen - 3) + '...';
    return url;
  }
}

// ---------------------------------------------------------------------------
// Waterfall bar
// ---------------------------------------------------------------------------

function WaterfallBar({ entry, timelineStart, timelineEnd }: {
  entry: NetworkEntry;
  timelineStart: number;
  timelineEnd: number;
}) {
  const range = timelineEnd - timelineStart;
  if (range <= 0) return null;

  const left = Math.max(0, ((entry.timing.startTime - timelineStart) / range) * 100);
  const width = Math.max(1, ((entry.timing.duration) / range) * 100);

  return (
    <div className="relative h-3 w-full rounded bg-neutral-800">
      <div
        className="absolute top-0 h-full rounded"
        style={{
          left: `${left}%`,
          width: `${Math.min(width, 100 - left)}%`,
          backgroundColor: entry.failed ? '#ef4444' : '#3b82f6',
          opacity: 0.7,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NetworkPanel({ entries, currentTime, recordingStartTime, onSeek }: NetworkPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeRef = useRef<HTMLTableRowElement>(null);

  // Filter
  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return entries.filter((e) => {
      if (statusFilter === 'success' && e.failed) return false;
      if (statusFilter === 'failed' && !e.failed) return false;
      if (methodFilter !== 'ALL' && e.method.toUpperCase() !== methodFilter) return false;
      if (search && !e.url.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [entries, statusFilter, methodFilter, search]);

  // Find active entry (closest to current playback time)
  const activeIndex = useMemo(() => {
    if (filtered.length === 0) return -1;
    const targetTimestamp = recordingStartTime + currentTime;
    let closest = 0;
    let minDiff = Math.abs(filtered[0].timestamp - targetTimestamp);
    for (let i = 1; i < filtered.length; i++) {
      const diff = Math.abs(filtered[i].timestamp - targetTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
      if (filtered[i].timestamp > targetTimestamp) break;
    }
    return closest;
  }, [filtered, currentTime, recordingStartTime]);

  // Waterfall range
  const timelineStart = entries.length > 0 ? Math.min(...entries.map((e) => e.timing.startTime)) : 0;
  const timelineEnd = entries.length > 0 ? Math.max(...entries.map((e) => e.timing.endTime)) : 1;

  // Auto-scroll to active
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  const handleRowClick = useCallback(
    (entry: NetworkEntry) => {
      const offsetMs = entry.timestamp - recordingStartTime;
      onSeek(Math.max(0, offsetMs));
    },
    [recordingStartTime, onSeek],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        {/* Status filters */}
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              statusFilter === f
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            {f === 'ALL' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}

        <span className="text-neutral-700">|</span>

        {/* Method filters */}
        {METHOD_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setMethodFilter(f)}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              methodFilter === f
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            {f}
          </button>
        ))}

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter URL..."
            className="h-6 w-40 rounded border border-neutral-700 bg-neutral-900 pl-6 pr-6 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <span className="text-[10px] text-neutral-500">{filtered.length} requests</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-neutral-900 text-left text-neutral-400">
            <tr>
              <th className="w-6 px-2 py-1.5" />
              <th className="w-16 px-2 py-1.5">Method</th>
              <th className="px-2 py-1.5">URL</th>
              <th className="w-16 px-2 py-1.5 text-center">Status</th>
              <th className="w-16 px-2 py-1.5 text-right">Time</th>
              <th className="w-16 px-2 py-1.5 text-right">Size</th>
              <th className="w-32 px-2 py-1.5">Waterfall</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, idx) => {
              const isActive = idx === activeIndex;
              const isExpanded = expandedId === entry.id;

              return (
                <tr key={entry.id} ref={undefined}>
                  {/* Main row */}
                  <td colSpan={7} className="p-0">
                    <table className="w-full">
                      <tbody>
                        <tr
                          ref={isActive ? activeRef : undefined}
                          onClick={() => handleRowClick(entry)}
                          className={`cursor-pointer transition-colors hover:bg-neutral-900 ${
                            entry.failed ? 'bg-red-950/20' : ''
                          } ${isActive ? 'ring-1 ring-inset ring-indigo-500/50 bg-indigo-950/20' : ''}`}
                        >
                          {/* Expand */}
                          <td className="w-6 px-2 py-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(entry.id);
                              }}
                              className="text-neutral-500 hover:text-neutral-300"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                          </td>

                          {/* Method */}
                          <td className="w-16 px-2 py-1.5">
                            <span
                              className="font-mono font-bold"
                              style={{ color: methodColor(entry.method) }}
                            >
                              {entry.method.toUpperCase()}
                            </span>
                          </td>

                          {/* URL */}
                          <td className="px-2 py-1.5">
                            <span className="font-mono text-neutral-300" title={entry.url}>
                              {truncateUrl(entry.url)}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="w-16 px-2 py-1.5 text-center">
                            <span
                              className="font-mono font-bold"
                              style={{ color: statusColor(entry.status) }}
                            >
                              {entry.status || '-'}
                            </span>
                          </td>

                          {/* Duration */}
                          <td className="w-16 px-2 py-1.5 text-right font-mono text-neutral-400">
                            {formatDuration(entry.timing.duration)}
                          </td>

                          {/* Size */}
                          <td className="w-16 px-2 py-1.5 text-right font-mono text-neutral-500">
                            {formatSize(entry.responseSize)}
                          </td>

                          {/* Waterfall */}
                          <td className="w-32 px-2 py-1.5">
                            <WaterfallBar
                              entry={entry}
                              timelineStart={timelineStart}
                              timelineEnd={timelineEnd}
                            />
                          </td>
                        </tr>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="bg-neutral-900/50 px-4 py-3">
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                {/* Request headers */}
                                <div>
                                  <h4 className="mb-1 font-semibold text-neutral-300">Request Headers</h4>
                                  <div className="max-h-40 overflow-auto rounded bg-neutral-900 p-2 font-mono text-[10px]">
                                    {Object.entries(entry.requestHeaders).length > 0 ? (
                                      Object.entries(entry.requestHeaders).map(([k, v]) => (
                                        <div key={k} className="break-all">
                                          <span className="text-blue-400">{k}</span>
                                          <span className="text-neutral-600">: </span>
                                          <span className="text-neutral-400">{v}</span>
                                        </div>
                                      ))
                                    ) : (
                                      <span className="text-neutral-600">No headers</span>
                                    )}
                                  </div>
                                </div>

                                {/* Response headers */}
                                <div>
                                  <h4 className="mb-1 font-semibold text-neutral-300">Response Headers</h4>
                                  <div className="max-h-40 overflow-auto rounded bg-neutral-900 p-2 font-mono text-[10px]">
                                    {Object.entries(entry.responseHeaders).length > 0 ? (
                                      Object.entries(entry.responseHeaders).map(([k, v]) => (
                                        <div key={k} className="break-all">
                                          <span className="text-green-400">{k}</span>
                                          <span className="text-neutral-600">: </span>
                                          <span className="text-neutral-400">{v}</span>
                                        </div>
                                      ))
                                    ) : (
                                      <span className="text-neutral-600">No headers</span>
                                    )}
                                  </div>
                                </div>

                                {/* Timing */}
                                <div className="col-span-2">
                                  <h4 className="mb-1 font-semibold text-neutral-300">Timing</h4>
                                  <div className="flex items-center gap-4 text-[10px]">
                                    <span className="text-neutral-400">
                                      Started: <span className="text-neutral-200">{formatTime(entry.timing.startTime - recordingStartTime)}</span>
                                    </span>
                                    <span className="text-neutral-400">
                                      Duration: <span className="text-neutral-200">{formatDuration(entry.timing.duration)}</span>
                                    </span>
                                    <span className="text-neutral-400">
                                      Initiator: <span className="text-neutral-200">{entry.initiator}</span>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-neutral-500">
            {entries.length === 0 ? 'No network requests captured' : 'No requests match filters'}
          </div>
        )}
      </div>
    </div>
  );
}
