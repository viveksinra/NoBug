'use client';

import { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';

export function SettingsShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      <Separator />
      {children}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export function DangerZone({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 space-y-4">
      <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
      {children}
    </div>
  );
}

export function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 space-y-4">
      {children}
    </div>
  );
}
