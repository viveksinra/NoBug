import { PII_PATTERNS, PII_REPLACEMENT } from '@nobug/shared';
import type { ConsoleEntry } from './console-types';
import type { NetworkEntry } from './network-types';

/** Redaction categories that can be toggled */
export interface RedactionConfig {
  email: boolean;
  creditCard: boolean;
  ssn: boolean;
  phone: boolean;
  authHeader: boolean;
  jwt: boolean;
  /** Custom regex patterns from company settings */
  customPatterns: string[];
}

export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  email: true,
  creditCard: true,
  ssn: true,
  phone: true,
  authHeader: true,
  jwt: true,
  customPatterns: [],
};

/** Apply PII redaction to a string */
export function redactString(input: string, config: RedactionConfig): string {
  let result = input;

  if (config.email) {
    result = result.replace(PII_PATTERNS.email, PII_REPLACEMENT);
  }
  if (config.creditCard) {
    result = result.replace(PII_PATTERNS.creditCard, PII_REPLACEMENT);
  }
  if (config.ssn) {
    result = result.replace(PII_PATTERNS.ssn, PII_REPLACEMENT);
  }
  if (config.phone) {
    result = result.replace(PII_PATTERNS.phone, PII_REPLACEMENT);
  }
  if (config.authHeader) {
    result = result.replace(PII_PATTERNS.authHeader, PII_REPLACEMENT);
  }
  if (config.jwt) {
    result = result.replace(PII_PATTERNS.jwt, PII_REPLACEMENT);
  }

  // Apply custom patterns
  for (const pattern of config.customPatterns) {
    try {
      const regex = new RegExp(pattern, 'g');
      result = result.replace(regex, PII_REPLACEMENT);
    } catch {
      // Invalid regex — skip
    }
  }

  return result;
}

/** Redact PII from console log entries */
export function redactConsoleLogs(
  logs: ConsoleEntry[],
  config: RedactionConfig,
): ConsoleEntry[] {
  return logs.map((entry) => ({
    ...entry,
    message: redactString(entry.message, config),
    args: entry.args.map((arg) => redactString(arg, config)),
    stack: entry.stack ? redactString(entry.stack, config) : null,
  }));
}

/** Redact PII from network entries */
export function redactNetworkLogs(
  logs: NetworkEntry[],
  config: RedactionConfig,
): NetworkEntry[] {
  return logs.map((entry) => ({
    ...entry,
    url: redactString(entry.url, config),
    requestHeaders: redactHeaders(entry.requestHeaders, config),
    responseHeaders: redactHeaders(entry.responseHeaders, config),
    requestBody: entry.requestBody ? redactString(entry.requestBody, config) : null,
    responseBody: entry.responseBody ? redactString(entry.responseBody, config) : null,
  }));
}

/** Redact PII from headers record */
function redactHeaders(
  headers: Record<string, string>,
  config: RedactionConfig,
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = redactString(value, config);
  }
  return redacted;
}

/** Redact PII from rrweb event text nodes */
export function redactRrwebEvents(
  events: unknown[],
  config: RedactionConfig,
): unknown[] {
  return events.map((event) => {
    // Deep clone and redact text content in rrweb snapshots
    return redactRrwebNode(event, config);
  });
}

function redactRrwebNode(node: unknown, config: RedactionConfig): unknown {
  if (node === null || node === undefined) return node;
  if (typeof node === 'string') return redactString(node, config);
  if (typeof node !== 'object') return node;

  if (Array.isArray(node)) {
    return node.map((item) => redactRrwebNode(item, config));
  }

  const obj = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'textContent' || key === 'value' || key === 'text') {
      result[key] = typeof value === 'string' ? redactString(value, config) : value;
    } else if (typeof value === 'object') {
      result[key] = redactRrwebNode(value, config);
    } else {
      result[key] = value;
    }
  }

  return result;
}
