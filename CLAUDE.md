# BugDetector -- Agent Instructions

> This file is auto-read by Claude Code on every invocation.
> It provides project context and working rules for every iteration.

## Project Overview

BugDetector is an AI-native bug tracking platform with a browser extension for instant bug capture (rrweb session recording, console logs, network requests, screenshots) and MCP integration for AI coding agents. Turborepo monorepo.

## Working Directory Structure

```
BugDetector/
├── apps/web/              # Next.js 15 (App Router) — frontend + API
├── apps/extension/        # WXT browser extension (Chrome, Firefox, Edge)
├── packages/shared/       # Shared Zod schemas, types, constants
├── packages/db/           # Prisma schema, client, migrations
├── packages/mcp-server/   # @bugdetector/mcp-server (npm package)
├── packages/ui/           # Shared shadcn/ui components
├── PLAN.md                # Master architecture plan (13 sections)
├── TASKS.md               # Detailed task descriptions with acceptance criteria
├── STATUS.json            # Machine-readable task completion status
├── progress.md            # Append-only learnings log
└── CLAUDE.md              # This file — agent instructions
```

## Task Execution Protocol

1. **Read STATUS.json** — find the current `in_progress` task, or the next `pending` task whose dependencies all have `passes: true`
2. **Read the task details** in TASKS.md for the matching task ID
3. **Read the Codebase Patterns section** at the top of progress.md before writing any code
4. **Implement the task** — follow the requirements and acceptance criteria exactly
5. **Verify all acceptance criteria** — run the checks listed in the task
6. **Update STATUS.json** — set `passes: true`, `status: "completed"`, `completed_at` timestamp, increment `completed` count, clear `in_progress` or set next task
7. **Append to progress.md** — add an iteration log entry with: date, task ID, files changed, what was implemented, learnings, and blockers
8. **Update Codebase Patterns** in progress.md if you discovered a reusable pattern
9. **If blocked** — set task status to `"blocked"` in STATUS.json, add to `blocked` array with reason, move to next available task

## Tech Stack Rules

- **Package manager:** pnpm (never npm or yarn)
- **Database:** PostgreSQL via Prisma ORM — import client from `@bugdetector/db`
- **API:** tRPC v11 — routers in `apps/web/src/server/routers/`
- **Auth:** Better Auth library — NOT custom jose/iron-session, NOT Clerk/Auth0
- **Validation:** Zod schemas from `@bugdetector/shared` — never duplicate
- **UI:** shadcn/ui + Tailwind CSS — components in `packages/ui` or `apps/web/src/components/`
- **Extension:** WXT framework — MV3, React + TypeScript
- **Recording:** rrweb ONLY in V1 (no video/MediaRecorder)
- **Storage:** AWS S3 via @aws-sdk/client-s3 — presigned URLs, never expose credentials to client
- **Console/network logs:** Stored as compressed S3 files (NOT inline JSONB in PostgreSQL)
- **Email:** Resend

## Code Principles

- Every entity must be accessible via tRPC API (AI-first: UI and agents use same endpoints)
- Polymorphic assignee pattern: `assignee_type` (MEMBER | AGENT) + `assignee_id` throughout
- PII redaction runs client-side in the extension BEFORE data leaves the browser
- No video recording in V1 — rrweb DOM recording only
- Quick Capture mode requires zero project/company setup — separate QuickCapture model
- Integration adapters implement the IntegrationAdapter interface — one adapter per provider

## Protected Files (NEVER modify during ralph loop execution)

- `.ralph/` directory and its contents
- `PLAN.md` (reference only)
- `FINAL-RESEARCH.md` (reference only)
- `CLAUDE.md` (this file — only a human should modify agent instructions)
