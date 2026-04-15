import { BaseAdapter, IntegrationError } from '../base-adapter';
import type {
  IssueSyncData,
  ExternalRef,
  WebhookResult,
  ConnectionTestResult,
} from '../types';

// ============================================================================
// Slack Adapter (stub — actual API calls in T-046)
// ============================================================================

export class SlackAdapter extends BaseAdapter {
  readonly provider = 'SLACK' as const;

  async testConnection(): Promise<ConnectionTestResult> {
    this.ensureConnected();

    // TODO (T-046): Call api.test or auth.test
    throw new IntegrationError(
      this.provider,
      'Slack adapter not yet implemented. See T-046.',
    );
  }

  async pushIssue(_issue: IssueSyncData): Promise<ExternalRef> {
    this.ensureConnected();

    // TODO (T-046): Post a rich message to configured channel
    throw new IntegrationError(
      this.provider,
      'pushIssue not yet implemented. See T-046.',
    );
  }

  async pullIssue(_externalId: string): Promise<IssueSyncData> {
    this.ensureConnected();

    // Slack doesn't have "issues" — this is a no-op for notification-only integrations
    throw new IntegrationError(
      this.provider,
      'pullIssue is not supported for Slack (notification-only provider).',
    );
  }

  async syncIssueStatus(_issueId: string, _status: string): Promise<void> {
    this.ensureConnected();

    // TODO (T-046): Post a status update message to channel
    throw new IntegrationError(
      this.provider,
      'syncIssueStatus not yet implemented. See T-046.',
    );
  }

  async handleWebhook(
    _payload: unknown,
    _headers: Record<string, string>,
  ): Promise<WebhookResult> {
    // TODO (T-046): Verify Slack signing secret, handle event callbacks
    throw new IntegrationError(
      this.provider,
      'handleWebhook not yet implemented. See T-046.',
    );
  }
}
