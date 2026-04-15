import { Octokit } from '@octokit/rest';
import { BaseAdapter, IntegrationError } from '../base-adapter';
import type {
  IntegrationConfig,
  IntegrationAuth,
  IssueSyncData,
  ExternalRef,
  WebhookResult,
  ConnectionTestResult,
} from '../types';
import { createHmac, timingSafeEqual } from 'crypto';

// ============================================================================
// GitHub Issues Adapter — 2-way sync via Octokit REST API
// ============================================================================

/** BugDetector status → GitHub state mapping */
const STATUS_TO_GITHUB_STATE: Record<string, 'open' | 'closed'> = {
  OPEN: 'open',
  IN_PROGRESS: 'open',
  DEV_TESTING: 'open',
  QA_TESTING: 'open',
  REOPENED: 'open',
  CLOSED: 'closed',
};

/** BugDetector statuses that get an extra label when mapped to GitHub (since they all map to "open") */
const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'status:in-progress',
  DEV_TESTING: 'status:dev-testing',
  QA_TESTING: 'status:qa-testing',
  REOPENED: 'status:reopened',
};

/** Priority → GitHub label mapping */
const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'priority:critical',
  HIGH: 'priority:high',
  MEDIUM: 'priority:medium',
  LOW: 'priority:low',
};

/** Reverse map: GitHub state → BugDetector status */
function githubStateToBugDetectorStatus(state: string): string {
  return state === 'closed' ? 'CLOSED' : 'OPEN';
}

/** Extract BugDetector priority from GitHub labels */
function extractPriorityFromLabels(
  labels: Array<string | { name?: string }>,
): string | undefined {
  const priorityPrefix = 'priority:';
  for (const label of labels) {
    const name = typeof label === 'string' ? label : label.name ?? '';
    if (name.startsWith(priorityPrefix)) {
      return name.slice(priorityPrefix.length).toUpperCase();
    }
  }
  return undefined;
}

/** Extract BugDetector status from GitHub labels (for statuses beyond open/closed) */
function extractStatusFromLabels(
  labels: Array<string | { name?: string }>,
): string | undefined {
  const statusPrefix = 'status:';
  const statusMap: Record<string, string> = {
    'in-progress': 'IN_PROGRESS',
    'dev-testing': 'DEV_TESTING',
    'qa-testing': 'QA_TESTING',
    'reopened': 'REOPENED',
  };
  for (const label of labels) {
    const name = typeof label === 'string' ? label : label.name ?? '';
    if (name.startsWith(statusPrefix)) {
      const key = name.slice(statusPrefix.length);
      if (key in statusMap) return statusMap[key];
    }
  }
  return undefined;
}

/** Get plain label names from GitHub label objects */
function getLabelNames(
  labels: Array<string | { name?: string }>,
): string[] {
  return labels
    .map((l) => (typeof l === 'string' ? l : l.name ?? ''))
    .filter((n) => n.length > 0 && !n.startsWith('priority:') && !n.startsWith('status:'));
}

interface GitHubConfig extends IntegrationConfig {
  owner: string;
  repo: string;
}

interface GitHubAuth extends IntegrationAuth {
  token: string;
}

export class GitHubAdapter extends BaseAdapter {
  readonly provider = 'GITHUB' as const;

  private octokit: Octokit | null = null;

  private get ghConfig(): GitHubConfig {
    return this.config as GitHubConfig;
  }

  private get ghAuth(): GitHubAuth {
    return this.auth as GitHubAuth;
  }

  // ─── Connection Lifecycle ──────────────────────────────────────

  override async connect(
    config: IntegrationConfig,
    auth: IntegrationAuth,
  ): Promise<void> {
    await super.connect(config, auth);

    const token = (auth as GitHubAuth).token;
    if (!token) {
      throw new IntegrationError(this.provider, 'GitHub token is required');
    }

    this.octokit = new Octokit({ auth: token });

    // Validate by calling GET /user
    try {
      const { data } = await this.octokit.rest.users.getAuthenticated();
      this.log('Authenticated as GitHub user', { login: data.login });
    } catch (error) {
      this.connected = false;
      this.octokit = null;
      throw new IntegrationError(
        this.provider,
        'Failed to authenticate with GitHub. Check your token.',
        false,
        (error as { status?: number }).status,
      );
    }
  }

