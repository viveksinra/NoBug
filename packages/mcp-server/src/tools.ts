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

interface RegressionSuite {
  id: string;
  name: string;
  description?: string;
  project_id: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface RegressionRun {
  id: string;
  suite_id: string;
  status: string;
  trigger_type: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  [key: string]: unknown;
}

interface TestResult {
  id: string;
  run_id: string;
  test_case_id: string;
  result: string;
  notes?: string;
  evidence_url?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

interface RunSummary {
  run_id: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  pass_rate: number;
  [key: string]: unknown;
}

interface AgentTask {
  id: string;
  agent_id: string;
  issue_id?: string;
  type: string;
  status: string;
  input_json?: unknown;
  output_json?: unknown;
  created_at: string;
  updated_at: string;
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

  // ═══════════════════════════════════════════════════════════════════
  // REGRESSION TOOLS
  // ═══════════════════════════════════════════════════════════════════

  // ── list_regression_suites ───────────────────────────────────────
  server.registerTool(
    "list_regression_suites",
    {
      title: "List Regression Suites",
      description:
        "List regression test suites for a project. Returns suites with their name, " +
        "description, and test case count. Use this to discover available test suites " +
        "before creating a regression run.",
      inputSchema: {
        project_id: z.string().describe("The project ID to list suites for"),
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
    async ({ project_id, limit, offset }) => {
      const params = new URLSearchParams();
      params.set("project_id", project_id);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const result = await api.get<{ suites: RegressionSuite[]; total: number }>(
        `/regression/suites?${params.toString()}`
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

  // ── get_regression_suite ─────────────────────────────────────────
  server.registerTool(
    "get_regression_suite",
    {
      title: "Get Regression Suite",
      description:
        "Get full details of a regression suite including all its test cases. " +
        "Returns the suite metadata and an array of test cases with their titles, " +
        "descriptions, and linked bugs. Use this to understand what a suite covers " +
        "before starting a regression run.",
      inputSchema: {
        suite_id: z.string().describe("The regression suite ID to retrieve"),
      },
    },
    async ({ suite_id }) => {
      const result = await api.get<RegressionSuite>(
        `/regression/suites/${suite_id}`
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

  // ── create_regression_run ────────────────────────────────────────
  server.registerTool(
    "create_regression_run",
    {
      title: "Create Regression Run",
      description:
        "Start a new regression run for a suite. A run tracks the execution of test cases " +
        "and collects pass/fail results. You can optionally specify a subset of test case IDs " +
        "to run (otherwise all test cases in the suite are included). Set the trigger type to " +
        "indicate whether this was triggered manually, by a deploy, or by a schedule.",
      inputSchema: {
        suite_id: z.string().describe("The regression suite ID to run"),
        trigger_type: z
          .enum(["MANUAL", "DEPLOY", "SCHEDULE"])
          .default("MANUAL")
          .describe("What triggered this run (default: MANUAL)"),
        test_case_ids: z
          .array(z.string())
          .optional()
          .describe("Optional subset of test case IDs to include. If omitted, all suite test cases are included"),
      },
    },
    async ({ suite_id, trigger_type, test_case_ids }) => {
      const body: Record<string, unknown> = {
        suite_id,
        trigger_type,
      };
      if (test_case_ids) body.test_case_ids = test_case_ids;

      const result = await api.post<RegressionRun>("/regression/runs", body);
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

  // ── submit_test_result ───────────────────────────────────────────
  server.registerTool(
    "submit_test_result",
    {
      title: "Submit Test Result",
      description:
        "Submit a pass/fail result for a specific test case in a regression run. " +
        "Each test case in a run should have exactly one result submitted. Include " +
        "evidence URLs (screenshots, recordings) and notes to document the outcome. " +
        "Duration helps track test execution time trends.",
      inputSchema: {
        run_id: z.string().describe("The regression run ID"),
        test_case_id: z.string().describe("The test case ID being reported on"),
        result: z
          .enum(["PASS", "FAIL", "SKIP", "BLOCKED"])
          .describe("Test result: PASS, FAIL, SKIP, or BLOCKED"),
        evidence_url: z
          .string()
          .url()
          .optional()
          .describe("URL to evidence (screenshot, recording, log file)"),
        notes: z
          .string()
          .optional()
          .describe("Notes about the result — failure details, workarounds, observations"),
        duration_ms: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("How long the test took to execute in milliseconds"),
      },
    },
    async ({ run_id, test_case_id, result, evidence_url, notes, duration_ms }) => {
      const body: Record<string, unknown> = {
        test_case_id,
        result,
      };
      if (evidence_url) body.evidence_url = evidence_url;
      if (notes) body.notes = notes;
      if (duration_ms !== undefined) body.duration_ms = duration_ms;

      const res = await api.post<TestResult>(
        `/regression/runs/${run_id}/results`,
        body
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    }
  );

  // ── get_run_summary ──────────────────────────────────────────────
  server.registerTool(
    "get_run_summary",
    {
      title: "Get Run Summary",
      description:
        "Get a summary of regression run results including pass rate, total/passed/failed/ " +
        "skipped/blocked counts, and individual test case results. Use this after a run " +
        "completes to review the overall outcome and identify failures.",
      inputSchema: {
        run_id: z.string().describe("The regression run ID to summarize"),
      },
    },
    async ({ run_id }) => {
      const result = await api.get<RunSummary>(
        `/regression/runs/${run_id}/summary`
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

  // ═══════════════════════════════════════════════════════════════════
  // AGENT TOOLS
  // ═══════════════════════════════════════════════════════════════════

  // ── get_agent_tasks ──────────────────────────────────────────────
  server.registerTool(
    "get_agent_tasks",
    {
      title: "Get Agent Tasks",
      description:
        "List tasks assigned to the current AI agent (identified by the API key). " +
        "Returns tasks with their type, status, input data, and linked issue. " +
        "Use status filter to find queued tasks to claim or running tasks to update.",
      inputSchema: {
        status: z
          .enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"])
          .optional()
          .describe("Filter by task status"),
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
    async ({ status, limit, offset }) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const result = await api.get<{ tasks: AgentTask[]; total: number }>(
        `/agents/tasks?${params.toString()}`
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

  // ── update_agent_task ────────────────────────────────────────────
  server.registerTool(
    "update_agent_task",
    {
      title: "Update Agent Task",
      description:
        "Update the status of an agent task. Use this to mark a task as RUNNING when you " +
        "start working on it, COMPLETED when done, or FAILED if something went wrong. " +
        "Include output data with your results or error details.",
      inputSchema: {
        task_id: z.string().describe("The agent task ID to update"),
        status: z
          .enum(["RUNNING", "COMPLETED", "FAILED"])
          .describe("New status for the task"),
        output: z
          .record(z.unknown())
          .optional()
          .describe("Output data — results on completion, error details on failure"),
      },
    },
    async ({ task_id, status, output }) => {
      const body: Record<string, unknown> = { status };
      if (output !== undefined) body.output = output;

      const result = await api.patch<AgentTask>(
        `/agents/tasks/${task_id}`,
        body
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

  // ── claim_agent_task ─────────────────────────────────────────────
  server.registerTool(
    "claim_agent_task",
    {
      title: "Claim Agent Task",
      description:
        "Claim a QUEUED agent task for execution. This atomically transitions the task " +
        "from QUEUED to RUNNING and assigns it to the current agent. Use get_agent_tasks " +
        "with status=QUEUED to find available tasks first. If the task is no longer QUEUED " +
        "(e.g., already claimed by another agent), an error is returned.",
      inputSchema: {
        task_id: z.string().describe("The QUEUED agent task ID to claim"),
      },
    },
    async ({ task_id }) => {
      const result = await api.post<AgentTask>(
        `/agents/tasks/${task_id}/claim`
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
