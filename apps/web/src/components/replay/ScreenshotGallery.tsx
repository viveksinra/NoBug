'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ImageIcon,
  Layers,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenshotItem {
  /** Unique id for the screenshot */
  id: string;
  /** URL to the original screenshot */
  originalUrl: string;
  /** URL to the annotated screenshot (optional) */
  annotatedUrl?: string | null;
  /** Caption / label */
  label?: string;
  /** Timestamp of capture */
  timestamp?: number | null;
}

export interface ScreenshotGalleryProps {
  screenshots: ScreenshotItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Lightbox Component
// ---------------------------------------------------------------------------

function Lightbox({
  screenshots,
  initialIndex,
  onClose,
}: {
  screenshots: ScreenshotItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showAnnotated, setShowAnnotated] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const current = screenshots[currentIndex];
  const hasAnnotated = !!current?.annotatedUrl;
  const displayUrl = showAnnotated && hasAnnotated ? current.annotatedUrl! : current?.originalUrl;

  // Reset zoom/pan when changing images
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowAnnotated(false);
  }, [currentIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % screenshots.length);
  }, [screenshots.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + screenshots.length) % screenshots.length);
  }, [screenshots.length]);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goPrev();
          break;
        case 'ArrowRight':
          goNext();
          break;
        case '+':
        case '=':
          zoomIn();
          break;
        case '-':
          zoomOut();
          break;
        case '0':
          resetZoom();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goNext, goPrev, zoomIn, zoomOut, resetZoom]);

  // Scroll to zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      } else {
        setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
      }
    },
    [],
  );

  // Pan handling
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [zoom, pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    },
    [isPanning],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!displayUrl) return;
    try {
      const response = await fetch(displayUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `screenshot-${current?.id ?? currentIndex}${showAnnotated ? '-annotated' : ''}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(displayUrl, '_blank');
    }
  }, [displayUrl, current?.id, currentIndex, showAnnotated]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-[#0a0a0a]/80 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-300">
            {currentIndex + 1} / {screenshots.length}
          </span>
          {current.label && (
            <span className="text-sm text-neutral-500">{current.label}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Annotated toggle */}
          {hasAnnotated && (
            <button
              onClick={() => setShowAnnotated(!showAnnotated)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showAnnotated
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300'
              }`}
              title={showAnnotated ? 'Show original' : 'Show annotated'}
            >
              <Layers className="h-3.5 w-3.5" />
              {showAnnotated ? 'Annotated' : 'Original'}
            </button>
          )}

          {/* Zoom controls */}
          <button
            onClick={zoomOut}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Zoom out"
            title="Zoom out (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center text-xs text-neutral-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={resetZoom}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Reset zoom"
            title="Reset zoom (0)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Download screenshot"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Close lightbox"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        ref={imageContainerRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
      >
        {/* Prev button */}
        {screenshots.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900/70 text-white transition-colors hover:bg-neutral-800"
            aria-label="Previous screenshot"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* Image */}
        <img
          src={displayUrl}
          alt={current.label ?? `Screenshot ${currentIndex + 1}`}
          className="max-h-full max-w-full select-none object-contain transition-transform duration-150"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          }}
          draggable={false}
        />

        {/* Next button */}
        {screenshots.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900/70 text-white transition-colors hover:bg-neutral-800"
            aria-label="Next screenshot"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Bottom thumbnail strip */}
      {screenshots.length > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-neutral-800 bg-[#0a0a0a]/80 px-4 py-2">
          {screenshots.map((ss, i) => (
            <button
              key={ss.id}
              onClick={() => setCurrentIndex(i)}
              className={`h-12 w-16 shrink-0 overflow-hidden rounded border-2 transition-colors ${
                i === currentIndex
                  ? 'border-indigo-500'
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img
                src={ss.originalUrl}
                alt={ss.label ?? `Thumbnail ${i + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gallery Component
// ---------------------------------------------------------------------------

export function ScreenshotGallery({ screenshots }: ScreenshotGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!screenshots || screenshots.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-[#262626] bg-[#0a0a0a]">
        <ImageIcon className="h-8 w-8 text-neutral-600" />
        <span className="text-sm text-neutral-500">No screenshots available</span>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {screenshots.map((ss, i) => (
          <div
            key={ss.id}
            className="group relative overflow-hidden rounded-lg border border-[#262626] bg-neutral-900 transition-colors hover:border-neutral-700"
          >
            {/* Thumbnail */}
            <button
              onClick={() => setLightboxIndex(i)}
              className="block w-full cursor-pointer"
              aria-label={`View ${ss.label ?? `screenshot ${i + 1}`}`}
            >
              <div className="relative aspect-video overflow-hidden bg-neutral-950">
                <img
                  src={ss.originalUrl}
                  alt={ss.label ?? `Screenshot ${i + 1}`}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Annotated badge */}
                {ss.annotatedUrl && (
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-indigo-500/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    <Layers className="h-2.5 w-2.5" />
                    Annotated
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                  <ZoomIn className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
            </button>

            {/* Info bar */}
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <span className="truncate text-xs text-neutral-400">
                {ss.label ?? `Screenshot ${i + 1}`}
              </span>
              {ss.timestamp && (
                <span className="shrink-0 text-[10px] text-neutral-600">
                  {formatTime(ss.timestamp)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          screenshots={screenshots}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
