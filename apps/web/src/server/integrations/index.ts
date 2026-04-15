// Integration Adapter Framework — public API
export type {
  IntegrationAdapter,
  IntegrationConfig,
  IntegrationAuth,
  IssueSyncData,
  ExternalRef,
  WebhookResult,
  ConnectionTestResult,
} from './types';

export { BaseAdapter, IntegrationError } from './base-adapter';
export { getAdapter, hasAdapter, getAvailableProviders, registerAdapter } from './registry';

// Adapter classes (for direct instantiation or testing)
export { GitHubAdapter } from './adapters/github';
export { JiraAdapter } from './adapters/jira';
export { SlackAdapter } from './adapters/slack';
