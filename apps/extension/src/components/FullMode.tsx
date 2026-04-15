import React, { useState } from 'react';
import type { AuthState } from '@/lib/types';
import { useRecording } from '@/lib/useRecording';
import { performCapture } from '@/lib/capture';
import { QuickCapture } from './QuickCapture';
import { APP_URL } from '@/lib/constants';

interface Props {
  authState: AuthState;
  onLogout: () => void;
  onSetActiveCompany: (id: string) => void;
  onSetActiveProject: (id: string) => void;
}

export function FullMode({
  authState,
  onLogout,
  onSetActiveCompany,
  onSetActiveProject,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);

  const activeCompany = authState.companies.find(
    (c) => c.id === authState.activeCompanyId,
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
            {activeCompany?.name?.charAt(0).toUpperCase() ?? 'N'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text truncate">
              {activeCompany?.name ?? 'NoBug'}
            </p>
            <p className="text-xs text-text-muted truncate">
              {authState.user?.email}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 10a2 2 0 100-4 2 2 0 000 4z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M13.5 8c0-.35-.03-.69-.08-1.02l1.36-1.07-.93-1.61-1.62.54a5.48 5.48 0 00-1.76-1.02L10 2H8l-.47 1.82a5.48 5.48 0 00-1.76 1.02l-1.62-.54-.93 1.61 1.36 1.07A5.55 5.55 0 004.5 8c0 .35.03.69.08 1.02l-1.36 1.07.93 1.61 1.62-.54c.5.43 1.1.78 1.76 1.02L8 14h2l.47-1.82a5.48 5.48 0 001.76-1.02l1.62.54.93-1.61-1.36-1.07c.05-.33.08-.67.08-1.02z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      </div>

      {showSettings ? (
        <SettingsPanel
          authState={authState}
          onBack={() => setShowSettings(false)}
          onLogout={onLogout}
          onSetActiveCompany={onSetActiveCompany}
        />
      ) : (
        <MainPanel authState={authState} />
      )}
    </div>
  );
}

function MainPanel({ authState }: { authState: AuthState }) {
  const { state: recording, startManualRecording, stopManualRecording } =
    useRecording();
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const handleCaptureBug = async () => {
    setCapturing(true);
    try {
      const bundle = await performCapture();
      // Store for full platform submission (T-030)
      await browser.storage.local.set({ nobug_capture_bundle: JSON.stringify(bundle) });
      console.log(`[NoBug] Captured: ${bundle.events.length} events, ${bundle.consoleLogs.length} logs, ${bundle.networkLogs.length} requests`);
    } catch (err) {
      console.error('[NoBug] Capture failed:', err);
    }
    setCapturing(false);
  };

  const handleManualToggle = async () => {
    if (recording.mode === 'manual') {
      await stopManualRecording();
    } else {
      await startManualRecording();
    }
  };

  const activeSlug =
    authState.companies.find((c) => c.id === authState.activeCompanyId)?.slug ?? '';

  if (showQuickCapture) {
    return <QuickCapture onBack={() => setShowQuickCapture(false)} />;
  }

  return (
    <>
      {/* Capture Bug button — Full Platform flow (T-030) */}
      <button
        className="w-full py-2.5 px-4 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
        onClick={handleCaptureBug}
        disabled={capturing || !recording.isRecording}
      >
        {capturing ? 'Capturing...' : 'Capture Bug'}
      </button>

      {/* Quick Capture — shareable link */}
      <button
        className="w-full py-2 px-4 rounded-lg bg-surface border border-border text-text font-medium text-sm hover:bg-surface-hover hover:border-border-hover transition-colors"
        onClick={() => setShowQuickCapture(true)}
      >
        Quick Capture
      </button>

      {/* Manual recording toggle */}
      <button
        className={`w-full py-1.5 px-4 rounded-lg border font-medium text-xs transition-colors ${
          recording.mode === 'manual'
            ? 'bg-error/10 border-error/30 text-error hover:bg-error/20'
            : 'bg-surface border-border text-text-secondary hover:bg-surface-hover hover:border-border-hover'
        }`}
        onClick={handleManualToggle}
      >
        {recording.mode === 'manual' ? 'Stop Manual Recording' : 'Start Manual Recording'}
      </button>

      {/* Recording status footer */}
      <div className="flex items-center justify-between text-xs text-text-muted pt-1">
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              recording.isThrottled
                ? 'bg-warning'
                : recording.isRecording
                  ? 'bg-success'
                  : 'bg-text-muted'
            }`}
          />
          {recording.isThrottled
            ? 'Throttled'
            : recording.isRecording
              ? `Recording (${recording.eventCount} events, ${recording.memoryUsageMB}MB)`
              : 'Not recording'}
        </span>
        <a
          href={`${APP_URL}/${activeSlug}/dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text-secondary transition-colors"
        >
          Open Dashboard
        </a>
      </div>
    </>
  );
}

function SettingsPanel({
  authState,
  onBack,
  onLogout,
  onSetActiveCompany,
}: {
  authState: AuthState;
  onBack: () => void;
  onLogout: () => void;
  onSetActiveCompany: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors self-start"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M7.5 9L4.5 6l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      {/* Company selector */}
      {authState.companies.length > 1 && (
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1.5">
            Team
          </label>
          <select
            value={authState.activeCompanyId ?? ''}
            onChange={(e) => onSetActiveCompany(e.target.value)}
            className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm focus:outline-none focus:border-primary"
          >
            {authState.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Auth info */}
      <div className="text-xs text-text-muted">
        <p>Auth: {authState.method === 'api_key' ? 'API Key' : 'Session'}</p>
        <p>
          Last synced:{' '}
          {authState.lastRefreshed
            ? new Date(authState.lastRefreshed).toLocaleTimeString()
            : 'Never'}
        </p>
      </div>

      <button
        onClick={onLogout}
        className="w-full py-2 px-4 rounded-lg bg-surface border border-error/30 text-error font-medium text-sm hover:bg-error/10 transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
