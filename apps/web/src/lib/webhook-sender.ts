import { createHmac } from 'crypto';

// ============================================================================
// Webhook Delivery Utility
// ============================================================================

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface DeliveryAttempt {
  attempt: number;
  status_code: number | null;
  success: boolean;
  duration_ms: number;
  error?: string;
  attempted_at: string;
}

export interface DeliveryResult {
  success: boolean;
  attempts: DeliveryAttempt[];
  total_duration_ms: number;
}

const RETRY_DELAYS_MS = [1000, 5000, 30000]; // 1s, 5s, 30s
const TIMEOUT_MS = 10000; // 10 seconds per attempt
const MAX_ATTEMPTS = 3;

/**
 * Sign a webhook payload using HMAC-SHA256.
 */
export function signPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Send a webhook POST request with HMAC-SHA256 signature.
 * Retries up to 3 times with exponential backoff (1s, 5s, 30s).
 */
export async function sendWebhook(
  url: string,
  payload: WebhookPayload,
  secret: string,
): Promise<DeliveryResult> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);
  const attempts: DeliveryAttempt[] = [];
  const overallStart = Date.now();

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    // Wait before retry (skip delay on first attempt)
    if (i > 0) {
      await sleep(RETRY_DELAYS_MS[i - 1] ?? 30000);
    }

    const attemptStart = Date.now();
    let statusCode: number | null = null;
    let success = false;
    let error: string | undefined;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NoBug-Signature': signature,
          'X-NoBug-Event': payload.event,
          'X-NoBug-Timestamp': payload.timestamp,
          'User-Agent': 'NoBug-Webhooks/1.0',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      statusCode = response.status;
      success = response.status >= 200 && response.status < 300;
    } catch (err) {
      error =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'Request timed out after 10s'
            : err.message
          : 'Unknown error';
    }

    const durationMs = Date.now() - attemptStart;

    attempts.push({
      attempt: i + 1,
      status_code: statusCode,
      success,
      duration_ms: durationMs,
      error,
      attempted_at: new Date().toISOString(),
    });

    if (success) {
      return {
        success: true,
        attempts,
        total_duration_ms: Date.now() - overallStart,
      };
    }
  }

  return {
    success: false,
    attempts,
    total_duration_ms: Date.now() - overallStart,
  };
}

/**
 * Build a webhook payload for a given event and data.
 */
export function buildWebhookPayload(
  event: string,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
}

/** Supported webhook event types */
export const WEBHOOK_EVENTS = [
  'issue.created',
  'issue.updated',
  'issue.status_changed',
  'issue.assigned',
  'comment.created',
  'capture.created',
  'regression.run_completed',
  'deploy.completed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