  override async disconnect(): Promise<void> {
    this.octokit = null;
    await super.disconnect();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    this.ensureConnected();

    try {
      const { data } = await this.octokit!.rest.users.getAuthenticated();
      return {
        ok: true,
        message: `Connected as ${data.login}`,
      };
    } catch (error) {
      return {
        ok: false,
        message: `GitHub connection failed: ${(error as Error).message}`,
      };
    }
  }

  // ─── Issue Sync ────────────────────────────────────────────────

  async pushIssue(issue: IssueSyncData): Promise<ExternalRef> {
    this.ensureConnected();
    const { owner, repo } = this.ghConfig;

    return this.withRetry(async () => {
      // Build labels array
      const labels: string[] = [...(issue.labels ?? [])];

      // Add priority label
      if (issue.priority && issue.priority in PRIORITY_LABELS) {
        labels.push(PRIORITY_LABELS[issue.priority]!);
      }

      // Add status label for intermediate statuses
      if (issue.status && issue.status in STATUS_LABELS) {
        labels.push(STATUS_LABELS[issue.status]!);
      }

      const state = STATUS_TO_GITHUB_STATE[issue.status] ?? 'open';

      // Build body with metadata footer
      let body = issue.description ?? '';
      if (issue.issueId) {
        body += `\n\n---\n_Synced from BugDetector issue \`${issue.issueId}\`_`;
      }

      // Check if we're updating an existing issue (externalId in metadata)
      const existingNumber = issue.metadata?.githubIssueNumber as
        | number
        | undefined;

      if (existingNumber) {
        // Update existing issue
        const { data } = await this.octokit!.rest.issues.update({
          owner,
          repo,
          issue_number: existingNumber,
          title: issue.title,
          body,
          state,
          labels,
          assignees: issue.assignee ? [issue.assignee] : undefined,
        });

        this.log('Updated GitHub issue', { number: data.number, url: data.html_url });

        return {
          externalId: String(data.number),
          externalUrl: data.html_url,
          metadata: {
            githubIssueNumber: data.number,
            nodeId: data.node_id,
          },
        };
      } else {
        // Create new issue
        const { data } = await this.octokit!.rest.issues.create({
          owner,
          repo,
          title: issue.title,
          body,
          labels,
          assignees: issue.assignee ? [issue.assignee] : undefined,
        });

        // If the target state is closed, close it after creation
        if (state === 'closed') {
          await this.octokit!.rest.issues.update({
            owner,
            repo,
            issue_number: data.number,
            state: 'closed',
          });
        }

        this.log('Created GitHub issue', { number: data.number, url: data.html_url });

        return {
          externalId: String(data.number),
          externalUrl: data.html_url,
          metadata: {
            githubIssueNumber: data.number,
            nodeId: data.node_id,
          },
        };
      }
    }, 'pushIssue');
  }

