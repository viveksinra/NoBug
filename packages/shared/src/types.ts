import type { ActorType } from './constants';

// ============================================================================
// Polymorphic assignee type — used for Issues, AgentTasks, TestResults, etc.
// ============================================================================

export type PolymorphicAssignee = {
  assignee_id: string;
  assignee_type: ActorType;
};

export type PolymorphicActor = {
  actor_id: string;
  actor_type: ActorType;
};

// ============================================================================
// Pagination
// ============================================================================

export type PaginationParams = {
  page?: number;
  limit?: number;
  cursor?: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    has_more: boolean;
  };
};

export type CursorPaginatedResponse<T> = {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
};

// ============================================================================
// API response wrapper
// ============================================================================

export type ApiResponse<T = unknown> = {
  success: true;
  data: T;
} | {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

// ============================================================================
// Environment info (captured by extension)
// ============================================================================

export type EnvironmentInfo = {
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  screen_width: number;
  screen_height: number;
  viewport_width: number;
  viewport_height: number;
  device_pixel_ratio: number;
  url: string;
  user_agent: string;
  timestamp: string;
};
