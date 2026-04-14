import React from 'react';

interface Props {
  onAccept: () => void;
  onDecline: () => void;
}

export function ConsentDialog({ onAccept, onDecline }: Props) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center">
        <h1 className="text-xl font-bold text-text">NoBug</h1>
        <p className="text-sm text-text-secondary mt-1">Recording Consent</p>
      </div>

      <div className="bg-surface border border-border rounded-lg p-3 text-xs text-text-secondary leading-relaxed space-y-2">
        <p>
          NoBug records browsing activity to help capture and reproduce bugs. This includes:
        </p>
        <ul className="list-disc pl-4 space-y-1">
          <li>DOM interactions (mouse clicks, scrolls, input)</li>
          <li>Console log output</li>
          <li>Network requests (URLs, status codes, headers)</li>
          <li>Viewport screenshots</li>
        </ul>
        <p>
          <strong className="text-text">Privacy protections:</strong>
        </p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Input values are masked by default</li>
          <li>PII (emails, credit cards, auth tokens) is automatically redacted</li>
          <li>Authorization and cookie headers are masked</li>
          <li>All redaction happens locally before any data leaves your browser</li>
          <li>You can configure which redaction categories to apply</li>
        </ul>
        <p>
          Recording only happens on pages you visit while the extension is active.
          You can revoke consent at any time in the extension settings.
        </p>
      </div>

      <button
        onClick={onAccept}
        className="w-full py-2.5 px-4 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors"
      >
        I Understand — Enable Recording
      </button>

      <button
        onClick={onDecline}
        className="w-full py-2 px-4 rounded-lg bg-surface border border-border text-text-secondary font-medium text-sm hover:bg-surface-hover transition-colors"
      >
        Decline — No Recording
      </button>

      <p className="text-xs text-text-muted text-center">
        You can change this in extension settings at any time.
      </p>
    </div>
  );
}
