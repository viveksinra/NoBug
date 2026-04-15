'use client';

import { useState } from 'react';
import {
  Globe,
  Monitor,
  Smartphone,
  Clipboard,
  Check,
  ExternalLink,
  Clock,
  Layers,
  Maximize2,
  Cpu,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvironmentInfo {
  url?: string | null;
  browser?: string | null;
  browserVersion?: string | null;
  os?: string | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  devicePixelRatio?: number | null;
  framework?: string | null;
  timestamp?: number | null;
  userAgent?: string | null;
}

export interface EnvironmentPanelProps {
  environment: EnvironmentInfo | null | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FRAMEWORK_COLORS: Record<string, string> = {
  'Next.js': 'bg-white/10 text-white',
  React: 'bg-sky-500/10 text-sky-400',
  Vue: 'bg-emerald-500/10 text-emerald-400',
  Nuxt: 'bg-emerald-500/10 text-emerald-400',
  Angular: 'bg-red-500/10 text-red-400',
  Svelte: 'bg-orange-500/10 text-orange-400',
  Astro: 'bg-purple-500/10 text-purple-400',
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getBrowserIcon(browser: string | null | undefined): React.ComponentType<{ className?: string }> {
  // All browsers get the Globe icon for simplicity
  switch (browser?.toLowerCase()) {
    case 'chrome':
    case 'firefox':
    case 'edge':
    case 'safari':
      return Globe;
    default:
      return Globe;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EnvironmentPanel({ environment }: EnvironmentPanelProps) {
  const [copied, setCopied] = useState(false);

  if (!environment || Object.keys(environment).length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-neutral-800 bg-[#0a0a0a] text-sm text-neutral-500">
        No environment info available
      </div>
    );
  }

  const env = environment;

  const handleCopyUrl = async () => {
    if (!env.url) return;
    try {
      await navigator.clipboard.writeText(env.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  const fields: {
    label: string;
    value: React.ReactNode;
    icon: React.ComponentType<{ className?: string }>;
    show: boolean;
  }[] = [
    {
      label: 'Page URL',
      icon: Globe,
      show: !!env.url,
      value: env.url ? (
        <div className="flex items-center gap-2">
          <a
            href={env.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-indigo-400 hover:text-indigo-300 hover:underline"
            title={env.url}
          >
            {env.url}
          </a>
          <ExternalLink className="h-3 w-3 shrink-0 text-neutral-500" />
          <button
            onClick={handleCopyUrl}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
            aria-label="Copy URL"
            title="Copy URL"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-400" />
            ) : (
              <Clipboard className="h-3 w-3" />
            )}
          </button>
        </div>
      ) : null,
    },
    {
      label: 'Browser',
      icon: getBrowserIcon(env.browser),
      show: !!env.browser,
      value: [env.browser, env.browserVersion].filter(Boolean).join(' ') || null,
    },
    {
      label: 'Operating System',
      icon: env.os?.toLowerCase().includes('android') || env.os?.toLowerCase().includes('ios')
        ? Smartphone
        : Monitor,
      show: !!env.os,
      value: env.os,
    },
    {
      label: 'Viewport',
      icon: Maximize2,
      show: env.viewportWidth != null && env.viewportHeight != null,
      value:
        env.viewportWidth != null && env.viewportHeight != null
          ? `${env.viewportWidth} x ${env.viewportHeight}`
          : null,
    },
    {
      label: 'Device Pixel Ratio',
      icon: Layers,
      show: env.devicePixelRatio != null,
      value: env.devicePixelRatio != null ? `${env.devicePixelRatio}x` : null,
    },
    {
      label: 'Framework',
      icon: Cpu,
      show: !!env.framework,
      value: env.framework ? (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            FRAMEWORK_COLORS[env.framework] ?? 'bg-neutral-800 text-neutral-300'
          }`}
        >
          {env.framework}
        </span>
      ) : null,
    },
    {
      label: 'Captured At',
      icon: Clock,
      show: env.timestamp != null,
      value: env.timestamp != null ? formatTimestamp(env.timestamp) : null,
    },
  ];

  const visibleFields = fields.filter((f) => f.show);

  return (
    <div className="rounded-lg border border-[#262626] bg-[#0a0a0a]">
      <div className="grid gap-0 sm:grid-cols-2">
        {visibleFields.map((field, i) => {
          const Icon = field.icon;
          const isLast = i === visibleFields.length - 1;
          const isLastRow =
            visibleFields.length % 2 === 0
              ? i >= visibleFields.length - 2
              : i === visibleFields.length - 1;

          return (
            <div
              key={field.label}
              className={`px-4 py-3 ${
                !isLastRow ? 'border-b border-[#262626]' : ''
              } ${
                i % 2 === 0 && !isLast ? 'sm:border-r sm:border-[#262626]' : ''
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-neutral-500" />
                <span className="text-xs font-medium text-neutral-500">
                  {field.label}
                </span>
              </div>
              <div className="text-sm text-neutral-200">{field.value}</div>
            </div>
          );
        })}
      </div>

      {/* User agent (collapsed by default) */}
      {env.userAgent && (
        <div className="border-t border-[#262626] px-4 py-3">
          <details>
            <summary className="cursor-pointer text-xs font-medium text-neutral-500 hover:text-neutral-400">
              User Agent
            </summary>
            <p className="mt-1.5 break-all font-mono text-xs text-neutral-400">
              {env.userAgent}
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
