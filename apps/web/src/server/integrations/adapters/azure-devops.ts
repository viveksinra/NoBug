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
// Azure DevOps Work Item Adapter — 2-way sync via REST API
// ============================================================================

/** BugDetector priority → Azure DevOps priority (1-4) */
const PRIORITY_TO_ADO: Record<string, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

/** Azure DevOps priority (1-4) → BugDetector priority */
const ADO_TO_PRIORITY: Record<number, string> = {
  1: 'CRITICAL',
  2: 'HIGH',
  3: 'MEDIUM',
  4: 'LOW',
};

/** BugDetector status → Azure DevOps state */
const STATUS_TO_ADO_STATE: Record<string, string> = {
  OPEN: 'New',
  IN_PROGRESS: 'Active',
  DEV_TESTING: 'Active',
  QA_TESTING: 'Active',
  REOPENED: 'New',
  CLOSED: 'Closed',
};

/** Azure DevOps state → BugDetector status */
const ADO_STATE_TO_STATUS: Record<string, string> = {
  New: 'OPEN',
  Active: 'IN_PROGRESS',
  Resolved: 'QA_TESTING',
  Closed: 'CLOSED',
};

interface AzureDevOpsConfig extends IntegrationConfig {
  organization: string;
  project: string;
}

interface AzureDevOpsAuth extends IntegrationAuth {
  pat: string;
}

/** JSON Patch operation for Azure DevOps REST API */
interface JsonPatchOperation {
  op: 'add' | 'replace' | 'remove' | 'test';
  path: string;
  value?: unknown;
}

/** Partial shape of an Azure DevOps work item response */
interface AdoWorkItem {
  id: number;
  rev: number;
  fields: Record<string, unknown>;
  url: string;
  _links?: {
    html?: { href: string };
  };
}

/** Azure DevOps service hook payload */
interface AdoWebhookPayload {
  publisherId?: string;
  eventType?: string;
  resource?: {
    id?: number;
    workItemId?: number;
    rev?: number;
    revision?: {
      id?: number;
      fields?: Record<string, unknown>;
    };
    fields?: Record<string, unknown>;
    url?: string;
    _links?: {
      html?: { href: string };
    };
  };
  resourceVersion?: string;
}

export class AzureDevOpsAdapter extends BaseAdapter {
  readonly provider = 'AZURE_DEVOPS' as const;

  private get adoConfig(): AzureDevOpsConfig {
    return this.config as AzureDevOpsConfig;
  }

  private get adoAuth(): AzureDevOpsAuth {
    return this.auth as AzureDevOpsAuth;
  }

  /** Build the Authorization header for Azure DevOps PAT auth */
  private get authHeader(): string {
    return `Basic ${Buffer.from(':' + this.adoAuth.pat).toString('base64')}`;
  }

  /** Base URL for Azure DevOps org-level APIs */
  private get orgBaseUrl(): string {
    return `https://dev.azure.com/${this.adoConfig.organization}`;
  }

  /** Base URL for Azure DevOps project-level APIs */
  private get projectBaseUrl(): string {
    return `${this.orgBaseUrl}/${this.adoConfig.project}`;
  }

  /** Build the HTML URL for a work item */
  private workItemUrl(workItemId: number): string {
    return `${this.orgBaseUrl}/${this.adoConfig.project}/_workitems/edit/${workItemId}`;
  }

  // ─── Connection Lifecycle ──────────────────────────────────────

