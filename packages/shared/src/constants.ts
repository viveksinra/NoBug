export const APP_NAME = 'NoBug';

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

export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REGRESSION_TIERS = ['SMOKE', 'CORE', 'FULL'] as const;
export type RegressionTier = (typeof REGRESSION_TIERS)[number];

export const MAX_RECORDING_SIZE_MB = 100;
export const MAX_SCREENSHOT_SIZE_MB = 10;
export const QUICK_CAPTURE_ANON_EXPIRY_HOURS = 24;
export const QUICK_CAPTURE_FREE_EXPIRY_DAYS = 30;