  async pullIssue(externalId: string): Promise<IssueSyncData> {
    this.ensureConnected();
    const { owner, repo } = this.ghConfig;
    const issueNumber = parseInt(externalId, 10);

    if (isNaN(issueNumber)) {
      throw new IntegrationError(
        this.provider,
        `Invalid GitHub issue number: ${externalId}`,
      );
    }

    return this.withRetry(async () => {
      const { data } = await this.octokit!.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      const labelObjects = (data.labels ?? []) as Array<string | { name?: string }>;

      // Determine status: check labels first for granular status, fall back to state
      const labelStatus = extractStatusFromLabels(labelObjects);
      const status = labelStatus ?? githubStateToBugDetectorStatus(data.state);

      const priority = extractPriorityFromLabels(labelObjects);
      const labels = getLabelNames(labelObjects);

      const assignee = data.assignee?.login ?? undefined;

      this.log('Pulled GitHub issue', { number: data.number });

      return {
        title: data.title,
        description: data.body ?? undefined,
        status,
        priority,
        labels,
        assignee,
        metadata: {
          githubIssueNumber: data.number,
          nodeId: data.node_id,
          htmlUrl: data.html_url,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      };
    }, 'pullIssue');
  }

  async syncIssueStatus(externalId: string, status: string): Promise<void> {
    this.ensureConnected();
    const { owner, repo } = this.ghConfig;
    const issueNumber = parseInt(externalId, 10);

    if (isNaN(issueNumber)) {
      throw new IntegrationError(
        this.provider,
        `Invalid GitHub issue number: ${externalId}`,
      );
    }

    return this.withRetry(async () => {
      const state = STATUS_TO_GITHUB_STATE[status] ?? 'open';

      // Get current labels to update status label
      const { data: currentIssue } = await this.octokit!.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      const currentLabels = (currentIssue.labels ?? []) as Array<
        string | { name?: string }
      >;

      // Remove old status labels, keep everything else
      const filteredLabels = currentLabels
        .map((l) => (typeof l === 'string' ? l : l.name ?? ''))
        .filter((n) => n.length > 0 && !n.startsWith('status:'));

      // Add new status label if applicable
      if (status in STATUS_LABELS) {
        filteredLabels.push(STATUS_LABELS[status]!);
      }

      await this.octokit!.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state,
        labels: filteredLabels,
      });

      this.log('Synced status to GitHub', { number: issueNumber, status, state });
    }, 'syncIssueStatus');
  }

  // ─── Webhooks ──────────────────────────────────────────────────

  async handleWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    // Verify webhook signature
    const signature = headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'];
    const webhookSecret = this.auth.webhookSecret;

    if (webhookSecret) {
      if (!signature) {
        return {
          handled: false,
          action: 'rejected',
          message: 'Missing X-Hub-Signature-256 header',
        };
      }

      const payloadString =
        typeof payload === 'string' ? payload : JSON.stringify(payload);
      const expected =
        'sha256=' +
        createHmac('sha256', webhookSecret)
          .update(payloadString)
          .digest('hex');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expected);

      if (
        sigBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        return {
          handled: false,
          action: 'rejected',
          message: 'Invalid webhook signature',
        };
      }
    }

    // Parse event type
    const event = headers['x-github-event'] ?? headers['X-GitHub-Event'];
    if (event !== 'issues') {
      return {
        handled: false,
        action: 'ignored',
        message: `Ignoring non-issue event: ${event}`,
      };
    }

    const body = payload as {
      action?: string;
      issue?: {
        number: number;
        title: string;
        body?: string | null;
        state: string;
        labels?: Array<string | { name?: string }>;
        assignee?: { login: string } | null;
        html_url: string;
        node_id: string;
      };
    };

    if (!body.action || !body.issue) {
      return {
        handled: false,
        action: 'ignored',
        message: 'Malformed issues webhook payload',
      };
    }

    const { action, issue } = body;

    switch (action) {
      case 'opened':
      case 'closed':
      case 'reopened':
      case 'edited':
      case 'labeled': {
        const labelObjects = (issue.labels ?? []) as Array<
          string | { name?: string }
        >;
        const labelStatus = extractStatusFromLabels(labelObjects);
        const status = labelStatus ?? githubStateToBugDetectorStatus(issue.state);

        this.log('Webhook received', { action, number: issue.number, status });

        return {
          handled: true,
          action: `issue_${action}`,
          message: `GitHub issue #${issue.number} ${action}: "${issue.title}" → status ${status}`,
        };
      }
      default:
        return {
          handled: false,
          action: 'ignored',
          message: `Ignoring issue action: ${action}`,
        };
    }
  }
}
