'use client';

import { useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Monitor,
  ImageIcon,
  Video,
  Clock,
  FileText,
  Link2,
  Check,
  Clipboard,
  ArrowUpCircle,
  Zap,
  HardDrive,
} from 'lucide-react';
import { EnvironmentPanel, type EnvironmentInfo } from './EnvironmentPanel';
import { ScreenshotGallery, type ScreenshotItem } from './ScreenshotGallery';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecordingInfo {
  /** Duration in milliseconds */
  duration?: number | null;
  /** Number of rrweb events */
  eventCount?: number | null;
  /** File size in bytes */
  fileSize?: number | null;
}

export interface BugDetailSidebarProps {
  environment?: EnvironmentInfo | null;
  screenshots?: ScreenshotItem[];
  recording?: RecordingInfo | null;
  captureTimestamp?: number | string | Date | null;
  captureMode?: 'quick' | 'full' | null;
  shareableUrl?: string | null;
  /** Whether the "Promote to Issue" button should be shown (for Quick Captures not linked to an issue) */
  showPromoteToIssue?: boolean;
  /** Called when the user clicks "Promote to Issue" */
  onPromoteToIssue?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(ts: number | string | Date): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

function SidebarSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
  badge,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string | number | null;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[#262626] last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-neutral-900/50"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        <span className="text-xs font-medium text-neutral-300">{title}</span>
        {badge != null && (
          <span className="ml-auto rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {badge}
          </span>
        )}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BugDetailSidebar({
  environment,
  screenshots = [],
  recording,
  captureTimestamp,
  captureMode,
  shareableUrl,
  showPromoteToIssue,
  onPromoteToIssue,
}: BugDetailSidebarProps) {
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyLink = useCallback(async () => {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard may not be available
    }
  }, [shareableUrl]);

  const hasEnvironment = environment && Object.keys(environment).length > 0;
  const hasScreenshots = screenshots.length > 0;
  const hasRecording = recording && (recording.duration != null || recording.eventCount != null || recording.fileSize != null);
  const hasCaptureInfo = captureTimestamp != null || captureMode != null;

  return (
    <div className="rounded-lg border border-[#262626] bg-[#0a0a0a]">
      {/* Environment Section */}
      {hasEnvironment && (
        <SidebarSection title="Environment" icon={Monitor} defaultOpen={true}>
          <EnvironmentPanel environment={environment} />
        </SidebarSection>
      )}

      {/* Screenshots Section */}
      {hasScreenshots && (
        <SidebarSection
          title="Screenshots"
          icon={ImageIcon}
          defaultOpen={true}
          badge={screenshots.length}
        >
          <ScreenshotGallery screenshots={screenshots} />
        </SidebarSection>
      )}

      {/* Recording Info Section */}
      {(hasRecording || hasCaptureInfo) && (
        <SidebarSection title="Recording Info" icon={Video} defaultOpen={true}>
          <div className="space-y-2.5">
            {recording?.duration != null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <Clock className="h-3 w-3" />
                  Duration
                </div>
                <span className="text-xs text-neutral-300">
                  {formatDuration(recording.duration)}
                </span>
              </div>
            )}
            {recording?.eventCount != null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <FileText className="h-3 w-3" />
                  Events
                </div>
                <span className="text-xs text-neutral-300">
                  {recording.eventCount.toLocaleString()}
                </span>
              </div>
            )}
            {recording?.fileSize != null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <HardDrive className="h-3 w-3" />
                  File Size
                </div>
                <span className="text-xs text-neutral-300">
                  {formatFileSize(recording.fileSize)}
                </span>
              </div>
            )}
            {captureTimestamp != null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <Clock className="h-3 w-3" />
                  Captured
                </div>
                <span className="text-xs text-neutral-300">
                  {formatTimestamp(captureTimestamp)}
                </span>
              </div>
            )}
            {captureMode && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <Zap className="h-3 w-3" />
                  Mode
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    captureMode === 'quick'
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-indigo-500/10 text-indigo-400'
                  }`}
                >
                  {captureMode === 'quick' ? 'Quick Capture' : 'Full Capture'}
                </span>
              </div>
            )}
          </div>
        </SidebarSection>
      )}

      {/* Shareable Link + Promote */}
      {(shareableUrl || showPromoteToIssue) && (
        <div className="space-y-2 border-t border-[#262626] px-4 py-4">
          {shareableUrl && (
            <button
              onClick={handleCopyLink}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-[#262626] bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white"
            >
              {linkCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5" />
                  Copy Shareable Link
                </>
              )}
            </button>
          )}
          {showPromoteToIssue && (
            <button
              onClick={onPromoteToIssue}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
              Promote to Issue
            </button>
          )}
        </div>
      )}

      {/* Empty state when no sections have content */}
      {!hasEnvironment && !hasScreenshots && !hasRecording && !hasCaptureInfo && !shareableUrl && !showPromoteToIssue && (
        <div className="flex h-32 items-center justify-center text-sm text-neutral-500">
          No details available
        </div>
      )}
    </div>
  );
}
