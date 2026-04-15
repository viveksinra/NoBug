import React, { useState, useCallback } from 'react';
import { performCapture, submitQuickCapture, type CaptureBundle } from '@/lib/capture';

type CaptureState = 'idle' | 'capturing' | 'form' | 'uploading' | 'success' | 'error';

interface Props {
  onBack?: () => void;
}

export function QuickCapture({ onBack }: Props) {
  const [state, setState] = useState<CaptureState>('idle');
  const [bundle, setBundle] = useState<CaptureBundle | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shareUrl, setShareUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCapture = useCallback(async () => {
    setState('capturing');
    setError('');
    try {
      const result = await performCapture();
      setBundle(result);
      setState('form');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capture failed');
      setState('error');
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!bundle) return;
    setState('uploading');
    setProgress(0);
    setError('');

    try {
      const result = await submitQuickCapture(
        bundle,
        {
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          password: password.trim() || undefined,
        },
        setProgress,
      );
      setShareUrl(result.shareUrl);
      setExpiresAt(result.expiresAt);
      setState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setState('error');
    }
  }, [bundle, title, description, password]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  // Idle: show capture button
  if (state === 'idle') {
    return (
      <div className="flex flex-col gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors self-start"
          >
            Back
          </button>
        )}
        <button
          onClick={handleCapture}
          className="w-full py-2.5 px-4 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors"
        >
          Quick Capture
        </button>
        <p className="text-xs text-text-muted text-center">
          Captures the last 30 seconds of activity, console logs, network requests, and a screenshot
        </p>
      </div>
    );
  }

  // Capturing: loading spinner
  if (state === 'capturing') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-secondary">Capturing bug data...</p>
      </div>
    );
  }

  // Form: title, description, password, environment preview
  if (state === 'form' && bundle) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-text">Quick Capture</h2>

        {/* Capture summary */}
        <div className="flex gap-2 text-xs text-text-muted">
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

        {/* Environment info */}
        {bundle.environment && (
          <div className="text-xs text-text-muted bg-surface rounded-lg p-2 space-y-0.5">
            <p className="truncate">{bundle.environment.url}</p>
            <p>
              {bundle.environment.browser} {bundle.environment.browserVersion} /{' '}
              {bundle.environment.os} / {bundle.environment.viewportWidth}x
              {bundle.environment.viewportHeight}
              {bundle.environment.framework
                ? ` / ${bundle.environment.framework}`
                : ''}
            </p>
          </div>
        )}

        <input
          type="text"
          placeholder="Title (optional — AI generates if blank)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
        />

        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-primary resize-none"
        />

        {/* Password toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPassword(!showPassword)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              showPassword
                ? 'bg-primary/20 text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Password protect
          </button>
        </div>
        {showPassword && (
          <input
            type="text"
            placeholder="Password for viewing"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
          />
        )}

        {error && <p className="text-xs text-error">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => setState('idle')}
            className="flex-1 py-2 px-4 rounded-lg bg-surface border border-border text-text font-medium text-sm hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2 px-4 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors"
          >
            Share
          </button>
        </div>
      </div>
    );
  }

  // Uploading: progress bar
  if (state === 'uploading') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="text-sm text-text-secondary">
          Uploading... {Math.round(progress * 100)}%
        </p>
      </div>
    );
  }

  // Success: shareable link
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
          <p className="text-sm font-semibold text-text">Bug Captured!</p>
        </div>

        {/* Share URL */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={shareUrl}
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

        {expiresAt && (
          <p className="text-xs text-text-muted text-center">
            Expires {new Date(expiresAt).toLocaleDateString()}
          </p>
        )}

        <button
          onClick={() => {
            setState('idle');
            setBundle(null);
            setTitle('');
            setDescription('');
            setPassword('');
            setShareUrl('');
          }}
          className="w-full py-2 px-4 rounded-lg bg-surface border border-border text-text font-medium text-sm hover:bg-surface-hover transition-colors"
        >
          Capture Another
        </button>
      </div>
    );
  }

  // Error
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center py-2">
        <p className="text-sm font-semibold text-error">Capture Failed</p>
        <p className="text-xs text-text-muted mt-1">{error}</p>
      </div>
      <button
        onClick={() => setState('idle')}
        className="w-full py-2 px-4 rounded-lg bg-surface border border-border text-text font-medium text-sm hover:bg-surface-hover transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
