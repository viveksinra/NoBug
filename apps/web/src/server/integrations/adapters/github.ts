import { BaseAdapter, IntegrationError } from '../base-adapter';
import type {
  IssueSyncData,
  ExternalRef,
  WebhookResult,
  ConnectionTestResult,
} from '../types';

// ============================================================================
// GitHub Issues Adapter (stub — actual API calls in T-043)
// ============================================================================

export class GitHubAdapter extends BaseAdapter {
  readonly provider = 'GITHUB' as const;

  async testConnection(): Promise<ConnectionTestResult> {
    this.ensureConnected();

    // TODO (T-043): Call GET /user with the stored token
    throw new IntegrationError(
      this.provider,
      'GitHub adapter not yet implemented. See T-043.',
    );
  }

  async pushIssue(_issue: IssueSyncData): Promise<ExternalRef> {
    this.ensureConnected();

    // TODO (T-043): POST /repos/:owner/:repo/issues
    throw new IntegrationError(
      this.provider,
      'pushIssue not yet implemented. See T-043.',
    );
  }

  async pullIssue(_externalId: string): Promise<IssueSyncData> {
    this.ensureConnected();

    // TODO (T-043): GET /repos/:owner/:repo/issues/:number
    throw new IntegrationError(
      this.provider,
      'pullIssue not yet implemented. See T-043.',
    );
  }

  async syncIssueStatus(_issueId: string, _status: string): Promise<void> {
    this.ensureConnected();

    // TODO (T-043): PATCH /repos/:owner/:repo/issues/:number
    throw new IntegrationError(
      this.provider,
      'syncIssueStatus not yet implemented. See T-043.',
    );
  }

  async handleWebhook(
    _payload: unknown,
    _headers: Record<string, string>,
  ): Promise<WebhookResult> {
    // TODO (T-043): Verify X-Hub-Signature-256, parse event type
    throw new IntegrationError(
      this.provider,
      'handleWebhook not yet implemented. See T-043.',
    );
  }
}
