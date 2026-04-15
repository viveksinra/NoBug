'use client';

import { useCallback, useRef, useState, useMemo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimelineMarkerType = 'console-error' | 'network-failure' | 'click' | 'navigation';

export interface TimelineMarker {
  /** Offset from recording start in ms */
  time: number;
  type: TimelineMarkerType;
  label?: string;
}

export interface TimelineProps {
  /** Total recording duration in ms */
  duration: number;
  /** Current playback position in ms */
  currentTime: number;
  /** Event markers to render on the timeline */
  markers: TimelineMarker[];
  /** Called when user clicks/seeks on the timeline */
  onSeek: (timeMs: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKER_COLORS: Record<TimelineMarkerType, string> = {
  'console-error': '#ef4444',
  'network-failure': '#f97316',
  'click': '#3b82f6',
  'navigation': '#22c55e',
};

const MARKER_LABELS: Record<TimelineMarkerType, string> = {
  'console-error': 'Console Error',
  'network-failure': 'Network Failure',
  'click': 'Click',
  'navigation': 'Navigation',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getTimeLabels(startMs: number, endMs: number): number[] {
  const range = endMs - startMs;
  if (range <= 0) return [];

  // Pick a nice interval: 1s, 2s, 5s, 10s, 15s, 30s, 60s
  const intervals = [1000, 2000, 5000, 10000, 15000, 30000, 60000];
  let interval = intervals[0];
  for (const i of intervals) {
    if (range / i >= 3 && range / i <= 20) {
      interval = i;
      break;
    }
    interval = i;
  }

  const labels: number[] = [];
  const firstLabel = Math.ceil(startMs / interval) * interval;
  for (let t = firstLabel; t <= endMs; t += interval) {
    labels.push(t);
  }
  return labels;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Timeline({ duration, currentTime, markers, onSeek }: TimelineProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [zoomStart, setZoomStart] = useState(0);
  const [zoomEnd, setZoomEnd] = useState(1); // fraction 0-1
  const [hoveredMarker, setHoveredMarker] = useState<TimelineMarker | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const viewStart = zoomStart * duration;
  const viewEnd = zoomEnd * duration;
  const viewDuration = viewEnd - viewStart;

  // Time labels
  const timeLabels = useMemo(() => getTimeLabels(viewStart, viewEnd), [viewStart, viewEnd]);

  // Visible markers
  const visibleMarkers = useMemo(
    () => markers.filter((m) => m.time >= viewStart && m.time <= viewEnd),
    [markers, viewStart, viewEnd],
  );

  // Playback position as percentage of view
  const playheadPercent = viewDuration > 0
    ? Math.max(0, Math.min(100, ((currentTime - viewStart) / viewDuration) * 100))
    : 0;

  // Click to seek
  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = barRef.current;
      if (!bar || viewDuration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      onSeek(viewStart + percent * viewDuration);
    },
    [viewStart, viewDuration, onSeek],
  );

  // Zoom in: halve the view range around current playhead
  const handleZoomIn = useCallback(() => {
    const center = duration > 0 ? currentTime / duration : 0.5;
    const halfRange = (zoomEnd - zoomStart) / 4;
    setZoomStart(Math.max(0, center - halfRange));
    setZoomEnd(Math.min(1, center + halfRange));
  }, [zoomStart, zoomEnd, currentTime, duration]);

  // Zoom out: double the view range
  const handleZoomOut = useCallback(() => {
    const center = (zoomStart + zoomEnd) / 2;
    const halfRange = (zoomEnd - zoomStart);
    setZoomStart(Math.max(0, center - halfRange));
    setZoomEnd(Math.min(1, center + halfRange));
  }, [zoomStart, zoomEnd]);

  // Reset zoom
  const handleZoomReset = useCallback(() => {
    setZoomStart(0);
    setZoomEnd(1);
  }, []);

  const isZoomed = zoomStart > 0 || zoomEnd < 1;

  return (
    <div className="border-t border-neutral-800 bg-neutral-950 px-4 py-2">
      {/* Zoom controls + legend */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Legend */}
          {(['console-error', 'network-failure', 'click', 'navigation'] as TimelineMarkerType[]).map((type) => (
            <div key={type} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: MARKER_COLORS[type] }}
              />
              <span className="text-[10px] text-neutral-500">{MARKER_LABELS[type]}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            disabled={!isZoomed}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          {isZoomed && (
            <button
              onClick={handleZoomReset}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
              aria-label="Reset zoom"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Timeline bar */}
      <div
        ref={barRef}
        onClick={handleBarClick}
        className="relative h-8 w-full cursor-pointer rounded bg-neutral-900 border border-neutral-800"
        role="slider"
        aria-valuenow={currentTime}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-label="Recording timeline"
        tabIndex={0}
      >
        {/* Time labels */}
        {timeLabels.map((t) => {
          const pct = viewDuration > 0 ? ((t - viewStart) / viewDuration) * 100 : 0;
          return (
            <div
              key={t}
              className="absolute top-0 h-full border-l border-neutral-700/40"
              style={{ left: `${pct}%` }}
            >
              <span className="absolute -top-0.5 left-0.5 text-[9px] text-neutral-600 select-none">
                {formatTime(t)}
              </span>
            </div>
          );
        })}

        {/* Markers */}
        {visibleMarkers.map((marker, idx) => {
          const pct = viewDuration > 0 ? ((marker.time - viewStart) / viewDuration) * 100 : 0;
          return (
            <div
              key={`${marker.type}-${marker.time}-${idx}`}
              className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border border-neutral-950 cursor-pointer z-10 transition-transform hover:scale-150"
              style={{
                left: `${pct}%`,
                backgroundColor: MARKER_COLORS[marker.type],
                marginLeft: '-6px',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(marker.time);
              }}
              onMouseEnter={(e) => {
                setHoveredMarker(marker);
                setHoverPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseLeave={() => {
                setHoveredMarker(null);
                setHoverPos(null);
              }}
            />
          );
        })}

        {/* Playhead — vertical line */}
        <div
          className="absolute top-0 h-full w-0.5 bg-indigo-400 z-20 pointer-events-none"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-indigo-400" />
        </div>
      </div>

      {/* Current time label below */}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] font-mono text-neutral-500">{formatTime(viewStart)}</span>
        <span className="text-[10px] font-mono text-indigo-400">{formatTime(currentTime)}</span>
        <span className="text-[10px] font-mono text-neutral-500">{formatTime(viewEnd)}</span>
      </div>

      {/* Tooltip */}
      {hoveredMarker && hoverPos && (
        <div
          className="fixed z-50 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 shadow-lg pointer-events-none"
          style={{ left: hoverPos.x + 8, top: hoverPos.y - 30 }}
        >
          {MARKER_LABELS[hoveredMarker.type]}
          {hoveredMarker.label ? `: ${hoveredMarker.label}` : ''} at{' '}
          {formatTime(hoveredMarker.time)}
        </div>
      )}
    </div>
  );
}
