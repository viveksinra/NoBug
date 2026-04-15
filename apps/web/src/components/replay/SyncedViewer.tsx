'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReplayViewer, type RRWebEvent } from './ReplayViewer';
import { Timeline, type TimelineMarker } from './Timeline';
import { ConsolePanel, type ConsoleEntry } from './ConsolePanel';
import { NetworkPanel, type NetworkEntry } from './NetworkPanel';
import { Terminal, Wifi } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncedViewerProps {
  /** rrweb events array */
  events: RRWebEvent[] | null;
  /** Whether events are still loading */
  loading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Console log entries */
  consoleEntries?: ConsoleEntry[];
  /** Network request entries */
  networkEntries?: NetworkEntry[];
}

type TabId = 'console' | 'network';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build timeline markers from console entries, network entries, and rrweb events.
 * Timestamps in entries are performance.now() based. We convert to offset from
 * recording start (first rrweb event timestamp).
 */
function buildMarkers(
  recordingStartTime: number,
  consoleEntries: ConsoleEntry[],
  networkEntries: NetworkEntry[],
  events: RRWebEvent[],
): TimelineMarker[] {
  const markers: TimelineMarker[] = [];

  // Console errors
  for (const entry of consoleEntries) {
    if (entry.level === 'error' || entry.level === 'exception' || entry.level === 'unhandledrejection') {
      markers.push({
        time: entry.timestamp - recordingStartTime,
        type: 'console-error',
        label: entry.message.slice(0, 60),
      });
    }
  }

  // Network failures
  for (const entry of networkEntries) {
    if (entry.failed) {
      markers.push({
        time: entry.timestamp - recordingStartTime,
        type: 'network-failure',
        label: `${entry.method} ${truncateUrlShort(entry.url)} (${entry.status})`,
      });
    }
  }

  // rrweb user interaction events (type 3 = IncrementalSnapshot, source 2 = MouseInteraction)
  // and navigation events (type 4 = Meta with href change)
  for (const event of events) {
    const offset = event.timestamp - recordingStartTime;
    if (offset < 0) continue;

    // Mouse clicks: type=3 (IncrementalSnapshot), data.source=2 (MouseInteraction), data.type=2 (Click)
    if (
      event.type === 3 &&
      (event as any).data?.source === 2 &&
      (event as any).data?.type === 2
    ) {
      markers.push({ time: offset, type: 'click' });
    }

    // Page navigation: type=4 (Meta)
    if (event.type === 4 && (event as any).data?.href) {
      markers.push({
        time: offset,
        type: 'navigation',
        label: (event as any).data.href,
      });
    }
  }

  return markers.sort((a, b) => a.time - b.time);
}

function truncateUrlShort(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 30 ? u.pathname.slice(0, 27) + '...' : u.pathname;
  } catch {
    return url.length > 30 ? url.slice(0, 27) + '...' : url;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SyncedViewer({
  events,
  loading,
  error,
  consoleEntries = [],
  networkEntries = [],
}: SyncedViewerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('console');
  const [syncedTime, setSyncedTime] = useState(0);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Recording start time = first rrweb event timestamp
  const recordingStartTime = useMemo(() => {
    if (!events || events.length === 0) return 0;
    return events[0].timestamp;
  }, [events]);

  // Total duration
  const totalDuration = useMemo(() => {
    if (!events || events.length < 2) return 0;
    return events[events.length - 1].timestamp - events[0].timestamp;
  }, [events]);

  // Build timeline markers
  const markers = useMemo(
    () => buildMarkers(recordingStartTime, consoleEntries, networkEntries, events ?? []),
    [recordingStartTime, consoleEntries, networkEntries, events],
  );

  // Error/warning counts for tab badges
  const errorCount = useMemo(
    () => consoleEntries.filter((e) => e.level === 'error' || e.level === 'exception' || e.level === 'unhandledrejection').length,
    [consoleEntries],
  );
  const failedRequestCount = useMemo(
    () => networkEntries.filter((e) => e.failed).length,
    [networkEntries],
  );

  // Listen to ReplayViewer's time updates by observing the DOM
  // The ReplayViewer updates currentTime internally; we tap into it via a MutationObserver
  // on the seek bar, or we can poll the playerRef. Since we cannot modify ReplayViewer,
  // we use a polling approach on the seek bar's aria-valuenow.
  useEffect(() => {
    if (!playerContainerRef.current) return;

    const interval = setInterval(() => {
      const seekBar = playerContainerRef.current?.querySelector('[aria-label="Seek bar"]');
      if (seekBar) {
        const value = seekBar.getAttribute('aria-valuenow');
        if (value !== null) {
          const timeMs = parseFloat(value);
          if (!isNaN(timeMs) && timeMs !== syncedTime) {
            setSyncedTime(timeMs);
          }
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [syncedTime]);

  // Seek handler — called when user clicks timeline/console/network entry
  // We need to trigger a seek on the ReplayViewer. Since we can't modify it,
  // we simulate a click on the seek bar at the right position.
  const handleSeek = useCallback(
    (timeMs: number) => {
      setSyncedTime(timeMs);

      // Find the seek bar and simulate a click at the correct position
      const seekBar = playerContainerRef.current?.querySelector('[aria-label="Seek bar"]');
      if (seekBar && totalDuration > 0) {
        const rect = seekBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, timeMs / totalDuration));
        const clickX = rect.left + percent * rect.width;
        const clickY = rect.top + rect.height / 2;

        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: clickX,
          clientY: clickY,
        });
        seekBar.dispatchEvent(clickEvent);
      }
    },
    [totalDuration],
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
      {/* Top: Replay Viewer */}
      <div ref={playerContainerRef}>
        <ReplayViewer events={events} loading={loading} error={error} />
      </div>

      {/* Middle: Timeline */}
      {events && events.length >= 2 && (
        <Timeline
          duration={totalDuration}
          currentTime={syncedTime}
          markers={markers}
          onSeek={handleSeek}
        />
      )}

      {/* Bottom: Tabbed Console/Network panel */}
      {events && events.length >= 2 && (
        <div className="flex flex-col border-t border-neutral-800" style={{ height: '300px' }}>
          {/* Tab bar */}
          <div className="flex items-center border-b border-neutral-800 bg-neutral-900/50">
            <button
              onClick={() => setActiveTab('console')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === 'console'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              Console
              {errorCount > 0 && (
                <span className="ml-1 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                  {errorCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('network')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === 'network'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Wifi className="h-3.5 w-3.5" />
              Network
              {failedRequestCount > 0 && (
                <span className="ml-1 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                  {failedRequestCount}
                </span>
              )}
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'console' && (
              <ConsolePanel
                entries={consoleEntries}
                currentTime={syncedTime}
                recordingStartTime={recordingStartTime}
                onSeek={handleSeek}
              />
            )}
            {activeTab === 'network' && (
              <NetworkPanel
                entries={networkEntries}
                currentTime={syncedTime}
                recordingStartTime={recordingStartTime}
                onSeek={handleSeek}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
