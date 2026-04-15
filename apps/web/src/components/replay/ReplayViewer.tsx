'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { eventWithTime } from 'rrweb';
import { ReplayControls } from './ReplayControls';
import { Loader2, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplayViewerProps {
  /** rrweb events array */
  events: eventWithTime[] | null;
  /** Whether events are still loading */
  loading?: boolean;
  /** Error message to display */
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReplayViewer({ events, loading, error }: ReplayViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize rrweb-player
  useEffect(() => {
    if (!events || events.length < 2 || !containerRef.current) return;

    // Clean up previous player
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {
        // ignore
      }
      playerRef.current = null;
      setPlayerReady(false);
    }

    // Clear container
    const container = containerRef.current;
    container.innerHTML = '';

    // Dynamically import rrweb-player (it needs DOM)
    let cancelled = false;
    (async () => {
      try {
        const { default: rrwebPlayer } = await import('rrweb-player');
        // Also import the CSS
        await import('rrweb-player/dist/style.css');

        if (cancelled || !container) return;

        const player = new rrwebPlayer({
          target: container,
          props: {
            events,
            width: container.clientWidth,
            height: Math.round(container.clientWidth * 9 / 16),
            autoPlay: false,
            showController: false, // We use our own controls
            speed: 1,
            skipInactive: true,
            mouseTail: {
              strokeStyle: '#6366f1',
            },
          },
        });

        playerRef.current = player;

        // Get metadata
        const meta = player.getMetaData();
        const duration = meta.totalTime ?? 0;
        setTotalDuration(duration);
        setCurrentTime(0);
        setIsPlaying(false);
        setPlayerReady(true);
      } catch (err) {
        console.error('Failed to initialize rrweb-player:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.pause();
        } catch {
          // ignore
        }
      }
    };
  }, [events]);

  // Update timer while playing
  useEffect(() => {
    if (isPlaying && playerRef.current) {
      timerRef.current = setInterval(() => {
        try {
          const time = playerRef.current?.getCurrentTime?.();
          if (typeof time === 'number') {
            setCurrentTime(time);
            // Stop at the end
            if (time >= totalDuration) {
              setIsPlaying(false);
              playerRef.current?.pause?.();
            }
          }
        } catch {
          // ignore
        }
      }, 100);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, totalDuration]);

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
      setIsPlaying(false);
    } else {
      // If at the end, restart
      if (currentTime >= totalDuration) {
        playerRef.current.goto(0);
        setCurrentTime(0);
      }
      playerRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, currentTime, totalDuration]);

  // Handle speed change
  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    if (playerRef.current) {
      playerRef.current.setSpeed(newSpeed);
    }
  }, []);

  // Handle seek
  const handleSeek = useCallback((timeMs: number) => {
    if (!playerRef.current) return;
    playerRef.current.goto(timeMs);
    setCurrentTime(timeMs);
  }, []);

  // Handle fullscreen
  const handleFullscreen = useCallback(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Handle window resize for responsive player
  useEffect(() => {
    if (!playerRef.current || !containerRef.current) return;

    const resize = () => {
      const width = containerRef.current?.clientWidth;
      if (width && playerRef.current) {
        try {
          playerRef.current.$set?.({
            width,
            height: Math.round(width * 9 / 16),
          });
        } catch {
          // ignore
        }
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [playerReady]);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <span className="text-sm text-neutral-400">Loading recording...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-red-900/50 bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      </div>
    );
  }

  // No events
  if (!events || events.length < 2) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-neutral-500" />
          <span className="text-sm text-neutral-500">No recording data available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
      {/* Player container */}
      <div
        ref={containerRef}
        className="relative w-full bg-neutral-900 [&_.rr-player]:!bg-neutral-900 [&_.replayer-wrapper]:!bg-neutral-900 [&_.rr-controller]:!hidden [&_.rr-player__frame]:!bg-neutral-900"
        style={{ aspectRatio: '16/9' }}
      />

      {/* Custom controls */}
      {playerReady && (
        <ReplayControls
          isPlaying={isPlaying}
          speed={speed}
          currentTime={currentTime}
          totalDuration={totalDuration}
          isFullscreen={isFullscreen}
          onPlayPause={handlePlayPause}
          onSpeedChange={handleSpeedChange}
          onSeek={handleSeek}
          onFullscreen={handleFullscreen}
        />
      )}
    </div>
  );
}
