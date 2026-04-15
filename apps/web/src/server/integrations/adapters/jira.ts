import { BaseAdapter, IntegrationError } from '../base-adapter';
import type {
  IssueSyncData,
  ExternalRef,
  WebhookResult,
  ConnectionTestResult,
} from '../types';

// ============================================================================
// Jira Adapter (stub — actual API calls in T-044)
// ============================================================================

export class JiraAdapter extends BaseAdapter {
  readonly provider = 'JIRA' as const;

  async testConnection(): Promise<ConnectionTestResult> {
    this.ensureConnected();

    // TODO (T-044): Call GET /rest/api/3/myself
    throw new IntegrationError(
      this.provider,
      'Jira adapter not yet implemented. See T-044.',
    );
  }

  async pushIssue(_issue: IssueSyncData): Promise<ExternalRef> {
    this.ensureConnected();

    // TODO (T-044): POST /rest/api/3/issue
    throw new IntegrationError(
      this.provider,
      'pushIssue not yet implemented. See T-044.',
    );
  }

  async pullIssue(_externalId: string): Promise<IssueSyncData> {
    this.ensureConnected();

    // TODO (T-044): GET /rest/api/3/issue/:id
    throw new IntegrationError(
      this.provider,
      'pullIssue not yet implemented. See T-044.',
    );
  }

  async syncIssueStatus(_issueId: string, _status: string): Promise<void> {
    this.ensureConnected();

    // TODO (T-044): POST /rest/api/3/issue/:id/transitions
    throw new IntegrationError(
      this.provider,
      'syncIssueStatus not yet implemented. See T-044.',
    );
  }

  async handleWebhook(
    _payload: unknown,
    _headers: Record<string, string>,
  ): Promise<WebhookResult> {
    // TODO (T-044): Verify webhook signature, parse Jira event
    throw new IntegrationError(
      this.provider,
      'handleWebhook not yet implemented. See T-044.',
    );
  }
}
