import { BaseAdapter, IntegrationError } from '../base-adapter';
import type {
  IntegrationConfig,
  IntegrationAuth,
  IssueSyncData,
  ExternalRef,
  WebhookResult,
  ConnectionTestResult,
} from '../types';

// ============================================================================
// Slack Adapter — 2-Way Notifications (T-046)
// ============================================================================

const SLACK_API_BASE = 'https://slack.com/api';

/** Priority → color hex for Block Kit sidebar */
const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#3b82f6',
};

/** Priority → emoji badge for display */
const PRIORITY_BADGES: Record<string, string> = {
  CRITICAL: ':red_circle: Critical',
  HIGH: ':large_orange_circle: High',
  MEDIUM: ':large_yellow_circle: Medium',
  LOW: ':large_blue_circle: Low',
};

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
  user?: string;
  team?: string;
  bot_id?: string;
  message?: {
    ts: string;
    text?: string;
  };
}

interface SlackInteractionPayload {
  type: string;
  token?: string;
  actions?: Array<{
    action_id: string;
    value?: string;
  }>;
  trigger_id?: string;
  user?: { id: string; name: string };
  channel?: { id: string; name: string };
  message?: { ts: string };
  command?: string;
  text?: string;
}

export class SlackAdapter extends BaseAdapter {
  readonly provider = 'SLACK' as const;

  /** Typed accessors for config/auth */
  private get botToken(): string {
    return (this.auth as { botToken?: string }).botToken ?? '';
  }

  private get channelId(): string {
    return (this.config as { channelId?: string }).channelId ?? '';
  }

  private get signingSecret(): string {
    return (this.auth as { webhookSecret?: string }).webhookSecret ?? '';
  }

  // ─── Connection Lifecycle ──────────────────────────────────────

  override async connect(
    config: IntegrationConfig,
    auth: IntegrationAuth,
  ): Promise<void> {
    await super.connect(config, auth);

    // Validate the bot token by calling auth.test
    const result = await this.slackApi<SlackApiResponse>('auth.test');
    if (!result.ok) {
      this.connected = false;
      throw new IntegrationError(
        this.provider,
        `Failed to validate bot token: ${result.error ?? 'unknown error'}`,
      );
    }

    this.log('Authenticated with Slack', {
      team: result.team,
      bot_id: result.bot_id,
    });
  }

  override async disconnect(): Promise<void> {
    await super.disconnect();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    this.ensureConnected();

    try {
      const result = await this.withRetry(
        () => this.slackApi<SlackApiResponse>('auth.test'),
        'testConnection',
      );

      if (result.ok) {
        return { ok: true, message: `Connected to Slack team (bot: ${result.user ?? 'unknown'})` };
      }

      return { ok: false, message: `Slack auth failed: ${result.error ?? 'unknown error'}` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  // ─── Issue Sync ────────────────────────────────────────────────

  async pushIssue(issue: IssueSyncData): Promise<ExternalRef> {
    this.ensureConnected();

    const blocks = this.buildIssueBlocks(issue);
    const color = PRIORITY_COLORS[issue.priority ?? 'MEDIUM'] ?? PRIORITY_COLORS.MEDIUM;
    const fallbackText = `[${issue.priority ?? 'MEDIUM'}] ${issue.title}`;

    // Check if the issue already has an external_id (message ts) — update instead of post
    const existingTs = issue.metadata?.externalId as string | undefined;

    if (existingTs) {
      // Update existing message
      const result = await this.withRetry(
        () =>
          this.slackApi<SlackApiResponse>('chat.update', {
            channel: this.channelId,
            ts: existingTs,
            text: fallbackText,
            attachments: [
              {
                color,
                blocks,
              },
            ],
          }),
        'pushIssue:update',
      );

      if (!result.ok) {
        throw new IntegrationError(
          this.provider,
          `Failed to update Slack message: ${result.error ?? 'unknown error'}`,
        );
      }

      return {
        externalId: existingTs,
        externalUrl: this.buildMessageUrl(this.channelId, existingTs),
        metadata: { channel: this.channelId, ts: existingTs },
      };
    }

    // Post new message
    const result = await this.withRetry(
      () =>
        this.slackApi<SlackApiResponse>('chat.postMessage', {
          channel: this.channelId,
          text: fallbackText,
          attachments: [
            {
              color,
              blocks,
            },
          ],
        }),
      'pushIssue:post',
    );

    if (!result.ok) {
      throw new IntegrationError(
        this.provider,
        `Failed to post Slack message: ${result.error ?? 'unknown error'}`,
      );
    }

    const ts = result.ts ?? result.message?.ts ?? '';
    const channel = result.channel ?? this.channelId;

    this.log('Posted issue to Slack', { ts, channel, issueId: issue.issueId });

    return {
      externalId: ts,
      externalUrl: this.buildMessageUrl(channel, ts),
      metadata: { channel, ts },
    };
  }

  async pullIssue(_externalId: string): Promise<IssueSyncData> {
    this.ensureConnected();

    // Slack is notification-only — return minimal data from the message timestamp
    // We cannot reconstruct a full issue from a Slack message
    return {
      title: 'Slack notification',
      status: 'OPEN',
      description: `Slack message reference: ${_externalId}`,
      metadata: { source: 'slack', ts: _externalId },
    };
  }

  async syncIssueStatus(issueId: string, status: string): Promise<void> {
    this.ensureConnected();

    // issueId here is the Slack message ts (externalId)
    const statusEmoji = this.getStatusEmoji(status);
    const statusText = `${statusEmoji} Status updated to *${status}*`;

    // Update the original message by posting a threaded reply with the status change
    const result = await this.withRetry(
      () =>
        this.slackApi<SlackApiResponse>('chat.postMessage', {
          channel: this.channelId,
          thread_ts: issueId,
          text: statusText,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: statusText,
              },
            },
          ],
        }),
      'syncIssueStatus',
    );

    if (!result.ok) {
      throw new IntegrationError(
        this.provider,
        `Failed to sync status to Slack: ${result.error ?? 'unknown error'}`,
      );
    }

    this.log('Synced issue status to Slack', { issueId, status });
  }

