# BugDetector — Product & Technical Plan

> An AI-native bug tracking, test management, and developer collaboration platform with a browser extension for instant bug capture (video, console, network, screenshots) and MCP integration for AI coding agents.

---

## Table of Contents

1. [Vision & Market Context](#1-vision--market-context)
2. [Decisions (Finalized)](#2-decisions-finalized)
3. [Architecture Overview](#3-architecture-overview)
4. [Tech Stack](#4-tech-stack)
5. [Version 1 — Core Platform](#5-version-1--core-platform)
6. [Version 2 — AI Automation Testing](#6-version-2--ai-automation-testing)
7. [Database Schema (High-Level)](#7-database-schema-high-level)
8. [MCP Server Design](#8-mcp-server-design)
9. [AI Agents as Team Members](#9-ai-agents-as-team-members)
10. [Browser Extension Architecture](#10-browser-extension-architecture)
11. [Integration Strategy — "Bridge, Don't Replace"](#11-integration-strategy--bridge-dont-replace)
12. [Risk Mitigations](#12-risk-mitigations-from-technical-research)
13. [Milestones & Phasing](#13-milestones--phasing)

---

## 1. Vision & Market Context

### What Exists Today

| Tool | What It Does | Gap We Fill |
|------|-------------|-------------|
| **Jam.dev** | Bug recording extension (170K users, $2.4M rev) | No project management, no test management, no MCP, no AI agents |
| **BetterBugs** | Bug recording + MCP support ($10/user) | No issue tracking, no test management, no regression, no agent model |
| **Jira / Azure DevOps** | Full project management + bug tracking | No built-in bug recording, no AI-native workflow, clunky for testers |
| **Linear** | Modern issue tracker | No recording extension, no test management, no AI agent MCP |
| **LogRocket / Replay.dev** | Session replay + debugging | Production monitoring, not bug reporting workflow |
| **Marker.io / BugHerd** | Visual bug reporting widgets | Limited to screenshots, no deep console/network capture |
| **Shortest / Playwright** | AI-powered E2E testing | Testing only, no bug tracking or project management |
| **Plane (open source)** | Jira alternative (30k+ GitHub stars) | No recording, no AI, no test management |

### Our Differentiator

**BugDetector is the first platform that connects the entire loop:**
```
Tester records bug → Structured data (video + console + network + screenshots)
    → Developer gets AI-readable bug context via MCP
    → AI agent reads bug, suggests/applies fix
    → Developer verifies with attached recording
    → QA re-tests and closes
    → Regression suite updated automatically
```

No existing tool connects bug capture → AI-powered fixing → verification → regression in one platform.

### The AI Bug Paradox — Our Biggest Tailwind

AI generates **1.7x more bugs than humans** (Stack Overflow 2026). With 40%+ of code now AI-generated, the demand for bug tracking and fixing tools is **growing proportionally with AI adoption**. We're building into an accelerating market, not a shrinking one.

### Market Validation

- BetterBugs ($10/user) already ships MCP support — confirms MCP for bug tools is a real category
- Jam.dev: 170K users, $2.4M revenue, 32 Fortune 100 companies — proves demand
- Linear: $1.25B valuation, $100M revenue with $35K marketing — proves product-led growth works
- Playwright 1.56: Built-in AI agents (Planner, Generator, Healer) — validates our V2 AI testing approach
- Asana, Slack, Claude Code all ship "AI as team member" features — validates our agent model
- Combined addressable market: **$2-5B in 2026, growing to $15-20B by 2033**

---

## 2. Decisions (Finalized)

### D1: Monorepo (Turborepo) — CONFIRMED

**Structure:**
```
BugDetector/                    (Turborepo monorepo)
├── apps/
│   ├── web/                    → Next.js 15 (frontend + API routes)
│   ├── extension/              → WXT browser extension
│   └── docs/                   → Documentation site (optional)
├── packages/
│   ├── shared/                 → Shared types, validation (Zod), constants
│   ├── mcp-server/             → @bugdetector/mcp-server (npm package)
│   ├── db/                     → Prisma schema, client, migrations
│   └── ui/                     → Shared UI components (shadcn/ui based)
├── docker/                     → Docker configs for self-hosted
├── turbo.json
└── package.json
```

**Deployment (independent per app):**
| App | Deploy Target | How |
|-----|--------------|-----|
| `apps/web` | EC2 (or any VPS) | Docker container, PM2 + Nginx, or `next start` behind reverse proxy |
| `apps/extension` | Chrome Web Store / Firefox Add-ons | Static build, `wxt build` → upload |
| `packages/mcp-server` | npm registry | `npm publish` — users install locally |
| Self-hosted bundle | Customer's server | `docker-compose up` with pre-built images |

**Why keep API inside Next.js for V1:** Simpler — one deployment, Server Actions + API routes handle everything. Split to separate Express API on EC2 only if scaling demands it later.

### D2: Both rrweb + Video — CONFIRMED

Default to rrweb (smaller, interactive), video as fallback for canvas/WebGL apps.

### D3: PostgreSQL (Neon) — CONFIRMED

Using Neon for managed PostgreSQL. Prisma ORM for type-safe access. JSONB for flexible metadata, pgvector for AI search.

### D4: Cloud-First, Self-Hosted via Docker Images — CONFIRMED

**Self-hosted approach (code stays private):**
- Source code stays in a **private** GitHub repo
- We publish **pre-built Docker images** to Docker Hub or GitHub Container Registry
- Docker images contain compiled/minified JS bundles — NOT source code
- Customers run: `docker-compose up -d` with their own env vars
- Same model as PostHog, GitLab, Plane — no source exposure
```
# Customer runs this (no source code visible):
docker pull bugdetector/web:latest
docker-compose up -d
```

### D5: Custom Auth (No Clerk) — CONFIRMED

Building auth from scratch for full control. Approach:
- **Library:** Better Auth (open source, Next.js native) OR fully custom with jose/iron-session
- **Password hashing:** bcrypt or argon2
- **Sessions:** HTTP-only cookies with JWT or iron-session (encrypted sessions)
- **Features to build:**
  - Email/password registration + login
  - Email verification (via Resend or Nodemailer)
  - Password reset flow
  - Organization/company creation
  - Team invitation system (email invites with tokens)
  - Role-based access control: Owner, Admin, Developer, QA/Tester, Viewer
  - OAuth providers: Google, GitHub (optional, nice-to-have)
- **Impact:** Adds ~1-2 weeks to Phase 1A but gives complete ownership
- **For self-hosted:** Custom auth is actually better — no dependency on third-party auth service

### D6: WXT Extension Framework — CONFIRMED

### D7: AWS S3 or Azure Blob Storage — CONFIRMED

Using AWS S3 (with CloudFront CDN) or Azure Blob Storage for media. Decision between AWS/Azure can be made at implementation time based on existing cloud preferences. Both are S3-compatible via SDKs.

### D8: SSE + WebSockets — CONFIRMED

SSE for V1, add WebSockets for collaboration features later.

### D9: AI-First Architecture — CONFIRMED (Critical Design Principle)

**Every workflow step must have dual interfaces: Human UI + AI Agent API/MCP**

The long-term vision is that AI agents can perform every step a human does. The platform is designed so that at any point, a human can be swapped for an AI agent (or vice versa) for any workflow step.

**Dual-Interface Design:**

| Workflow Step | Human Interface | AI Agent Interface |
|---------------|----------------|-------------------|
| **Report Bug** | Browser extension UI | MCP: `create_bug` / auto-detection agent |
| **Triage Bug** | Dashboard, drag-and-drop | MCP: `triage_bug` (AI analyzes severity, assigns) |
| **Assign Bug** | Dropdown in UI | MCP: `assign_bug` (AI picks best developer) |
| **Fix Bug** | Code editor | MCP: `get_bug` → AI reads context, writes fix |
| **Dev Test** | Extension records manual test | MCP: `run_dev_test` (AI runs targeted tests) |
| **Code Review** | PR review UI | MCP: `review_fix` (AI reviews code changes) |
| **QA Test** | Extension records QA verification | MCP: `run_qa_test` (AI runs E2E verification) |
| **Regression Test** | Manual checklist + recording | MCP: `run_regression` (AI runs automated suite) |
| **Close/Reopen** | Button click | MCP: `close_bug` / `reopen_bug` (auto on test result) |

**Implementation principle:** Build the API/MCP layer first, then the UI consumes the same API. This ensures AI agents have the same capabilities as human users from day one.

### D10: Tiered Regression System — FINALIZED

**Three-tier regression model:**

| Tier | Name | Test Count | When to Run | V1 (Human) | V2 (AI) |
|------|------|-----------|-------------|------------|---------|
| **Smoke** | Critical path | 5-10 tests | Every deploy | Manual checklist | AI automated |
| **Core** | Key features | 20-50 tests | Every release | Manual + recording | Mix AI + manual |
| **Full** | Everything | 100+ tests | Major releases / scheduled | Full manual run | Mostly AI |

**Smart features:**
- **Bug-to-test linking:** When bug BUG-142 is found during test case TC-15, they're linked. When BUG-142 is fixed, TC-15 is auto-flagged for re-testing in next run.
- **Flaky test detection:** If a test flips pass↔fail across runs, flag it with a "flaky" indicator and frequency score.
- **Regression auto-discovery:** When bugs cluster around a feature area, AI suggests adding new regression tests for coverage gaps.
- **Test history per case:** Track pass/fail history across all runs — identify tests that always pass (potential removal candidates) vs frequently fail (priority attention).
- **Release comparison:** Side-by-side comparison of regression runs across releases — instantly see what regressed.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
├──────────────┬──────────────────┬───────────────────────────────┤
│  Web App     │  Browser Extension│  MCP Server (for AI agents)  │
│  (Next.js)   │  (WXT + React)   │  (TypeScript SDK)            │
└──────┬───────┴────────┬─────────┴──────────────┬───────────────┘
       │                │                         │
       ▼                ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API LAYER                                    │
│              Next.js API Routes / Server Actions                 │
│              + tRPC (type-safe API layer)                        │
├─────────────────────────────────────────────────────────────────┤
│                     SERVICES                                     │
│  Auth (Custom) │  Media Processing  │  AI Services  │  Realtime │
│  JWT/Sessions  │  (FFmpeg/Sharp)    │  (Claude API)  │  (SSE)   │
├──────────┬─────┴──────┬────────────┴───────┬────────┴──────────┤
│          │            │                    │                     │
▼          ▼            ▼                    ▼                     │
┌────────┐ ┌──────────┐ ┌──────────────┐ ┌────────┐              │
│PostgreSQL│ │  Redis   │ │  AWS S3 /    │ │ClickHouse│            │
│ (Neon)  │ │(Upstash) │ │ Azure Blob   │ │(Optional) │           │
│(Prisma) │ │(Cache/   │ │(Media Store) │ │(Analytics)│           │
│         │ │ Queues)  │ │ + CDN        │ │           │           │
└─────────┘ └──────────┘ └──────────────┘ └──────────┘            │
```

---

## 4. Tech Stack

### Core

| Layer | Technology | Why |
|-------|-----------|-----|
| **Monorepo** | Turborepo | Caching, parallel builds, shared packages |
| **Frontend** | Next.js 15 (App Router) | RSC, Server Actions, dominant React framework |
| **Styling** | Tailwind CSS + shadcn/ui | Fast development, consistent design system |
| **API** | tRPC v11 | End-to-end type safety between client and server |
| **Database** | PostgreSQL (Neon) | Relational data, JSONB flexibility, pgvector for AI search |
| **ORM** | Prisma (or Drizzle) | Type-safe DB access, migrations, great DX |
| **Auth** | Custom (Better Auth or jose/iron-session) | Full control, self-hosted compatible, no third-party dependency |
| **Media Storage** | AWS S3 + CloudFront (or Azure Blob + CDN) | Proven at scale, flexible cloud provider choice |
| **Cache/Queue** | Redis (Upstash) | Caching, rate limiting, background job queues |
| **Real-time** | SSE (built-in) | Bug updates, notifications |
| **Email** | Resend (or Nodemailer + SMTP) | Invitations, password reset, notifications |

### Browser Extension

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | WXT (wxt.dev) | Modern MV3 extension framework, cross-browser |
| **UI** | React + Tailwind | Consistent with web app |
| **Recording** | rrweb + MediaRecorder | DOM replay (primary) + video fallback |
| **Console Capture** | Custom MAIN world script | Monkey-patch console.* methods |
| **Network Capture** | fetch/XHR interception + chrome.webRequest | Full request/response capture |
| **Annotation** | Fabric.js on Canvas | Drawing tools for screenshot markup |
| **Storage** | IndexedDB (Dexie.js) | Buffer recordings before upload |

### AI & MCP

| Layer | Technology | Why |
|-------|-----------|-----|
| **MCP Server** | @modelcontextprotocol/sdk (TypeScript) | Expose bug data to AI agents |
| **AI Provider** | Claude API (Anthropic) | Bug summarization, test generation |
| **Embeddings** | pgvector + OpenAI embeddings | Semantic bug search, duplicate detection |
| **AI Testing (V2)** | Playwright + Claude | AI-driven E2E test execution |

---

## 5. Version 1 — Core Platform

### Phase 1A: Foundation (Weeks 1-4)

**Custom Auth System**

- [ ] User model: email, password_hash (argon2), name, avatar, email_verified
- [ ] Registration: email + password, send verification email
- [ ] Login: email + password → JWT in HTTP-only cookie (or iron-session)
- [ ] Password reset: token-based flow via email (Resend)
- [ ] Session management: refresh tokens, token rotation
- [ ] OAuth (Google, GitHub) — nice-to-have for V1, add if time permits
- [ ] Middleware: protect routes, extract user from session

**Company & Project Management**

- [ ] Company (Organization) creation — name, logo, slug URL
- [ ] Project creation within a company — name, description, key prefix (e.g., `BUG-123`)
- [ ] Team invitation system: owner sends email invite → invite token → recipient creates account or joins
- [ ] Roles & permissions: Owner, Admin, Developer, QA/Tester, Viewer
- [ ] **Multi-company roles:** A user can be Admin in Company A and Viewer in Company B. Role is per-membership, not per-user. On login, user sees all companies they belong to and picks one (company switcher).
- [ ] RBAC middleware: check role for CURRENT company context (API-level, not just UI)
- [ ] Company switcher: user can switch between companies they belong to
- [ ] Company settings: billing placeholder, integrations placeholder, custom fields
- [ ] Project settings: statuses (customizable), priorities, labels/tags
- [ ] Dashboard: overview of recent activity across projects
- [ ] API key generation per project (for MCP server and extension auth)

**AI Agent Management (V1 — model + UI, execution in V2)**

- [ ] Create AI agents within a company: name, type (qa_tester/developer/code_reviewer/regression_runner), config
- [ ] Agent appears in assignment dropdowns alongside human members
- [ ] Assign issues/test cases to AI agents — creates AgentTask (status: queued)
- [ ] Agent task queue dashboard: see pending, running, completed agent tasks
- [ ] V1 scope: agents are assignable and visible, but automated execution comes in V2. Developers use MCP manually in V1.

**AI-First Note:** Every entity (company, project, member, issue) must be accessible via API from day one. The UI and AI agents consume the same tRPC endpoints. API keys enable headless access for AI agents.

**Data Model:**
```
Company (org)
  ├── Projects[]
  │     ├── Issues[]
  │     │     ├── Comments[]
  │     │     ├── Recordings[]
  │     │     ├── Screenshots[]
  │     │     └── ActivityLog[]
  │     ├── RegressionSuites[]
  │     │     └── TestCases[]
  │     └── Releases[]
  ├── Members[] (custom auth, roles stored in DB)
  └── ApiKeys[] (for MCP/extension/integrations)
```

### Phase 1B: Issue Tracking (Weeks 3-5)

**Issue/Bug Management**

- [ ] Issue creation with: title, description (rich text - Tiptap editor), priority, status, assignee, labels, due date
- [ ] Issue detail page with full context
- [ ] List view with filtering (status, priority, assignee, label, date range)
- [ ] Board view (Kanban) with drag-and-drop status changes
- [ ] Issue comments with @mentions and rich text
- [ ] Activity log on each issue (status changes, assignments, comments)
- [ ] Issue linking (related, blocks, blocked by, duplicate)
- [ ] Bulk actions (assign, change status, add label)
- [ ] Search across issues (full-text + filters)
- [ ] Notification system (in-app + email for assignments, mentions, status changes)

**Issue Statuses (default, customizable):**
```
Open → In Progress → Dev Testing → QA Testing → Closed
                  ↘ Reopened ↗
```

### Phase 1C: Browser Extension — Bug Capture (Weeks 5-9)

**TWO MODES — Critical for Adoption**

```
┌─────────────────────────────────────────────────────────────────┐
│  MODE 1: QUICK CAPTURE (zero friction, the growth engine)       │
│                                                                  │
│  Install extension → Click "Capture Bug" → Add title (optional) │
│  → "Get Link" → https://bugdetector.io/b/abc123                │
│  → Paste in Google Sheet, Slack, Email, Jira comment, anywhere  │
│                                                                  │
│  Requirements: email signup only (or anonymous with 24hr expiry) │
│  No company, no project, no team setup needed.                   │
│  Viewer page is PUBLIC (no login to view).                       │
│  This is how Jam.dev hooks users. This is our #1 acquisition.   │
├─────────────────────────────────────────────────────────────────┤
│  MODE 2: FULL PLATFORM (for teams that want workflow)           │
│                                                                  │
│  Same capture + creates issue in BugDetector project             │
│  → Assigned to dev/agent, tracked on board, QA workflow          │
│  → Optionally synced to Jira/Azure DevOps/GitHub                 │
│                                                                  │
│  Requirements: company + project setup + team members.           │
│  This is the monetization path.                                  │
└─────────────────────────────────────────────────────────────────┘

Extension popup adapts to user state:
- Not logged in      → "Capture & Get Link" (Quick Capture only)
- Logged in, no org  → "Capture & Get Link" + "Create free team"
- Logged in + org    → Project selector + Quick Capture + Full submission
```

**Extension Core**

- [ ] WXT project setup with React + TypeScript
- [ ] Extension popup: adapts based on auth state (see modes above)
- [ ] Quick Capture mode: capture → upload → get shareable link (no project needed)
- [ ] Full mode: capture → select project → fill details → create issue
- [ ] Content script injection for console/network capture
- [ ] Service worker for event coordination and storage

**Screen Recording**

- [ ] rrweb integration for DOM session recording (primary mode)
- [ ] MediaRecorder + tabCapture for video recording (fallback mode)
- [ ] Rolling buffer — always records last 30-60 seconds (configurable)
- [ ] Recording controls: start/stop manual recording, or "capture last N seconds"
- [ ] Audio capture toggle (optional microphone narration)

**Console Log Capture**

- [ ] MAIN world script injection at `document_start`
- [ ] Intercept: `console.log`, `.warn`, `.error`, `.info`, `.debug`
- [ ] Capture uncaught exceptions (`window.onerror`, `unhandledrejection`)
- [ ] Serialize arguments safely (handle circular refs, DOM elements, large objects)
- [ ] Timestamp each entry and link to recording timeline

**Network Request Capture**

- [ ] Monkey-patch `fetch()` and `XMLHttpRequest` in MAIN world
- [ ] Capture: URL, method, headers, request body, response status, response body (truncated if large), timing
- [ ] Use `chrome.webRequest.onCompleted` for comprehensive metadata
- [ ] HAR-like structured format for each request
- [ ] Flag failed requests (4xx, 5xx) prominently

**Screenshot & Annotation**

- [ ] Capture viewport screenshot via `chrome.tabs.captureVisibleTab()`
- [ ] Full-page screenshot via scrolling + stitching (optional)
- [ ] Annotation overlay with Fabric.js:
  - Arrow tool
  - Rectangle/ellipse highlight
  - Freehand draw
  - Text labels
  - Blur/redact tool (for sensitive data)
  - Color picker
- [ ] Export annotated screenshot as PNG

**Bug Report Submission**

- [ ] "Report Bug" button — opens submission form

**Quick Capture flow (no project, shareable link):**
- [ ] Title (optional — AI auto-generates if blank)
- [ ] Description (optional)
- [ ] Auto-populated: URL, browser, OS, viewport, framework, timestamp
- [ ] One click → Upload recording + console + network + screenshot
- [ ] Returns shareable link: `https://bugdetector.io/b/abc123`
- [ ] Link viewer is public (no login required to view)
- [ ] Optional: password-protect link, set expiry (24hr/7days/30days/never)
- [ ] Anonymous captures expire after 24hrs. Signed-in captures: 30 days (free) or forever (paid).

**Full Platform flow (with project, creates issue):**
- [ ] Everything from Quick Capture PLUS:
- [ ] Project selector, priority, assignee (human or AI agent), labels, due date
- [ ] AI-generated description: send captured data to Claude API → auto-write reproduction steps
- [ ] Creates issue in BugDetector + optionally syncs to external tool (Jira/GitHub/etc.)
- [ ] Share link also generated (same viewer)

**Environment Data Auto-Captured (both modes):**

**Environment Data Auto-Captured:**
```json
{
  "url": "https://app.example.com/dashboard",
  "browser": "Chrome 125.0.6422.112",
  "os": "Windows 11",
  "viewport": "1920x1080",
  "devicePixelRatio": 1,
  "memory": "8 GB",
  "connection": "4g",
  "framework": "Next.js 15.1.0",
  "timestamp": "2026-04-12T10:30:00Z",
  "localStorage_keys": ["auth_token", "theme", "locale"],
  "cookies_count": 12
}
```

### Phase 1D: Bug Viewer & Replay (Weeks 9-11)

**Recording Replay Viewer**

- [ ] rrweb-player integration for DOM session replay
- [ ] Video player for video recordings
- [ ] Synchronized timeline showing:
  - Recording playback (scrubable)
  - Console log entries (click to jump to timestamp)
  - Network requests (click to see details)
  - User interaction events (clicks, scrolls, inputs)
- [ ] Console log panel: filterable by level (error/warn/info/log), searchable
- [ ] Network panel: filterable by status, searchable, expandable request/response details
- [ ] Environment info panel
- [ ] Screenshot gallery with annotation viewer
- [ ] Shareable public link (no login to view — critical for adoption)
- [ ] Optional: password protection, expiry settings
- [ ] Quick Capture viewer: `bugdetector.io/b/{slug}` — same replay viewer but standalone
- [ ] "Promote to Issue" button on viewer: convert a quick capture into a full tracked issue (prompts login + project selection)
- [ ] Viewer shows: "Captured with BugDetector — Install extension" CTA (viral loop)

### Phase 1E: Developer Testing & QA Workflow (Weeks 11-13)

**Dev Testing Flow**

- [ ] When developer moves issue to "Dev Testing":
  - Dev tests the fix
  - Can attach a recording of their testing (using the extension)
  - Recording appears in the issue timeline as "Dev Test Recording"
  - Dev marks as "Ready for QA" → moves to "QA Testing"

**QA Testing Flow**

- [ ] When issue moves to "QA Testing":
  - QA tester gets notification
  - Tests the fix using the original bug report as reference
  - Can attach pass/fail recording
  - If pass → close issue
  - If fail → reopen with new recording showing the failure → back to developer

**Issue Timeline:**
```
1. [QA] Bug reported — Recording + console + network + screenshots
2. [Dev] Picked up — status: In Progress
3. [Dev] Dev testing done — attached recording showing fix works
4. [QA] QA testing — attached recording confirming fix
5. [QA] Issue closed ✓
```

### Phase 1F: MCP Server (Weeks 11-13, parallel with 1E)

**MCP Server for AI Coding Agents**

- [ ] Published as npm package: `@bugdetector/mcp-server`
- [ ] Authentication via API key (per project)

**Tools exposed:**

```typescript
// Search and retrieve bugs
search_bugs(query: string, filters: { status, priority, assignee, label })
get_bug(id: string)  // Full bug details
get_bug_console_logs(id: string)  // Console logs from recording
get_bug_network_logs(id: string)  // Network requests from recording
get_bug_environment(id: string)  // Browser, OS, framework info
get_bug_screenshots(id: string)  // Screenshot URLs
get_bug_steps(id: string)  // AI-extracted reproduction steps

// Update bugs
update_bug_status(id: string, status: string)
add_bug_comment(id: string, comment: string)

// Project context
get_project_info(project_key: string)
list_open_bugs(project_key: string)

// Regression
get_regression_suite(project_key: string)
```

**What makes this AI-agent-friendly:**
- Console errors are extracted and formatted as structured data (not embedded in video)
- Network failures are highlighted with request/response payloads
- Stack traces are parsed and linked to source files
- Environment info helps the AI understand the runtime context
- Reproduction steps are in natural language, actionable by an AI agent

### Phase 1G: Regression Test Management (Weeks 13-16)

**Regression Suite**

- [ ] Create regression suite per project (can have multiple)
- [ ] Add test cases: title, description, steps (structured JSON), expected result
- [ ] Tier assignment: Smoke (critical path) / Core (key features) / Full (everything)
- [ ] Organize test cases in folders/sections (e.g., "Login Flow", "Checkout", "Dashboard")
- [ ] Tag test cases for flexible filtering (e.g., "payments", "auth", "mobile")
- [ ] Import/export test cases (CSV for bulk management)

**Regression Runs**

- [ ] Create a "Regression Run" from a suite — select tier: smoke / core / full / custom
- [ ] Link regression run to a release/version
- [ ] Trigger modes: manual, deploy webhook, scheduled (cron)
- [ ] QA tester goes through each test case:
  - Mark as: Pass / Fail / Blocked / Skipped
  - Attach recording or screenshot for evidence
  - If fail → auto-create a bug issue linked to this test case (TestCaseBugLink)
- [ ] Dashboard showing run progress: X/Y tested, pass rate, blockers, by-tier breakdown
- [ ] History: compare regression runs across releases (pass rate trends, by-tier charts)
- [ ] Flaky test detection: auto-calculate flaky_score from pass/fail history across runs

**Bug-Test Linking (Smart Re-testing)**

- [ ] When a bug is created from a failed test → auto-link bug to test case
- [ ] When linked bug is fixed (closed) → flag the test case as "needs re-verification" in next run
- [ ] Dashboard widget: "X test cases pending re-verification due to bug fixes"

**AI-First Regression Notes:**
- Every regression action (create run, mark result, link bug) available via tRPC API
- MCP tools: `get_regression_suite`, `start_regression_run`, `submit_test_result`
- In V2, AI agents can execute regression runs by calling these same APIs

---

## 6. Version 2 — AI Automation Testing

> V2 builds on the regression suite from V1 with AI-powered test execution.

### Phase 2A: AI E2E Test Generation

- [ ] For each regression test case (manual), offer "Generate Automated Test"
- [ ] User provides: the test case description (natural language) + the target URL
- [ ] AI (Claude) generates a Playwright test script from the description
- [ ] User can review, edit, and save the generated test
- [ ] Tests stored in the platform, version-controlled

**Approach:** Similar to Shortest (antiwork/shortest) — natural language → Playwright via LLM. But integrated into our regression suite, not standalone.

### Phase 2B: AI Test Execution

- [ ] Run automated tests on demand or on schedule (after each deploy via webhook)
- [ ] Test runner: Playwright in a sandboxed cloud environment (containerized)
- [ ] During execution, AI handles:
  - **Self-healing locators**: if a selector breaks, AI analyzes the page and finds the correct element
  - **Adaptive assertions**: AI interprets "verify the dashboard loads" by analyzing the actual page state
  - **Screenshot on failure**: automatic screenshot + recording when a test fails
- [ ] Results feed back into regression run: automated pass/fail alongside manual results
- [ ] Failed tests auto-create bug issues with the test recording attached

### Phase 2C: Visual Regression Testing

- [ ] Capture baseline screenshots for each page/component
- [ ] After each test run, compare screenshots against baseline
- [ ] AI-powered diff (not pixel-perfect — handles anti-aliasing, dynamic content, timestamps)
- [ ] Flag visual regressions with side-by-side comparison
- [ ] One-click approve (update baseline) or reject (create bug)

### Phase 2D: Smart Test Selection

- [ ] Analyze git diff / deploy changeset
- [ ] AI determines which regression tests are affected by the code changes
- [ ] Run only affected tests for fast feedback (full suite on schedule)
- [ ] Learn from history: tests that frequently fail after certain types of changes get priority

### Phase 2E: AI Bug-to-Fix Pipeline

- [ ] When a bug is reported with full context (console, network, steps):
  - AI analyzes the bug and suggests potential root causes
  - If connected via MCP, AI agent can:
    1. Read the bug details
    2. Explore the codebase
    3. Generate a fix
    4. Run relevant tests
    5. Create a PR with the fix
  - Developer reviews the AI-generated fix
  - QA tests and closes

---

## 7. Database Schema (High-Level)

```sql
-- Auth & Users (custom auth — no third-party dependency)
User (
  id, email, password_hash, name, avatar_url,
  email_verified, email_verify_token,
  reset_token, reset_token_expires,
  created_at, updated_at
)

Session (id, user_id, token, expires_at, ip_address, user_agent, created_at)

OAuthAccount (id, user_id, provider, provider_account_id, access_token, refresh_token)
  -- provider: google | github

-- Organizations
Company (id, name, slug, logo_url, plan, created_at)

-- Members: a user can be in MULTIPLE companies with DIFFERENT roles
-- e.g., Admin in Company A, Viewer in Company B
Member (id, company_id, user_id, role, invited_at, joined_at)
  -- role: owner | admin | developer | qa | viewer
  -- UNIQUE constraint on (company_id, user_id) — one role per company
  -- A User can have many Member rows (one per company they belong to)

Invitation (id, company_id, email, role, token, invited_by, expires_at, accepted_at)

-- AI Agents — first-class team members in an organization
-- Can be assigned issues, test cases, and workflow steps just like humans
Agent (
  id, company_id,
  name,              -- "QA Bot", "Dev Fixer", "Regression Runner"
  type,              -- qa_tester | developer | code_reviewer | regression_runner
  status,            -- active | paused | disabled
  avatar_url,        -- visual identity in UI (robot icon, etc.)
  config_json,       -- {
                     --   model: "claude-sonnet-4-6",
                     --   repo_url: "github.com/org/repo",  (for dev agents)
                     --   target_url: "https://staging.app.com",  (for QA agents)
                     --   max_retries: 3,
                     --   auto_assign: true,  (auto-pick up new assignments)
                     --   capabilities: ["fix_bugs", "run_tests", "code_review"]
                     -- }
  api_key_id,        -- which API key this agent uses to authenticate
  created_by,        -- user who created this agent
  created_at, updated_at
)

-- Unified assignee: issues/tests can be assigned to EITHER a human or an agent
-- We use a polymorphic pattern: assignee_type + assignee_id
-- assignee_type = 'member' → assignee_id references Member.id
-- assignee_type = 'agent'  → assignee_id references Agent.id

-- API Access (for MCP server, extension, integrations, AI agents)
ApiKey (id, company_id, project_id, name, key_hash, permissions_json, last_used_at, created_at)

-- Quick Captures (no project required — the growth engine)
QuickCapture (
  id, slug,              -- slug = short ID for shareable link: /b/{slug}
  user_id,               -- nullable (anonymous captures allowed)
  title, description,
  recording_url,         -- S3 URL to rrweb JSON
  console_logs_url,      -- S3 URL to console logs JSON
  network_logs_url,      -- S3 URL to network logs JSON
  screenshot_url,        -- S3 URL to screenshot PNG
  environment_json,      -- browser, OS, framework, viewport
  password_hash,         -- optional link password
  expires_at,            -- null = never (paid), 24hr (anon), 30d (free signed-in)
  view_count,            -- track how many times link was viewed
  converted_to_issue_id, -- if user later promotes this to a full issue
  created_at
)
-- QuickCapture is SEPARATE from Issue. A capture can be promoted to an Issue later.
-- This allows zero-friction capture without company/project setup.

-- Projects
Project (id, company_id, name, key, description, settings_json, created_at)
  -- settings_json: { statuses: [], priorities: [], default_assignee, etc. }

-- Issues
Issue (
  id, project_id, number, title, description,
  status, priority, type,
  reporter_id, reporter_type,         -- member | agent | system
  assignee_id, assignee_type,         -- member | agent (polymorphic)
  environment_json,   -- browser, OS, framework, URL
  ai_summary,         -- AI-generated bug summary
  ai_root_cause,      -- AI-analyzed root cause (populated by MCP agent)
  created_at, updated_at, closed_at
)

IssueComment (id, issue_id, author_id, author_type, content, type, created_at)
  -- author_type: member | agent | system
  -- type: comment | status_change | assignment | recording_attached | ai_analysis

IssueLabel (issue_id, label_id)
Label (id, project_id, name, color)

IssueLink (id, source_issue_id, target_issue_id, link_type)
  -- link_type: related | blocks | blocked_by | duplicate

-- Recordings & Media
Recording (
  id, issue_id, uploader_id, uploader_type,  -- human | ai_agent
  type,          -- rrweb | video | dev_test | qa_test | ai_test
  storage_url,   -- S3/Azure Blob URL
  duration_ms,
  console_logs_url,     -- S3 URL to structured console log JSON
  network_logs_url,     -- S3 URL to structured network request JSON
  environment_json,
  thumbnail_url,
  created_at
)

Screenshot (
  id, issue_id, uploader_id,
  original_url, annotated_url,
  annotations_json,  -- annotation overlay data
  created_at
)

-- Regression Testing (tiered system)
RegressionSuite (id, project_id, name, description, created_at)

TestCase (
  id, suite_id, title, description,
  steps_json,         -- [{step: "Click login", expected: "Login form appears"}]
  expected_result,
  tier,               -- smoke | core | full
  priority,
  tags,               -- string[] for flexible categorization
  folder,             -- organizational grouping ("Login Flow", "Checkout")
  automated,          -- boolean: has AI-generated Playwright test?
  playwright_script,  -- V2: generated test code
  flaky_score,        -- 0-100, calculated from pass/fail history
  created_at, updated_at
)

-- Link between bugs and the test cases that found them
TestCaseBugLink (id, test_case_id, issue_id, found_in_run_id)
  -- When a bug is found during regression, link it to the test case
  -- When bug is fixed, auto-flag this test case for re-testing

RegressionRun (
  id, suite_id, release_version,
  tier_filter,      -- which tier(s) to include: smoke | core | full | all
  trigger,          -- manual | deploy_webhook | scheduled
  executor_type,    -- human | ai_agent | mixed
  status,           -- pending | in_progress | completed
  started_at, completed_at,
  stats_json        -- {total, passed, failed, blocked, skipped, automated, manual}
)

-- Test case assignment: who should execute this test case in a run?
-- Can assign to a human member OR an AI agent
TestCaseAssignment (
  id, test_case_id,
  assignee_id, assignee_type,   -- member | agent
  -- Default assignment. Overridable per-run.
)

TestResult (
  id, run_id, test_case_id,
  tester_id, tester_type,     -- member | agent
  result,                     -- pass | fail | blocked | skipped
  recording_id,               -- optional evidence recording
  screenshot_id,              -- optional evidence screenshot
  notes,
  ai_failure_analysis,        -- V2: AI explanation of why it failed
  execution_log_url,          -- S3 URL: for AI agents, the full execution trace
  tested_at
)

-- Activity & Notifications
ActivityLog (
  id, entity_type, entity_id,
  actor_id, actor_type,        -- member | agent | system
  action, metadata_json,
  created_at
)

Notification (id, user_id, type, title, body, read, entity_type, entity_id, created_at)

-- Integrations (bridge to external tools)
Integration (
  id, company_id, project_id,
  provider,          -- github | jira | azure_devops | linear | slack | gitlab | webhook
  config_json,       -- { base_url, project_key, channel_id, webhook_url, etc. }
  auth_json,         -- encrypted { access_token, refresh_token, api_key }
  sync_enabled,      -- boolean
  created_by, created_at, updated_at
)

ExternalRef (
  id, issue_id, integration_id,
  external_id,       -- "JIRA-123" or "github#45" or "AB#789"
  external_url,      -- full URL to external issue
  last_synced_at,
  sync_status        -- synced | pending | error
)

-- Agent execution queue: tracks what agents are assigned to do
AgentTask (
  id, agent_id, company_id,
  task_type,          -- fix_bug | qa_test | dev_test | regression_run | code_review
  entity_type,        -- issue | test_case | regression_run
  entity_id,
  status,             -- queued | running | completed | failed
  result_json,        -- { outcome, notes, recording_id, pr_url, etc. }
  started_at, completed_at,
  created_at
)
```

**Key schema design decisions:**
- **Multi-company roles:** A User has many Members (one per company). `UNIQUE(company_id, user_id)` ensures one role per company. User can be admin of Company A and viewer of Company B.
- **AI Agents as team members:** `Agent` table represents virtual team members. Same polymorphic assignee pattern (`assignee_type + assignee_id`) used everywhere — issues, test cases, regression runs. In the UI, agents appear in assignment dropdowns alongside human members.
- **Polymorphic assignees:** `assignee_type` = `member` or `agent` throughout. This means the same "assign to" dropdown can show both humans and AI agents.
- **AgentTask queue:** When you assign an AI agent to a bug or test, it creates an AgentTask. The agent execution engine picks it up and processes it.
- `ApiKey` table — enables MCP server and extension authentication without coupling to user sessions.
- `TestCaseBugLink` — connects bugs to the regression tests that found them, enabling smart re-testing.
- `flaky_score` on TestCase — calculated field that tracks how often a test flips pass/fail.
- Console/network logs stored as separate S3 files (not inline JSONB) — can be large, and this keeps the Issue table fast.

---

## 8. MCP Server Design

### Architecture: Where MCP Lives

```
┌───────────────────────────────────────────────────────────────┐
│  DEVELOPER'S MACHINE                                          │
│                                                               │
│  ┌──────────────────┐    stdio    ┌────────────────────────┐ │
│  │ Claude Desktop / │◄──────────►│ @bugdetector/mcp-server │ │
│  │ Cursor / Claude  │            │ (npm package)           │ │
│  │ Code             │            │                         │ │
│  └──────────────────┘            │ - ZERO business logic   │ │
│                                   │ - Translates MCP calls  │ │
│                                   │   to HTTP API calls     │ │
│                                   │ - Auth via API key      │ │
│                                   └───────────┬────────────┘ │
└───────────────────────────────────────────────┼──────────────┘
                                                │ HTTPS
                                                ▼
┌───────────────────────────────────────────────────────────────┐
│  EC2 (BugDetector Backend)                                    │
│                                                               │
│  Next.js API Routes (/api/v1/*)                               │
│  ├── /api/v1/bugs          ← ALL logic lives here             │
│  ├── /api/v1/projects                                         │
│  ├── /api/v1/regression                                       │
│  ├── /api/v1/agents        ← AI agent management              │
│  └── /api/mcp/sse          ← V2: Remote MCP endpoint (SSE)   │
│       ↕                         (no npm install needed)       │
│  PostgreSQL + S3                                              │
└───────────────────────────────────────────────────────────────┘
```

**The npm package is a thin client (~50 lines per tool).** All real logic is on EC2.

### Setup in Cursor / Claude Desktop

```json
// Claude Desktop: %APPDATA%/Claude/claude_desktop_config.json
// Cursor: .cursor/mcp.json
{
  "mcpServers": {
    "bugdetector": {
      "command": "npx",
      "args": ["@bugdetector/mcp-server"],
      "env": {
        "BUGDETECTOR_API_KEY": "bd_key_xxxxx",
        "BUGDETECTOR_URL": "https://your-instance.com"
      }
    }
  }
}
```

**V2 Remote MCP (no install):** We expose an SSE endpoint directly from the backend:
```json
{
  "mcpServers": {
    "bugdetector": {
      "url": "https://your-instance.com/api/mcp/sse?key=bd_key_xxxxx"
    }
  }
}
```

### MCP Tools

```typescript
// @bugdetector/mcp-server — thin client that calls backend API

const server = new McpServer({
  name: "bugdetector",
  version: "1.0.0",
});

// === BUG TOOLS ===

server.tool("search_bugs", { ... }, async (params) => {
  // → GET /api/v1/bugs?query=...&status=...
});

server.tool("get_bug", { ... }, async (params) => {
  // → GET /api/v1/bugs/:id?include=console_logs,network_logs,environment,steps
  // Returns structured bug data optimized for AI consumption
});

server.tool("get_bug_console_logs", { ... }, async (params) => {
  // → GET /api/v1/bugs/:id/console-logs?level=error
});

server.tool("get_bug_network_logs", { ... }, async (params) => {
  // → GET /api/v1/bugs/:id/network-logs?failed_only=true
});

server.tool("update_bug_status", { ... }, async (params) => {
  // → PATCH /api/v1/bugs/:id/status
});

server.tool("add_comment", { ... }, async (params) => {
  // → POST /api/v1/bugs/:id/comments
});

// === REGRESSION TOOLS ===

server.tool("get_regression_suite", { ... }, async (params) => {
  // → GET /api/v1/projects/:key/regression
});

server.tool("start_regression_run", { ... }, async (params) => {
  // → POST /api/v1/regression/runs (AI agent starts a test run)
});

server.tool("submit_test_result", { ... }, async (params) => {
  // → POST /api/v1/regression/runs/:id/results (AI submits pass/fail)
});

// === AGENT TOOLS ===

server.tool("claim_assignment", { ... }, async (params) => {
  // → POST /api/v1/agents/assignments/:id/claim
  // AI agent claims an assigned task (issue fix, test, review)
});

server.tool("complete_assignment", { ... }, async (params) => {
  // → POST /api/v1/agents/assignments/:id/complete
  // AI agent marks its assignment as done with results
});

// === RESOURCES ===

server.resource("project/{key}", async (uri) => {
  // → GET /api/v1/projects/:key
});

server.resource("project/{key}/open-bugs", async (uri) => {
  // → GET /api/v1/bugs?project=:key&status=open
});
```

### How an AI Agent Uses BugDetector MCP:

```
Developer: "Fix the bug BUG-142"

AI Agent (Claude Code / Cursor):
1. Calls get_bug("BUG-142") → gets full context
2. Reads console_logs → finds "TypeError: Cannot read property 'map' of undefined"
3. Reads network_logs → finds GET /api/users returned 500
4. Reads environment → Next.js 15, Chrome 125, production URL
5. Reads steps → "1. Go to /dashboard 2. Click 'Users' tab 3. Error appears"
6. Searches codebase for the /api/users endpoint and the dashboard component
7. Identifies the bug: API returns null instead of [] when no users exist
8. Fixes the code, adds null check
9. Calls update_bug_status("BUG-142", "dev_testing", "Fixed null check in /api/users endpoint")
```

---

## 9. AI Agents as Team Members

### Concept

AI agents are **first-class team members** in a company. They appear alongside human members in every assignment dropdown. You can assign a bug to "Dev Bot" the same way you assign it to "John". You can assign a test case to "QA Agent" or to "Sarah".

### Agent Types

| Type | What It Does | Uses |
|------|-------------|------|
| **qa_tester** | Executes test cases, records pass/fail, captures evidence | Playwright + AI to navigate app, verify expected behavior |
| **developer** | Reads bug context via MCP, writes fix, creates PR | Claude/Codex via API, needs repo access |
| **code_reviewer** | Reviews PRs/fixes for quality, security, correctness | AI code review on diff |
| **regression_runner** | Executes full regression suites automatically | Playwright + AI, triggered by deploy webhook |

### How It Works in the UI

```
Assign Issue BUG-142:
┌─────────────────────────────┐
│  Assign to:                 │
│  ──── Team Members ─────    │
│  👤 John (Developer)        │
│  👤 Sarah (QA)              │
│  👤 Mike (Developer)        │
│  ──── AI Agents ────────    │
│  🤖 Dev Fixer (Developer)   │
│  🤖 QA Bot (QA Tester)      │
│  🤖 Reviewer (Code Review)  │
└─────────────────────────────┘
```

When assigned to an AI agent:
1. System creates an `AgentTask` (status: queued)
2. Agent execution engine picks it up
3. Agent performs the work (fix code, run test, review PR)
4. Agent posts results back (comments, recordings, status updates)
5. AgentTask marked completed

When assigned to a human:
1. Human gets notification
2. Human does the work manually
3. Human updates status via UI or extension

**Same workflow, interchangeable actors.**

### Agent Configuration (per company)

```json
{
  "name": "Dev Fixer",
  "type": "developer",
  "config": {
    "model": "claude-sonnet-4-6",
    "repo_url": "github.com/acme/webapp",
    "branch_prefix": "agent/fix-",
    "auto_assign": false,
    "max_concurrent_tasks": 3,
    "capabilities": ["fix_bugs", "dev_testing"],
    "notification_channel": "#agent-activity"
  }
}
```

### Example: Full AI-Driven Bug Lifecycle

```
1. QA tester (human) reports bug BUG-200 via extension
   → Recording + console + network captured

2. Admin assigns BUG-200 to "Dev Fixer" (AI agent)
   → AgentTask created (type: fix_bug)

3. Dev Fixer agent:
   a. Reads bug via MCP: get_bug("BUG-200")
   b. Analyzes console errors + network failures
   c. Clones repo, finds root cause, writes fix
   d. Creates PR on GitHub
   e. Runs dev tests
   f. Comments on BUG-200: "Fixed in PR #47. Root cause: null check missing in UserList component"
   g. Moves status → Dev Testing

4. Admin assigns dev testing to "QA Bot" (AI agent)
   → AgentTask created (type: qa_test)

5. QA Bot agent:
   a. Reads bug reproduction steps
   b. Launches Playwright, navigates to staging URL
   c. Follows reproduction steps — verifies bug no longer occurs
   d. Captures recording as evidence
   e. Posts result: PASS + recording link
   f. Moves status → QA Testing

6. Admin assigns QA testing to "QA Bot" OR human QA
   → Same flow: test, record, pass/fail

7. On pass → Issue closed automatically
   On fail → Reopened, back to Dev Fixer with new recording
```

### V1 vs V2 Agent Scope

| Feature | V1 (Human-first) | V2 (AI-capable) |
|---------|------------------|-----------------|
| Agent CRUD (create, configure, manage) | Yes | Yes |
| Assign to agent in UI | Yes (creates AgentTask) | Yes |
| Agent execution engine | Stub — shows "Agent assigned, awaiting integration" | Full execution via Claude API + Playwright |
| Agent runs tests | No | Yes |
| Agent fixes bugs | No (manual MCP usage) | Yes (automated pipeline) |

**V1 ships the agent model and UI.** The "assign to agent" feature works — it creates the task and shows it in the queue. But actual automated execution is V2. In V1, developers use MCP manually (via Claude Code/Cursor) to read bug context and fix. V2 makes it fully autonomous.

---

## 10. Browser Extension Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    EXTENSION (WXT + MV3)                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Content Script (per tab)                        │    │
│  │  ├── Injected MAIN world script                  │    │
│  │  │   ├── console.* interception                  │    │
│  │  │   ├── fetch() / XHR interception              │    │
│  │  │   └── Error event listeners                   │    │
│  │  ├── rrweb recorder (isolated world)             │    │
│  │  ├── Screenshot annotation overlay (Fabric.js)   │    │
│  │  └── Message relay to service worker             │    │
│  └─────────────────────────────────────────────────┘    │
│                         │                                │
│                         ▼                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Service Worker (background)                     │    │
│  │  ├── Event hub (receives from content scripts)   │    │
│  │  ├── Rolling buffer management                   │    │
│  │  ├── IndexedDB storage (via Dexie.js)            │    │
│  │  ├── chrome.webRequest listener (network meta)   │    │
│  │  ├── Upload manager (chunked upload to API)      │    │
│  │  └── Auth token management                       │    │
│  └─────────────────────────────────────────────────┘    │
│                         │                                │
│                         ▼                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Offscreen Document (when needed)                │    │
│  │  ├── MediaRecorder for video encoding            │    │
│  │  ├── Heavy data processing / compression         │    │
│  │  └── Canvas operations for screenshot stitching  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Extension Popup / Side Panel                    │    │
│  │  ├── Login / project selector                    │    │
│  │  ├── Bug report form                             │    │
│  │  ├── Recording controls                          │    │
│  │  └── Recent reports list                         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Key Extension Technical Decisions:

1. **rrweb for DOM recording** — records MutationObserver events, not screenshots. 50-500KB/min vs 2-5MB/min for video. Interactive playback.

2. **Rolling buffer** — rrweb events stored in a circular buffer in the content script (not service worker, since SW can sleep). When user clicks "report bug," last 30-60 seconds of events are captured.

3. **MAIN world injection** — console and network interception MUST run in the page's execution context. Use `chrome.scripting.registerContentScripts({ world: 'MAIN' })`.

4. **Offscreen document** — only created when video recording is needed (MediaRecorder requires DOM access, unavailable in service workers).

5. **Chunked upload** — large recordings are split into chunks, uploaded in parallel, and assembled server-side.

---

## 11. Integration Strategy — "Bridge, Don't Replace"

### Core Principle

BugDetector works **100% standalone** (zero external dependencies). But teams can **optionally bridge** to their existing tools. Integrations are free-tier features (not paywalled) to drive adoption.

```
TWO MODES:

1. STANDALONE (default):
   Extension records bug → Created in BugDetector → Full workflow inside BugDetector
   Cost: $0 (free tier) or BugDetector subscription only

2. BRIDGE MODE (optional):
   Extension records bug → Created in BugDetector (source of truth for rich data)
                         → Summary + link auto-synced to external tool
   External tool gets: title, description, priority, link to BugDetector viewer
   BugDetector keeps: recordings, console logs, network logs, screenshots, AI analysis
   Status changes sync BOTH WAYS
```

### Integration Tiers

**Tier 1 — Free Tools (always free in BugDetector, no external subscription needed):**

| Tool | Sync Type | What Syncs |
|------|-----------|-----------|
| **GitHub Issues** | 2-way | Create issue in GH with link to BugDetector viewer. Status sync. |
| **GitHub Actions** | Webhook | Trigger regression runs on deploy. Report results as check status. |
| **GitLab Issues** | 2-way | Same as GitHub Issues. |
| **Discord** | 1-way (notify) | Post bug reports to a channel. Slash command to query bugs. |
| **Email** | 1-way (notify) | Bug assignment, status change, and comment notifications. |
| **Webhooks** | 1-way (outgoing) | Generic webhook for any event (bug created, status changed, etc.). |

**Tier 2 — Popular Paid Tools (free to connect in BugDetector, tool subscription is user's own):**

| Tool | Sync Type | What Syncs |
|------|-----------|-----------|
| **Jira** | 2-way | Create Jira issue with BugDetector link. Map statuses. Sync comments. |
| **Azure DevOps Boards** | 2-way | Create work item with link. Status mapping. |
| **Linear** | 2-way | Create Linear issue with link. Status sync. |
| **Slack** | 2-way | Post to channel on bug creation. React with emoji to claim. Slash commands. |
| **Asana** | 2-way | Create task with link. |
| **ClickUp** | 2-way | Create task with link. |
| **Microsoft Teams** | 1-way (notify) | Post bug cards to channel. |

**Tier 3 — CI/CD & DevOps (trigger regression runs, report results):**

| Tool | Integration Type | What It Does |
|------|-----------------|-------------|
| **GitHub Actions** | Webhook + Status Check | On deploy → trigger smoke/regression run → report pass/fail as check |
| **GitLab CI** | Webhook + Pipeline | Same as GitHub Actions |
| **Azure Pipelines** | Webhook | Trigger regression on release pipeline completion |
| **Jenkins** | Webhook | Trigger regression on build success |
| **Vercel** | Deploy Hook | On Vercel deploy → trigger smoke tests |
| **Netlify** | Deploy Notification | On deploy → trigger tests |

### How Integration Architecture Works

```
                BugDetector Backend (EC2)
                        │
              ┌─────────┼─────────────┐
              │         │             │
              ▼         ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │Integration│ │Integration│ │Integration│
        │  GitHub   │ │   Jira   │ │  Slack   │
        │  Adapter  │ │  Adapter │ │  Adapter │
        └─────┬────┘ └────┬─────┘ └────┬─────┘
              │            │            │
              ▼            ▼            ▼
        GitHub API    Jira REST API  Slack API
        (free)        (user's sub)   (user's sub)
```

Each integration is an **adapter** with a standard interface:
```typescript
interface IntegrationAdapter {
  // Outbound: BugDetector → External
  createExternalIssue(bug: Bug): Promise<ExternalRef>
  updateExternalIssue(bug: Bug, ref: ExternalRef): Promise<void>
  
  // Inbound: External → BugDetector (via webhook)
  handleWebhook(payload: WebhookPayload): Promise<void>
  
  // Sync
  syncStatus(bug: Bug, ref: ExternalRef): Promise<void>
}
```

### Extension Behavior with Integrations

```
Extension "Report Bug" popup:
┌──────────────────────────────────────┐
│  Title: [                          ] │
│  Description: [                    ] │
│  Priority: [High ▼]                  │
│  Project: [Frontend App ▼]           │
│                                      │
│  Create in BugDetector  [always]     │
│                                      │
│  Also sync to: (optional)            │
│  ☑ GitHub Issues (connected)         │
│  ☐ Jira (not connected - set up)     │
│  ☑ Slack #bugs (connected)           │
│                                      │
│  [Submit Bug Report]                 │
└──────────────────────────────────────┘
```

### The "Trojan Horse" Strategy

1. Team uses Jira. QA installs BugDetector extension for recording.
2. Bugs are created in BugDetector (rich data) AND synced to Jira (summary + link).
3. Developers click the BugDetector link to see the recording + console + network.
4. Over time, BugDetector becomes the primary view because that's where the useful data lives.
5. Eventually, some teams drop Jira entirely. Others keep both — that's fine too.

**Key: BugDetector is valuable even if you never stop using Jira.** The extension + viewer alone solve the "context gap" problem.

---

## 12. Risk Mitigations (from Technical Research)

### Critical Risks — Must Address in V1

**C1: MV3 Service Worker Kills Recording**
- Use offscreen document for ALL recording buffering (rrweb events, MediaRecorder)
- Store rolling buffer chunks in IndexedDB via Dexie.js
- Service worker only coordinates; never holds recording state
- `chrome.alarms` (30s interval) to keep SW alive during active recording

**C2: Chrome Web Store Rejection**
- Use `activeTab` + runtime `host_permissions` instead of `<all_urls>`
- Detailed privacy policy explaining exactly what data is captured
- Plan for 3-week review cycles; publish "unlisted" for beta
- Single purpose description in listing

**C3: PII Leakage**
- Client-side PII redaction pipeline runs BEFORE data leaves the browser
- Auto-mask: Authorization headers, Cookie headers, email regex, credit card patterns
- Network response body capture is opt-in (headers-only by default)
- Configurable "sensitive patterns" blocklist per company
- GDPR consent dialog in extension before first recording

**C4: Custom Auth Security**
- Use **Better Auth** library (not fully custom) — handles JWT, sessions, OAuth safely
- Argon2id for password hashing
- Rate limiting on login (exponential backoff after 5 failures)
- Security headers: HSTS, CSP, X-Frame-Options
- Pre-launch security audit on auth endpoints

### High Risks — Address in V1

**H1-H2: rrweb Performance & Storage**
- Mutation throttling: if mutations/second > threshold, auto-pause rrweb
- 50MB memory cap with automatic IndexedDB chunking
- Canvas detection: show warning, suggest video mode (V1.5)
- S3 lifecycle policies: Standard → IA (30d) → Glacier (90d)
- Per-account recording size limits with warnings

**H3: PostgreSQL JSONB**
- Console/network logs stored as **compressed S3 files with reference URLs** in Postgres
- JSONB only for small metadata: environment info, browser details (always <2KB)
- GIN indexes only on small JSONB fields

**H5: MCP Security**
- Scoped API keys: read-only vs read-write, per-project
- Sanitize bug descriptions before feeding to AI agents
- Rate limiting per API key
- Full audit log of all MCP tool invocations

### Plan Gaps Now Addressed

| Gap | Resolution |
|-----|-----------|
| Data retention policy | Configurable per-company: 30/60/90/365 days. Auto-delete recordings past retention. GDPR-compliant. |
| Rate limiting | Redis (Upstash) rate limiting on: API routes (100/min), recording uploads (10/min), AI features (20/min) |
| Upload size limits | Max 100MB per recording, 10MB per screenshot. Reject larger with clear error. |
| Offline upload handling | IndexedDB buffer → retry with exponential backoff → upload when back online |
| Extension CSP | Strict MV3 CSP in manifest. No eval, no remote code. |
| Platform observability | Sentry for error tracking on our own platform. Structured logging. Uptime monitoring. |
| GDPR consent | Extension shows consent dialog before first recording. Consent audit trail stored. |
| Video recording | **Deferred to V1.5.** V1 ships rrweb-only to halve testing surface. |
| SSE connection limits | Single multiplexed SSE stream per client (event types as channels). HTTP/2 for parallel streams. |
| Replay viewport scaling | rrweb-player with CSS transform scaling to fit developer's viewport. |

---

## 13. Milestones & Phasing

### V1 Milestones

| Phase | What | Duration | Dependencies |
|-------|------|----------|-------------|
| **1A** | Foundation: Better Auth, Company, Project, Team, Multi-company RBAC, Agent model | 4 weeks | None |
| **1B** | Issue Tracking: CRUD, Board, List, Search, Notifications | 2 weeks | 1A |
| **1C** | Browser Extension: rrweb recording, Console, Network, Screenshots, PII redaction | 4 weeks | 1A (auth/API keys) |
| **1D** | Bug Viewer: rrweb replay, Synchronized timeline, Log panels | 2 weeks | 1C |
| **1E** | Dev/QA Workflow: Testing flow, recording attachment, status lifecycle | 2 weeks | 1B + 1D |
| **1F** | MCP Server: npm package (thin client), AI agent integration | 2 weeks | 1B (parallel with 1E) |
| **1G** | Integrations: GitHub Issues, Jira, Azure DevOps, Slack, Webhooks, CI/CD hooks | 3 weeks | 1B (parallel with 1E/1F) |
| **1H** | Regression Testing: Tiered suites, Runs, Bug linking, Flaky detection | 3 weeks | 1B + 1E |

**V1 Total: ~18-20 weeks** (1C starts alongside 1B; 1F/1G run in parallel with 1E)

```
Week:  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20
1A:    ████████████████
1B:                      ████████
1C:                      ████████████████████████
1D:                                              ████████
1E:                                                       ████████
1F:                                                       ████████
1G:                                              ████████████████████
1H:                                                                ████████████
```

### V1.5 Milestones (Quick Additions)

| Phase | What | Duration | Dependencies |
|-------|------|----------|-------------|
| **1.5A** | Video recording mode (MediaRecorder + offscreen doc) | 2 weeks | 1C |
| **1.5B** | Remote MCP endpoint (SSE-based, no npm install needed) | 1 week | 1F |
| **1.5C** | Additional integrations: Linear, GitLab, Asana, Teams | 2 weeks | 1G |

### V2 Milestones

| Phase | What | Duration | Dependencies |
|-------|------|----------|-------------|
| **2A** | AI Test Generation: NL → Playwright | 3 weeks | 1H |
| **2B** | AI Test Execution: Cloud runner, self-healing | 3 weeks | 2A |
| **2C** | AI Agent Execution Engine: agents actually run tasks autonomously | 3 weeks | 2B |
| **2D** | Visual Regression Testing | 2 weeks | 2B |
| **2E** | Smart Test Selection (analyze git diff → run affected tests) | 2 weeks | 2B |
| **2F** | AI Bug-to-Fix Pipeline (full autonomous loop) | 2 weeks | 1F + 2C |

**V2 Total: ~12-14 weeks**

---

## Appendix: Key Open Source Libraries to Leverage

| Library | Purpose | Stars |
|---------|---------|-------|
| **rrweb** (`rrweb-io/rrweb`) | Session recording & replay | 17k+ |
| **Fabric.js** | Canvas annotation/drawing | 28k+ |
| **Tiptap** | Rich text editor (for descriptions) | 28k+ |
| **Playwright** | Browser automation (V2 testing) | 70k+ |
| **@modelcontextprotocol/sdk** | MCP server SDK | — |
| **WXT** (`wxt-dev/wxt`) | Extension framework | 5k+ |
| **Dexie.js** | IndexedDB wrapper | 11k+ |
| **rrweb-player** | Recording playback UI | (part of rrweb) |
| **Prisma** | Database ORM | 40k+ |
| **shadcn/ui** | UI component library | 75k+ |
| **Uppy** | File/media upload UI | 29k+ |

---

## Appendix: Competitor Quick Reference

| Feature | Jam.dev | Jira | Linear | Marker.io | Crikket | BugDetector (Ours) |
|---------|---------|------|--------|-----------|---------|-------------------|
| Bug recording extension | Yes | No | No | Partial | Yes | Yes |
| Console/network capture | Yes | No | No | Yes | Yes | Yes |
| Screenshot annotation | Yes | No | No | Yes | No | Yes |
| Standalone issue tracking | No | Yes | Yes | No | No | Yes |
| Bridge to existing tools | N/A (no tracker) | N/A | N/A | Yes (1-way) | Shareable links | Yes (2-way sync) |
| Test management | No | Plugins | No | No | No | Yes |
| Regression suites | No | Plugins | No | No | No | Yes |
| MCP for AI agents | No | Community | Community | No | No | Yes (first-class) |
| AI agents as team members | No | No | No | No | No | Yes |
| AI test generation | No | No | No | No | No | Yes (V2) |
| Dev/QA workflow | No | Yes | Yes | No | No | Yes |
| CI/CD integration | No | Yes | Yes | No | No | Yes (webhooks) |
| Self-hosted option | No | Server | No | No | Yes | Yes (Docker) |
| Free tier | Yes | Yes | Yes | No (trial) | Yes (OSS) | Yes (generous) |
| PII redaction | Partial | N/A | N/A | No | No | Yes (client-side) |

### Key Competitor: BetterBugs (betterbugs.io) — HAS MCP SUPPORT

- **Price:** $10/user/month
- **What they have:** MCP support (VS Code, Cursor), captures cookies/localStorage/sessionStorage (Jam doesn't), 15-min free recordings, Chrome extension
- **What they lack:** No standalone issue tracking, no test management, no regression suites, no AI agent model, no self-hosted, no 2-way sync with external tools
- **Our advantage:** Full platform (not just capture), AI agents as team members, regression testing, 2-way integrations, self-hosted Docker
- **Risk:** They already have MCP — we need to ship ours fast and make it deeper (not just bug reading, but full workflow control)
- **Takeaway:** MCP for bug tools is validated. But BetterBugs is just a capture tool with MCP. We're a full platform with MCP — significantly broader scope.

### Closest Competitor Analysis: Crikket (github.com/redpangilinan/crikket)

- **Stars:** 79 | **Tech:** Next.js + Prisma + Turborepo + Better Auth (IDENTICAL to our stack)
- **What they have:** Screenshots, video, console, network capture, browser extension, team workspaces, shareable links
- **What they lack:** No AI features, no test management, no regression suites, no MCP server, no integrations with Jira/Azure DevOps, no agent model, tiny community
- **Our advantage:** AI-first architecture, full issue tracking, test management, regression, MCP integration, 2-way external tool sync, agents as team members
- **Risk:** They could add features fast since they have the same base. Speed of execution matters.

### Cautionary Tale: Tegon (ARCHIVED)

- AI-first Jira/Linear alternative with 1,900 stars — **now archived**
- Had good ideas: AI auto-triage, duplicate detection, omni-channel bug intake from Slack/Email
- **Why it likely failed:** Tried to replace Jira/Linear head-on without enough differentiation. No recording extension, no test management.
- **Our lesson:** Don't position as "yet another Jira killer." Position as "the recording + AI layer that works WITH your existing tracker OR replaces it."
