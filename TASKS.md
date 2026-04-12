# BugDetector -- Ralph Loop Task File

## Project Summary

BugDetector is an AI-native bug tracking, test management, and developer collaboration platform. It consists of a Turborepo monorepo with: a Next.js 15 web app, a WXT browser extension for bug capture (rrweb recording, console/network logs, screenshots), an MCP server for AI coding agent integration, and a Prisma/PostgreSQL data layer. The platform supports two extension modes (Quick Capture for zero-friction shareable links, Full Platform for team workflow), multi-company RBAC, AI agents as first-class team members, tiered regression testing, and 2-way integrations with GitHub Issues, Jira, Azure DevOps, and Slack.

V1 scope covers 8 phases (1A-1H) across approximately 18-20 weeks. V2 (AI automation testing) is out of scope for this task file.

## Assumptions

- This is a greenfield project; no code exists yet beyond PLAN.md and FINAL-RESEARCH.md.
- Better Auth is the auth library (not fully custom jose/iron-session).
- AWS S3 is the initial storage target (Azure Blob deferred).
- rrweb-only for V1 (no video recording via MediaRecorder; deferred to V1.5).
- tRPC v11 is the API layer between web client and server.
- Redis (Upstash) is used for rate limiting and caching.
- Resend is the email provider.
- Claude API is the AI provider for summarization features.
- Deployment target for V1 development is local dev + Neon for database.

## Task Conventions

- Each task targets one ralph loop iteration (30-90 minutes of focused work).
- Tasks are grouped by phase but sequenced for optimal dependency flow.
- The "Learnings" column should be filled during/after execution to capture decisions, gotchas, and pivots.
- Acceptance criteria use checkbox format for tracking completion.

---

# Phase 1A: Foundation (Weeks 1-4)

## Task 1: Turborepo Monorepo Scaffolding

### Objective
Initialize the Turborepo monorepo with the correct workspace structure, package.json files, TypeScript configs, and build pipeline for all apps and packages.

### Requirements
- Create root `package.json` with Turborepo dependency and workspace config
- Create `turbo.json` with build, dev, lint, and typecheck pipelines
- Scaffold `apps/web` as a Next.js 15 (App Router) project with TypeScript, Tailwind CSS, and shadcn/ui
- Scaffold `apps/extension` as an empty WXT project placeholder (React + TypeScript)
- Scaffold `packages/shared` with TypeScript config for shared types, Zod schemas, and constants
- Scaffold `packages/db` as the Prisma package with TypeScript config
- Scaffold `packages/mcp-server` as a TypeScript package placeholder
- Scaffold `packages/ui` as a shared component library placeholder (shadcn/ui based)
- Root `.gitignore`, `.nvmrc` (Node 20+), root `tsconfig.json`
- Add ESLint and Prettier config at root level

### Acceptance Criteria
- [ ] `pnpm install` succeeds at root with no errors
- [ ] `pnpm turbo build` runs across all workspaces (even if outputs are minimal)
- [ ] `pnpm turbo dev` starts the Next.js dev server in `apps/web`
- [ ] Each package has its own `package.json` and `tsconfig.json`
- [ ] Importing from `@bugdetector/shared` in `apps/web` resolves correctly
- [ ] `.gitignore` covers `node_modules`, `.next`, `.turbo`, `dist`, `.env*`

### Context
This is the foundational monorepo structure from PLAN.md Section 2 (D1). Every subsequent task builds on this structure. Use pnpm as the package manager.

### Learnings
_(Fill during execution)_

---

## Task 2: Prisma Schema -- Core Auth and Organization Models

### Objective
Define the initial Prisma schema in `packages/db` with User, Session, OAuthAccount, Company, Member, Invitation, and ApiKey models. Configure Prisma to connect to Neon PostgreSQL.

### Requirements
- Install Prisma and `@prisma/client` in `packages/db`
- Create `schema.prisma` with the following models: User, Session, OAuthAccount, Company, Member, Invitation, ApiKey
- User model: id (cuid), email (unique), password_hash, name, avatar_url, email_verified (boolean), email_verify_token, reset_token, reset_token_expires, created_at, updated_at
- Session model: id, user_id (FK), token (unique), expires_at, ip_address, user_agent, created_at
- OAuthAccount model: id, user_id (FK), provider (enum: GOOGLE, GITHUB), provider_account_id, access_token, refresh_token; unique constraint on (provider, provider_account_id)
- Company model: id, name, slug (unique), logo_url, plan (enum: FREE, PRO, BUSINESS, ENTERPRISE), created_at, updated_at
- Member model: id, company_id (FK), user_id (FK), role (enum: OWNER, ADMIN, DEVELOPER, QA, VIEWER), invited_at, joined_at; unique constraint on (company_id, user_id)
- Invitation model: id, company_id (FK), email, role, token (unique), invited_by (FK to User), expires_at, accepted_at
- ApiKey model: id, company_id (FK), project_id (nullable FK), name, key_hash, permissions (JSON), last_used_at, created_at, revoked_at
- Set up `.env` loading for `DATABASE_URL` pointing to Neon
- Export the Prisma client from `packages/db` for use by other workspaces
- Create a `generate` and `migrate` script in the db package

### Acceptance Criteria
- [ ] `pnpm --filter @bugdetector/db prisma generate` succeeds
- [ ] `pnpm --filter @bugdetector/db prisma migrate dev` creates all tables in Neon
- [ ] All unique constraints and foreign keys are properly defined
- [ ] `packages/db/index.ts` exports a configured PrismaClient instance
- [ ] `apps/web` can import and use `db` from `@bugdetector/db`

### Context
Schema based on PLAN.md Section 7. The Member model enables multi-company roles (a user can be Admin in Company A and Viewer in Company B). ApiKey enables MCP server and extension auth. Project FK on ApiKey is nullable because some keys are company-wide.

### Learnings
_(Fill during execution)_

---

## Task 3: Prisma Schema -- Project, Issue, and Supporting Models

### Objective
Extend the Prisma schema with Project, Issue, IssueComment, Label, IssueLabel, IssueLink, Recording, Screenshot, QuickCapture, Agent, AgentTask, ActivityLog, and Notification models.

### Requirements
- Project model: id, company_id (FK), name, key (unique within company), description, settings_json (JSON), created_at, updated_at
- Issue model: id, project_id (FK), number (auto-increment per project), title, description (text), status (enum), priority (enum), type (enum: BUG, FEATURE, TASK), reporter_id, reporter_type (enum: MEMBER, AGENT, SYSTEM), assignee_id (nullable), assignee_type (nullable, enum: MEMBER, AGENT), environment_json (JSON), ai_summary (nullable text), ai_root_cause (nullable text), created_at, updated_at, closed_at (nullable)
- Status enum: OPEN, IN_PROGRESS, DEV_TESTING, QA_TESTING, CLOSED, REOPENED
- Priority enum: CRITICAL, HIGH, MEDIUM, LOW, NONE
- IssueComment model: id, issue_id (FK), author_id, author_type (enum: MEMBER, AGENT, SYSTEM), content (text), type (enum: COMMENT, STATUS_CHANGE, ASSIGNMENT, RECORDING_ATTACHED, AI_ANALYSIS), created_at
- Label model: id, project_id (FK), name, color
- IssueLabel: composite key (issue_id, label_id)
- IssueLink: id, source_issue_id (FK), target_issue_id (FK), link_type (enum: RELATED, BLOCKS, BLOCKED_BY, DUPLICATE)
- Recording model: id, issue_id (nullable FK), uploader_id, uploader_type, type (enum: RRWEB, VIDEO, DEV_TEST, QA_TEST, AI_TEST), storage_url, duration_ms, console_logs_url, network_logs_url, environment_json, thumbnail_url, created_at
- Screenshot model: id, issue_id (nullable FK), uploader_id, original_url, annotated_url, annotations_json, created_at
- QuickCapture model: id, slug (unique), user_id (nullable FK), title, description, recording_url, console_logs_url, network_logs_url, screenshot_url, environment_json, password_hash (nullable), expires_at (nullable), view_count (default 0), converted_to_issue_id (nullable FK), created_at
- Agent model: id, company_id (FK), name, type (enum: QA_TESTER, DEVELOPER, CODE_REVIEWER, REGRESSION_RUNNER), status (enum: ACTIVE, PAUSED, DISABLED), avatar_url, config_json (JSON), api_key_id (nullable FK), created_by (FK to User), created_at, updated_at
- AgentTask model: id, agent_id (FK), company_id (FK), task_type (enum), entity_type, entity_id, status (enum: QUEUED, RUNNING, COMPLETED, FAILED), result_json (JSON nullable), started_at, completed_at, created_at
- ActivityLog model: id, entity_type, entity_id, actor_id, actor_type (enum: MEMBER, AGENT, SYSTEM), action, metadata_json (JSON), created_at
- Notification model: id, user_id (FK), type, title, body, read (boolean default false), entity_type, entity_id, created_at
- Add proper indexes on: Issue(project_id, status), Issue(project_id, assignee_id), QuickCapture(slug), ActivityLog(entity_type, entity_id), Notification(user_id, read)

### Acceptance Criteria
- [ ] `prisma migrate dev` succeeds with all new models
- [ ] All enums are defined as Prisma enums
- [ ] Foreign key relationships and cascading deletes are correctly configured
- [ ] Issue number auto-generation per project is handled (either via Prisma middleware or application logic)
- [ ] QuickCapture.slug has a unique index for fast lookup
- [ ] The polymorphic assignee pattern (assignee_type + assignee_id) is documented in schema comments

### Context
This covers the full data model from PLAN.md Section 7. The polymorphic assignee pattern is used for both Issues and AgentTasks. Console/network logs are stored as S3 file URLs (not JSONB) per the H3 risk mitigation. QuickCapture is separate from Issue to enable zero-friction capture without company/project setup.

### Learnings
_(Fill during execution)_

---

## Task 4: Prisma Schema -- Regression Testing and Integration Models

### Objective
Add RegressionSuite, TestCase, TestCaseBugLink, RegressionRun, TestCaseAssignment, TestResult, Integration, and ExternalRef models to complete the V1 schema.

### Requirements
- RegressionSuite model: id, project_id (FK), name, description, created_at, updated_at
- TestCase model: id, suite_id (FK), title, description, steps_json (JSON), expected_result, tier (enum: SMOKE, CORE, FULL), priority, tags (String[]), folder (nullable), automated (boolean default false), playwright_script (nullable text), flaky_score (float default 0), created_at, updated_at
- TestCaseBugLink model: id, test_case_id (FK), issue_id (FK), found_in_run_id (FK)
- RegressionRun model: id, suite_id (FK), release_version (nullable), tier_filter (enum), trigger (enum: MANUAL, DEPLOY_WEBHOOK, SCHEDULED), executor_type (enum: HUMAN, AI_AGENT, MIXED), status (enum: PENDING, IN_PROGRESS, COMPLETED), started_at, completed_at (nullable), stats_json (JSON), created_at
- TestCaseAssignment model: id, test_case_id (FK), assignee_id, assignee_type (enum: MEMBER, AGENT)
- TestResult model: id, run_id (FK), test_case_id (FK), tester_id, tester_type (enum: MEMBER, AGENT), result (enum: PASS, FAIL, BLOCKED, SKIPPED), recording_id (nullable FK), screenshot_id (nullable FK), notes (nullable text), ai_failure_analysis (nullable text), execution_log_url (nullable), tested_at
- Integration model: id, company_id (FK), project_id (nullable FK), provider (enum: GITHUB, JIRA, AZURE_DEVOPS, LINEAR, SLACK, GITLAB, WEBHOOK), config_json (JSON), auth_json (JSON -- encrypted at application level), sync_enabled (boolean default true), created_by (FK), created_at, updated_at
- ExternalRef model: id, issue_id (FK), integration_id (FK), external_id, external_url, last_synced_at, sync_status (enum: SYNCED, PENDING, ERROR)
- Add indexes on: TestCase(suite_id, tier), TestResult(run_id), ExternalRef(issue_id)

### Acceptance Criteria
- [ ] `prisma migrate dev` succeeds with all regression and integration models
- [ ] TestCaseBugLink correctly links test cases to issues and the run where the bug was found
- [ ] RegressionRun.stats_json has a documented JSON structure in a schema comment
- [ ] Integration.auth_json is noted as requiring application-level encryption
- [ ] All enums for the new models are defined

### Context
Completes the full V1 schema from PLAN.md Section 7. The regression models support the tiered system (Smoke/Core/Full) from decision D10. Integration and ExternalRef models support the "Bridge, Don't Replace" strategy from Section 11. TestCaseBugLink enables the smart re-testing feature where fixing a bug auto-flags linked test cases.

### Learnings
_(Fill during execution)_

---

## Task 5: Shared Package -- Zod Schemas, Types, and Constants

