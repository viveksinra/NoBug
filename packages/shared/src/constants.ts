export const APP_NAME = 'NoBug';

// ============================================================================
// Enums as const tuples (used for Zod enums and type inference)
// ============================================================================

export const ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'QA', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ISSUE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'DEV_TESTING',
  'QA_TESTING',
  'CLOSED',
  'REOPENED',
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_DISPLAY_ORDER: IssueStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'DEV_TESTING',
  'QA_TESTING',
  'REOPENED',
  'CLOSED',
];

export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_COLORS: Record<Priority, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#3b82f6',
  NONE: '#6b7280',
};

export const ISSUE_TYPES = ['BUG', 'FEATURE', 'TASK'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ACTOR_TYPES = ['MEMBER', 'AGENT', 'SYSTEM'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const COMMENT_TYPES = [
  'COMMENT',
  'STATUS_CHANGE',
  'ASSIGNMENT',
  'RECORDING_ATTACHED',
  'AI_ANALYSIS',
] as const;
export type CommentType = (typeof COMMENT_TYPES)[number];

export const LINK_TYPES = ['RELATED', 'BLOCKS', 'BLOCKED_BY', 'DUPLICATE'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const RECORDING_TYPES = ['RRWEB', 'VIDEO', 'DEV_TEST', 'QA_TEST', 'AI_TEST'] as const;
export type RecordingType = (typeof RECORDING_TYPES)[number];

export const AGENT_TYPES = ['QA_TESTER', 'DEVELOPER', 'CODE_REVIEWER', 'REGRESSION_RUNNER'] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_STATUSES = ['ACTIVE', 'PAUSED', 'DISABLED'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const REGRESSION_TIERS = ['SMOKE', 'CORE', 'FULL'] as const;
export type RegressionTier = (typeof REGRESSION_TIERS)[number];

export const PLANS = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'] as const;
export type Plan = (typeof PLANS)[number];

export const INTEGRATION_PROVIDERS = [
  'GITHUB',
  'JIRA',
  'AZURE_DEVOPS',
  'LINEAR',
  'SLACK',
  'GITLAB',
  'WEBHOOK',
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

// ============================================================================
// Size limits
// ============================================================================

export const MAX_RECORDING_SIZE_MB = 100;
export const MAX_SCREENSHOT_SIZE_MB = 10;
export const MAX_RECORDING_SIZE_BYTES = MAX_RECORDING_SIZE_MB * 1024 * 1024;
export const MAX_SCREENSHOT_SIZE_BYTES = MAX_SCREENSHOT_SIZE_MB * 1024 * 1024;

// ============================================================================
// Quick Capture expiry
// ============================================================================

export const QUICK_CAPTURE_ANON_EXPIRY_HOURS = 24;
export const QUICK_CAPTURE_FREE_EXPIRY_DAYS = 30;

// ============================================================================
// Supported browsers (for environment reporting)
// ============================================================================

export const SUPPORTED_BROWSERS = ['chrome', 'firefox', 'edge'] as const;

// ============================================================================
// Role permissions matrix
// ============================================================================

export type Permission =
  | 'create_issue'
  | 'update_issue'
  | 'delete_issue'
  | 'manage_members'
  | 'manage_settings'
  | 'manage_integrations'
  | 'view_reports'
  | 'manage_projects'
  | 'manage_agents'
  | 'manage_api_keys';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [
    'create_issue',
    'update_issue',
    'delete_issue',
    'manage_members',
    'manage_settings',
    'manage_integrations',
    'view_reports',
    'manage_projects',
    'manage_agents',
    'manage_api_keys',
  ],
  ADMIN: [
    'create_issue',
    'update_issue',
    'delete_issue',
    'manage_members',
    'manage_settings',
    'manage_integrations',
    'view_reports',
    'manage_projects',
    'manage_agents',
    'manage_api_keys',
  ],
  DEVELOPER: ['create_issue', 'update_issue', 'view_reports'],
  QA: ['create_issue', 'update_issue', 'view_reports'],
  VIEWER: ['view_reports'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// ============================================================================
// PII patterns for client-side redaction in the extension
// ============================================================================

export const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  creditCard: /\b(?:\d[ -]*?){13,19}\b/g,
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  phone: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  authHeader: /(?:Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi,
  jwt: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
} as const;

export const PII_REPLACEMENT = '[REDACTED]';

// ============================================================================
// Error codes
// ============================================================================

export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  // Resource
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