  // ─── Webhooks ──────────────────────────────────────────────────

  async handleWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    // Verify Slack request signature
    this.verifySlackSignature(payload, headers);

    const body = payload as Record<string, unknown>;

    // Handle URL verification challenge (Slack sends this when setting up event subscriptions)
    if (body.type === 'url_verification') {
      return {
        handled: true,
        action: 'url_verification',
        message: body.challenge as string,
      };
    }

    // Handle interactive payloads (button clicks, slash commands)
    // Slack sends these as form-encoded with a "payload" JSON string
    if (body.type === 'interactive_message' || body.type === 'block_actions') {
      return this.handleInteraction(body as unknown as SlackInteractionPayload);
    }

    // Handle slash commands
    if (body.command === '/bugdetector') {
      return this.handleSlashCommand(body as unknown as SlackInteractionPayload);
    }

    return {
      handled: false,
      action: 'ignored',
      message: `Unhandled Slack event type: ${String(body.type ?? body.command ?? 'unknown')}`,
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────

  /**
   * Call a Slack Web API method using native fetch.
   */
  private async slackApi<T extends SlackApiResponse>(
    method: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${SLACK_API_BASE}/${method}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const isRetryable = response.status === 429 || response.status >= 500;
      throw new IntegrationError(
        this.provider,
        `Slack API ${method} returned HTTP ${response.status}`,
        isRetryable,
        response.status,
      );
    }

    const data = (await response.json()) as T;

    // Slack returns 200 with ok:false for auth/permission errors
    if (!data.ok && data.error === 'ratelimited') {
      throw new IntegrationError(
        this.provider,
        `Slack API rate limited on ${method}`,
        true,
        429,
      );
    }

    return data;
  }