### Objective
Create shared Zod validation schemas, TypeScript types, and constants in `packages/shared` that are consumed by both the web app and extension.

### Requirements
- Export Zod schemas for: user registration, user login, company creation, project creation, invitation creation, issue creation, issue update, comment creation, quick capture creation
- Export TypeScript types derived from Zod schemas (z.infer)
- Export constants: default issue statuses and their display order, priority levels and colors, role permissions matrix (what each role can do), max upload sizes (100MB recording, 10MB screenshot), supported browsers list, PII patterns for redaction (email regex, credit card regex, auth header patterns)
- Export utility types: polymorphic assignee type, pagination params, API response wrapper type, error codes enum
- Ensure all exports work when consumed from `apps/web`, `apps/extension`, and `packages/mcp-server`

### Acceptance Criteria
- [ ] All Zod schemas validate correct input and reject invalid input
- [ ] TypeScript types are correctly inferred from Zod schemas
- [ ] `packages/shared` builds with `tsc` and produces declaration files
- [ ] Importing `@bugdetector/shared` from `apps/web` resolves types and runtime code
- [ ] Role permissions matrix covers: create_issue, update_issue, delete_issue, manage_members, manage_settings, manage_integrations, view_reports for each role

### Context
This is the "single source of truth" for validation and types across the monorepo. The extension and web app both need the same validation rules. PII patterns are used by the extension for client-side redaction (risk C3 from PLAN.md Section 12).

### Learnings
_(Fill during execution)_

---

## Task 6: Better Auth Setup -- Registration and Login

### Objective
Set up Better Auth in `apps/web` with email/password registration, login, email verification, and session management via HTTP-only cookies.

### Requirements
- Install and configure Better Auth in `apps/web`
- Configure Better Auth to use the Prisma database from `@bugdetector/db`
- Implement registration endpoint: email + password, validate with Zod schema from `@bugdetector/shared`, hash password with Argon2id, create User record, send verification email via Resend
- Implement login endpoint: email + password, verify hash, create Session record, set HTTP-only secure cookie with session token
- Implement email verification: token-based flow, mark user as verified
- Implement session middleware: extract session from cookie, validate, attach user to request context
- Implement logout: invalidate session, clear cookie
- Configure security: CSRF protection, secure cookie settings (HttpOnly, Secure, SameSite=Lax)
- Rate limiting on login endpoint: max 5 attempts per email per 15 minutes (use Upstash Redis)

### Acceptance Criteria
- [ ] User can register with email/password and receives verification email
- [ ] User can verify email via token link
- [ ] User can log in and receives an HTTP-only session cookie
- [ ] Protected API routes reject unauthenticated requests with 401
- [ ] Session persists across page refreshes (cookie-based)
- [ ] Logout clears the session
- [ ] Brute force protection works: 6th login attempt within 15 minutes returns 429

### Context
Based on PLAN.md Section 2 (D5) and risk mitigation C4. Better Auth was chosen over fully custom auth to handle security patterns correctly. Argon2id is the password hashing algorithm per the plan. Resend is the email provider.

### Learnings
_(Fill during execution)_

---

## Task 7: Better Auth -- Password Reset and OAuth Providers

### Objective
Add password reset flow and optional OAuth (Google, GitHub) login to the auth system.

### Requirements
- Password reset: user submits email -> generate reset token with 1-hour expiry -> send email via Resend -> user clicks link -> validate token -> set new password -> invalidate token and all existing sessions
- Reset token stored in User model (reset_token, reset_token_expires)
- OAuth with Google: configure Better Auth Google provider, handle account linking (if user already registered with email, link the OAuth account)
- OAuth with GitHub: configure Better Auth GitHub provider, same account linking logic
- OAuthAccount records created on first OAuth login
- If user logs in via OAuth and no User record exists, create one (email from OAuth, email_verified = true, no password)

### Acceptance Criteria
- [ ] User can request password reset and receives email with reset link
- [ ] Reset token expires after 1 hour
- [ ] User can set new password via reset link; all previous sessions invalidated
- [ ] User can sign in with Google OAuth
- [ ] User can sign in with GitHub OAuth
- [ ] OAuth account is linked to existing user if email matches
- [ ] New user created via OAuth has email_verified = true

### Context
OAuth is marked as "nice-to-have for V1" in the plan. Implementing it now provides a better user experience and is relatively low effort with Better Auth's built-in provider support.

### Learnings
_(Fill during execution)_

---

## Task 8: Company CRUD and Slug-Based Routing

### Objective
Implement company (organization) creation, retrieval, update, and slug-based URL routing. A user who creates a company becomes its Owner.

