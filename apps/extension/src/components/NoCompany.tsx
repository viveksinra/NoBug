import React from 'react';
import { APP_URL } from '@/lib/constants';
import type { AuthState } from '@/lib/types';

interface Props {
  authState: AuthState;
  onLogout: () => void;
}

export function NoCompany({ authState, onLogout }: Props) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text">NoBug</h1>
          <p className="text-xs text-text-secondary truncate max-w-[200px]">
            {authState.user?.email}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Quick Capture — always available */}
      <button
        className="w-full py-2.5 px-4 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors"
        onClick={() => {
          // Quick capture — T-029
        }}
      >
        Quick Capture
      </button>

      <div className="border-t border-border" />

      <div className="text-center py-2">
        <p className="text-sm text-text-secondary">
          Create a team to unlock full bug tracking
        </p>
        <a
          href={`${APP_URL}/onboarding`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 py-2 px-4 rounded-lg bg-surface border border-border text-text font-medium text-sm hover:bg-surface-hover hover:border-border-hover transition-colors"
        >
          Create Team
        </a>
      </div>
    </div>
  );
}
