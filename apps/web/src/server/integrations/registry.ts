import type { IntegrationProvider } from '@nobug/shared';
import type { IntegrationAdapter } from './types';
import { GitHubAdapter } from './adapters/github';
import { JiraAdapter } from './adapters/jira';
import { SlackAdapter } from './adapters/slack';

// ============================================================================
// Adapter Registry — maps provider names to adapter factory functions
// ============================================================================

type AdapterFactory = () => IntegrationAdapter;

const adapterFactories: Partial<Record<IntegrationProvider, AdapterFactory>> = {
  GITHUB: () => new GitHubAdapter(),
  JIRA: () => new JiraAdapter(),
  SLACK: () => new SlackAdapter(),
};

/**
 * Get a fresh adapter instance for the given provider.
 * Returns null if the provider has no adapter implemented yet.
 */
export function getAdapter(provider: IntegrationProvider): IntegrationAdapter | null {
  const factory = adapterFactories[provider];
  if (!factory) return null;
  return factory();
}

/**
 * Check whether a provider has an adapter registered.
 */
export function hasAdapter(provider: IntegrationProvider): boolean {
  return provider in adapterFactories;
}

/**
 * Get list of all providers that have adapters available.
 */
export function getAvailableProviders(): IntegrationProvider[] {
  return Object.keys(adapterFactories) as IntegrationProvider[];
}

/**
 * Register or override an adapter factory for a provider.
 * Useful for testing or adding new providers at runtime.
 */
export function registerAdapter(
  provider: IntegrationProvider,
  factory: AdapterFactory,
): void {
  adapterFactories[provider] = factory;
}
