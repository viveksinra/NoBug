'use client';

import {
  Bug,
  Wrench,
  FlaskConical,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  PlayCircle,
  Clock,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestingTimelineProps {
  issueId: string;
  companyId: string;
}

/** Lifecycle stages in order */
const LIFECYCLE_STAGES = [
  { key: 'BUG_REPORT', label: 'Bug Report', icon: Bug },
  { key: 'DEV_FIX', label: 'Dev Fix', icon: Wrench },
  { key: 'DEV_TESTING', label: 'Dev Test', icon: FlaskConical },
  { key: 'QA_TESTING', label: 'QA Test', icon: ShieldCheck },
  { key: 'CLOSED', label: 'Closed', icon: CheckCircle2 },
] as const;

/** Map status to a stage key */
function statusToStage(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'BUG_REPORT';
    case 'IN_PROGRESS':
      return 'DEV_FIX';
    case 'DEV_TESTING':
      return 'DEV_TESTING';
    case 'QA_TESTING':
      return 'QA_TESTING';
    case 'CLOSED':
      return 'CLOSED';
    case 'REOPENED':
      return 'DEV_FIX'; // Reopened goes back to dev
    default:
      return 'BUG_REPORT';
  }
}

/** Get color classes based on entry type */
function getEventColor(entry: any): string {
  const metadata = entry.data?.metadata_json;

  // QA verdict entries
  if (metadata?.qa_verdict === 'PASS') return 'text-green-600 dark:text-green-400';
  if (metadata?.qa_verdict === 'FAIL') return 'text-red-600 dark:text-red-400';

  // Status transitions
  if (metadata?.to === 'CLOSED') return 'text-green-600 dark:text-green-400';
  if (metadata?.to === 'REOPENED') return 'text-red-600 dark:text-red-400';

  // Recordings
  if (entry.type === 'recording') return 'text-blue-600 dark:text-blue-400';

  return 'text-muted-foreground';
}

type StageKey = (typeof LIFECYCLE_STAGES)[number]['key'];

/** Get background color for stage indicator */
function getStageColor(stageKey: StageKey, currentStage: string, issueStatus: string): string {
  const stageOrder: readonly string[] = LIFECYCLE_STAGES.map((s) => s.key);
  const currentIdx = stageOrder.indexOf(currentStage);
  const thisIdx = stageOrder.indexOf(stageKey);

  if (issueStatus === 'REOPENED' && stageKey === 'DEV_FIX') {
    return 'bg-red-100 border-red-400 text-red-700 dark:bg-red-950 dark:border-red-600 dark:text-red-300';
  }

  if (thisIdx < currentIdx) {
    return 'bg-green-100 border-green-400 text-green-700 dark:bg-green-950 dark:border-green-600 dark:text-green-300';
  }

  if (thisIdx === currentIdx) {
    return 'bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-950 dark:border-blue-600 dark:text-blue-300';
  }

  return 'bg-muted border-muted-foreground/30 text-muted-foreground';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TestingTimeline({ issueId, companyId }: TestingTimelineProps) {
  const timeline = trpc.testingWorkflow.getTestingTimeline.useQuery(
    { companyId, issueId },
    { enabled: !!issueId },
  );

  if (timeline.isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Clock className="h-4 w-4 animate-pulse" />
        Loading timeline...
      </div>
    );
  }

  if (timeline.error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        Failed to load timeline: {timeline.error.message}
      </div>
    );
  }

  const data = timeline.data;
  if (!data) return null;

  const currentStage = statusToStage(data.issue.status);

  return (
    <div className="space-y-6">
      {/* Stage Progress Bar */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Issue Lifecycle</h3>
        <div className="flex items-center gap-1">
          {LIFECYCLE_STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const colorClass = getStageColor(stage.key, currentStage, data.issue.status);
            const isCurrent = stage.key === currentStage;

            return (
              <div key={stage.key} className="flex items-center flex-1">
                <div
                  className={`flex flex-col items-center gap-1 flex-1 rounded-md border px-2 py-2 transition-all ${colorClass} ${isCurrent ? 'ring-2 ring-ring shadow-sm' : ''}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-[10px] font-medium leading-tight text-center">
                    {stage.label}
                  </span>
                </div>
                {idx < LIFECYCLE_STAGES.length - 1 && (
                  <div className="mx-1 h-px w-3 bg-border flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
        {data.issue.status === 'REOPENED' && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
            <RotateCcw className="h-3 w-3" />
            Issue was reopened — returned to developer
          </p>
        )}
      </div>

      {/* Detailed Timeline */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Activity Timeline</h3>

        {data.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <div className="relative space-y-0">
            {/* Vertical line */}
            <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

            {data.timeline.map((entry: any, idx: number) => {
              const color = getEventColor(entry);
              const metadata = entry.data?.metadata_json;

              return (
                <div key={idx} className="relative flex gap-3 pb-4 last:pb-0">
                  {/* Dot */}
                  <div
                    className={`relative z-10 mt-1 h-6 w-6 flex-shrink-0 rounded-full border-2 bg-background flex items-center justify-center ${color}`}
                  >
                    {entry.type === 'recording' ? (
                      <PlayCircle className="h-3 w-3" />
                    ) : entry.type === 'activity' ? (
                      metadata?.to === 'REOPENED' ? (
                        <RotateCcw className="h-3 w-3" />
                      ) : metadata?.to === 'CLOSED' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Wrench className="h-3 w-3" />
                      )
                    ) : (
                      <Bug className="h-3 w-3" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-sm font-medium ${color}`}>
                        {entry.type === 'recording' && (
                          <>Recording: {entry.data.type}</>
                        )}
                        {entry.type === 'activity' && (
                          <>
                            {metadata?.from} → {metadata?.to}
                            {metadata?.qa_verdict && (
                              <span className="ml-1">
                                (QA: {metadata.qa_verdict})
                              </span>
                            )}
                          </>
                        )}
                        {entry.type === 'comment' && (
                          <>{entry.data.content}</>
                        )}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    {metadata?.notes && (
                      <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                        {metadata.notes}
                      </p>
                    )}
                    {entry.type === 'recording' && entry.data.id && (
                      <a
                        href={`/recordings/${entry.data.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        <PlayCircle className="h-3 w-3" />
                        View recording
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