  override async connect(
    config: IntegrationConfig,
    auth: IntegrationAuth,
  ): Promise<void> {
    await super.connect(config, auth);

    const pat = (auth as AzureDevOpsAuth).pat;
    if (!pat) {
      throw new IntegrationError(this.provider, 'Azure DevOps PAT is required');
    }

    const organization = (config as AzureDevOpsConfig).organization;
    if (!organization) {
      throw new IntegrationError(this.provider, 'Azure DevOps organization is required');
    }

    // Validate PAT by listing projects
    try {
      const response = await fetch(
        `https://dev.azure.com/${organization}/_apis/projects?api-version=7.0`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(':' + pat).toString('base64')}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new IntegrationError(
          this.provider,
          `Failed to authenticate: ${response.status} ${response.statusText}`,
          false,
          response.status,
        );
      }

      const data = (await response.json()) as { count: number };
      this.log('Authenticated with Azure DevOps', {
        organization,
        projectCount: data.count,
      });
    } catch (error) {
      this.connected = false;
      if (error instanceof IntegrationError) throw error;
      throw new IntegrationError(
        this.provider,
        `Failed to connect to Azure DevOps: ${(error as Error).message}`,
      );
    }
  }

  override async disconnect(): Promise<void> {
    await super.disconnect();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    this.ensureConnected();

    try {
      const response = await fetch(
        `${this.orgBaseUrl}/_apis/projects?api-version=7.0`,
        {
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return {
          ok: false,
          message: `Azure DevOps connection failed: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as { count: number };
      return {
        ok: true,
        message: `Connected to ${this.adoConfig.organization} (${data.count} projects)`,
      };
    } catch (error) {
      return {
        ok: false,
        message: `Azure DevOps connection failed: ${(error as Error).message}`,
      };
    }
  }

  // ─── Issue Sync ────────────────────────────────────────────────

  async pushIssue(issue: IssueSyncData): Promise<ExternalRef> {
    this.ensureConnected();

    return this.withRetry(async () => {
      // Build description as HTML
      const descriptionHtml = issue.description
        ? `<div>${issue.description.replace(/\n/g, '<br>')}</div>`
        : '';

      // Map priority
      const adoPriority = issue.priority
        ? PRIORITY_TO_ADO[issue.priority] ?? 3
        : 3;

      // Map status to state
      const adoState = issue.status
        ? STATUS_TO_ADO_STATE[issue.status] ?? 'New'
        : 'New';

      // Check if updating an existing work item
      const existingId = issue.metadata?.adoWorkItemId as number | undefined;

      if (existingId) {
        // Update existing work item
        const patchOps: JsonPatchOperation[] = [
          { op: 'replace', path: '/fields/System.Title', value: issue.title },
          { op: 'replace', path: '/fields/System.Description', value: descriptionHtml },
          { op: 'replace', path: '/fields/Microsoft.VSTS.Common.Priority', value: adoPriority },
          { op: 'replace', path: '/fields/System.State', value: adoState },
        ];

        if (issue.assignee) {
          patchOps.push({
            op: 'replace',
            path: '/fields/System.AssignedTo',
            value: issue.assignee,
          });
        }

        const response = await fetch(
          `${this.projectBaseUrl}/_apis/wit/workitems/${existingId}?api-version=7.0`,
          {
            method: 'PATCH',
            headers: {
              Authorization: this.authHeader,
              'Content-Type': 'application/json-patch+json',
            },
            body: JSON.stringify(patchOps),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new IntegrationError(
            this.provider,
            `Failed to update work item ${existingId}: ${response.status} — ${errorText}`,
            response.status >= 500,
            response.status,
          );
        }

        const workItem = (await response.json()) as AdoWorkItem;
        const url = workItem._links?.html?.href ?? this.workItemUrl(workItem.id);

        this.log('Updated Azure DevOps work item', { id: workItem.id, url });

        return {
          externalId: String(workItem.id),
          externalUrl: url,
          metadata: { adoWorkItemId: workItem.id, rev: workItem.rev },
        };
      } else {
        // Create new work item
        const patchOps: JsonPatchOperation[] = [
          { op: 'add', path: '/fields/System.Title', value: issue.title },
          { op: 'add', path: '/fields/System.Description', value: descriptionHtml },
          { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: adoPriority },
        ];

        if (issue.assignee) {
          patchOps.push({
            op: 'add',
            path: '/fields/System.AssignedTo',
            value: issue.assignee,
          });
        }

        // Add BugDetector issue ID as a tag for traceability
        if (issue.issueId) {
          patchOps.push({
            op: 'add',
            path: '/fields/System.Tags',
            value: `bugdetector:${issue.issueId}`,
          });
        }

        const response = await fetch(
          `${this.projectBaseUrl}/_apis/wit/workitems/$Bug?api-version=7.0`,
          {
            method: 'PATCH',
            headers: {
              Authorization: this.authHeader,
              'Content-Type': 'application/json-patch+json',
            },
            body: JSON.stringify(patchOps),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new IntegrationError(
            this.provider,
            `Failed to create work item: ${response.status} — ${errorText}`,
            response.status >= 500,
            response.status,
          );
        }

        const workItem = (await response.json()) as AdoWorkItem;
        const url = workItem._links?.html?.href ?? this.workItemUrl(workItem.id);

        // If the desired state is not "New", update the state after creation
        if (adoState !== 'New') {
          await this.updateWorkItemState(workItem.id, adoState);
        }

        this.log('Created Azure DevOps work item', { id: workItem.id, url });

        return {
          externalId: String(workItem.id),
          externalUrl: url,
          metadata: { adoWorkItemId: workItem.id, rev: workItem.rev },
        };
      }
    }, 'pushIssue');
  }

  async pullIssue(externalId: string): Promise<IssueSyncData> {
    this.ensureConnected();

    const workItemId = parseInt(externalId, 10);
    if (isNaN(workItemId)) {
      throw new IntegrationError(
        this.provider,
        `Invalid work item ID: ${externalId}`,
      );
    }

    return this.withRetry(async () => {
      const response = await fetch(
        `${this.projectBaseUrl}/_apis/wit/workitems/${workItemId}?$expand=all&api-version=7.0`,
        {
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new IntegrationError(
          this.provider,
          `Failed to fetch work item ${workItemId}: ${response.status} — ${errorText}`,
          response.status >= 500,
          response.status,
        );
      }

      const workItem = (await response.json()) as AdoWorkItem;
      const fields = workItem.fields;

      const adoState = (fields['System.State'] as string) ?? 'New';
      const adoPriority = (fields['Microsoft.VSTS.Common.Priority'] as number) ?? 3;
      const title = (fields['System.Title'] as string) ?? '';
      const description = (fields['System.Description'] as string) ?? undefined;
      const assignedTo = fields['System.AssignedTo'] as
        | { uniqueName?: string; displayName?: string }
        | undefined;
      const tags = (fields['System.Tags'] as string) ?? '';

      const status = ADO_STATE_TO_STATUS[adoState] ?? 'OPEN';
      const priority = ADO_TO_PRIORITY[adoPriority] ?? 'MEDIUM';

      const url = workItem._links?.html?.href ?? this.workItemUrl(workItem.id);

      this.log('Pulled Azure DevOps work item', { id: workItem.id });

      return {
        title,
        description,
        status,
        priority,
        assignee: assignedTo?.uniqueName ?? assignedTo?.displayName ?? undefined,
        labels: tags ? tags.split(';').map((t: string) => t.trim()).filter(Boolean) : [],
        metadata: {
          adoWorkItemId: workItem.id,
          rev: workItem.rev,
          url,
          state: adoState,
          workItemType: fields['System.WorkItemType'] as string,
        },
      };
    }, 'pullIssue');
  }

  async syncIssueStatus(externalId: string, status: string): Promise<void> {
    this.ensureConnected();

    const workItemId = parseInt(externalId, 10);
    if (isNaN(workItemId)) {
      throw new IntegrationError(
        this.provider,
        `Invalid work item ID: ${externalId}`,
      );
    }

    const adoState = STATUS_TO_ADO_STATE[status] ?? 'New';

    return this.withRetry(async () => {
      await this.updateWorkItemState(workItemId, adoState);
      this.log('Synced status to Azure DevOps', {
        id: workItemId,
        status,
        adoState,
      });
    }, 'syncIssueStatus');
  }

  // ─── Webhooks ──────────────────────────────────────────────────

  async handleWebhook(
    payload: unknown,
    _headers: Record<string, string>,
  ): Promise<WebhookResult> {
    const body = payload as AdoWebhookPayload;

    // Validate this is from Azure DevOps (TFS)
    if (body.publisherId !== 'tfs') {
      return {
        handled: false,
        action: 'ignored',
        message: `Ignoring non-TFS publisher: ${body.publisherId}`,
      };
    }

    const eventType = body.eventType;
    if (!eventType || !eventType.startsWith('workitem.')) {
      return {
        handled: false,
        action: 'ignored',
        message: `Ignoring non-work-item event: ${eventType}`,
      };
    }

    const resource = body.resource;
    if (!resource) {
      return {
        handled: false,
        action: 'ignored',
        message: 'Malformed webhook payload: missing resource',
      };
    }

    // Extract work item ID — may be at resource.id or resource.workItemId or resource.revision.id
    const workItemId =
      resource.workItemId ?? resource.id ?? resource.revision?.id;

    if (!workItemId) {
      return {
        handled: false,
        action: 'ignored',
        message: 'Could not determine work item ID from webhook payload',
      };
    }

    switch (eventType) {
      case 'workitem.created': {
        this.log('Webhook: work item created', { id: workItemId });
        return {
          handled: true,
          action: 'issue_created',
          message: `Azure DevOps work item ${workItemId} created`,
        };
      }

      case 'workitem.updated': {
        this.log('Webhook: work item updated', { id: workItemId });
        return {
          handled: true,
          action: 'issue_updated',
          message: `Azure DevOps work item ${workItemId} updated`,
        };
      }

      case 'workitem.deleted': {
        this.log('Webhook: work item deleted', { id: workItemId });
        return {
          handled: true,
          action: 'issue_deleted',
          message: `Azure DevOps work item ${workItemId} deleted`,
        };
      }

      default:
        return {
          handled: false,
          action: 'ignored',
          message: `Ignoring work item event type: ${eventType}`,
        };
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────

  /** Update just the State field on a work item */
  private async updateWorkItemState(
    workItemId: number,
    state: string,
  ): Promise<void> {
    const patchOps: JsonPatchOperation[] = [
      { op: 'replace', path: '/fields/System.State', value: state },
    ];

    const response = await fetch(
      `${this.projectBaseUrl}/_apis/wit/workitems/${workItemId}?api-version=7.0`,
      {
        method: 'PATCH',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json-patch+json',
        },
        body: JSON.stringify(patchOps),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new IntegrationError(
        this.provider,
        `Failed to update work item state ${workItemId}: ${response.status} — ${errorText}`,
        response.status >= 500,
        response.status,
      );
    }
  }
}
