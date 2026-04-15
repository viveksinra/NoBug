import React, { useState, useCallback, useEffect } from 'react';
import { performCapture, type CaptureBundle } from '@/lib/capture';
import type { AuthState } from '@/lib/types';
import { APP_URL } from '@/lib/constants';

type CaptureState = 'capturing' | 'form' | 'submitting' | 'success' | 'error';

interface ProjectOption {
  id: string;
  name: string;
  key: string;
}

interface AssigneeOption {
  id: string;
  type: 'MEMBER' | 'AGENT';
  name: string;
  email: string | null;
  avatar_url: string | null;
}

interface LabelOption {
  id: string;
  name: string;
  color: string;
}

interface Props {
  authState: AuthState;
  onBack: () => void;
}

const PRIORITY_OPTIONS = [
  { value: 'CRITICAL', label: 'Critical', color: '#ef4444' },
  { value: 'HIGH', label: 'High', color: '#f97316' },
  { value: 'MEDIUM', label: 'Medium', color: '#eab308' },
  { value: 'LOW', label: 'Low', color: '#3b82f6' },
  { value: 'NONE', label: 'None', color: '#6b7280' },
] as const;

function getAuthHeaders(authState: AuthState): Record<string, string> {
  if (authState.method === 'api_key' && authState.apiKey) {
    return { Authorization: `Bearer ${authState.apiKey}` };
  }
  return {};
}

