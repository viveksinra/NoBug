import React, { useState, useCallback, useEffect, useRef } from 'react';
import { performCapture, type CaptureBundle } from '@/lib/capture';
import type { AuthState } from '@/lib/types';
import { APP_URL } from '@/lib/constants';

type AttachState = 'capturing' | 'search' | 'submitting' | 'success' | 'error';

interface IssueOption {
  id: string;
  number: number;
  title: string;
  status: string;
  projectKey: string;
  key: string;
}

interface Props {
  authState: AuthState;
  onBack: () => void;
}

function getAuthHeaders(authState: AuthState): Record<string, string> {
  if (authState.method === 'api_key' && authState.apiKey) {
    return { Authorization: `Bearer ${authState.apiKey}` };
  }
  return {};
}

export function AttachToIssue({ authState, onBack }: Props) {
  const [state, setState] = useState<AttachState>('capturing');
  const [bundle, setBundle] = useState<CaptureBundle | null>(null);
  const [error, setError] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [issues, setIssues] = useState<IssueOption[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection
  const [selectedIssue, setSelectedIssue] = useState<IssueOption | null>(null);
  const [recordingType, setRecordingType] = useState<'DEV_TEST' | 'QA_TEST'>('DEV_TEST');

  // Success
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
          setState('search');
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

  // Debounced search
  useEffect(() => {
    if (state !== 'search') return;

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    // Fetch immediately if empty (shows recent issues) or after debounce
    const delay = searchQuery.trim() ? 300 : 0;

    searchTimerRef.current = setTimeout(async () => {
      setLoadingIssues(true);
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...getAuthHeaders(authState),
        };
        const params = new URLSearchParams({
          q: searchQuery.trim(),
          limit: '10',
        });
        if (authState.activeCompanyId) {
          params.set('companyId', authState.activeCompanyId);
        }
        if (authState.activeProjectId) {
          params.set('projectId', authState.activeProjectId);
        }

        const res = await fetch(
          `${APP_URL}/api/extension/search-issues?${params.toString()}`,
          { credentials: 'include', headers },
        );

        if (res.ok) {
          const data = await res.json();
          setIssues(data.issues ?? []);
        }
      } catch {
        // Network error
      }
      setLoadingIssues(false);
    }, delay);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, state, authState.activeCompanyId, authState.activeProjectId]);

  const handleSubmit = useCallback(async () => {
    if (!bundle || !selectedIssue) return;
    setState('submitting');
    setError('');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...getAuthHeaders(authState),
      };

      const payload = {
        issueId: selectedIssue.id,
        recordingType,
        captureData: {
          eventCount: bundle.events.length,
          consoleLogCount: bundle.consoleLogs.length,
          networkLogCount: bundle.networkLogs.length,
          hasScreenshot: !!bundle.screenshotDataUrl,
        },
        environmentJson: bundle.environment ?? undefined,
      };

      const res = await fetch(`${APP_URL}/api/extension/attach-recording`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to attach recording' }));
        throw new Error(errData.error || 'Failed to attach recording');
      }

      const result = await res.json();
      setIssueKey(result.issueKey);
      setIssueUrl(result.issueUrl);
      setState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach recording');
      setState('error');
    }
  }, [bundle, selectedIssue, recordingType, authState]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(issueUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [issueUrl]);

  // Capturing state
  if (state === 'capturing') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-secondary">Capturing test data...</p>
      </div>
    );
  }

  // Search & select state
  if (state === 'search' && bundle) {
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
          <h2 className="text-sm font-semibold text-text">Attach to Issue</h2>
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

        {/* Recording type selector */}
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Recording Type</label>
          <div className="flex gap-2">
            <button
              onClick={() => setRecordingType('DEV_TEST')}
              className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                recordingType === 'DEV_TEST'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-text-muted hover:border-border-hover'
              }`}
            >
              Dev Test
            </button>
            <button
              onClick={() => setRecordingType('QA_TEST')}
              className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                recordingType === 'QA_TEST'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-text-muted hover:border-border-hover'
              }`}
            >
              QA Test
            </button>
          </div>
        </div>

        {/* Issue search */}
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Search Issue</label>
          <input
            type="text"
            placeholder="Search by title or #number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
            autoFocus
          />
        </div>

        {/* Issue list */}
        <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border">
          {loadingIssues ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : issues.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">
              {searchQuery ? 'No issues found' : 'Type to search issues'}
            </p>
          ) : (
            issues.map((issue) => (
              <button
                key={issue.id}
                onClick={() => setSelectedIssue(issue)}
                className={`w-full text-left px-3 py-2 border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors ${
                  selectedIssue?.id === issue.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-text-muted shrink-0">
                    {issue.key}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    issue.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-500' :
                    issue.status === 'DEV_TESTING' ? 'bg-yellow-500/10 text-yellow-500' :
                    issue.status === 'QA_TESTING' ? 'bg-purple-500/10 text-purple-500' :
                    'bg-surface text-text-muted'
                  }`}>
                    {issue.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-sm text-text truncate mt-0.5">{issue.title}</p>
              </button>
            ))
          )}
        </div>

        {/* Selected issue indicator */}
        {selectedIssue && (
          <div className="flex items-center gap-2 text-xs text-success bg-success/10 rounded-lg px-3 py-2">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 6l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Selected: {selectedIssue.key} - {selectedIssue.title}
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
            disabled={!selectedIssue}
            className="flex-1 py-2 px-4 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Attach Recording
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
        <p className="text-sm text-text-secondary">Attaching recording...</p>
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
          <p className="text-sm font-semibold text-text">Recording Attached!</p>
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
          {bundle ? 'Failed to Attach Recording' : 'Capture Failed'}
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
