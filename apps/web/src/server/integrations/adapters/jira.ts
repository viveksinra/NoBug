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
// Jira Adapter — Full 2-way sync via Jira REST API v3
// ============================================================================

/** Priority mapping: BugDetector → Jira */
const PRIORITY_TO_JIRA: Record<string, string> = {
  CRITICAL: 'Highest',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

/** Priority mapping: Jira → BugDetector */
const PRIORITY_FROM_JIRA: Record<string, string> = {
  Highest: 'CRITICAL',
  High: 'HIGH',
  Medium: 'MEDIUM',
  Low: 'LOW',
  Lowest: 'LOW',
};

/** Status mapping: BugDetector → Jira category */
const STATUS_TO_JIRA: Record<string, string> = {
  OPEN: 'To Do',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Done',
  CLOSED: 'Done',
};

/** Status mapping: Jira status category → BugDetector */
const STATUS_CATEGORY_FROM_JIRA: Record<string, string> = {
  'new': 'OPEN',
  'indeterminate': 'IN_PROGRESS',
  'done': 'CLOSED',
};

/** Shape of Jira webhook payloads we handle */
interface JiraWebhookPayload {
  webhookEvent?: string;
  issue_event_type_name?: string;
  issue?: {
    id?: string;
    key?: string;
    fields?: Record<string, unknown>;
  };
}

export class JiraAdapter extends BaseAdapter {
  readonly provider = 'JIRA' as const;

  // ─── Typed accessors for config / auth ────────────────────────

  private get baseUrl(): string {
    const url = this.config.baseUrl as string | undefined;
    if (!url) throw new IntegrationError(this.provider, 'baseUrl is not configured');
    // Strip trailing slash
    return url.replace(/\/+$/, '');
  }

  private get projectKey(): string {
    const key = this.config.projectKey as string | undefined;
    if (!key) throw new IntegrationError(this.provider, 'projectKey is not configured');
    return key;
  }

  private get authHeader(): string {
    // Cloud: email + apiToken
    const email = this.auth.email as string | undefined;
    const apiToken = this.auth.apiToken as string | undefined;
    if (email && apiToken) {
      return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
    }
    // Server: username + password
    const username = this.auth.username as string | undefined;
    const password = this.auth.password as string | undefined;
    if (username && password) {
      return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
    throw new IntegrationError(
      this.provider,
      'No valid auth credentials. Provide email+apiToken (cloud) or username+password (server).',
    );
  }

  // ─── Connection Lifecycle ──────────────────────────────────────

  override async connect(config: IntegrationConfig, auth: IntegrationAuth): Promise<void> {
    await super.connect(config, auth);
    // Validate credentials immediately
    const result = await this.testConnection();
    if (!result.ok) {
      this.connected = false;
      throw new IntegrationError(this.provider, `Connection failed: ${result.message}`);
    }
  }

  override async disconnect(): Promise<void> {
    await super.disconnect();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    this.ensureConnected();

    try {
      const res = await this.jiraFetch('/rest/api/3/myself');
      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        return { ok: false, message: `Jira auth failed (${res.status}): ${text}` };
      }
      const user = (await res.json()) as { displayName?: string; emailAddress?: string };
      return {
        ok: true,
        message: `Authenticated as ${user.displayName ?? user.emailAddress ?? 'unknown'}`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `Connection test failed: ${msg}` };
    }
  }

  // ─── Issue Sync ────────────────────────────────────────────────

  async pushIssue(issue: IssueSyncData): Promise<ExternalRef> {
    this.ensureConnected();

    // If metadata contains an existing Jira key, update instead of create
    const existingKey = issue.metadata?.jiraKey as string | undefined;

    if (existingKey) {
      return this.withRetry(() => this.updateJiraIssue(existingKey, issue), 'pushIssue:update');
    }
    return this.withRetry(() => this.createJiraIssue(issue), 'pushIssue:create');
  }

  async pullIssue(externalId: string): Promise<IssueSyncData> {
    this.ensureConnected();

    return this.withRetry(async () => {
      const res = await this.jiraFetch(
        `/rest/api/3/issue/${encodeURIComponent(externalId)}?fields=summary,description,status,priority,labels,assignee,issuetype`,
      );
      if (!res.ok) {
        throw new IntegrationError(
          this.provider,
          `Failed to fetch issue ${externalId}: ${res.status}`,
          res.status === 429,
          res.status,
        );
      }

      const data = (await res.json()) as {
        key: string;
        fields: {
          summary?: string;
          description?: unknown;
          status?: { name?: string; statusCategory?: { key?: string } };
          priority?: { name?: string };
          labels?: string[];
          assignee?: { displayName?: string; emailAddress?: string };
          issuetype?: { name?: string };
        };
      };

      const fields = data.fields;

      return {
        title: fields.summary ?? '',
        description: this.extractDescription(fields.description),
        status: this.mapStatusFromJira(fields.status?.statusCategory?.key),
        priority: fields.priority?.name
          ? PRIORITY_FROM_JIRA[fields.priority.name] ?? 'MEDIUM'
          : undefined,
        type: fields.issuetype?.name,
        assignee: fields.assignee?.emailAddress ?? fields.assignee?.displayName,
        labels: fields.labels ?? [],
        metadata: {
          jiraKey: data.key,
          jiraStatusName: fields.status?.name,
        },
      } satisfies IssueSyncData;
    }, 'pullIssue');
  }

  async syncIssueStatus(issueId: string, status: string): Promise<void> {
    this.ensureConnected();

    await this.withRetry(async () => {
      const targetStatusName = STATUS_TO_JIRA[status] ?? status;

      // 1. Get available transitions
      const transRes = await this.jiraFetch(
        `/rest/api/3/issue/${encodeURIComponent(issueId)}/transitions`,
      );
      if (!transRes.ok) {
        throw new IntegrationError(
          this.provider,
          `Failed to get transitions for ${issueId}: ${transRes.status}`,
          transRes.status === 429,
          transRes.status,
        );
      }

      const transData = (await transRes.json()) as {
        transitions: Array<{ id: string; name: string; to: { name: string } }>;
      };

      // 2. Find a transition whose target matches the desired status
      const transition = transData.transitions.find(
        (t) =>
          t.to.name.toLowerCase() === targetStatusName.toLowerCase() ||
          t.name.toLowerCase() === targetStatusName.toLowerCase(),
      );

      if (!transition) {
        const available = transData.transitions.map((t) => t.to.name).join(', ');
        throw new IntegrationError(
          this.provider,
          `No transition found for status "${targetStatusName}" on ${issueId}. Available: ${available}`,
        );
      }

      // 3. Execute the transition
      const execRes = await this.jiraFetch(
        `/rest/api/3/issue/${encodeURIComponent(issueId)}/transitions`,
        {
          method: 'POST',
          body: JSON.stringify({ transition: { id: transition.id } }),
        },
      );

      if (!execRes.ok) {
        throw new IntegrationError(
          this.provider,
          `Failed to transition ${issueId} to "${targetStatusName}": ${execRes.status}`,
          execRes.status === 429,
          execRes.status,
        );
      }

      this.log(`Transitioned ${issueId} to "${transition.to.name}"`);
    }, 'syncIssueStatus');
  }

  // ─── Webhooks ──────────────────────────────────────────────────

  async handleWebhook(
    payload: unknown,
    _headers: Record<string, string>,
  ): Promise<WebhookResult> {
    const data = payload as JiraWebhookPayload;
    const event = data.webhookEvent ?? data.issue_event_type_name;

    if (!event) {
      return { handled: false, action: 'ignored', message: 'No webhook event type found' };
    }

    const issueKey = data.issue?.key;
    if (!issueKey) {
      return { handled: false, action: 'ignored', message: `Event "${event}" has no issue key` };
    }

    this.log('Received webhook', { event, issueKey });

    // Categorize the event
    if (event.includes('issue_created') || event === 'jira:issue_created') {
      return {
        handled: true,
        action: 'issue_created',
        issueId: issueKey,
        message: `Jira issue ${issueKey} was created`,
      };
    }

    if (event.includes('issue_updated') || event === 'jira:issue_updated') {
      const changelogItems = (data as Record<string, unknown>).changelog as
        | { items?: Array<{ field?: string }> }
        | undefined;

      const isStatusChange = changelogItems?.items?.some((i) => i.field === 'status');

      return {
        handled: true,
        action: isStatusChange ? 'status_changed' : 'issue_updated',
        issueId: issueKey,
        message: `Jira issue ${issueKey} was updated${isStatusChange ? ' (status changed)' : ''}`,
      };
    }

    if (event.includes('issue_deleted') || event === 'jira:issue_deleted') {
      return {
        handled: true,
        action: 'issue_deleted',
        issueId: issueKey,
        message: `Jira issue ${issueKey} was deleted`,
      };
    }

    return {
      handled: false,
      action: 'ignored',
      message: `Unhandled Jira event: ${event}`,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────

  /**
   * Central fetch wrapper for all Jira REST API calls.
   * Adds auth header and content-type automatically.
   */
  private async jiraFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    return fetch(url, { ...options, headers });
  }

  /** Create a new Jira issue and return an ExternalRef. */
  private async createJiraIssue(issue: IssueSyncData): Promise<ExternalRef> {
    const body: Record<string, unknown> = {
      fields: {
        project: { key: this.projectKey },
        summary: issue.title,
        description: this.toAdfDescription(issue.description),
        issuetype: { name: issue.type ?? 'Bug' },
        ...(issue.priority ? { priority: { name: PRIORITY_TO_JIRA[issue.priority] ?? 'Medium' } } : {}),
        ...(issue.labels && issue.labels.length > 0 ? { labels: issue.labels } : {}),
      },
    };

    const res = await this.jiraFetch('/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new IntegrationError(
        this.provider,
        `Failed to create Jira issue: ${res.status} ${errText}`,
        res.status === 429,
        res.status,
      );
    }

    const created = (await res.json()) as { id: string; key: string; self: string };

    this.log('Created Jira issue', { key: created.key });

    return {
      externalId: created.key,
      externalUrl: `${this.baseUrl}/browse/${created.key}`,
      metadata: { jiraId: created.id, jiraKey: created.key },
    };
  }

  /** Update an existing Jira issue by key. */
  private async updateJiraIssue(issueKey: string, issue: IssueSyncData): Promise<ExternalRef> {
    const fields: Record<string, unknown> = {
      summary: issue.title,
      description: this.toAdfDescription(issue.description),
    };

    if (issue.priority) {
      fields.priority = { name: PRIORITY_TO_JIRA[issue.priority] ?? 'Medium' };
    }
    if (issue.labels && issue.labels.length > 0) {
      fields.labels = issue.labels;
    }

    const res = await this.jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new IntegrationError(
        this.provider,
        `Failed to update Jira issue ${issueKey}: ${res.status} ${errText}`,
        res.status === 429,
        res.status,
      );
    }

    this.log('Updated Jira issue', { key: issueKey });

    // If status needs updating, do it via transition
    if (issue.status) {
      try {
        await this.syncIssueStatus(issueKey, issue.status);
      } catch (e) {
        this.logError(`Could not sync status for ${issueKey} during update`, e);
      }
    }

    return {
      externalId: issueKey,
      externalUrl: `${this.baseUrl}/browse/${issueKey}`,
      metadata: { jiraKey: issueKey },
    };
  }

  /**
   * Convert a plain-text description to Jira Cloud ADF (Atlassian Document Format).
   * Returns a minimal ADF document with a single paragraph.
   */
  private toAdfDescription(description?: string): unknown {
    if (!description) {
      return {
        type: 'doc',
        version: 1,
        content: [],
      };
    }

    // Split by double newlines for paragraphs
    const paragraphs = description.split(/\n{2,}/).filter(Boolean);

    return {
      type: 'doc',
      version: 1,
      content: paragraphs.map((para) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: para.trim() }],
      })),
    };
  }

  /**
   * Extract plain text from a Jira ADF description.
   * Handles both ADF objects and plain strings.
   */
  private extractDescription(description: unknown): string {
    if (!description) return '';
    if (typeof description === 'string') return description;

    // ADF format
    const adf = description as { type?: string; content?: Array<{ content?: Array<{ text?: string }> }> };
    if (adf.type === 'doc' && Array.isArray(adf.content)) {
      return adf.content
        .map((block) => {
          if (Array.isArray(block.content)) {
            return block.content.map((inline) => inline.text ?? '').join('');
          }
          return '';
        })
        .filter(Boolean)
        .join('\n\n');
    }

    return '';
  }

  /** Map a Jira status category key to a BugDetector status string. */
  private mapStatusFromJira(categoryKey?: string): string {
    if (!categoryKey) return 'OPEN';
    return STATUS_CATEGORY_FROM_JIRA[categoryKey] ?? 'OPEN';
  }
}
