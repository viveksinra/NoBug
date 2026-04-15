import React, { useState } from 'react';
import { APP_URL } from '@/lib/constants';
import { QuickCapture } from './QuickCapture';

interface Props {
  onLogin: () => void;
  onApiKeyLogin: (key: string) => Promise<boolean>;
}

export function NotLoggedIn({ onLogin, onApiKeyLogin }: Props) {
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApiKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await onApiKeyLogin(apiKey.trim());
    setLoading(false);
    if (!ok) {
      setError('Invalid API key. Check your key and try again.');
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center">
        <h1 className="text-xl font-bold text-text">NoBug</h1>
        <p className="text-sm text-text-secondary mt-1">
          Capture bugs instantly
        </p>
      </div>

      {/* Quick Capture — always available */}
      {showQuickCapture ? (
        <QuickCapture onBack={() => setShowQuickCapture(false)} />
      ) : (
        <button
          className="w-full py-2.5 px-4 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors"
          onClick={() => setShowQuickCapture(true)}
        >
          Quick Capture
        </button>
      )}

      <div className="border-t border-border" />

      {/* Sign in */}
      <button
        className="w-full py-2.5 px-4 rounded-lg bg-surface border border-border text-text font-medium text-sm hover:bg-surface-hover hover:border-border-hover transition-colors"
        onClick={onLogin}
      >
        Sign in to NoBug
      </button>

      {/* API key fallback */}
      {!showApiKey ? (
        <button
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          onClick={() => setShowApiKey(true)}
        >
          Use API key instead
        </button>
      ) : (
        <form onSubmit={handleApiKeySubmit} className="flex flex-col gap-2">
          <input
            type="password"
            placeholder="Paste your API key (nb_key_...)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full py-2 px-3 rounded-lg bg-surface border border-border text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
            autoFocus
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <button
            type="submit"
            disabled={!apiKey.trim() || loading}
            className="w-full py-2 px-4 rounded-lg bg-surface border border-border text-text font-medium text-sm hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Validating...' : 'Connect'}
          </button>
        </form>
      )}

      <p className="text-xs text-text-muted text-center">
        Get an API key from{' '}
        <a
          href={`${APP_URL}/settings/api-keys`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary-hover"
        >
          your settings
        </a>
      </p>
    </div>
  );
}