### Requirements
- tRPC router for company operations: create, get (by id and slug), update, list (user's companies)
- Company creation: name (required), slug (auto-generated from name, editable, unique), logo_url (optional); creating user becomes Owner (Member record with role OWNER created)
- Company slug validation: lowercase, alphanumeric + hyphens, 3-50 chars, unique
- Company update: name, slug, logo_url; only Owner/Admin can update
- Company list: return all companies the authenticated user is a Member of
- Company switcher: store "current company" in a cookie or URL context; all subsequent API calls scoped to this company
- Next.js route structure: `/[companySlug]/...` for company-scoped pages
- Layout component that loads company data and provides it via React context

### Acceptance Criteria
- [ ] User can create a company and is automatically made Owner
- [ ] Company slug is unique and properly validated
- [ ] User can list all companies they belong to
- [ ] Company switcher works and persists the selection
- [ ] All company-scoped API routes validate that the user is a member of the current company
- [ ] Non-members receive 403 when attempting to access a company's resources

### Context
Multi-company support is a core requirement from PLAN.md Section 5 (Phase 1A). The slug-based URL pattern (e.g., `/acme/projects`) is the foundation for all company-scoped pages. This must work before project or issue features can be built.

### Learnings
_(Fill during execution)_

---

## Task 9: Team Invitation System

### Objective
Implement the team invitation flow: owner/admin sends email invite with role, recipient receives link, can accept to join the company.

### Requirements
- tRPC endpoints: create invitation, list pending invitations, cancel invitation, accept invitation
- Create invitation: email, role; generates unique token; sends invite email via Resend with accept link
- Accept invitation: validate token, check expiry (7-day default), if user exists attach as Member, if not prompt registration then attach
- Cancel invitation: only the inviter or Owner/Admin can cancel
- List invitations: show pending, accepted, and expired invitations for the company
- Duplicate check: cannot invite someone who is already a member or has a pending invite
- Permission: only Owner and Admin can invite; only Owner can invite with Admin role
- Invitation accept page: `/invite/[token]` -- shows company name, role offered, accept/decline buttons

### Acceptance Criteria
- [ ] Owner/Admin can send invitation email with a specific role
- [ ] Invitation email contains a working accept link
- [ ] Existing user can accept and join the company with the specified role
- [ ] New user is prompted to register, then auto-joins the company after registration
- [ ] Duplicate invitations are rejected
- [ ] Expired invitations (>7 days) cannot be accepted
- [ ] Only Owner can invite with Admin role

### Context
From PLAN.md Section 5 (Phase 1A). The invitation system is how teams grow. The flow must handle both existing users (just create a Member record) and new users (registration + Member record). Permission hierarchy: Owner > Admin > Developer/QA > Viewer.

### Learnings
_(Fill during execution)_

---

## Task 10: RBAC Middleware and Permission Enforcement

### Objective
Implement role-based access control middleware that enforces permissions per company context across all tRPC routes.

### Requirements
- RBAC middleware for tRPC: accepts required permission(s), checks the user's role in the current company
- Permission matrix from `@bugdetector/shared`:
  - OWNER: all permissions
  - ADMIN: all except delete company, transfer ownership
  - DEVELOPER: create/update issues, manage own assignments, view all
  - QA: create/update issues, manage test cases/runs, view all
  - VIEWER: read-only access to all resources
- Company context resolution: extract company from URL slug or request header
- Middleware validates: (1) user is authenticated, (2) user is a member of the company, (3) user's role has the required permission
- Return 403 with clear error message when permission is denied
- Utility function: `hasPermission(role, action)` for use in UI (hide/show buttons)
- Export the permission checker from `@bugdetector/shared` so the extension can also use it

### Acceptance Criteria
- [ ] tRPC routes decorated with RBAC middleware correctly enforce permissions
- [ ] VIEWER cannot create issues (gets 403)
- [ ] DEVELOPER can create issues but cannot manage members
- [ ] ADMIN can manage members but cannot delete the company
- [ ] OWNER can do everything
- [ ] A user's role in Company A does not affect their permissions in Company B
- [ ] `hasPermission` utility works for both server and client

### Context
Multi-company RBAC is a critical foundation from PLAN.md Phase 1A. The key design point: role is per-membership (Member table), not per-user. A user can be Admin in one company and Viewer in another. The middleware must always scope to the "current company" context.

### Learnings
_(Fill during execution)_

---

## Task 11: Project CRUD and Settings

### Objective
Implement project creation, retrieval, update, and deletion within a company. Projects hold issues, regression suites, and integrations.

### Requirements
- tRPC endpoints: create project, get project (by id and key), list projects (in company), update project, delete project (soft delete)
- Project creation: name, key (auto-generated from name, e.g., "Frontend App" -> "FA", editable, unique within company), description; requires ADMIN+ role
- Project key validation: uppercase letters + numbers, 2-10 chars, unique within company
- Project settings (stored in settings_json): custom statuses list (default from shared constants), custom priorities, default assignee, notification preferences
- Project listing: paginated, filterable by name
- Project update: name, description, settings_json; requires ADMIN+ role
- Project delete: soft delete (archived flag); requires OWNER/ADMIN role
- Issue number sequence: each project maintains its own counter for issue numbering (e.g., BUG-1, BUG-2)

### Acceptance Criteria
- [ ] Admin+ can create a project with auto-generated key
- [ ] Project key is unique within the company
- [ ] Project settings can be customized (statuses, priorities)
- [ ] Projects are listed for the current company only
- [ ] Soft delete archives the project; it no longer appears in listings
- [ ] Issue number counter is initialized to 0 on project creation
- [ ] VIEWER/DEVELOPER/QA cannot create or delete projects

### Context
From PLAN.md Section 5 (Phase 1A). Projects are the primary organizational unit for issues and regression suites. The key prefix is used in issue numbering (e.g., `BUG-142`). Settings_json stores customizable workflow configuration.

### Learnings
_(Fill during execution)_

---

## Task 12: API Key Generation and Validation

### Objective
Implement API key generation, listing, revocation, and validation for MCP server and extension authentication.

### Requirements
- tRPC endpoints: generate API key, list API keys (for company or project), revoke API key
- Key format: `bd_key_` prefix + 32-character random string (e.g., `bd_key_a1b2c3d4e5f6...`)
- Storage: hash the key with SHA-256 and store only the hash; show the full key once at creation time
- Permissions: JSON field with scoped permissions (read, write, per resource type); per-project or company-wide
- Validation middleware: accept API key via `Authorization: Bearer bd_key_...` header; look up by hash; check permissions; attach company/project context
- API key can authenticate both tRPC calls and REST-style API routes
- Key metadata: name (user-provided label), last_used_at (updated on each use), created_at, revoked_at
- Only ADMIN+ can generate and revoke API keys

### Acceptance Criteria
- [ ] Admin can generate an API key and sees the full key exactly once
- [ ] API key is stored as a SHA-256 hash (never in plaintext)
- [ ] API requests with a valid API key are authenticated and scoped correctly
- [ ] Revoked API keys are rejected
- [ ] API key permissions are enforced (a read-only key cannot create issues)
- [ ] `last_used_at` is updated on each API call using the key
- [ ] Keys can be scoped to a specific project or company-wide

### Context
From PLAN.md Section 5 (Phase 1A). API keys are essential for: (1) MCP server authentication, (2) extension authentication when not using session cookies, (3) CI/CD webhook authentication, (4) AI agent authentication. The "show once" pattern is standard security practice.

### Learnings
_(Fill during execution)_

---

## Task 13: Agent Model CRUD and Assignment UI

### Objective
Implement AI agent creation, configuration, listing, and the ability to assign agents alongside human members in dropdowns. Agent execution is V2; this is the model and UI only.

### Requirements
- tRPC endpoints: create agent, get agent, list agents (in company), update agent, disable/enable agent
- Agent creation: name, type (QA_TESTER, DEVELOPER, CODE_REVIEWER, REGRESSION_RUNNER), config_json (model, repo_url, target_url, capabilities), avatar_url; requires ADMIN+ role
- Agent listing: alongside members in assignment contexts; separate listing for agent management
- Agent appears in issue assignment dropdowns grouped under "AI Agents" section (separate from "Team Members")
- When an issue or test case is assigned to an agent: create an AgentTask record with status QUEUED
- AgentTask queue dashboard: list all agent tasks with status (queued/running/completed/failed), filterable by agent and status
- V1 behavior: assigning to an agent creates the task and shows "Agent assigned, awaiting integration" status. No automated execution.

### Acceptance Criteria
- [ ] Admin can create and configure an AI agent
- [ ] Agents appear in assignment dropdowns alongside human members (visually separated)
- [ ] Assigning an issue to an agent creates an AgentTask record
- [ ] AgentTask queue dashboard shows all pending/completed tasks
- [ ] Agent can be disabled (no longer appears in assignment dropdowns)
- [ ] Agent config is validated (required fields based on type)
- [ ] Only ADMIN+ can manage agents

### Context
From PLAN.md Section 9 (AI Agents as Team Members). V1 ships the agent model and UI. The assignee pattern is polymorphic: assignee_type = "member" or "agent", assignee_id references the respective table. Actual agent execution (Claude API + Playwright) is V2.

### Learnings
_(Fill during execution)_

---

## Task 14: Web App Layout Shell and Navigation

### Objective
Build the main application layout with sidebar navigation, company switcher, project selector, and user menu. This is the shell that all pages render within.

### Requirements
- App layout with responsive sidebar (collapsible on mobile)
- Sidebar navigation: Dashboard, Issues (per project), Regression Suites (per project), Agents, Integrations, Settings
- Company switcher dropdown in sidebar header: shows all user's companies, allows switching
- Project selector: within the company context, switch between projects
- User menu (top-right or sidebar bottom): profile, settings, logout
- Breadcrumb component for page hierarchy
- Use shadcn/ui components for all UI elements
- Dark mode support (system preference + toggle)
- Loading states with skeleton UI for all navigation data
- Route structure: `/[companySlug]/[projectKey]/issues`, `/[companySlug]/[projectKey]/regression`, `/[companySlug]/settings`, etc.

### Acceptance Criteria
- [ ] Layout renders with sidebar, header, and main content area
- [ ] Company switcher loads and switches between companies
- [ ] Project selector loads projects for the current company
- [ ] Navigation links route to correct pages
- [ ] Sidebar collapses on mobile with hamburger menu
- [ ] Dark mode toggles correctly
- [ ] Skeleton loading states appear while data loads
- [ ] Active navigation item is visually highlighted

### Context
This is the application shell. Every feature page (issues, regression, settings) renders inside this layout. The URL structure follows the pattern `/{companySlug}/{projectKey}/{feature}`. shadcn/ui is the component library per PLAN.md Section 4.

### Learnings
_(Fill during execution)_

---

## Task 15: Dashboard -- Company Overview Page

### Objective
Build the main dashboard page showing recent activity, issue statistics, and quick actions for the current company.

### Requirements
- Dashboard route: `/[companySlug]/dashboard`
- Stats cards: total open issues, issues created this week, issues closed this week, pending agent tasks
- Recent activity feed: last 20 activities across all projects (from ActivityLog)
- Quick actions: create issue, invite member, create project
- Project summary cards: for each project, show open issue count and latest activity
- Member list widget: show team members and their current assignments
- Agent status widget: show AI agents and their queue status
- All data loaded via tRPC queries
- Responsive grid layout

### Acceptance Criteria
- [ ] Dashboard loads stats for the current company
- [ ] Recent activity feed shows the latest actions across projects
- [ ] Project summary cards link to the respective project
- [ ] Quick action buttons navigate to the correct creation flows
- [ ] Dashboard handles empty state gracefully (new company with no projects)
- [ ] Data refreshes when switching companies

### Context
The dashboard is the landing page after login. It provides an overview and quick access to key workflows. This is the "home base" from which users navigate to specific projects and features.

### Learnings
_(Fill during execution)_

---

# Phase 1B: Issue Tracking (Weeks 3-5)

## Task 16: Issue Creation -- tRPC API and Form

### Objective
Implement issue creation with the full form including title, rich text description (Tiptap editor), priority, status, assignee, labels, and due date.

### Requirements
- tRPC mutation: createIssue -- validates with Zod schema, auto-generates issue number (project key + sequence), creates ActivityLog entry
- Issue creation form page: `/[companySlug]/[projectKey]/issues/new`
- Title field: required, max 200 chars
- Description: Tiptap rich text editor with basic formatting (bold, italic, lists, code blocks, links, images)
- Priority selector: Critical, High, Medium, Low, None (from project settings or defaults)
- Status: defaults to OPEN
- Assignee: dropdown with team members and AI agents (polymorphic)
- Labels: multi-select from project's labels (with create-new-label inline)
- Due date: date picker
- Auto-populated metadata: reporter (current user), created_at
- Keyboard shortcut: Cmd/Ctrl+Enter to submit
- After creation, redirect to issue detail page

### Acceptance Criteria
- [ ] Issue is created with auto-generated number (e.g., BUG-1)
- [ ] Tiptap editor renders with formatting toolbar
- [ ] Priority, status, assignee, and labels are selectable
- [ ] ActivityLog entry is created for issue creation
- [ ] Validation errors show inline (title required, etc.)
- [ ] Issue number increments correctly per project
- [ ] Redirect to issue detail page after successful creation

### Context
From PLAN.md Section 5 (Phase 1B). Issues are the core entity. The Tiptap editor is specified in the appendix. Issue numbers follow the pattern `{PROJECT_KEY}-{SEQUENCE}` (e.g., BUG-1, BUG-2). The polymorphic assignee supports both human and AI agent assignment.

### Learnings
_(Fill during execution)_

---

## Task 17: Issue Detail Page

### Objective
Build the issue detail page showing all issue data, comments, activity log, recordings, and screenshots in a comprehensive view.

### Requirements
- Issue detail route: `/[companySlug]/[projectKey]/issues/[issueNumber]`
- Header: issue number, title (inline editable), status badge, priority badge
- Sidebar: assignee (changeable), labels (editable), due date, reporter, created/updated dates, links to related issues
- Main content: description (rendered rich text, editable), AI summary (if available), AI root cause (if available)
- Comments section: list of comments with author, timestamp, rich text content; new comment form with Tiptap editor
- Activity log: chronological list of all status changes, assignments, comments, recordings attached
- Recordings section: list of attached recordings with thumbnails and links to viewer (Phase 1D)
- Screenshots section: gallery of attached screenshots
- Status change: dropdown or button bar to transition status (respecting allowed transitions)
- Inline editing: click on title, description, priority, assignee, labels to edit in place
- @mentions in comments: autocomplete with team members and agents

### Acceptance Criteria
- [ ] Issue detail page loads all issue data
- [ ] Inline editing works for title, description, priority, assignee, labels
- [ ] Comments can be added with rich text and @mentions
- [ ] Activity log shows all changes chronologically
- [ ] Status transitions follow the allowed flow (Open -> In Progress -> Dev Testing -> QA Testing -> Closed; any -> Reopened)
- [ ] Recordings and screenshots sections show attached media (or empty state)
- [ ] Changes create ActivityLog entries

### Context
This is the central page for working with a bug. It must show the "full context" that developers need: the bug description, reproduction steps, recordings, console/network logs, and the full history of work done on it. The viewer for recordings is built in Phase 1D.

### Learnings
_(Fill during execution)_

---

## Task 18: Issue List View with Filtering and Sorting

### Objective
Build the issue list view with table/list display, column sorting, multi-criteria filtering, and pagination.

### Requirements
- List route: `/[companySlug]/[projectKey]/issues` (default view)
- Table columns: number, title, status, priority, assignee, labels, created date, updated date
- Sorting: click column headers to sort ascending/descending
- Filters: status (multi-select), priority (multi-select), assignee (multi-select including agents), label (multi-select), date range, reporter
- Filter UI: filter bar above the table with dropdowns; active filters shown as removable chips
- Pagination: cursor-based pagination, configurable page size (25/50/100)
- URL-persisted filters: filter state reflected in URL query params (shareable filtered views)
- Empty state: "No issues found" with CTA to create first issue
- Bulk selection: checkboxes on each row for bulk actions (Task 21)
- Row click navigates to issue detail page

### Acceptance Criteria
- [ ] Issues are listed in a sortable table
- [ ] All filter types work correctly and can be combined
- [ ] Filters persist in the URL (refreshing preserves filters)
- [ ] Pagination works with cursor-based navigation
- [ ] Sorting works on all columns
- [ ] Empty state is shown when no issues match filters
- [ ] Performance is acceptable with 100+ issues (no full table re-render on filter change)

### Context
From PLAN.md Section 5 (Phase 1B). The list view is the primary way to see all issues in a project. URL-persisted filters are important so filtered views can be bookmarked and shared. Cursor-based pagination scales better than offset-based for large datasets.

### Learnings
_(Fill during execution)_

---

## Task 19: Issue Board View (Kanban)

### Objective
Build a Kanban board view with drag-and-drop status changes, swimlanes by status, and card previews.

### Requirements
- Board route: `/[companySlug]/[projectKey]/issues?view=board` (toggle between list and board)
- Columns: one per status (Open, In Progress, Dev Testing, QA Testing, Closed, Reopened) -- derived from project settings
- Cards: show issue number, title, priority badge, assignee avatar, label dots
- Drag-and-drop: drag a card between columns to change status; calls tRPC mutation to update; creates ActivityLog entry
- Card count per column shown in column header
- Drag constraints: respect allowed status transitions (configurable, but default allows any transition)
- Filter bar: same filters as list view apply to the board
- Column scrolling: each column independently scrollable
- Use a library like @dnd-kit or react-beautiful-dnd for drag-and-drop
- View toggle: button to switch between list and board views (preserves filters)

### Acceptance Criteria
- [ ] Board displays columns for each status with issue cards
- [ ] Drag-and-drop moves cards between columns and updates status
- [ ] ActivityLog entry is created on status change via drag
- [ ] Card shows issue number, title, priority, assignee
- [ ] Filters from the filter bar apply to the board
- [ ] View toggle preserves current filters
- [ ] Board handles 50+ issues per column without lag

### Context
From PLAN.md Section 5 (Phase 1B). The Kanban board is essential for teams that work visually. The status flow from the plan: Open -> In Progress -> Dev Testing -> QA Testing -> Closed, with Reopened as a branch. This is a standard pattern used by Linear, Jira, etc.

### Learnings
_(Fill during execution)_

---

## Task 20: Full-Text Search Across Issues

### Objective
Implement full-text search across issues within a project, searching title, description, and comments.

### Requirements
- Search input in the issue list/board header
- tRPC query: searchIssues(query, projectId, filters) -- combines text search with existing filters
- Search targets: issue title, description (strip HTML), comment content
- PostgreSQL full-text search using `tsvector` and `tsquery` (or Prisma's native search if sufficient)
- Search results ranked by relevance
- Highlight matching terms in results (optional but nice)
- Debounced search input (300ms delay)
- Search also works from the global search bar (search across all projects in the company)
- Show recent searches for quick access

### Acceptance Criteria
- [ ] Searching by keyword returns matching issues
- [ ] Search works across title, description, and comments
- [ ] Results are ranked by relevance
- [ ] Search can be combined with filters (e.g., search "login" + status:OPEN)
- [ ] Debounce prevents excessive API calls
- [ ] Empty search state shows appropriate message
- [ ] Global search returns results across all projects in the company

### Context
From PLAN.md Section 5 (Phase 1B). Full-text search is critical for teams with many issues. PostgreSQL's built-in full-text search is sufficient for V1. In the future, pgvector can be added for semantic/AI search (listed in the tech stack).

### Learnings
_(Fill during execution)_

---

## Task 21: Bulk Actions and Issue Linking

### Objective
Implement bulk actions on issues (assign, change status, add label) and issue-to-issue linking (related, blocks, duplicate).

### Requirements
- Bulk actions in list view: select multiple issues via checkboxes, then: bulk assign, bulk change status, bulk add label, bulk change priority
- Bulk action bar appears when items are selected (shows count and action buttons)
- tRPC mutations for each bulk action; create ActivityLog entries for each affected issue
- Issue linking: on issue detail page, "Link issue" button opens a search modal to find and link another issue
- Link types: RELATED, BLOCKS, BLOCKED_BY, DUPLICATE
- Linked issues displayed in the issue detail sidebar
- When marking as duplicate: optionally close the duplicate and add a comment pointing to the original
- Bidirectional display: if Issue A blocks Issue B, then Issue B shows "blocked by Issue A"

### Acceptance Criteria
- [ ] Bulk select works with "select all" and individual checkboxes
- [ ] Bulk assign changes assignee on all selected issues
- [ ] Bulk status change works with ActivityLog entries for each issue
- [ ] Issue linking modal allows searching and selecting an issue to link
- [ ] All link types are supported and display correctly
- [ ] Linked issues show in the sidebar with link type
- [ ] Duplicate marking optionally closes the duplicate
- [ ] Bidirectional links display correctly on both issues

### Context
From PLAN.md Section 5 (Phase 1B). Bulk actions are essential for triage workflows. Issue linking supports dependency tracking (blocks/blocked_by) and duplicate management. The DUPLICATE link type is important for the AI duplicate detection feature planned for later.

### Learnings
_(Fill during execution)_

---

## Task 22: Notification System -- In-App and Email

### Objective
Implement in-app notifications and email notifications for issue assignments, mentions, status changes, and comments.

### Requirements
- Notification triggers: issue assigned to you, @mentioned in a comment, issue you reported changes status, issue you're watching gets a comment, invitation received
- In-app notifications: bell icon in header with unread count badge; dropdown showing recent notifications; mark as read (individual and bulk); click notification to navigate to the relevant entity
- Notification model records: user_id, type, title, body, read (boolean), entity_type, entity_id
- Email notifications: send via Resend for the same triggers; respect user preferences (can disable per type)
- User notification preferences: stored per user, toggles for each notification type (in-app and email separately)
- tRPC queries: list notifications (paginated), unread count, mark read, mark all read
- Real-time updates: SSE (Server-Sent Events) to push new notifications to the client without polling

### Acceptance Criteria
- [ ] In-app notification bell shows unread count
- [ ] Notification dropdown lists recent notifications
- [ ] Clicking a notification navigates to the relevant issue/entity
- [ ] Mark as read works (individual and all)
- [ ] Email notifications are sent for configured triggers
- [ ] User can configure notification preferences (disable specific types)
- [ ] SSE pushes new notifications in real-time without page refresh

### Context
From PLAN.md Section 5 (Phase 1B). SSE is the real-time mechanism for V1 (decision D8). Note from FINAL-RESEARCH.md: browsers limit SSE connections to 6 per domain, so use a single multiplexed SSE stream with event types as channels. Email notifications via Resend.

### Learnings
_(Fill during execution)_

---

# Phase 1C: Browser Extension -- Bug Capture (Weeks 5-9)

## Task 23: WXT Extension Project Setup and Auth

### Objective
Set up the WXT browser extension project in `apps/extension` with React, TypeScript, Tailwind, and authentication that connects to the web app's auth system.

### Requirements
- Initialize WXT project with React + TypeScript in `apps/extension`
- Configure Tailwind CSS for the extension UI
- Set up manifest.json (MV3) with: name, description, permissions (`activeTab`, `storage`, `tabs`, `scripting`, `offscreen`), host_permissions configured via runtime requests
- Extension popup: React app that renders in the browser action popup
- Auth flow: "Sign in" button opens the BugDetector web app login page in a new tab; after login, extension reads the session cookie or uses a token exchange; store auth state in `chrome.storage.local`
- API key auth fallback: user can paste an API key in extension settings for headless auth
- Auth state determines popup UI mode: not logged in (Quick Capture only), logged in + no org (Quick Capture + "Create team" CTA), logged in + org (full feature set with project selector)
- Service worker: basic setup with message handling between popup, content scripts, and service worker
- Shared package integration: import types and schemas from `@bugdetector/shared`

### Acceptance Criteria
- [ ] WXT project builds successfully with `wxt build`
- [ ] Extension loads in Chrome via "Load unpacked" in developer mode
- [ ] Popup renders with React and Tailwind styling
- [ ] User can authenticate with the BugDetector web app
- [ ] Auth state persists across browser restarts
- [ ] API key auth works as fallback
- [ ] Popup adapts UI based on auth state (3 modes)
- [ ] Service worker initializes and handles messages

### Context
From PLAN.md Section 5 (Phase 1C) and Section 10 (Extension Architecture). WXT is the extension framework (decision D6). MV3 is required. Use `activeTab` instead of `<all_urls>` to avoid Chrome Web Store rejection (risk C2). The three popup modes are critical for the adoption strategy.

### Learnings
_(Fill during execution)_

---

## Task 24: rrweb Session Recording Integration

### Objective
Integrate rrweb for DOM session recording in the extension content script, with a rolling buffer that captures the last 30-60 seconds of activity.

### Requirements
- Install rrweb in the extension
- Content script (isolated world) initializes rrweb recorder on page load
- Rolling buffer: store rrweb events in a circular buffer (configurable 30s or 60s default)
- Buffer stored in content script memory (NOT service worker, since SW can sleep)
- When user clicks "Capture Bug," snapshot the buffer contents
- Buffer management: discard events older than the configured window; track approximate memory usage
- Mutation throttling: if rrweb detects >500 mutations/second, reduce recording fidelity or pause
- 50MB memory cap: if buffer exceeds this, start dropping oldest events aggressively
- rrweb configuration: record mouse movements, scrolls, input changes; mask input values by default (PII safety)
- Recording indicator: small badge on the extension icon when recording is active
- Start/stop manual recording mode (in addition to rolling buffer): user explicitly starts, captures everything until stop

### Acceptance Criteria
- [ ] rrweb records DOM events on the current page
- [ ] Rolling buffer captures the last 30-60 seconds
- [ ] "Capture Bug" grabs the buffer contents as a JSON blob
- [ ] Mutation throttling engages at high mutation rates
- [ ] Memory cap is enforced
- [ ] Manual start/stop recording mode works
- [ ] Input values are masked by default
- [ ] Recording indicator shows on the extension icon

### Context
From PLAN.md Section 5 (Phase 1C) and Section 10. rrweb is the primary recording method (decision D2: rrweb-only for V1, video deferred to V1.5). The rolling buffer approach matches Jam.dev's UX: always recording in the background, capture "last N seconds" on demand. Risk H1: rrweb can degrade on complex pages; mutation throttling and memory cap are mitigations.

### Learnings
_(Fill during execution)_

---

## Task 25: Console Log Capture

### Objective
Implement console log interception in a MAIN world content script to capture all console output, uncaught exceptions, and unhandled promise rejections.

### Requirements
- MAIN world script injection at `document_start` via `chrome.scripting.registerContentScripts({ world: 'MAIN' })`
- Monkey-patch: `console.log`, `console.warn`, `console.error`, `console.info`, `console.debug`
- Capture uncaught exceptions via `window.onerror`
- Capture unhandled promise rejections via `window.addEventListener('unhandledrejection')`
- Each entry: timestamp, level (log/warn/error/info/debug/exception), message, stack trace (if error), serialized arguments
- Safe serialization: handle circular references, DOM elements (convert to string), large objects (truncate at 10KB), undefined/null/Symbol
- Relay captured logs from MAIN world to content script via `window.postMessage` with a unique message type
- Content script forwards to service worker for buffer storage
- Log buffer: keep last 500 log entries (configurable)
- Timestamp each entry with high-resolution time (performance.now()) and wall clock time
- Link log timestamps to rrweb recording timeline (same time base)

### Acceptance Criteria
- [ ] All console.* calls are intercepted and captured
- [ ] Uncaught exceptions are captured with stack traces
- [ ] Unhandled promise rejections are captured
- [ ] Circular references don't crash the serializer
- [ ] Large objects are truncated, not omitted
- [ ] Logs relay from MAIN world to content script via postMessage
- [ ] Log timestamps align with the rrweb recording timeline
- [ ] Original console behavior is preserved (patched functions still output to DevTools)

### Context
From PLAN.md Section 5 (Phase 1C). Console capture MUST run in MAIN world because the page's console object lives there. The ISOLATED world content script cannot see console calls. The relay pattern (MAIN -> postMessage -> ISOLATED -> chrome.runtime.sendMessage -> SW) is the standard MV3 approach.

### Learnings
_(Fill during execution)_

---

## Task 26: Network Request Capture

### Objective
Implement network request interception to capture all fetch and XHR requests with headers, bodies, timing, and response status.

### Requirements
- MAIN world script: monkey-patch `window.fetch()` and `XMLHttpRequest.prototype.open/send`
- For each request capture: URL, method, request headers, request body (opt-in, off by default), response status, response headers, response body (opt-in, off by default), timing (start, end, duration), request size, response size
- Also use `chrome.webRequest.onCompleted` in service worker for comprehensive metadata (initiator, resource type, IP)
- Merge MAIN world capture (bodies, exact headers) with webRequest capture (metadata) into unified entries
- HAR-like structured format for each request entry
- Flag failed requests: highlight 4xx and 5xx responses prominently
- Truncation: request/response bodies capped at 50KB each
- Buffer: keep last 200 network requests
- Relay from MAIN world to content script to service worker (same pattern as console)
- PII redaction on headers: auto-mask `Authorization`, `Cookie`, `Set-Cookie` header values before storing

### Acceptance Criteria
- [ ] fetch() and XHR requests are intercepted and captured
- [ ] Request and response headers are captured
- [ ] Body capture is opt-in and off by default
- [ ] Failed requests (4xx/5xx) are flagged
- [ ] Bodies are truncated at 50KB
- [ ] Authorization/Cookie headers are auto-masked
- [ ] Network entries include timing data
- [ ] HAR-like structure is used for storage
- [ ] Entries relay correctly through the message chain

### Context
From PLAN.md Section 5 (Phase 1C) and risk mitigation C3 (PII leakage). Network capture is one of BugDetector's key differentiators: developers get the exact request/response context for debugging. The dual approach (MAIN world patching + webRequest API) provides the most complete data. Body capture is opt-in to minimize PII exposure.

### Learnings
_(Fill during execution)_

---

## Task 27: Screenshot Capture and Annotation

### Objective
Implement viewport screenshot capture and an annotation overlay with drawing tools (arrows, rectangles, text, blur/redact).

### Requirements
- Screenshot capture via `chrome.tabs.captureVisibleTab()` -- captures the visible viewport as PNG
- Full-page screenshot (optional): scroll + stitch approach via offscreen document
- Annotation overlay: opens over the captured screenshot using Fabric.js on a Canvas
- Tools: arrow, rectangle, ellipse, freehand draw, text label, blur/redact tool, color picker
- Toolbar: floating toolbar with tool selection, color, and undo/redo
- Export: save annotated screenshot as PNG (flatten canvas)
- Store annotations as JSON (annotations_json) so they can be re-rendered later
- Blur/redact tool: applies a pixelation/blur effect to selected areas (for hiding sensitive data)
- Keyboard shortcuts: Escape to cancel annotation, Enter to save, Ctrl+Z to undo

### Acceptance Criteria
- [ ] Viewport screenshot is captured as PNG
- [ ] Annotation overlay opens with the screenshot as background
- [ ] All drawing tools work: arrow, rectangle, ellipse, freehand, text, blur
- [ ] Color picker changes the drawing color
- [ ] Undo/redo works
- [ ] Annotated screenshot exports as flattened PNG
- [ ] Annotations are saved as JSON for later re-rendering
- [ ] Blur/redact tool obscures the selected area

### Context
From PLAN.md Section 5 (Phase 1C). Fabric.js is specified in the tech stack for annotation. The blur/redact tool is important for PII safety (users can manually redact sensitive data in screenshots). Full-page screenshot is optional for V1 as it requires the offscreen document and stitching logic.

### Learnings
_(Fill during execution)_

---

## Task 28: PII Redaction Pipeline

### Objective
Build the client-side PII redaction pipeline that runs before any captured data leaves the browser.

### Requirements
- PII redaction runs in the extension BEFORE uploading any data
- Auto-redact patterns (from `@bugdetector/shared` constants):
  - Email addresses (regex)
  - Credit card numbers (regex patterns for major card types)
  - Authorization header values (replace with `[REDACTED]`)
  - Cookie header values (replace with `[REDACTED]`)
  - Custom patterns: configurable per-company sensitive headers/keys blocklist
- Apply to: console log entries (message content), network request headers, network request/response bodies (if captured), rrweb text snapshots
- Configurable: users can toggle redaction on/off per category in extension settings
- GDPR consent dialog: shown on first use of the extension; must accept before any recording starts; consent stored in `chrome.storage.local`; consent audit trail sent to the backend
- Redaction is non-destructive to the original page (only applied to captured data copies)

### Acceptance Criteria
- [ ] Email addresses in console logs are redacted before upload
- [ ] Credit card patterns in any captured data are redacted
- [ ] Authorization and Cookie headers are auto-masked in network captures
- [ ] Custom patterns from company settings are applied
- [ ] GDPR consent dialog shows on first use
- [ ] Recording does not start until consent is given
- [ ] Consent is stored and sent to backend for audit
- [ ] Redaction can be toggled per category in settings

### Context
From PLAN.md risk mitigation C3. PII leakage is a critical risk with potential GDPR fines up to 20M EUR. Client-side redaction is both a legal requirement and a trust differentiator vs competitors (Jam.dev does partial PII redaction; BugDetector does comprehensive client-side). The GDPR consent dialog is noted as a plan gap that was addressed.

### Learnings
_(Fill during execution)_

---

## Task 29: Extension Popup -- Quick Capture Flow

### Objective
Build the Quick Capture mode in the extension popup: one-click capture that uploads all data and returns a shareable link. No project or team setup required.

### Requirements
- Quick Capture button: prominent "Capture Bug" button in the popup
- On click: snapshot the rolling buffer (rrweb events, console logs, network requests), capture screenshot
- Title field: optional (AI auto-generates from captured data if blank -- Claude API call)
- Description field: optional
- Auto-populated environment data: current URL, browser name + version, OS, viewport dimensions, devicePixelRatio, detected framework (scan for Next.js/React/Vue/Angular markers), timestamp
- Upload flow: compress data (gzip), upload to backend API via chunked upload, receive shareable slug
- Progress indicator during upload
- Success state: show shareable link `https://bugdetector.io/b/{slug}` with copy button
- Link options: password protection toggle, expiry (24hr for anonymous, 30 days for free signed-in, never for paid)
- Backend: create QuickCapture record, upload recording/console/network/screenshot to S3, return slug
- Anonymous captures: allowed (no login required), expire after 24 hours

### Acceptance Criteria
- [ ] One-click capture grabs rrweb buffer, console, network, screenshot, and environment data
- [ ] Data is compressed and uploaded to the backend
- [ ] Shareable link is returned and copyable
- [ ] Title auto-generation via AI works when title is blank
- [ ] Environment data is correctly detected and included
- [ ] Anonymous captures work without login
- [ ] Link expiry rules are enforced (24hr/30d/never based on auth state)
- [ ] Upload progress is shown

### Context
From PLAN.md Section 5 (Phase 1C -- Quick Capture mode). This is the "growth engine" per the plan. Jam.dev's success validates that zero-friction bug capture is the #1 adoption driver. The shareable link (no login to view) is critical. The viewer for these links is built in Phase 1D.

### Learnings
_(Fill during execution)_

---

## Task 30: Extension Popup -- Full Platform Flow

### Objective
Build the Full Platform mode in the extension popup: capture + create a tracked issue in a BugDetector project, with assignee, priority, labels, and optional external tool sync.

### Requirements
- Full Platform mode: available when user is logged in AND has at least one company/project
- Same capture mechanism as Quick Capture (rrweb buffer, console, network, screenshot)
- Additional form fields: project selector, priority, assignee (members + agents), labels, due date
- AI-generated description: send captured console errors + network failures to Claude API -> auto-write reproduction steps as the description (user can edit before submitting)
- Submit creates: Issue record in the selected project, Recording record linked to the issue, Screenshot record linked to the issue, uploads media to S3
- Shareable link also generated (same viewer as Quick Capture)
- "Also sync to" section: shows connected integrations (GitHub Issues, Jira, Slack) with toggles (built in Phase 1G, stub for now)
- After submission: show success with issue link and shareable link

### Acceptance Criteria
- [ ] Full mode shows project selector, priority, assignee, labels
- [ ] AI-generated description populates from captured data
- [ ] Submitting creates an Issue with linked Recording and Screenshot
- [ ] Media files are uploaded to S3
- [ ] Issue detail is accessible via the web app
- [ ] Shareable link is also generated
- [ ] Integration sync section shows as a placeholder stub
- [ ] Switching between Quick Capture and Full mode preserves captured data

### Context
From PLAN.md Section 5 (Phase 1C -- Full Platform mode). This is the "monetization path." Teams that want workflow tracking (assignments, status, boards) use Full mode. The AI-generated description is a key differentiator: Claude reads the console errors and network failures and writes human-readable reproduction steps. Integration sync toggles are stubbed now; actual implementation is in Phase 1G.

### Learnings
_(Fill during execution)_

---

## Task 31: S3 Upload Pipeline and Media Storage

### Objective
Build the server-side upload pipeline for recording data, screenshots, console logs, and network logs to AWS S3, with presigned URLs and CDN delivery.

### Requirements
- S3 bucket structure: `{env}/{company_id}/{type}/{id}.{ext}` (e.g., `prod/abc123/recordings/rec456.json.gz`, `prod/abc123/screenshots/ss789.png`)
- Presigned upload URLs: backend generates presigned PUT URLs, extension uploads directly to S3 (no proxy through backend)
- Upload types: rrweb recording (gzipped JSON), console logs (gzipped JSON), network logs (gzipped JSON), screenshots (PNG), annotated screenshots (PNG)
- File size limits: 100MB per recording, 10MB per screenshot (from `@bugdetector/shared` constants)
- Chunked upload support for large recordings: split into 5MB chunks, upload in parallel, server reassembles
- S3 lifecycle policy: Standard -> IA (30 days) -> Glacier (90 days)
- CloudFront CDN for read access (signed URLs for private content, public URLs for Quick Capture viewer)
- Backend tRPC endpoints: requestUploadUrl(type, size) -> returns presigned URL; confirmUpload(type, key) -> validates and creates DB record
- Content-Type and Content-Encoding headers set correctly (gzip for JSON files)

### Acceptance Criteria
- [ ] Presigned upload URLs are generated for each file type
- [ ] Extension uploads directly to S3 using presigned URLs
- [ ] File size limits are enforced (reject >100MB recordings, >10MB screenshots)
- [ ] Gzipped JSON files are uploaded with correct Content-Encoding
- [ ] Uploaded files are accessible via CloudFront CDN URLs
- [ ] S3 lifecycle policy is configured
- [ ] DB records (Recording, Screenshot, QuickCapture) store the correct S3 URLs
- [ ] Chunked upload works for large recordings

### Context
From PLAN.md Section 2 (D7) and risk mitigation H2. AWS S3 is the initial storage target. Console and network logs are stored as S3 files (not JSONB in PostgreSQL) per risk mitigation H3 -- this avoids the TOAST performance cliff for large JSON payloads. Presigned URLs avoid proxying large files through the backend.

### Learnings
_(Fill during execution)_

---

## Task 32: Extension Service Worker and IndexedDB Storage

### Objective
Build the extension service worker for event coordination, IndexedDB-based storage via Dexie.js, and retry logic for failed uploads.

### Requirements
- Service worker: central event hub receiving messages from content scripts and popup
- Dexie.js database with tables: pendingUploads (captures waiting to upload), captureBuffer (temporary rrweb/console/network data), settings (user preferences), auth (session tokens)
- Message routing: content script -> service worker -> IndexedDB; popup -> service worker -> API
- Upload queue: when a capture is submitted, data goes to IndexedDB first, then a background upload process picks it up
- Retry logic: exponential backoff (1s, 2s, 4s, 8s, max 60s) for failed uploads; max 5 retries
- Offline handling: if network is unavailable, queue uploads in IndexedDB; resume when online (`navigator.onLine` + `online` event)
- Keep-alive during upload: use `chrome.alarms` to prevent service worker termination during active uploads
- Cleanup: remove successfully uploaded data from IndexedDB; purge expired data (>24hrs for anonymous, >7 days for all)
- Storage quota management: monitor IndexedDB usage, warn user when approaching limits

### Acceptance Criteria
- [ ] Service worker receives and routes messages correctly
- [ ] Dexie.js database initializes with the correct schema
- [ ] Uploads are queued in IndexedDB before network requests
- [ ] Failed uploads retry with exponential backoff
- [ ] Offline captures are stored and uploaded when connectivity returns
- [ ] Service worker stays alive during active uploads (chrome.alarms)
- [ ] Successfully uploaded data is cleaned from IndexedDB
- [ ] Expired data is purged automatically

### Context
From PLAN.md Section 10 (Extension Architecture) and risk mitigation C1 (MV3 service worker kills recording). The service worker ONLY coordinates; it does NOT hold recording state (that stays in the content script). IndexedDB via Dexie.js is the persistence layer. The offline handling is a plan gap identified in FINAL-RESEARCH.md.

### Learnings
_(Fill during execution)_

---

# Phase 1D: Bug Viewer and Replay (Weeks 9-11)

## Task 33: rrweb Replay Viewer Page

### Objective
Build the bug viewer page with rrweb-player for DOM session replay, playback controls, and viewport scaling.

### Requirements
- Viewer route: `/b/[slug]` for Quick Captures (public, no login required); `/[companySlug]/[projectKey]/issues/[issueNumber]/recording/[recordingId]` for issue recordings
- rrweb-player integration: load rrweb JSON data from S3, initialize player
- Playback controls: play/pause, speed (0.5x, 1x, 2x, 4x), seek bar, current time display
- Viewport scaling: scale the replay to fit the developer's screen (CSS transform) since the recording may be at a different resolution
- Loading state: skeleton UI while recording data downloads from S3
- Error handling: show friendly message if recording data is corrupted or unavailable
- "Captured with BugDetector -- Install Extension" CTA banner on public viewer (viral loop)
- Full-screen mode for the replay
- Responsive: works on different screen sizes

### Acceptance Criteria
- [ ] rrweb-player loads and plays back recorded sessions
- [ ] Playback controls work: play, pause, speed change, seek
- [ ] Recording data loads from S3 via CDN
- [ ] Viewport scales correctly for different screen sizes
- [ ] Public viewer (`/b/[slug]`) works without login
- [ ] CTA banner shows on public viewer
- [ ] Loading and error states are handled gracefully
- [ ] Full-screen mode works

### Context
From PLAN.md Section 5 (Phase 1D). The viewer is critical for adoption: when someone shares a BugDetector link, the viewer must work instantly without login. rrweb-player is part of the rrweb library. Viewport scaling is noted as a plan gap in FINAL-RESEARCH.md -- use CSS transform to scale the replay container.

### Learnings
_(Fill during execution)_

---

## Task 34: Synchronized Timeline with Console and Network Panels

### Objective
Add synchronized console log and network request panels alongside the rrweb replay, with timeline markers that sync with playback position.

### Requirements
- Timeline bar below the replay: shows time markers for console errors, network failures, and user interactions
- Console log panel (collapsible, below or beside replay): list of captured console entries; filterable by level (error, warn, info, log, debug); searchable; clicking an entry jumps the replay to that timestamp
- Network panel (collapsible, tab alongside console): list of network requests; filterable by status (all, failed only), method, URL pattern; expandable rows showing headers and body (if captured); clicking a request jumps replay to that timestamp
- Timestamp synchronization: as the replay plays, the current time indicator moves on the timeline; console and network panels auto-scroll to the current time window
- Timeline markers: red dots for errors, orange for warnings, blue for network requests, red x for failed network requests
- Click on timeline marker to jump to that event
- User interaction events: show click, scroll, and input events on the timeline (from rrweb events)

### Acceptance Criteria
- [ ] Console panel shows all captured log entries with level icons and timestamps
- [ ] Console panel filters by level and supports search
- [ ] Network panel shows all captured requests with status, method, URL, timing
- [ ] Network panel allows expanding to see headers and body
- [ ] Clicking a console entry or network request jumps the replay to that timestamp
- [ ] Timeline bar shows color-coded markers for different event types
- [ ] Timeline syncs with replay playback position
- [ ] Auto-scroll keeps the current time window visible in panels

### Context
From PLAN.md Section 5 (Phase 1D). The synchronized timeline is what makes BugDetector's viewer superior to a plain screen recording. Developers can see exactly what console errors and network failures occurred at each moment in the replay. This is the "context gap" solution identified in FINAL-RESEARCH.md Section 3.

### Learnings
_(Fill during execution)_

---

## Task 35: Environment Info Panel and Screenshot Gallery

### Objective
Add the environment information panel and screenshot gallery to the bug viewer.

### Requirements
- Environment panel (collapsible tab): display all auto-captured environment data: URL, browser, OS, viewport, devicePixelRatio, memory, connection speed, detected framework, timestamp, localStorage keys (names only), cookie count
- Environment data loaded from the QuickCapture or Recording's environment_json field
- Screenshot gallery: display all screenshots attached to the issue or quick capture; thumbnail grid; click to view full-size; annotation overlay renders on top if annotations_json is present
- Screenshot viewer: zoom, pan, download original, download annotated
- Copy environment info as formatted text (for pasting into other tools)
- Mobile-responsive layout: panels stack vertically on small screens

### Acceptance Criteria
- [ ] Environment panel shows all captured metadata
- [ ] Environment info is copiable as formatted text
- [ ] Screenshot gallery shows thumbnails
- [ ] Full-size screenshot viewer works with zoom and pan
- [ ] Annotations render correctly on screenshots
- [ ] Screenshots are downloadable
- [ ] Layout is responsive on mobile

### Context
From PLAN.md Section 5 (Phase 1D). Environment data helps developers reproduce the bug in the same conditions. The screenshot gallery with annotations lets viewers see exactly what the reporter was highlighting. Combined with the replay and console/network panels, this completes the "full context" viewer.

### Learnings
_(Fill during execution)_

---

## Task 36: Public Shareable Links and Promote-to-Issue Flow

### Objective
Implement the public shareable link system for Quick Captures, including password protection, expiry, view counting, and the "promote to issue" conversion flow.

### Requirements
- Public route `/b/[slug]`: loads QuickCapture by slug, renders the full viewer (replay + console + network + environment + screenshots)
- No authentication required to view (critical for adoption)
- Password protection: if QuickCapture has a password_hash, prompt for password before showing content; verify with bcrypt
- Expiry enforcement: if expired, show "This capture has expired" message with CTA to install extension
- View count: increment view_count on each visit (debounced, not on every API call)
- "Promote to Issue" button: visible when viewer is logged in; opens a modal: select company + project, add priority/assignee/labels; converts the QuickCapture into a full Issue with all recordings/screenshots linked; sets converted_to_issue_id on the QuickCapture
- "Share" button: copy link to clipboard, or generate embed code (optional)
- SEO: basic meta tags and Open Graph tags for shared links (title, description, thumbnail)

### Acceptance Criteria
- [ ] Public link loads the viewer without login
- [ ] Password-protected captures prompt for password
- [ ] Expired captures show expiry message
- [ ] View count increments on visits
- [ ] "Promote to Issue" converts a Quick Capture to a tracked Issue
- [ ] Promoted issue has all recordings and screenshots linked
- [ ] Share button copies the link
- [ ] Open Graph meta tags are set for social sharing

### Context
From PLAN.md Section 5 (Phase 1D). The shareable link is the viral loop: QA captures a bug, shares the link in Slack/email, developers click the link and see the full context without installing anything or logging in. The "Promote to Issue" button is the conversion funnel from Quick Capture (free, easy) to Full Platform (paid, workflow). View counting provides analytics on link usage.

### Learnings
_(Fill during execution)_

---

# Phase 1E: Developer Testing and QA Workflow (Weeks 11-13)

## Task 37: Dev Testing Flow -- Recording Attachment and Status Transitions

### Objective
Implement the developer testing workflow: when a developer moves an issue to "Dev Testing," they can attach a recording of their testing. After testing, they mark it "Ready for QA."

### Requirements
- Status transition: IN_PROGRESS -> DEV_TESTING (triggered by developer)
- Dev test recording: developer uses the extension to record their testing of the fix; from the extension, they can attach the recording to the issue (select issue from a list or by number)
- Recording appears in the issue timeline as a "Dev Test Recording" entry (Recording.type = DEV_TEST)
- Extension: "Attach to Issue" feature -- after capturing, option to attach to an existing issue instead of creating a new one
- Status transition: DEV_TESTING -> QA_TESTING (developer marks "Ready for QA")
- Notification: when issue moves to QA_TESTING, notify the QA team (or assigned QA tester)
- ActivityLog entries for all transitions and recording attachments
- Issue detail shows the dev test recording in the timeline

### Acceptance Criteria
- [ ] Developer can move issue to DEV_TESTING status
- [ ] Extension allows attaching a recording to an existing issue
- [ ] Dev test recording appears in the issue timeline with correct type
- [ ] Developer can mark issue "Ready for QA" (moves to QA_TESTING)
- [ ] QA team receives notification when issue enters QA_TESTING
- [ ] ActivityLog captures all transitions and attachments
- [ ] Issue timeline shows the correct chronological flow

### Context
From PLAN.md Section 5 (Phase 1E). This is the core dev/QA workflow that differentiates BugDetector from simple bug capture tools. The extension's "Attach to Issue" feature is new for this task: previously, the extension only created new issues or quick captures. Now it can also attach recordings to existing issues.

### Learnings
_(Fill during execution)_

---

## Task 38: QA Testing Flow -- Verification, Pass/Fail, and Reopen Cycle

### Objective
Implement the QA verification workflow: QA tester reviews the fix, attaches a pass/fail recording, and either closes the issue or reopens it with new evidence.

### Requirements
- QA testing view: when issue is in QA_TESTING, show the original bug report, the dev test recording, and a "Test this fix" prompt
- QA recording: QA uses extension to record their verification testing; attaches as QA_TEST type
- QA verdict: after attaching recording, QA selects PASS or FAIL
  - PASS: issue moves to CLOSED status, closed_at timestamp set, notification sent to reporter and assignee
  - FAIL: issue moves to REOPENED status, notification sent to developer with the QA failure recording; issue returns to the developer's queue
- Reopen cycle: reopened issues can be re-assigned, worked on, and go through dev/QA testing again
- Issue timeline shows the complete lifecycle: bug report -> dev fix -> QA pass/fail -> close/reopen
- Metrics tracking: count of reopen cycles per issue (visible on issue detail)

### Acceptance Criteria
- [ ] QA tester can view the original bug and dev test recording
- [ ] QA can attach a verification recording (QA_TEST type)
- [ ] PASS verdict closes the issue with timestamp
- [ ] FAIL verdict reopens the issue with new recording as evidence
- [ ] Notifications fire on close and reopen
- [ ] Issue timeline shows the complete cycle
- [ ] Reopen count is tracked and displayed
- [ ] Multiple reopen cycles work correctly

### Context
From PLAN.md Section 5 (Phase 1E). The full lifecycle from the plan: (1) QA reports bug with recording, (2) Dev picks up and fixes, (3) Dev tests and records, (4) QA verifies and records, (5) Close or reopen. This workflow with attached recordings at every step is what makes BugDetector unique vs plain issue trackers.

### Learnings
_(Fill during execution)_

---

# Phase 1F: MCP Server (Weeks 11-13, parallel with 1E)

## Task 39: MCP Server Package Setup and Core Tools

### Objective
Create the `@bugdetector/mcp-server` npm package as a thin client that translates MCP tool calls into HTTP API calls to the BugDetector backend.

### Requirements
- Package in `packages/mcp-server` using `@modelcontextprotocol/sdk`
- Configuration via environment variables: `BUGDETECTOR_API_KEY`, `BUGDETECTOR_URL`
- Implement core bug tools: `search_bugs` (query + filters), `get_bug` (full details including console/network/environment/steps), `get_bug_console_logs` (with level filter), `get_bug_network_logs` (with failed_only option), `get_bug_environment`, `get_bug_screenshots`
- Implement update tools: `update_bug_status`, `add_comment`
- Implement project tools: `get_project_info`, `list_open_bugs`
- Each tool: Zod input schema, descriptive tool description for AI agents, HTTP call to backend API, structured response optimized for AI consumption
- Error handling: clear error messages when API key is invalid, server unreachable, or permissions insufficient
- The package is a thin client (~50 lines per tool): zero business logic, only HTTP translation

### Acceptance Criteria
- [ ] Package builds and is publishable as an npm package
- [ ] `npx @bugdetector/mcp-server` starts the MCP server via stdio
- [ ] All bug read tools return structured data
- [ ] `update_bug_status` and `add_comment` work correctly
- [ ] Authentication via API key works
- [ ] Error responses are clear and actionable
- [ ] Tool descriptions are detailed enough for AI agents to use correctly
- [ ] Server works with Claude Desktop and Cursor MCP configuration

### Context
From PLAN.md Section 8. The MCP server is a key differentiator -- no competitor has this depth of bug data accessible to AI agents. The architecture: MCP server on developer's machine -> HTTPS calls -> BugDetector backend on EC2. The server is thin; all logic lives in the backend API routes.

### Learnings
_(Fill during execution)_

---

## Task 40: MCP Server -- Regression and Agent Tools

### Objective
Add regression testing tools and agent workflow tools to the MCP server.

### Requirements
- Regression tools: `get_regression_suite` (list test cases with tier/priority), `start_regression_run` (creates a new run), `submit_test_result` (submit pass/fail for a test case in a run)
- Agent tools: `claim_assignment` (AI agent claims an assigned task), `complete_assignment` (agent marks task done with results), `get_my_assignments` (list pending assignments for this agent/API key)
- MCP Resources: `project/{key}` (project info), `project/{key}/open-bugs` (list of open bugs), `project/{key}/regression-summary` (latest run stats)
- All tools have detailed descriptions explaining when and how to use them
- Tools return data optimized for AI consumption: structured JSON, relevant context included, unnecessary noise removed

### Acceptance Criteria
- [ ] Regression tools allow an AI agent to view suites, start runs, and submit results
- [ ] Agent tools allow claiming and completing assigned tasks
- [ ] MCP Resources are discoverable by AI clients
- [ ] All tools have comprehensive descriptions
- [ ] Response format is optimized for AI agents (not raw database dumps)
- [ ] Tools can be tested with the MCP Inspector tool

### Context
From PLAN.md Section 8. These tools complete the MCP server for V1. The regression tools enable the V2 vision where AI agents can autonomously execute regression runs. The agent tools enable the "AI agent as team member" workflow where agents claim and complete assigned work.

### Learnings
_(Fill during execution)_

---

## Task 41: Backend REST API Routes for MCP Server

### Objective
Create the REST API routes (`/api/v1/*`) that the MCP server's thin client calls. These are separate from tRPC and use API key authentication.

### Requirements
- API routes under `/api/v1/` in the Next.js app:
  - `GET /api/v1/bugs` -- search and list bugs
  - `GET /api/v1/bugs/:id` -- get bug with includes (console_logs, network_logs, environment, steps)
  - `GET /api/v1/bugs/:id/console-logs` -- get console logs (with level filter)
  - `GET /api/v1/bugs/:id/network-logs` -- get network logs (with failed_only filter)
  - `PATCH /api/v1/bugs/:id/status` -- update bug status
  - `POST /api/v1/bugs/:id/comments` -- add comment
  - `GET /api/v1/projects/:key` -- get project info
  - `GET /api/v1/projects/:key/bugs` -- list open bugs
  - `GET /api/v1/projects/:key/regression` -- get regression suite
  - `POST /api/v1/regression/runs` -- start a regression run
  - `POST /api/v1/regression/runs/:id/results` -- submit test result
  - `POST /api/v1/agents/assignments/:id/claim` -- claim assignment
  - `POST /api/v1/agents/assignments/:id/complete` -- complete assignment
- All routes authenticated via API key (from Task 12 middleware)
- Rate limiting: 100 requests/minute per API key (via Upstash Redis)
- Audit logging: every MCP tool invocation is logged (MCP security risk H5)
- Response format: consistent JSON with `{ success, data, error }` wrapper
- Console and network logs fetched from S3 (not from database JSONB)

### Acceptance Criteria
- [ ] All API routes respond correctly with valid API key
- [ ] Invalid API key returns 401
- [ ] Rate limiting enforces 100 req/min per key
- [ ] Console/network log routes fetch from S3 and return structured data
- [ ] Audit log records every API invocation
- [ ] Response format is consistent across all routes
- [ ] Routes handle not-found cases (404) and permission errors (403)

### Context
From PLAN.md Section 8. These REST routes are the backend counterpart to the MCP server's thin client. The MCP server calls these routes; the routes contain all the business logic. The dual API surface (tRPC for web app, REST for MCP/extension) is intentional: tRPC gives type safety for the web, REST gives universal access for external clients.

### Learnings
_(Fill during execution)_

---

# Phase 1G: Integrations (Weeks 11-16, parallel)

## Task 42: Integration Framework and Adapter Interface

### Objective
Build the integration framework with a standard adapter interface that all provider integrations implement. Includes the Integration and ExternalRef database management.

### Requirements
- IntegrationAdapter interface (TypeScript):
  - `createExternalIssue(bug)` -> ExternalRef
  - `updateExternalIssue(bug, ref)` -> void
  - `handleWebhook(payload)` -> void
  - `syncStatus(bug, ref)` -> void
  - `testConnection()` -> boolean
  - `getAvailableProjects()` -> list (for project mapping)
- Integration CRUD: tRPC endpoints to create, list, update, delete, test integrations
- Integration setup wizard UI: select provider -> configure auth -> test connection -> map projects/statuses
- ExternalRef management: create when syncing, update last_synced_at, track sync_status (synced/pending/error)
- Sync engine: when an issue is created or updated, check for active integrations on the project, call the appropriate adapter
- Sync direction controls: outbound only (BD -> external), inbound only (external -> BD), or bidirectional
- Webhook endpoint: `/api/webhooks/[provider]` for inbound sync from external tools
- Webhook signature verification per provider
- Error handling: if sync fails, set sync_status to ERROR, retry 3 times with backoff, notify admin

### Acceptance Criteria
- [ ] IntegrationAdapter interface is defined and documented
- [ ] Integration CRUD works (create, test, update, delete)
- [ ] Setup wizard walks through provider configuration
- [ ] Sync engine triggers on issue create/update
- [ ] ExternalRef records are created and updated correctly
- [ ] Webhook endpoint accepts and routes inbound events
- [ ] Failed syncs are retried and errors surface to admins
- [ ] Sync direction is configurable per integration

### Context
From PLAN.md Section 11. The adapter pattern allows adding new integrations with minimal code. Each provider implements the same interface. The "Bridge, Don't Replace" strategy means BugDetector keeps the rich data (recordings, console, network) while syncing summaries and links to external tools.

### Learnings
_(Fill during execution)_

---

## Task 43: GitHub Issues Integration (2-Way Sync)

### Objective
Implement the GitHub Issues integration adapter with 2-way sync: create GitHub issues from BugDetector bugs, sync status changes bidirectionally.

### Requirements
- GitHub OAuth for authentication (or personal access token)
- Outbound sync (BD -> GitHub): when an issue is created in BugDetector, create a GitHub issue with: title, description (including BugDetector viewer link), labels (mapped), assignee (if GitHub username is mapped)
- Status mapping: configurable mapping between BugDetector statuses and GitHub issue open/closed state + labels
- Inbound sync (GitHub -> BD): GitHub webhook for issue events; when a GitHub issue linked to a BugDetector issue is closed/reopened, update the BD issue status
- Comment sync: optional bidirectional comment sync
- Repository selector: during setup, user picks which GitHub repo to sync with
- ExternalRef: store GitHub issue number and URL for each synced issue

### Acceptance Criteria
- [ ] GitHub OAuth connects successfully
- [ ] Creating a BD issue with GitHub sync creates a GitHub issue
- [ ] GitHub issue includes BugDetector viewer link in description
- [ ] Closing a GitHub issue updates the BD issue status
- [ ] Reopening a GitHub issue updates the BD issue status
- [ ] Status mapping is configurable
- [ ] Comment sync works bidirectionally
- [ ] ExternalRef tracks the GitHub issue link

### Context
From PLAN.md Section 11 (Tier 1 - free tools). GitHub Issues is the first integration because: (1) GitHub is free, (2) most developers use it, (3) it validates the adapter pattern for other integrations. The GitHub issue description should include the BugDetector viewer link so developers clicking through from GitHub get the full recording context.

### Learnings
_(Fill during execution)_

---

## Task 44: Jira Integration (2-Way Sync)

### Objective
Implement the Jira integration adapter with 2-way sync for issues, status changes, and comments.

### Requirements
- Jira authentication: OAuth 2.0 (Atlassian Connect) or API token
- Outbound sync: create Jira issue with title, description (including viewer link), priority mapping, custom fields mapping, labels
- Jira project mapping: map BugDetector project to Jira project; map issue types (Bug, Task, Story)
- Status mapping: map BugDetector statuses to Jira workflow transitions (configurable since Jira workflows vary)
- Inbound sync: Jira webhook for issue events; status changes and comment additions sync back to BD
- Assignee mapping: map Jira users to BD members (by email)
- Attachment: include BugDetector viewer link as a Jira comment or description section
- Handling Jira's complexity: different Jira instances have different workflows, custom fields, and issue types; the adapter must handle this flexibly

### Acceptance Criteria
- [ ] Jira OAuth/API token authentication works
- [ ] Creating a BD issue with Jira sync creates a Jira issue
- [ ] Jira issue includes BugDetector viewer link
- [ ] Status mapping is configurable for different Jira workflows
- [ ] Jira status changes sync back to BD
- [ ] Comment sync works bidirectionally
- [ ] Project and issue type mapping is configurable
- [ ] Adapter handles different Jira configurations gracefully

### Context
From PLAN.md Section 11 (Tier 2). Jira has 86% market share but massive dissatisfaction (FINAL-RESEARCH.md). Many teams will use BugDetector alongside Jira, not instead of it. The "Trojan Horse" strategy: start as a recording layer on top of Jira, gradually become the primary tool. Jira's complexity (custom workflows, fields) means the adapter must be more configurable than GitHub's.

### Learnings
_(Fill during execution)_

---

## Task 45: Azure DevOps Integration (2-Way Sync)

### Objective
Implement the Azure DevOps Boards integration adapter with 2-way sync for work items.

### Requirements
- Azure DevOps authentication: OAuth or Personal Access Token
- Outbound sync: create work item (Bug type) with title, description (including viewer link), priority, area path mapping
- Status mapping: map BD statuses to Azure DevOps work item states (New, Active, Resolved, Closed)
- Inbound sync: Azure DevOps service hooks (webhooks) for work item updated events
- Project/area path mapping: configure which Azure DevOps project and area path to sync with
- Assignee mapping by email
- Comment sync: optional bidirectional

### Acceptance Criteria
- [ ] Azure DevOps authentication works
- [ ] Creating a BD issue with ADO sync creates a work item
- [ ] Work item includes BugDetector viewer link
- [ ] Status mapping is configurable
- [ ] ADO state changes sync back to BD
- [ ] Area path and project mapping works
- [ ] ExternalRef tracks the ADO work item link

### Context
From PLAN.md Section 11 (Tier 2). Azure DevOps is heavily used in enterprise environments. The integration pattern is similar to Jira but with Azure DevOps-specific concepts (work items, area paths, iterations).

### Learnings
_(Fill during execution)_

---

## Task 46: Slack Integration (2-Way Notifications)

### Objective
Implement the Slack integration with channel notifications for bug events, emoji reactions to claim bugs, and slash commands to query bugs.

### Requirements
- Slack app installation: OAuth 2.0 flow to install the BugDetector Slack app
- Outbound notifications: post to a configured Slack channel when: bug created (rich card with title, priority, viewer link, screenshot thumbnail), bug status changed, bug assigned
- Emoji reactions: react with a specific emoji (e.g., eyes) on a bug notification to claim/assign the bug to yourself
- Slash commands: `/bugdetector search <query>` to search bugs, `/bugdetector recent` to list recent bugs, `/bugdetector status <issue-number>` to check bug status
- Channel configuration: per-project channel mapping (different projects post to different channels)
- Message formatting: Slack Block Kit for rich bug cards with buttons (view in BD, claim, change status)
- Interactive messages: button clicks in Slack trigger actions in BugDetector (view, claim)

### Acceptance Criteria
- [ ] Slack app installs via OAuth
- [ ] Bug creation posts a rich card to the configured Slack channel
- [ ] Status changes post updates to Slack
- [ ] Emoji reaction claims/assigns the bug
- [ ] Slash commands return bug information
- [ ] Per-project channel mapping works
- [ ] Interactive buttons in Slack messages trigger BD actions
- [ ] Message formatting is clean and useful

### Context
From PLAN.md Section 11 (Tier 2). Slack is where teams communicate. Bug notifications in Slack close the loop between bug capture and developer awareness. The emoji-to-claim feature is inspired by common Slack workflows. This is also noted in FINAL-RESEARCH.md as a validated pattern (Tegon had Slack intake).

### Learnings
_(Fill during execution)_

---

## Task 47: Webhook System and CI/CD Hooks

### Objective
Implement a generic outgoing webhook system and CI/CD deploy hooks that trigger regression runs.

### Requirements
- Outgoing webhooks: configurable URL + secret; fires on events: bug.created, bug.updated, bug.closed, bug.reopened, regression.completed
- Webhook payload: JSON with event type, entity data, timestamp; HMAC-SHA256 signature in header for verification
- Webhook management UI: create webhook, select events, test webhook (send sample payload), view delivery log
- Retry logic: 3 retries with exponential backoff on failure (non-2xx response)
- Delivery log: store last 100 deliveries per webhook with status, response code, timestamp
- CI/CD deploy hooks: incoming webhook endpoint `/api/webhooks/deploy` that triggers a smoke or regression run
  - Accepts payload with: release version, environment, git SHA, deploy tool identifier
  - Creates a RegressionRun with trigger = DEPLOY_WEBHOOK
  - Returns run ID for polling results
- GitHub Actions integration: provide a GitHub Action yaml snippet for triggering regression on deploy
- Vercel/Netlify: document how to use deploy notification webhooks to trigger tests

### Acceptance Criteria
- [ ] Outgoing webhooks fire for configured events
- [ ] Webhook payloads include HMAC signature
- [ ] Retry logic works for failed deliveries
- [ ] Delivery log shows recent webhook attempts
- [ ] Deploy hook endpoint creates a regression run
- [ ] Deploy hook accepts release version and git SHA
- [ ] GitHub Actions snippet is provided and tested
- [ ] Webhook test button sends a sample payload

### Context
From PLAN.md Section 11 (Tier 3 - CI/CD). Webhooks are the universal integration mechanism. The deploy hook is how BugDetector connects to CI/CD pipelines: a deployment triggers a smoke test regression run. This is the foundation for the V2 vision where AI agents automatically run tests after each deploy.

### Learnings
_(Fill during execution)_

---

# Phase 1H: Regression Testing (Weeks 13-16)

## Task 48: Regression Suite and Test Case CRUD

### Objective
Implement regression suite creation and test case management: create, edit, organize, and tag test cases with the tiered system (Smoke/Core/Full).

### Requirements
- tRPC endpoints: create suite, get suite, list suites (per project), update suite, delete suite
- Test case CRUD: create, get, list (with filters), update, delete, reorder
- Test case fields: title, description, steps_json (structured steps with expected results), expected_result, tier (SMOKE/CORE/FULL), priority, tags (array), folder (organizational grouping)
- Folder structure: test cases organized in folders (e.g., "Login Flow", "Checkout", "Dashboard"); folders are flat (no nesting in V1)
- Tag management: add/remove tags, filter by tags
- Tier assignment: each test case belongs to one tier; filter by tier in listings
- Test case steps editor: structured JSON editor for steps: each step has "action" and "expected" fields
- Import/export: CSV import for bulk test case creation; CSV export for backup
- Drag-and-drop reordering within folders

### Acceptance Criteria
- [ ] Regression suites can be created per project
- [ ] Test cases can be created with all fields
- [ ] Steps editor allows adding/editing/removing structured steps
- [ ] Test cases are organized in folders
- [ ] Tier filter works (show only Smoke, Core, or Full)
- [ ] Tags can be added and used for filtering
- [ ] CSV import creates test cases in bulk
- [ ] CSV export produces valid CSV
- [ ] Drag-and-drop reordering works within folders

### Context
From PLAN.md Section 5 (Phase 1G, labeled as regression testing section). The tiered system (Smoke/Core/Full) is from decision D10. Smoke tests (5-10) run on every deploy, Core (20-50) on every release, Full (100+) on major releases. Folders and tags provide flexible organization for different team workflows.

### Learnings
_(Fill during execution)_

---

## Task 49: Regression Run Execution and Test Results

### Objective
Implement the regression run workflow: create a run from a suite, QA testers execute test cases, mark pass/fail with evidence, and track progress.

### Requirements
- Create regression run: select suite, select tier filter (smoke/core/full/all/custom), link to release version (optional), set trigger type (manual/deploy_webhook/scheduled)
- Run dashboard: show all test cases in the run, grouped by folder, with current result status; progress bar (X tested / Y total); filter by result (pass/fail/blocked/skipped/untested)
- Test execution: QA tester opens a test case in the run; sees steps and expected results; marks as PASS, FAIL, BLOCKED, or SKIPPED; can attach a recording or screenshot as evidence; adds notes
- If FAIL: prompt to create a linked bug (auto-fills title and description from test case); creates TestCaseBugLink
- Run completion: when all test cases are tested, mark run as COMPLETED; calculate stats_json (total, passed, failed, blocked, skipped)
- Results saved as TestResult records
- Run history: list previous runs with pass rates, compare runs side-by-side

### Acceptance Criteria
- [ ] Regression run can be created from a suite with tier filter
- [ ] Run dashboard shows all test cases with progress
- [ ] QA can mark test cases as pass/fail/blocked/skipped
- [ ] Evidence (recording/screenshot) can be attached to results
- [ ] Failing a test prompts to create a linked bug
- [ ] TestCaseBugLink is created when a bug is filed from a failed test
- [ ] Run stats are calculated on completion
- [ ] Run history shows previous runs with pass rates

### Context
From PLAN.md Section 5 (Phase 1G, regression section). This is the manual test execution workflow. The key innovation is linking test failures directly to bugs (TestCaseBugLink), which enables smart re-testing when bugs are fixed. The run dashboard is where QA teams spend most of their time during regression testing.

### Learnings
_(Fill during execution)_

---

## Task 50: Smart Re-Testing and Flaky Test Detection

### Objective
Implement the smart re-testing feature (when a linked bug is fixed, flag the test case for re-verification) and flaky test detection (track pass/fail oscillation).

### Requirements
- Bug-test linking: when a bug linked via TestCaseBugLink is closed (fixed), automatically flag the associated test case as "needs re-verification"
- Dashboard widget: "X test cases pending re-verification due to bug fixes" -- shows which test cases need re-testing in the next run
- In the next regression run, flagged test cases are highlighted with "Re-verify: bug BUG-XXX was fixed"
- After re-verification passes, clear the flag
- Flaky test detection: calculate flaky_score for each test case based on pass/fail history across the last 10 runs
  - Formula: flaky_score = (number of result flips / total runs) * 100
  - A "flip" is when a test case changes from pass to fail or fail to pass between consecutive runs
- Flaky badge: test cases with flaky_score > 30 get a "Flaky" badge in listings
- Flaky test report: list all flaky tests sorted by score, with flip history
- Run comparison: side-by-side view of two regression runs showing which tests changed results

### Acceptance Criteria
- [ ] Closing a linked bug flags the test case for re-verification
- [ ] Dashboard widget shows pending re-verifications
- [ ] Flagged test cases are highlighted in the next run
- [ ] Flaky score is calculated from pass/fail history
- [ ] Flaky badge appears on test cases with score > 30
- [ ] Flaky test report lists all flaky tests
- [ ] Run comparison shows result differences between two runs
- [ ] Re-verification flag clears after passing re-test

### Context
From PLAN.md decision D10 (Tiered Regression System). Smart re-testing closes the loop: bug found in test -> bug fixed -> test re-verified. Flaky detection is essential for test suite health -- flaky tests erode confidence. These features are specifically called out in the plan as differentiators vs competitors that don't link bugs to tests.

### Learnings
_(Fill during execution)_

---

# Cross-Cutting and Polish

## Task 51: Rate Limiting and Security Headers

### Objective
Implement rate limiting across all API surfaces and security headers for the web application.

### Requirements
- Rate limiting via Upstash Redis:
  - API routes: 100 requests/minute per API key
  - Login attempts: 5 per email per 15 minutes
  - Recording uploads: 10 per minute per user
  - AI features (Claude API calls): 20 per minute per company
  - Quick Capture creation: 20 per minute per IP (anonymous)
- Rate limit response: 429 Too Many Requests with `Retry-After` header
- Security headers (Next.js middleware):
  - Strict-Transport-Security (HSTS)
  - Content-Security-Policy (strict, no eval)
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy: restrict unnecessary features
- CORS configuration: allow extension origin, restrict others

### Acceptance Criteria
- [ ] Rate limiting enforces all configured limits
- [ ] 429 responses include Retry-After header
- [ ] All security headers are present on responses
- [ ] CSP does not break application functionality
- [ ] CORS allows the extension to communicate with the API
- [ ] Rate limit state is stored in Redis (survives server restarts)

### Context
Rate limiting is a plan gap identified in FINAL-RESEARCH.md. Security headers are part of risk mitigation C4. These are essential before any public launch.

### Learnings
_(Fill during execution)_

---

## Task 52: Error Tracking, Logging, and Observability

### Objective
Set up Sentry for error tracking, structured logging, and uptime monitoring for the BugDetector platform itself.

### Requirements
- Sentry integration in `apps/web`: capture unhandled errors, API route errors, and server component errors
- Sentry in `apps/extension`: capture extension errors (popup, content script, service worker)
- Structured logging: use a logging library (e.g., pino) with JSON output; log levels: debug, info, warn, error
- Key events to log: authentication events, issue CRUD, recording uploads, integration sync attempts, MCP API calls
- Health check endpoint: `GET /api/health` returns 200 with service status (DB connected, Redis connected, S3 accessible)
- Uptime monitoring: configure an external service (e.g., Uptime Robot or Better Stack) to monitor the health endpoint
- Error alerting: Sentry alerts for error spikes; integrate with Slack for notifications

### Acceptance Criteria
- [ ] Sentry captures errors from the web app
- [ ] Sentry captures errors from the extension
- [ ] Structured logs are output in JSON format with appropriate levels
- [ ] Health check endpoint reports service status
- [ ] Error alerting notifies the team on error spikes
- [ ] Key application events are logged

### Context
From FINAL-RESEARCH.md: "Monitoring/observability: Error tracking + logging for the platform itself (ironic to lack this for a bug tracker)." This is a plan gap that must be addressed before launch. Sentry is mentioned in the research as having an MCP server, validating its use in the developer tools ecosystem.

### Learnings
_(Fill during execution)_

---

## Task 53: Data Retention Policy and GDPR Compliance

### Objective
Implement configurable data retention policies and GDPR compliance features: auto-deletion, data export, and consent management.

### Requirements
- Configurable retention per company: 30/60/90/365 days or never (paid plans)
- Auto-deletion job: scheduled task that deletes recordings, console logs, network logs, and screenshots past retention period; deletes S3 objects and database records
- Quick Capture expiry enforcement: delete expired anonymous captures (24hr) and free tier captures (30 days)
- GDPR data export: user can request an export of all their data (JSON format); delivered via download link
- GDPR data deletion: user can request deletion of their account and all associated data; cascade to recordings, screenshots, comments
- Data retention settings UI: in company settings, configure retention period
- Audit trail: log all data deletion actions

### Acceptance Criteria
- [ ] Retention period is configurable per company
- [ ] Auto-deletion job runs and removes expired data from S3 and database
- [ ] Expired Quick Captures are cleaned up
- [ ] User can request data export
- [ ] User can request account deletion
- [ ] Deletion cascades to all associated data
- [ ] Audit trail logs all deletion actions

### Context
From FINAL-RESEARCH.md: "Data retention policy -- GDPR requires defined retention." GDPR compliance is legally required for EU users. The retention policy also helps control storage costs (S3 lifecycle policies handle storage tier migration, but actual deletion requires application logic).

### Learnings
_(Fill during execution)_

---

## Task 54: Company Settings and Billing Placeholder

### Objective
Build the company settings pages for general settings, member management, integration management, and a billing placeholder for future Stripe integration.

### Requirements
- Settings route: `/[companySlug]/settings`
- Tabs: General, Members, Agents, Integrations, API Keys, Billing, Data Retention
- General: company name, slug, logo upload
- Members: list members with roles, invite button, remove member, change role
- Agents: list AI agents, create/edit/disable (from Task 13)
- Integrations: list connected integrations, add new, configure, disconnect
- API Keys: list keys, generate new, revoke (from Task 12)
- Billing: placeholder page showing current plan (FREE), "Upgrade" button (non-functional, placeholder for Stripe)
- Data Retention: configure retention period (from Task 53)
- All settings respect RBAC (only ADMIN+ can change settings)

### Acceptance Criteria
- [ ] Settings page renders with all tabs
- [ ] General settings can be updated
- [ ] Member management works (invite, remove, change role)
- [ ] Agent management is accessible from settings
- [ ] Integration management is accessible
- [ ] API key management is accessible
- [ ] Billing page shows current plan with upgrade placeholder
- [ ] RBAC restricts access to ADMIN+ users

### Context
This is the central management hub for a company. It consolidates settings that were built across multiple tasks into a unified UI. The billing page is a placeholder because Stripe integration is not in V1 scope but the UI should be ready.

### Learnings
_(Fill during execution)_

---

## Task 55: End-to-End Smoke Test Suite

### Objective
Create a manual smoke test suite covering the critical paths of the entire V1 platform, to be run before each deployment.

### Requirements
- Document a smoke test checklist covering:
  1. Registration and login flow
  2. Company creation and project setup
  3. Team invitation (send, accept, verify member appears)
  4. Issue creation (title, description, priority, assignee)
  5. Issue board: drag-and-drop status change
  6. Extension: install, authenticate, Quick Capture flow
  7. Extension: full platform capture flow (create issue)
  8. Bug viewer: replay plays, console panel shows logs, network panel shows requests
  9. Public shareable link: accessible without login
  10. Promote Quick Capture to Issue
  11. Dev testing flow: attach recording, mark ready for QA
  12. QA testing flow: pass/fail verdict
  13. MCP server: search_bugs and get_bug return data
  14. Regression: create suite, add test cases, create run, submit results
  15. Notifications: in-app notification appears on assignment
- Create this as a regression suite in BugDetector itself (eating our own dog food)
- Each test case has clear steps and expected results

### Acceptance Criteria
- [ ] Smoke test suite covers all 15 critical paths
- [ ] Each test case has numbered steps and expected results
- [ ] Suite is created in BugDetector as a regression suite
- [ ] Full run passes on the current build
- [ ] Any failures are logged as issues

### Context
This is the V1 readiness check. By creating the smoke tests in BugDetector itself, we validate the regression testing feature while also ensuring the platform works end-to-end. This is the minimum quality bar before any external user sees the product.

### Learnings
_(Fill during execution)_

---

# Appendix: Task Dependency Graph

```
Task 1  (Monorepo setup)
  |
  +-> Task 2  (Prisma: auth/org models)
  |     |
  |     +-> Task 3  (Prisma: project/issue models)
  |     |     |
  |     |     +-> Task 4  (Prisma: regression/integration models)
  |     |
  |     +-> Task 5  (Shared package: Zod/types)
  |     |
  |     +-> Task 6  (Better Auth: register/login)
  |           |
  |           +-> Task 7  (Better Auth: reset/OAuth)
  |           |
  |           +-> Task 8  (Company CRUD)
  |           |     |
  |           |     +-> Task 9  (Invitations)
  |           |     |
  |           |     +-> Task 10 (RBAC)
  |           |     |
  |           |     +-> Task 11 (Project CRUD)
  |           |     |     |
  |           |     |     +-> Task 12 (API Keys)
  |           |     |
  |           |     +-> Task 13 (Agent model)
  |           |     |
  |           |     +-> Task 14 (Layout shell)
  |           |           |
  |           |           +-> Task 15 (Dashboard)
  |           |
  |           +--[Phase 1B: Issues]--
  |           |   Task 16 (Issue create)
  |           |     |
  |           |     +-> Task 17 (Issue detail)
  |           |     +-> Task 18 (Issue list)
  |           |     +-> Task 19 (Issue board)
  |           |     +-> Task 20 (Search)
  |           |     +-> Task 21 (Bulk actions/linking)
  |           |     +-> Task 22 (Notifications)
  |           |
  +--[Phase 1C: Extension]--
  |   Task 23 (WXT setup/auth)
  |     |
  |     +-> Task 24 (rrweb recording)
  |     +-> Task 25 (Console capture)
  |     +-> Task 26 (Network capture)
  |     +-> Task 27 (Screenshot/annotation)
  |     +-> Task 28 (PII redaction)
  |     |
  |     +-> Task 29 (Quick Capture flow)
  |     +-> Task 30 (Full Platform flow)
  |     +-> Task 31 (S3 upload pipeline)
  |     +-> Task 32 (Service worker/IndexedDB)
  |
  +--[Phase 1D: Viewer]--
  |   Task 33 (rrweb replay) -- depends on 24, 31
  |     |
  |     +-> Task 34 (Sync timeline/panels) -- depends on 25, 26
  |     +-> Task 35 (Environment/screenshots) -- depends on 27
  |     +-> Task 36 (Shareable links/promote)
  |
  +--[Phase 1E: Workflow]--
  |   Task 37 (Dev testing flow) -- depends on 17, 30
  |     |
  |     +-> Task 38 (QA testing flow)
  |
  +--[Phase 1F: MCP]--
  |   Task 39 (MCP core tools) -- depends on 12
  |     |
  |     +-> Task 40 (MCP regression/agent tools)
  |     +-> Task 41 (Backend REST API)
  |
  +--[Phase 1G: Integrations]--
  |   Task 42 (Framework/adapter) -- depends on 16
  |     |
  |     +-> Task 43 (GitHub Issues)
  |     +-> Task 44 (Jira)
  |     +-> Task 45 (Azure DevOps)
  |     +-> Task 46 (Slack)
  |     +-> Task 47 (Webhooks/CI/CD)
  |
  +--[Phase 1H: Regression]--
  |   Task 48 (Suite/test case CRUD) -- depends on 4, 11
  |     |
  |     +-> Task 49 (Run execution)
  |     +-> Task 50 (Smart re-testing/flaky)
  |
  +--[Cross-Cutting]--
      Task 51 (Rate limiting/security)
      Task 52 (Observability)
      Task 53 (Data retention/GDPR)
      Task 54 (Settings pages)
      Task 55 (Smoke test suite)
```

## Parallelization Notes

The following task groups can be worked on in parallel once their dependencies are met:
- **Phase 1B (Issues)** and **Phase 1C (Extension)** can start in parallel after Phase 1A foundation tasks (1-15) are complete
- **Phase 1E, 1F, and 1G** can all run in parallel once Phase 1B is complete
- **Phase 1H** can start once Phase 1B and Task 4 (regression schema) are done
- **Cross-cutting tasks (51-54)** can be done at any point but are best addressed before the final smoke test (Task 55)
- Within Phase 1C, Tasks 24-28 (capture mechanisms) can be developed in parallel, then 29-32 (flows and infrastructure) depend on them
- Within Phase 1G, Tasks 43-47 (individual integrations) can be developed in parallel after Task 42 (framework)
