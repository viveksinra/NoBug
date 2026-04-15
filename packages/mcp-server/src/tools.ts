/**
 * MCP tool definitions for NoBug bug tracking.
 * Each tool is a thin wrapper that calls the NoBug REST API.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "./api-client.js";

// ─── Shared Types ─────────────────────────────────────────────────

interface Bug {
  id: string;
  number: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignee_type?: string;
  assignee_id?: string;
  project_id: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface Comment {
  id: string;
  content: string;
  author_id: string;
  created_at: string;
  [key: string]: unknown;
}

// ─── Tool Registration ───────────────────────────────────────────

export function registerTools(server: McpServer, api: ApiClient): void {
  // ── list_bugs ──────────────────────────────────────────────────
  server.registerTool(
    "list_bugs",
    {
      title: "List Bugs",
      description:
        "List bugs/issues with optional filters. Returns a paginated list of bugs " +
        "matching the given criteria. Use this to browse bugs by status, priority, " +
        "assignee, or project. Results include bug number, title, status, and priority.",
      inputSchema: {
        project_id: z.string().optional().describe("Filter by project ID"),
        status: z
          .enum(["OPEN", "IN_PROGRESS", "IN_REVIEW", "RESOLVED", "CLOSED", "REOPENED"])
          .optional()
          .describe("Filter by bug status"),
        priority: z
          .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"])
          .optional()
          .describe("Filter by priority level"),
        assignee_id: z.string().optional().describe("Filter by assignee ID (member or agent)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Number of results to return (default: 20, max: 100)"),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Offset for pagination (default: 0)"),
      },
    },
    async ({ project_id, status, priority, assignee_id, limit, offset }) => {
      const params = new URLSearchParams();
      if (project_id) params.set("project_id", project_id);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (assignee_id) params.set("assignee_id", assignee_id);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const result = await api.get<{ bugs: Bug[]; total: number }>(
        `/bugs?${params.toString()}`
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ── get_bug ────────────────────────────────────────────────────
  server.registerTool(
    "get_bug",
    {
      title: "Get Bug Details",
      description:
        "Get full details of a specific bug by its ID. Returns complete bug information " +
        "including title, description, status, priority, assignee, comments, labels, " +
        "environment info, and attached recordings/screenshots. Use this after finding " +
        "a bug via list_bugs or search_bugs to get the full context.",
      inputSchema: {
        bug_id: z.string().describe("The bug ID to retrieve"),
      },
    },
    async ({ bug_id }) => {
      const result = await api.get<Bug>(`/bugs/${bug_id}`);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ── create_bug ─────────────────────────────────────────────────
  server.registerTool(
    "create_bug",
    {
      title: "Create Bug",
      description:
        "Create a new bug/issue in a project. Requires at minimum a title and project_id. " +
        "You can optionally set priority, assign to a member or AI agent, and provide " +
        "a detailed description. The bug will be created with OPEN status and assigned " +
        "an auto-incrementing issue number within the project.",
      inputSchema: {
        project_id: z.string().describe("The project ID to create the bug in"),
        title: z.string().min(1).max(500).describe("Bug title — be specific and descriptive"),
        description: z
          .string()
          .optional()
          .describe("Detailed bug description with reproduction steps, expected vs actual behavior"),
        priority: z
          .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"])
          .default("MEDIUM")
          .describe("Bug priority (default: MEDIUM)"),
        assignee_id: z
          .string()
          .optional()
          .describe("ID of the member or AI agent to assign this bug to"),
        assignee_type: z
          .enum(["MEMBER", "AGENT"])
          .optional()
          .describe("Type of assignee: MEMBER (human) or AGENT (AI). Required if assignee_id is set"),
        labels: z
          .array(z.string())
          .optional()
          .describe("Array of label IDs to attach to this bug"),
      },
    },
    async ({ project_id, title, description, priority, assignee_id, assignee_type, labels }) => {
      const body: Record<string, unknown> = {
        project_id,
        title,
        priority,
      };
      if (description) body.description = description;
      if (assignee_id) body.assignee_id = assignee_id;
      if (assignee_type) body.assignee_type = assignee_type;
      if (labels) body.labels = labels;

      const result = await api.post<Bug>("/bugs", body);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ── update_bug ─────────────────────────────────────────────────
  server.registerTool(
    "update_bug",
    {
      title: "Update Bug",
      description:
        "Update an existing bug's status, priority, assignee, or description. " +
        "Use this to change bug status (e.g., mark as resolved), reassign to a different " +
        "team member or AI agent, change priority, or update the description. " +
        "Only provided fields will be updated — omitted fields remain unchanged.",
      inputSchema: {
        bug_id: z.string().describe("The bug ID to update"),
        status: z
          .enum(["OPEN", "IN_PROGRESS", "IN_REVIEW", "RESOLVED", "CLOSED", "REOPENED"])
          .optional()
          .describe("New status for the bug"),
        priority: z
          .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"])
          .optional()
          .describe("New priority for the bug"),
        title: z.string().min(1).max(500).optional().describe("Updated title"),
        description: z.string().optional().describe("Updated description"),
        assignee_id: z
          .string()
          .nullable()
          .optional()
          .describe("New assignee ID, or null to unassign"),
        assignee_type: z
          .enum(["MEMBER", "AGENT"])
          .optional()
          .describe("Type of new assignee: MEMBER or AGENT"),
      },
    },
    async ({ bug_id, status, priority, title, description, assignee_id, assignee_type }) => {
      const body: Record<string, unknown> = {};
      if (status !== undefined) body.status = status;
      if (priority !== undefined) body.priority = priority;
      if (title !== undefined) body.title = title;
      if (description !== undefined) body.description = description;
      if (assignee_id !== undefined) body.assignee_id = assignee_id;
      if (assignee_type !== undefined) body.assignee_type = assignee_type;

      const result = await api.patch<Bug>(`/bugs/${bug_id}`, body);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ── add_comment ────────────────────────────────────────────────
  server.registerTool(
    "add_comment",
    {
      title: "Add Comment",
      description:
        "Add a comment to a bug. Use this to provide updates, ask questions, " +
        "share findings, or document progress on a bug. Comments are visible to all " +
        "team members and AI agents with access to the project.",
      inputSchema: {
        bug_id: z.string().describe("The bug ID to comment on"),
        content: z
          .string()
          .min(1)
          .describe("Comment text — supports plain text"),
      },
    },
    async ({ bug_id, content }) => {
      const result = await api.post<Comment>(`/bugs/${bug_id}/comments`, {
        content,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ── search_bugs ────────────────────────────────────────────────
  server.registerTool(
    "search_bugs",
    {
      title: "Search Bugs",
      description:
        "Full-text search across all bugs in the workspace. Searches bug titles and " +
        "descriptions. Use this when you need to find bugs by keywords, error messages, " +
        "or specific terms. More flexible than list_bugs for discovery. " +
        "Combine with status/priority filters to narrow results.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Search query — matches against bug title and description"),
        project_id: z.string().optional().describe("Narrow search to a specific project"),
        status: z
          .enum(["OPEN", "IN_PROGRESS", "IN_REVIEW", "RESOLVED", "CLOSED", "REOPENED"])
          .optional()
          .describe("Filter results by status"),
        priority: z
          .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"])
          .optional()
          .describe("Filter results by priority"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Number of results to return (default: 20, max: 100)"),
      },
    },
    async ({ query, project_id, status, priority, limit }) => {
      const params = new URLSearchParams();
      params.set("q", query);
      if (project_id) params.set("project_id", project_id);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      params.set("limit", String(limit));

      const result = await api.get<{ bugs: Bug[]; total: number }>(
        `/bugs/search?${params.toString()}`
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