  /**
   * Build Block Kit blocks for an issue notification.
   */
  private buildIssueBlocks(issue: IssueSyncData): Record<string, unknown>[] {
    const priorityBadge = PRIORITY_BADGES[issue.priority ?? 'MEDIUM'] ?? PRIORITY_BADGES.MEDIUM;
    const descriptionExcerpt = issue.description
      ? issue.description.length > 200
        ? issue.description.substring(0, 200) + '...'
        : issue.description
      : '_No description provided._';

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bugdetector.dev';
    const issueUrl = issue.issueId ? `${appUrl}/issues/${issue.issueId}` : appUrl;

    const blocks: Record<string, unknown>[] = [
      // Header
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: issue.title.length > 150 ? issue.title.substring(0, 147) + '...' : issue.title,
          emoji: true,
        },
      },
      // Priority / Status / Assignee
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Priority:*\n${priorityBadge}`,
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${this.getStatusEmoji(issue.status)} ${issue.status}`,
          },
        ],
      },
    ];

    // Assignee field (optional)
    if (issue.assignee) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Assignee:* ${issue.assignee}`,
        },
      });
    }

    // Description excerpt
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: descriptionExcerpt,
      },
    });

    // Divider
    blocks.push({ type: 'divider' });

    // Actions — View Bug button
    if (issue.issueId) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Bug',
              emoji: true,
            },
            url: issueUrl,
            action_id: 'view_bug',
            value: issue.issueId,
          },
        ],
      });
    }

    // Context — timestamp
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Sent from BugDetector | ${new Date().toISOString()}`,
        },
      ],
    });

    return blocks;
  }

  /**
   * Get a status emoji for display.
   */
  private getStatusEmoji(status: string): string {
    const map: Record<string, string> = {
      OPEN: ':white_circle:',
      IN_PROGRESS: ':arrows_counterclockwise:',
      IN_REVIEW: ':mag:',
      RESOLVED: ':white_check_mark:',
      CLOSED: ':no_entry_sign:',
      BACKLOG: ':inbox_tray:',
    };
    return map[status] ?? ':question:';
  }

  /**
   * Build a permalink-style URL for a Slack message.
   * Note: actual deep links require the team ID, so this is a best-effort URL.
   */
  private buildMessageUrl(channel: string, ts: string): string {
    // Slack archive URL format: /archives/{channel}/p{ts_without_dot}
    const tsNoDot = ts.replace('.', '');
    return `https://slack.com/archives/${channel}/p${tsNoDot}`;
  }

  /**
   * Handle interactive payload (button clicks).
   */
  private handleInteraction(payload: SlackInteractionPayload): WebhookResult {
    const action = payload.actions?.[0];

    if (action?.action_id === 'view_bug') {
      // "View Bug" button clicked — just acknowledge
      return {
        handled: true,
        action: 'view_bug_clicked',
        issueId: action.value,
        message: `User ${payload.user?.name ?? 'unknown'} clicked View Bug for issue ${action.value}`,
      };
    }

    return {
      handled: true,
      action: 'interaction_acknowledged',
      message: `Acknowledged interaction: ${action?.action_id ?? 'unknown'}`,
    };
  }

  /**
   * Handle /bugdetector slash command.
   */
  private handleSlashCommand(payload: SlackInteractionPayload): WebhookResult {
    const text = (payload.text ?? '').trim();

    // Parse: /bugdetector <title>
    if (!text) {
      return {
        handled: true,
        action: 'slash_command_help',
        message: 'Usage: `/bugdetector <bug title>` — Creates a new bug in BugDetector.',
      };
    }

    // Return data so the caller can create the issue
    return {
      handled: true,
      action: 'create_bug_from_slash',
      message: text,
    };
  }

  /**
   * Verify Slack request signature using the signing secret.
   * See: https://api.slack.com/authentication/verifying-requests-from-slack
   */
  private verifySlackSignature(
    payload: unknown,
    headers: Record<string, string>,
  ): void {
    if (!this.signingSecret) {
      this.log('Warning: No signing secret configured, skipping signature verification');
      return;
    }

    const timestamp = headers['x-slack-request-timestamp'];
    const signature = headers['x-slack-signature'];

    if (!timestamp || !signature) {
      throw new IntegrationError(
        this.provider,
        'Missing Slack signature headers (x-slack-request-timestamp, x-slack-signature)',
      );
    }

    // Reject requests older than 5 minutes to prevent replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
      throw new IntegrationError(
        this.provider,
        'Slack request timestamp is too old (possible replay attack)',
      );
    }

    // Compute HMAC signature: v0=HMAC_SHA256(signing_secret, "v0:{timestamp}:{body}")
    // Note: Full HMAC verification requires the raw request body string and
    // Node.js crypto module. Here we validate the header format and timestamp.
    // In production, the webhook route handler should pass the raw body and
    // perform the full HMAC check using crypto.timingSafeEqual.
    if (!signature.startsWith('v0=')) {
      throw new IntegrationError(
        this.provider,
        'Invalid Slack signature format (expected v0=...)',
      );
    }

    // The actual HMAC computation should be done at the route handler level
    // where the raw body string is available. This adapter validates the
    // structural requirements of the Slack signing protocol.
    this.log('Slack signature headers validated', { timestamp });
  }
}
