'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  ChevronDown,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirroring extension ConsoleEntry)
// ---------------------------------------------------------------------------

export type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug' | 'exception' | 'unhandledrejection';

export interface ConsoleEntry {
  timestamp: number;
  wallTime: number;
  level: LogLevel;
  message: string;
  args: string[];
  stack: string | null;
}

export interface ConsolePanelProps {
  entries: ConsoleEntry[];
  /** Current replay playback time in ms (offset from recording start) */
  currentTime: number;
  /** Recording start timestamp (performance.now origin) */
  recordingStartTime: number;
  /** Called when user clicks an entry to seek replay */
  onSeek: (timeMs: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: '#ef4444',
  exception: '#ef4444',
  unhandledrejection: '#ef4444',
  warn: '#f97316',
  info: '#3b82f6',
  log: '#d4d4d4',
  debug: '#6b7280',
};

const LEVEL_BG: Record<LogLevel, string> = {
  error: 'bg-red-950/30',
  exception: 'bg-red-950/30',
  unhandledrejection: 'bg-red-950/30',
  warn: 'bg-orange-950/20',
  info: '',
  log: '',
  debug: '',
};

type FilterLevel = 'ALL' | 'error' | 'warn' | 'info' | 'debug';

const FILTER_OPTIONS: FilterLevel[] = ['ALL', 'error', 'warn', 'info', 'debug'];

// Window size for virtualization
const VISIBLE_WINDOW = 50;

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

function LevelIcon({ level }: { level: LogLevel }) {
  const className = 'h-3.5 w-3.5 flex-shrink-0';
  switch (level) {
    case 'error':
    case 'exception':
    case 'unhandledrejection':
      return <AlertCircle className={className} style={{ color: LEVEL_COLORS.error }} />;
    case 'warn':
      return <AlertTriangle className={className} style={{ color: LEVEL_COLORS.warn }} />;
    case 'info':
      return <Info className={className} style={{ color: LEVEL_COLORS.info }} />;
    case 'debug':
      return <Bug className={className} style={{ color: LEVEL_COLORS.debug }} />;
    default:
      return <span className={`${className} inline-block`} />;
  }
}

function matchesFilter(entry: ConsoleEntry, filter: FilterLevel): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'error') return entry.level === 'error' || entry.level === 'exception' || entry.level === 'unhandledrejection';
  return entry.level === filter;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConsolePanel({ entries, currentTime, recordingStartTime, onSeek }: ConsolePanelProps) {
  const [filter, setFilter] = useState<FilterLevel>('ALL');
  const [search, setSearch] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Filter + search
  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return entries.filter((e, _i) => {
      if (!matchesFilter(e, filter)) return false;
      if (search && !e.message.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [entries, filter, search]);

  // Find the entry closest to currentTime
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
      // entries are time-ordered, stop once we pass current time
      if (filtered[i].timestamp > targetTimestamp) break;
    }
    return closest;
  }, [filtered, currentTime, recordingStartTime]);

  // Virtualization: show entries around active index
  const windowStart = Math.max(0, activeIndex - VISIBLE_WINDOW);
  const windowEnd = Math.min(filtered.length, activeIndex + VISIBLE_WINDOW);
  const visibleEntries = filtered.slice(windowStart, windowEnd);

  // Auto-scroll to active entry
  useEffect(() => {
    if (autoScroll && activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeIndex, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    // If user scrolls manually, disable auto-scroll; re-enable when they seek
    setAutoScroll(false);
  }, []);

  // Re-enable auto-scroll on seek
  const handleEntryClick = useCallback(
    (entry: ConsoleEntry) => {
      const offsetMs = entry.timestamp - recordingStartTime;
      onSeek(Math.max(0, offsetMs));
      setAutoScroll(true);
    },
    [recordingStartTime, onSeek],
  );

  const toggleExpanded = useCallback((globalIdx: number) => {
    setExpandedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(globalIdx)) next.delete(globalIdx);
      else next.add(globalIdx);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
        {/* Level filter buttons */}
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            {f === 'ALL' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'ALL' && (
              <span className="ml-1 text-neutral-500">
                ({entries.filter((e) => matchesFilter(e, f)).length})
              </span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
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

        <span className="text-[10px] text-neutral-500">{filtered.length} entries</span>
      </div>

      {/* Entries list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {windowStart > 0 && (
          <div className="px-3 py-1 text-[10px] text-neutral-600">
            ... {windowStart} earlier entries
          </div>
        )}

        {visibleEntries.map((entry, i) => {
          const globalIdx = windowStart + i;
          const isActive = globalIdx === activeIndex;
          const isExpanded = expandedIdx.has(globalIdx);
          const hasExpandable = (entry.args.length > 0 && entry.args[0] !== entry.message) || entry.stack;
          const entryTime = entry.timestamp - recordingStartTime;

          return (
            <div
              key={`${entry.timestamp}-${globalIdx}`}
              ref={isActive ? activeRef : undefined}
              className={`group flex cursor-pointer border-b border-neutral-800/50 px-3 py-1 text-xs transition-colors hover:bg-neutral-900 ${
                LEVEL_BG[entry.level]
              } ${isActive ? 'ring-1 ring-inset ring-indigo-500/50 bg-indigo-950/20' : ''}`}
              onClick={() => handleEntryClick(entry)}
            >
              {/* Expand toggle */}
              <div className="mr-1.5 flex w-4 flex-shrink-0 items-start pt-0.5">
                {hasExpandable ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(globalIdx);
                    }}
                    className="text-neutral-500 hover:text-neutral-300"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                ) : null}
              </div>

              {/* Level icon */}
              <div className="mr-2 flex items-start pt-0.5">
                <LevelIcon level={entry.level} />
              </div>

              {/* Timestamp */}
              <span className="mr-3 flex-shrink-0 font-mono text-[10px] text-neutral-500 pt-0.5">
                {formatTime(Math.max(0, entryTime))}
              </span>

              {/* Message */}
              <div className="min-w-0 flex-1">
                <div
                  className="break-all font-mono"
                  style={{ color: LEVEL_COLORS[entry.level] }}
                >
                  {entry.message}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="mt-1 space-y-1">
                    {entry.args.length > 0 && entry.args[0] !== entry.message && (
                      <div className="rounded bg-neutral-900 p-2 font-mono text-[10px] text-neutral-400 whitespace-pre-wrap break-all">
                        {entry.args.join('\n')}
                      </div>
                    )}
                    {entry.stack && (
                      <div className="rounded bg-neutral-900 p-2 font-mono text-[10px] text-red-400/70 whitespace-pre-wrap break-all">
                        {entry.stack}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {windowEnd < filtered.length && (
          <div className="px-3 py-1 text-[10px] text-neutral-600">
            ... {filtered.length - windowEnd} more entries
          </div>
        )}

        {filtered.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-neutral-500">
            {entries.length === 0 ? 'No console logs captured' : 'No entries match filters'}
          </div>
        )}
      </div>
    </div>
  );
}
