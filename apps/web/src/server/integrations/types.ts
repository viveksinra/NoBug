import type { IntegrationProvider } from '@nobug/shared';

// ============================================================================
// Integration Adapter Types
// ============================================================================

/** Configuration passed when connecting an integration */
export interface IntegrationConfig {
  /** Provider-specific settings (e.g., repo owner/name for GitHub, project key for Jira) */
  [key: string]: unknown;
}

/** Auth credentials stored in auth_json (encrypted in future) */
export interface IntegrationAuth {
  /** OAuth access token or API token */
  accessToken?: string;
  /** OAuth refresh token */
  refreshToken?: string;
  /** Token expiry timestamp */
  expiresAt?: number;
  /** Webhook secret for verifying inbound webhooks */
  webhookSecret?: string;
  /** Provider-specific auth fields */
  [key: string]: unknown;
}

/** Data structure for syncing issues between NoBug and external providers */
export interface IssueSyncData {
  /** NoBug issue ID (null when pulling a new issue from external) */
  issueId?: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  type?: string;
  assignee?: string;
  labels?: string[];
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/** Reference returned after pushing an issue to an external provider */
export interface ExternalRef {
  /** External system's ID for the issue */
  externalId: string;
  /** URL to view the issue in the external system */
  externalUrl: string;
  /** Raw response metadata from the provider */
  metadata?: Record<string, unknown>;
}

/** Result of processing an inbound webhook */
export interface WebhookResult {
  /** Whether the webhook was processed successfully */
  handled: boolean;
  /** Action taken (e.g., 'issue_updated', 'status_changed', 'ignored') */
  action: string;
  /** NoBug issue ID affected, if any */
  issueId?: string;
  /** Human-readable message */
  message?: string;
}

/** Connection test result */
export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

// ============================================================================
// Integration Adapter Interface
// ============================================================================

/**
 * All integration adapters implement this interface.
 * Each provider (GitHub, Jira, Slack, etc.) has one adapter class.
 */
export interface IntegrationAdapter {
  /** Provider identifier matching IntegrationProvider enum */
  readonly provider: IntegrationProvider;

  // ─── Connection Lifecycle ──────────────────────────────────────

  /** Initialize the adapter with stored config and auth */
  connect(config: IntegrationConfig, auth: IntegrationAuth): Promise<void>;

  /** Tear down the connection and clean up resources */
  disconnect(): Promise<void>;

  /** Verify that the stored credentials are still valid */
  testConnection(): Promise<ConnectionTestResult>;

  // ─── Issue Sync ────────────────────────────────────────────────

  /** Push a NoBug issue to the external provider */
  pushIssue(issue: IssueSyncData): Promise<ExternalRef>;

  /** Pull an issue from the external provider by its external ID */
  pullIssue(externalId: string): Promise<IssueSyncData>;

  /** Sync a status change to the external provider */
  syncIssueStatus(issueId: string, status: string): Promise<void>;

  // ─── Webhooks ──────────────────────────────────────────────────

  /** Process an inbound webhook from the external provider */
  handleWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookResult>;
}