export function FullCapture({ authState, onBack }: Props) {
  const [state, setState] = useState<CaptureState>('capturing');
  const [bundle, setBundle] = useState<CaptureBundle | null>(null);
  const [error, setError] = useState('');

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(authState.activeProjectId ?? '');
  const [priority, setPriority] = useState('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeType, setAssigneeType] = useState<'MEMBER' | 'AGENT' | ''>('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [showLabels, setShowLabels] = useState(false);

  // Data from API
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [labels, setLabels] = useState<LabelOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Success state
  const [issueKey, setIssueKey] = useState('');
  const [issueUrl, setIssueUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Start capture immediately on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await performCapture();
        if (!cancelled) {
          setBundle(result);
          setState('form');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Capture failed');
          setState('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch projects, assignees when form is shown
  useEffect(() => {
    if (state !== 'form' || !authState.activeCompanyId) return;
    let cancelled = false;

    (async () => {
      setLoadingData(true);
      const headers = {
        'Content-Type': 'application/json',
        ...getAuthHeaders(authState),
      };
      const fetchOpts: RequestInit = {
        credentials: 'include' as const,
        headers,
      };

      try {
        const [projRes, assignRes] = await Promise.all([
          fetch(
            `${APP_URL}/api/extension/projects?companyId=${authState.activeCompanyId}`,
            fetchOpts,
          ),
          fetch(
            `${APP_URL}/api/extension/assignees?companyId=${authState.activeCompanyId}`,
            fetchOpts,
          ),
        ]);

        if (!cancelled) {
          if (projRes.ok) {
            const projData = await projRes.json();
            setProjects(projData.projects ?? []);
            // Auto-select first project if none set
            if (!selectedProjectId && projData.projects?.length) {
              setSelectedProjectId(projData.projects[0].id);
            }
          }
          if (assignRes.ok) {
            const assignData = await assignRes.json();
            setAssignees(assignData.assignees ?? []);
          }
        }
      } catch {
        // Network error — continue with empty lists
      }
      if (!cancelled) setLoadingData(false);
    })();

    return () => { cancelled = true; };
  }, [state, authState.activeCompanyId]);

  // Fetch labels when project changes
  useEffect(() => {
    if (!selectedProjectId || state !== 'form') return;
    let cancelled = false;

    (async () => {
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...getAuthHeaders(authState),
        };
        const res = await fetch(
          `${APP_URL}/api/extension/projects?companyId=${authState.activeCompanyId}&projectId=${selectedProjectId}`,
          { credentials: 'include', headers },
        );
        // Labels come from the project — for now just set empty
        // since there's no dedicated label endpoint, we'll leave labels
        // as a feature that can be used when available
        if (!cancelled) {
          setLabels([]);
          setSelectedLabelIds([]);
        }
      } catch {
        // Ignore
      }
    })();

    return () => { cancelled = true; };
  }, [selectedProjectId, state]);

  const handleSubmit = useCallback(async () => {
    if (!bundle || !selectedProjectId || !title.trim()) return;
    setState('submitting');
    setError('');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...getAuthHeaders(authState),
      };

      const payload = {
        projectId: selectedProjectId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigneeId: assigneeId || undefined,
        assigneeType: assigneeType || undefined,
        labelIds: selectedLabelIds.length > 0 ? selectedLabelIds : undefined,
        environmentJson: bundle.environment ?? undefined,
        captureData: {
          eventCount: bundle.events.length,
          consoleLogCount: bundle.consoleLogs.length,
          networkLogCount: bundle.networkLogs.length,
          hasScreenshot: !!bundle.screenshotDataUrl,
        },
      };

      const res = await fetch(`${APP_URL}/api/extension/create-issue`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to create issue' }));
        throw new Error(errData.error || 'Failed to create issue');
      }

      const result = await res.json();
      setIssueKey(result.key);
      setIssueUrl(result.url);
      setState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create issue');
      setState('error');
    }
  }, [bundle, selectedProjectId, title, description, priority, assigneeId, assigneeType, selectedLabelIds, authState]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(issueUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [issueUrl]);

  const handleAssigneeChange = (value: string) => {
    if (!value) {
      setAssigneeId('');
      setAssigneeType('');
      return;
    }
    const [type, id] = value.split(':');
    setAssigneeId(id);
    setAssigneeType(type as 'MEMBER' | 'AGENT');
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId],
    );
  };

  // Capturing state
  if (state === 'capturing') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-secondary">Capturing bug data...</p>
      </div>
    );
  }

  // Form state
  if (state === 'form' && bundle) {
    return (
      <div className="flex flex-col gap-2.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 9L4.5 6l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <h2 className="text-sm font-semibold text-text">Create Issue</h2>
        </div>

        {/* Capture summary */}
        <div className="flex gap-1.5 text-xs text-text-muted flex-wrap">
          {bundle.events.length > 0 && (
            <span className="bg-surface px-2 py-0.5 rounded">
              {bundle.events.length} events
            </span>
          )}
          {bundle.consoleLogs.length > 0 && (
            <span className="bg-surface px-2 py-0.5 rounded">
              {bundle.consoleLogs.length} logs
            </span>
          )}
          {bundle.networkLogs.length > 0 && (
            <span className="bg-surface px-2 py-0.5 rounded">
              {bundle.networkLogs.length} requests
            </span>
          )}
          {bundle.screenshotDataUrl && (
            <span className="bg-surface px-2 py-0.5 rounded">Screenshot</span>
          )}
        </div>

        {/* Title (required) */}
        <input
          type="text"
          placeholder="Bug title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
          autoFocus
        />

        {/* AI description placeholder */}
        <div className="w-full py-2 px-3 rounded-lg bg-surface/50 border border-dashed border-border text-xs text-text-muted">
          AI will generate description from captured data
        </div>

        {/* Description (optional) */}
        <textarea
          placeholder="Additional notes (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-primary resize-none"
        />

        {/* Project selector */}
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Project *</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            disabled={loadingData}
            className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm focus:outline-none focus:border-primary disabled:opacity-50"
          >
            <option value="">Select project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.key} - {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Priority + Assignee row */}
        <div className="flex gap-2">
          {/* Priority */}
          <div className="flex-1">
            <label className="text-xs font-medium text-text-secondary block mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm focus:outline-none focus:border-primary"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee */}
          <div className="flex-1">
            <label className="text-xs font-medium text-text-secondary block mb-1">Assignee</label>
            <select
              value={assigneeId ? `${assigneeType}:${assigneeId}` : ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              disabled={loadingData}
              className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="">Unassigned</option>
              {assignees.filter((a) => a.type === 'MEMBER').length > 0 && (
                <optgroup label="Members">
                  {assignees
                    .filter((a) => a.type === 'MEMBER')
                    .map((a) => (
                      <option key={a.id} value={`MEMBER:${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                </optgroup>
              )}
              {assignees.filter((a) => a.type === 'AGENT').length > 0 && (
                <optgroup label="AI Agents">
                  {assignees
                    .filter((a) => a.type === 'AGENT')
                    .map((a) => (
                      <option key={a.id} value={`AGENT:${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {/* Labels */}
        {labels.length > 0 && (
          <div>
            <button
              onClick={() => setShowLabels(!showLabels)}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              Labels ({selectedLabelIds.length} selected) {showLabels ? '-' : '+'}
            </button>
            {showLabels && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {labels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => toggleLabel(label.id)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                      selectedLabelIds.includes(label.id)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface text-text-muted hover:border-border-hover'
                    }`}
                    style={
                      selectedLabelIds.includes(label.id)
                        ? { borderColor: label.color, backgroundColor: `${label.color}20`, color: label.color }
                        : {}
                    }
                  >
                    {label.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* "Also sync to" placeholder */}
        <div className="flex items-center gap-2 text-xs text-text-muted py-1 border-t border-border">
          <span>Also sync to:</span>
          <div className="flex gap-1">
            {['GitHub', 'Jira', 'Slack'].map((name) => (
              <span
                key={name}
                className="px-1.5 py-0.5 rounded bg-surface text-text-muted/50 cursor-default"
                title="Coming soon"
              >
                {name}
              </span>
            ))}
          </div>
          <span className="text-text-muted/40 italic">Soon</span>
        </div>

        {/* Environment info */}
        {bundle.environment && (
          <div className="text-xs text-text-muted bg-surface rounded-lg p-2 space-y-0.5">
            <p className="truncate">{bundle.environment.url}</p>
            <p>
              {bundle.environment.browser} {bundle.environment.browserVersion} /{' '}
              {bundle.environment.os} / {bundle.environment.viewportWidth}x
              {bundle.environment.viewportHeight}
              {bundle.environment.framework ? ` / ${bundle.environment.framework}` : ''}
            </p>
          </div>
        )}

        {error && <p className="text-xs text-error">{error}</p>}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="flex-1 py-2 px-4 rounded-lg bg-surface border border-border text-text font-medium text-sm hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !selectedProjectId}
            className="flex-1 py-2 px-4 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Issue
          </button>
        </div>
      </div>
    );
  }

  // Submitting state
  if (state === 'submitting') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-secondary">Creating issue...</p>
      </div>
    );
  }

  // Success state
  if (state === 'success') {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-center py-2">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-success/20 text-success mb-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 10l3 3 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-text">Issue Created!</p>
          <p className="text-xs text-text-muted mt-1">{issueKey}</p>
        </div>

        {/* Issue URL */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={issueUrl}
            readOnly
            className="flex-1 py-2 px-3 rounded-lg bg-surface border border-border text-text text-xs font-mono focus:outline-none"
          />
          <button
            onClick={handleCopy}
            className="py-2 px-3 rounded-lg bg-primary text-white font-medium text-xs hover:bg-primary-hover transition-colors shrink-0"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <a
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2 px-4 rounded-lg bg-surface border border-border text-text font-medium text-sm hover:bg-surface-hover transition-colors text-center"
        >
          View Issue
        </a>

        <button
          onClick={onBack}
          className="w-full py-2 px-4 rounded-lg bg-surface border border-border text-text-muted font-medium text-sm hover:bg-surface-hover transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  // Error state
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center py-2">
        <p className="text-sm font-semibold text-error">
          {state === 'error' && bundle ? 'Failed to Create Issue' : 'Capture Failed'}
        </p>
        <p className="text-xs text-text-muted mt-1">{error}</p>
      </div>
      <button
        onClick={onBack}
        className="w-full py-2 px-4 rounded-lg bg-surface border border-border text-text font-medium text-sm hover:bg-surface-hover transition-colors"
      >
        Go Back
      </button>
    </div>
  );
}
