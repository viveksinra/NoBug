import type { IntegrationProvider } from '@nobug/shared';
import type {
  IntegrationAdapter,
  IntegrationConfig,
  IntegrationAuth,
  IssueSyncData,
  ExternalRef,
  WebhookResult,
  ConnectionTestResult,
} from './types';

// ============================================================================
// Base Adapter — common logic for all integration adapters
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Abstract base class that implements common cross-cutting concerns:
 * - Structured logging
 * - Automatic retry with exponential backoff
 * - Error normalization
 *
 * Concrete adapters extend this and implement the abstract methods.
 */
export abstract class BaseAdapter implements IntegrationAdapter {
  abstract readonly provider: IntegrationProvider;

  protected config: IntegrationConfig = {};
  protected auth: IntegrationAuth = {};
  protected connected = false;

  // ─── Connection Lifecycle ──────────────────────────────────────

  async connect(config: IntegrationConfig, auth: IntegrationAuth): Promise<void> {
    this.log('Connecting...');
    this.config = config;
    this.auth = auth;
    this.connected = true;
    this.log('Connected');
  }

  async disconnect(): Promise<void> {
    this.log('Disconnecting...');
    this.config = {};
    this.auth = {};
    this.connected = false;
    this.log('Disconnected');
  }

  abstract testConnection(): Promise<ConnectionTestResult>;

  // ─── Issue Sync ────────────────────────────────────────────────

  abstract pushIssue(issue: IssueSyncData): Promise<ExternalRef>;
  abstract pullIssue(externalId: string): Promise<IssueSyncData>;
  abstract syncIssueStatus(issueId: string, status: string): Promise<void>;

  // ─── Webhooks ──────────────────────────────────────────────────

  abstract handleWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookResult>;

  // ─── Helpers ───────────────────────────────────────────────────

  /** Structured log with provider prefix */
  protected log(message: string, data?: Record<string, unknown>): void {
    const prefix = `[Integration:${this.provider}]`;
    if (data) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }

  /** Log an error with provider prefix */
  protected logError(message: string, error: unknown): void {
    const prefix = `[Integration:${this.provider}]`;
    console.error(prefix, message, error);
  }

  /** Ensure the adapter is connected before operations */
  protected ensureConnected(): void {
    if (!this.connected) {
      throw new IntegrationError(
        this.provider,
        'Adapter is not connected. Call connect() first.',
      );
    }
  }

  /**
   * Retry an async operation with exponential backoff.
   * Retries on transient errors (network, rate-limit) only.
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    label: string,
    maxRetries = MAX_RETRIES,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error) || attempt === maxRetries) {
          this.logError(`${label} failed after ${attempt} attempt(s)`, error);
          throw error;
        }

        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        this.log(`${label} attempt ${attempt} failed, retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError;
  }

  /** Determine if an error is transient and should be retried */
  protected isRetryable(error: unknown): boolean {
    if (error instanceof IntegrationError) {
      return error.retryable;
    }
    // Network errors are typically retryable
    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
      return true;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Integration Error
// ============================================================================

export class IntegrationError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly retryable = false,
    public readonly statusCode?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'IntegrationError';
  }
}
