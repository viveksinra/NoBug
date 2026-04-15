'use client';

import { useCallback, useRef } from 'react';
import {
  Play,
  Pause,
  Maximize,
  Minimize,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplayControlsProps {
  isPlaying: boolean;
  speed: number;
  currentTime: number;
  totalDuration: number;
  isFullscreen: boolean;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (timeMs: number) => void;
  onFullscreen: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SPEED_OPTIONS = [1, 2, 4] as const;

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReplayControls({
  isPlaying,
  speed,
  currentTime,
  totalDuration,
  isFullscreen,
  onPlayPause,
  onSpeedChange,
  onSeek,
  onFullscreen,
}: ReplayControlsProps) {
  const seekBarRef = useRef<HTMLDivElement>(null);

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  const handleSeekClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = seekBarRef.current;
      if (!bar || totalDuration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      onSeek(percent * totalDuration);
    },
    [totalDuration, onSeek],
  );

  const cycleSpeed = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(speed as 1 | 2 | 4);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    onSpeedChange(next);
  }, [speed, onSpeedChange]);

  return (
    <div className="border-t border-neutral-800 bg-neutral-950 px-4 py-3">
      {/* Seek bar */}
      <div
        ref={seekBarRef}
        onClick={handleSeekClick}
        className="group mb-3 h-1.5 w-full cursor-pointer rounded-full bg-neutral-800 transition-all hover:h-2"
        role="slider"
        aria-valuenow={currentTime}
        aria-valuemin={0}
        aria-valuemax={totalDuration}
        aria-label="Seek bar"
        tabIndex={0}
      >
        <div
          className="h-full rounded-full bg-indigo-500 transition-all group-hover:bg-indigo-400"
          style={{ width: `${progress}%` }}
        >
          <div className="relative h-full w-full">
            <div
              className="absolute -top-1 right-0 h-3.5 w-3.5 translate-x-1/2 rounded-full border-2 border-indigo-500 bg-white opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={onPlayPause}
          className="flex h-8 w-8 items-center justify-center rounded-md text-white transition-colors hover:bg-neutral-800"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>

        {/* Time display */}
        <span className="select-none font-mono text-xs text-neutral-400">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Speed selector */}
        <button
          onClick={cycleSpeed}
          className="flex h-7 items-center rounded-md border border-neutral-700 px-2 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white"
          aria-label={`Playback speed: ${speed}x`}
        >
          {speed}x
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={onFullscreen}
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
