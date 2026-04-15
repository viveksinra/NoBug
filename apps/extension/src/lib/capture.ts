import type { ConsoleEntry } from './console-types';
import type { NetworkEntry } from './network-types';
import type { EnvironmentInfo } from './environment';
import type { RedactionConfig } from './pii-redaction';
import { redactConsoleLogs, redactNetworkLogs, redactRrwebEvents } from './pii-redaction';
import { getRedactionConfig } from './redaction-config';
import type { ExtensionMessage } from './types';
import { APP_URL } from './constants';

/** Captured bug data ready for upload */
export interface CaptureBundle {
  /** rrweb events (PII-redacted) */
  events: unknown[];
  /** Console logs (PII-redacted) */
  consoleLogs: ConsoleEntry[];
  /** Network logs (PII-redacted) */
  networkLogs: NetworkEntry[];
  /** Screenshot data URL */
  screenshotDataUrl: string | null;
  /** Auto-detected environment info */
  environment: EnvironmentInfo | null;
}

/**
 * Orchestrate a full bug capture:
 * 1. Capture rrweb buffer + console + network from content script
 * 2. Capture screenshot from service worker
 * 3. Apply PII redaction
 * 4. Collect environment data
 */
export async function performCapture(): Promise<CaptureBundle> {
  // 1. Get buffer data from content script (via service worker relay)
  const bufferResponse = (await browser.runtime.sendMessage({
    type: 'CAPTURE_BUFFER',
  } satisfies ExtensionMessage)) as {
    events: unknown[];
    consoleLogs: ConsoleEntry[];
    networkLogs: NetworkEntry[];
  } | null;

  // 2. Capture screenshot
  let screenshotDataUrl: string | null = null;
  try {
    const ssResponse = (await browser.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
    } satisfies ExtensionMessage)) as { dataUrl?: string; error?: string };
    screenshotDataUrl = ssResponse?.dataUrl ?? null;
  } catch {
    // Screenshot failed — continue without it
  }

  // 3. Get environment info from active tab
  let environment: EnvironmentInfo | null = null;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const envResult = await browser.tabs.sendMessage(tab.id, {
        type: 'GET_ENVIRONMENT',
      });
      environment = envResult as EnvironmentInfo | null;
    }
  } catch {
    // Environment detection failed
  }

  // 4. Apply PII redaction
  const config: RedactionConfig = await getRedactionConfig();
  const events = bufferResponse?.events
    ? redactRrwebEvents(bufferResponse.events, config)
    : [];
  const consoleLogs = bufferResponse?.consoleLogs
    ? redactConsoleLogs(bufferResponse.consoleLogs, config)
    : [];
  const networkLogs = bufferResponse?.networkLogs
    ? redactNetworkLogs(bufferResponse.networkLogs, config)
    : [];

  return {
    events,
    consoleLogs,
    networkLogs,
    screenshotDataUrl,
    environment,
  };
}

/** Upload progress callback */
export type UploadProgressCallback = (progress: number) => void;

/**
 * Submit a Quick Capture to the backend.
 * Returns the shareable URL.
 */
export async function submitQuickCapture(
  bundle: CaptureBundle,
  opts: {
    title?: string;
    description?: string;
    password?: string;
  },
  onProgress?: UploadProgressCallback,
): Promise<{ slug: string; shareUrl: string; expiresAt: string | null }> {
  onProgress?.(0.1);

  // Compress the data
  const payload = {
    title: opts.title || undefined,
    description: opts.description || undefined,
    password: opts.password || undefined,
    environment_json: bundle.environment ?? undefined,
    recording_data: bundle.events.length > 0 ? { eventCount: bundle.events.length } : undefined,
    console_logs_data:
      bundle.consoleLogs.length > 0 ? { count: bundle.consoleLogs.length } : undefined,
    network_logs_data:
      bundle.networkLogs.length > 0 ? { count: bundle.networkLogs.length } : undefined,
    screenshot_data_url: bundle.screenshotDataUrl || undefined,
  };

  onProgress?.(0.3);

  // Call the backend API
  const res = await fetch(`${APP_URL}/api/extension/quick-capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  onProgress?.(0.8);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }

  const result = await res.json();
  onProgress?.(1.0);

  return {
    slug: result.slug,
    shareUrl: result.share_url,
    expiresAt: result.expires_at,
  };
}
