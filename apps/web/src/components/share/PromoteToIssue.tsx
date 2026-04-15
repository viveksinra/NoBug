'use client';

import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Loader2,
  X,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { PRIORITIES, ISSUE_TYPES } from '@nobug/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PromoteToIssueProps {
  captureId: string;
  captureTitle: string | null;
  companyId: string;
  companySlug: string;
  onClose: () => void;
  onPromoted?: (issueKey: string, issueId: string) => void;
}

// ---------------------------------------------------------------------------
// Priority / Type label helpers
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'None',
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-400',
  HIGH: 'text-orange-400',
  MEDIUM: 'text-yellow-400',
  LOW: 'text-blue-400',
  NONE: 'text-neutral-400',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PromoteToIssue({
  captureId,
  captureTitle,
  companyId,
  companySlug,
  onClose,
  onPromoted,
}: PromoteToIssueProps) {
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState(captureTitle || 'Bug from Quick Capture');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('MEDIUM');
  const [type, setType] = useState<(typeof ISSUE_TYPES)[number]>('BUG');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [assigneeType, setAssigneeType] = useState<'MEMBER' | 'AGENT' | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [promotedResult, setPromotedResult] = useState<{
    issueKey: string;
    issueId: string;
  } | null>(null);

  // Fetch projects
  const { data: projectsData } = trpc.project.list.useQuery(
    { companyId, limit: 100, page: 1 },
    { enabled: !!companyId },
  );

  // Fetch assignees
  const { data: assigneesData } = trpc.agent.listAssignable.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  // Fetch labels for selected project
  const { data: labelsData } = trpc.issue.listLabels.useQuery(
    { companyId, projectId },
    { enabled: !!projectId },
  );

  const promoteMut = trpc.share.promoteToIssue.useMutation({
    onSuccess: (data) => {
      setPromotedResult({ issueKey: data.issueKey, issueId: data.issueId });
      onPromoted?.(data.issueKey, data.issueId);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !title) return;

    promoteMut.mutate({
      companyId,
      captureId,
      projectId,
      title,
      priority,
      type,
      assigneeId,
      assigneeType,
      labelIds: selectedLabels.length > 0 ? selectedLabels : undefined,
    });
  };

  const projects = projectsData?.data ?? [];
  const assignees = [
    ...(assigneesData?.members ?? []),
    ...(assigneesData?.agents ?? []),
  ];
  const labels = labelsData ?? [];

  // Success state
  if (promotedResult) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl">
          <div className="flex flex-col items-center gap-4 p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-6 w-6 text-green-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white">Issue Created</h3>
              <p className="mt-1 text-sm text-neutral-400">
                Successfully promoted to{' '}
                <span className="font-mono text-indigo-400">{promotedResult.issueKey}</span>
              </p>
            </div>
            <div className="flex gap-3">
              <a
                href={`/${companySlug}/issues/${promotedResult.issueKey}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Issue
              </a>
              <Button
                variant="outline"
                onClick={onClose}
                className="border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Promote to Issue</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {/* Project selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">
              Project <span className="text-red-400">*</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setSelectedLabels([]);
              }}
              className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              required
            >
              <option value="">Select a project...</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.key} - {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              required
              maxLength={200}
            />
          </div>

          {/* Priority and Type row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-400">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p] || p}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-400">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {ISSUE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignee */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">Assignee</label>
            <select
              value={assigneeId ? `${assigneeType}:${assigneeId}` : ''}
              onChange={(e) => {
                if (!e.target.value) {
                  setAssigneeId(null);
                  setAssigneeType(null);
                } else {
                  const [aType, aId] = e.target.value.split(':');
                  setAssigneeType(aType as 'MEMBER' | 'AGENT');
                  setAssigneeId(aId);
                }
              }}
              className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {assignees.map((a: any) => (
                <option key={`${a.type}:${a.id}`} value={`${a.type}:${a.id}`}>
                  {a.type === 'AGENT' ? '[Agent] ' : ''}{a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Labels */}
          {projectId && labels.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-400">Labels</label>
              <div className="flex flex-wrap gap-2">
                {labels.map((label: any) => {
                  const isSelected = selectedLabels.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => {
                        setSelectedLabels((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== label.id)
                            : [...prev, label.id],
                        );
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        isSelected
                          ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                          : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600'
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      {label.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {promoteMut.error && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {promoteMut.error.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-neutral-800 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!projectId || !title || promoteMut.isPending}
            >
              {promoteMut.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
                  Create Issue
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
