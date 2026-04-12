import { z } from 'zod';
import {
  ROLES,
  ISSUE_STATUSES,
  PRIORITIES,
  ISSUE_TYPES,
  ACTOR_TYPES,
  COMMENT_TYPES,
  LINK_TYPES,
  PLANS,
  INTEGRATION_PROVIDERS,
  REGRESSION_TIERS,
  MAX_RECORDING_SIZE_BYTES,
  MAX_SCREENSHOT_SIZE_BYTES,
} from './constants';

// ============================================================================
// Auth schemas
// ============================================================================

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  name: z.string().min(1, 'Name is required').max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ============================================================================
// Company schemas
// ============================================================================

export const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(100),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  logo_url: z.string().url().nullable().optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

// ============================================================================
// Project schemas
// ============================================================================

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100),
  key: z
    .string()
    .min(2, 'Key must be at least 2 characters')
    .max(10)
    .regex(/^[A-Z0-9]+$/, 'Key must be uppercase alphanumeric'),
  description: z.string().max(500).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  settings_json: z.record(z.unknown()).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// ============================================================================
// Invitation schemas
// ============================================================================

export const createInvitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(ROLES).default('DEVELOPER'),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

// ============================================================================
// Issue schemas
// ============================================================================

export const createIssueSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(50000).optional(),
  status: z.enum(ISSUE_STATUSES).default('OPEN'),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  type: z.enum(ISSUE_TYPES).default('BUG'),
  assignee_id: z.string().nullable().optional(),
  assignee_type: z.enum(ACTOR_TYPES).nullable().optional(),
  label_ids: z.array(z.string()).optional(),
  environment_json: z.record(z.unknown()).optional(),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(50000).nullable().optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  type: z.enum(ISSUE_TYPES).optional(),
  assignee_id: z.string().nullable().optional(),
  assignee_type: z.enum(ACTOR_TYPES).nullable().optional(),
  label_ids: z.array(z.string()).optional(),
});
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

// ============================================================================
// Comment schemas
// ============================================================================

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(10000),
  type: z.enum(COMMENT_TYPES).default('COMMENT'),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

// ============================================================================
// Issue Link schemas
// ============================================================================

export const createIssueLinkSchema = z.object({
  target_issue_id: z.string().min(1),
  link_type: z.enum(LINK_TYPES),
});
export type CreateIssueLinkInput = z.infer<typeof createIssueLinkSchema>;

// ============================================================================
// Quick Capture schemas
// ============================================================================

export const createQuickCaptureSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  password: z.string().min(4).max(128).optional(),
  environment_json: z.record(z.unknown()).optional(),
});
export type CreateQuickCaptureInput = z.infer<typeof createQuickCaptureSchema>;

// ============================================================================
// Label schemas
// ============================================================================

export const createLabelSchema = z.object({
  name: z.string().min(1, 'Label name is required').max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex color')
    .default('#6366f1'),
});
export type CreateLabelInput = z.infer<typeof createLabelSchema>;

// ============================================================================
// API Key schemas
// ============================================================================

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100),
  project_id: z.string().nullable().optional(),
  permissions: z.record(z.boolean()).optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// ============================================================================
// Agent schemas
// ============================================================================

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['QA_TESTER', 'DEVELOPER', 'CODE_REVIEWER', 'REGRESSION_RUNNER']),
  config_json: z.record(z.unknown()).optional(),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

// ============================================================================
// Integration schemas
// ============================================================================

export const createIntegrationSchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS),
  project_id: z.string().nullable().optional(),
  config_json: z.record(z.unknown()).optional(),
});
export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;

// ============================================================================
// File upload validation
// ============================================================================

export const recordingUploadSchema = z.object({
  filename: z.string().min(1),
  content_type: z.string().min(1),
  size: z.number().max(MAX_RECORDING_SIZE_BYTES, 'Recording exceeds maximum size'),
});
export type RecordingUploadInput = z.infer<typeof recordingUploadSchema>;

export const screenshotUploadSchema = z.object({
  filename: z.string().min(1),
  content_type: z.string().regex(/^image\//),
  size: z.number().max(MAX_SCREENSHOT_SIZE_BYTES, 'Screenshot exceeds maximum size'),
});
export type ScreenshotUploadInput = z.infer<typeof screenshotUploadSchema>;
