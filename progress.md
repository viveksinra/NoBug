# BugDetector -- Progress & Learnings Log

> This file is APPEND-ONLY. Never replace existing entries. Add new entries at the bottom.
> The "Codebase Patterns" section at the top is updated as general patterns are discovered.

---

## Codebase Patterns

> Consolidate reusable patterns here. Read this section FIRST before starting any task.
> These patterns apply across the entire codebase.

- Package scope is `@nobug/` (not `@bugdetector/`) — all workspace packages use this prefix
- Prisma client is imported from `@nobug/db` via `import { db } from '@nobug/db'` — singleton pattern in `packages/db/src/index.ts`
- Better Auth manages User, Session, Account, Verification tables — password is stored in `Account` table, not `User`
- Better Auth field mappings: use snake_case in Prisma, map to camelCase in `auth.ts` config
- tRPC routers in `apps/web/src/server/routers/` — one file per domain, combined in `_app.ts`
- `protectedProcedure` in `apps/web/src/server/trpc.ts` enforces auth — provides `ctx.user` and `ctx.session`
- Zod schemas from `@nobug/shared` — never duplicate validation between web app and extension
- WXT extension requires `srcDir: 'src'` in wxt.config.ts when using `src/entrypoints/` directory structure
- API keys use `nb_key_` prefix + SHA-256 hash storage; `validateApiKey()` in `api-key.ts` for REST/MCP auth
- `requirePermission('perm')` factory in trpc.ts chains off companyProcedure — use for write operations
- `agent.listAssignable` returns unified members + agents list for assignment dropdowns — use this everywhere assignments are needed
- Soft delete pattern: set `settings_json.archived = true` instead of hard delete (projects, etc.)
- WXT 0.20.20: `defineBackground` is auto-imported (no `wxt/sandbox`); storage API at `wxt/utils/storage`
- Extension auth uses `@/lib/auth.ts` with `wxt/utils/storage` for persistent state in `chrome.storage.local`
- Extension ↔ service worker messaging: use `browser.runtime.sendMessage` with typed `ExtensionMessage` union
- Web app extension endpoint: `/api/extension/me` supports session cookie and API key Bearer auth
- rrweb content script stores buffer in content script memory (not SW) — SW can sleep in MV3
- Recording message relay pattern: popup → service worker → content script via `browser.tabs.sendMessage`
- MAIN world scripts use `world: 'MAIN'` in defineContentScript; relay to ISOLATED via `window.postMessage`
- Console capture at `document_start`, rrweb at `document_idle` — both share same performance.now() time origin
- S3 uploads use presigned URLs via `@/lib/s3.ts` — extension/client uploads directly to S3, never through backend
- S3 gracefully no-ops when env vars not set — `isS3Configured()` check, returns null instead of crashing
- Upload types: recordings, console-logs, network-logs, screenshots, annotated-screenshots — gzip encoding for JSON types

<!-- Example entries to be added during execution:
- Use `@bugdetector/shared` for all Zod schemas — never duplicate validation logic
- tRPC routers go in `apps/web/src/server/routers/` — one file per domain (issue.ts, project.ts, etc.)
- Prisma client is imported from `@bugdetector/db` — never instantiate directly
- Extension content scripts use message passing via chrome.runtime.sendMessage — never access DOM from service worker
- S3 uploads use presigned URLs generated server-side — extension never has direct S3 credentials
-->

---

## Iteration Log

## [2026-04-12] — Task T-001: Turborepo Monorepo Scaffolding
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/extension/wxt.config.ts (modified — added srcDir: 'src')
- eslint.config.mjs (created — root ESLint with typescript-eslint)
- turbo.json (modified — added .output to build outputs)
- apps/extension/package.json (modified — added @wxt-dev/module-react)

**What Was Implemented:**
- Fixed missing @wxt-dev/module-react dependency in extension
- Added srcDir configuration to WXT so it finds entrypoints in src/
- Added root ESLint config with typescript-eslint recommended rules
- Added .output/** to turbo build outputs for WXT extension
- Verified `pnpm turbo build` succeeds across all 6 workspaces

**Learnings:**
- Package scope is @nobug/ (not @bugdetector/ as CLAUDE.md suggests) — follow existing convention
- WXT requires `srcDir: 'src'` when entrypoints are under src/entrypoints/
- WXT outputs to .output/ directory, needs to be in turbo.json outputs

---

## [2026-04-12] — Tasks T-002/T-003/T-004: Prisma Schema (All Models)
**Status:** completed
**Iteration:** 1
**Files Changed:**
- packages/db/prisma/schema.prisma (created — full V1 schema with all models)
- packages/db/src/index.ts (modified — PrismaClient singleton export)
- packages/db/package.json (modified — added @types/node)
- package.json (modified — fixed db:* script names)

**What Was Implemented:**
- Complete Prisma schema with 25+ models covering auth, organizations, issues, recordings, regression testing, integrations
- All enums defined as Prisma enums
- Proper indexes on high-traffic query patterns
- Polymorphic actor/assignee pattern documented in schema comments
- PrismaClient singleton with global instance for dev hot reload

**Learnings:**
- Better Auth manages Account/Verification tables — our original OAuthAccount model was replaced with Better Auth's Account model
- Password is stored in Account table (not User) per Better Auth convention
- `@types/node` needed in packages/db for `process.env` references

---

## [2026-04-12] — Task T-005: Shared Package — Zod Schemas, Types, and Constants
**Status:** completed
**Iteration:** 1
**Files Changed:**
- packages/shared/src/constants.ts (modified — added role permissions, PII patterns, priority colors, error codes, all enum tuples)
- packages/shared/src/schemas.ts (created — Zod schemas for all entities)
- packages/shared/src/types.ts (created — utility types: PolymorphicAssignee, PaginatedResponse, ApiResponse, EnvironmentInfo)
- packages/shared/src/index.ts (modified — re-exports all modules)

**What Was Implemented:**
- Zod schemas for auth, company, project, invitation, issue, comment, label, quick capture, API key, agent, integration
- Role permissions matrix with `hasPermission()` utility
- PII patterns for client-side redaction (email, credit card, SSN, phone, auth headers, JWTs)
- Error codes enum
- Pagination and API response wrapper types

---

## [2026-04-12] — Task T-006: Better Auth Setup — Registration and Login
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/lib/auth.ts (created — Better Auth server config with Prisma adapter)
- apps/web/src/lib/auth-client.ts (created — Better Auth React client with signIn, signUp, useSession)
- apps/web/src/lib/trpc.ts (created — tRPC React client)
- apps/web/src/app/api/auth/[...all]/route.ts (created — Better Auth API handler)
- apps/web/src/app/api/trpc/[trpc]/route.ts (created — tRPC fetch handler)
- apps/web/src/server/trpc.ts (created — tRPC init with auth context, protectedProcedure)
- apps/web/src/server/routers/_app.ts (created — root tRPC router)
- apps/web/src/components/providers.tsx (created — tRPC + React Query providers)
- apps/web/src/middleware.ts (created — session-based route protection)
- apps/web/src/app/layout.tsx (modified — wrapped children in Providers)
- apps/web/.env.example (created)
- packages/db/prisma/schema.prisma (modified — aligned with Better Auth: Account replaces OAuthAccount, added Verification table)

**What Was Implemented:**
- Better Auth configured with Prisma adapter and snake_case field mappings
- Email/password registration and login
- Email verification flow (sendOnSignUp, autoSignInAfterVerification)
- Session management with cookie caching
- Next.js middleware redirecting unauth users to /login
- tRPC infrastructure with public and protected procedures
- Auth context injection into tRPC (session + user available in ctx)

**Learnings:**
- Better Auth's `session` config key holds both behavior settings AND model mappings — don't create a duplicate key
- Better Auth stores passwords in Account table, not User table — different from traditional auth
- The OAuthProvider enum was removed; Better Auth uses string provider_id field
- Need `Verification` model for email tokens — Better Auth manages this internally

---

## [2026-04-13] — Task T-011: Project CRUD with Settings
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/server/routers/project.ts (created)
- apps/web/src/server/routers/_app.ts (modified — added projectRouter)

**What Was Implemented:**
- Project CRUD router: create, getByKey, getById, list (paginated+search), update, delete (soft archive via settings_json), suggestKey
- Uses requirePermission('manage_projects') for write operations
- Key uniqueness enforced within company scope (company_id_key compound unique)
- suggestKey auto-generates from project name initials with collision avoidance

**Learnings:**
- Prisma compound unique index (`company_id_key`) works well for scoped uniqueness checks
- Soft delete via settings_json.archived avoids cascade issues and allows restore

---

## [2026-04-13] — Task T-012: API Key Generation and Validation
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/server/routers/api-key.ts (created)
- apps/web/src/server/routers/_app.ts (modified — added apiKeyRouter)

**What Was Implemented:**
- API key generation with `nb_key_` prefix + 24 random bytes (hex)
- SHA-256 hash stored in DB — raw key shown once at creation, never retrievable
- List active keys (never exposing hash), revoke (soft delete via revoked_at)
- `validateApiKey()` utility exported for REST API and MCP endpoint authentication
- Updates `last_used_at` on each validation (fire-and-forget)
- Scoped permissions: read/write, per-project or company-wide

**Learnings:**
- API key prefix changed from `bd_key_` to `nb_key_` to match NoBug branding
- validateApiKey is exported as a standalone utility (not a tRPC middleware) so it can be used by non-tRPC routes (REST, MCP SSE endpoint)

---

## [2026-04-13] — Task T-013: AI Agent Model CRUD
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/server/routers/agent.ts (created)
- apps/web/src/server/routers/_app.ts (modified — added agentRouter)

**What Was Implemented:**
- Agent CRUD: create, getById, list (filterable by status/type), update, disable/enable
- `listAssignable` endpoint: returns both human members AND active agents in a unified format for assignment dropdowns
- Agent task queue: `listTasks` with agent/status filters
- Polymorphic assignee pattern: members have type 'MEMBER', agents have type 'AGENT'
- Config schema validated per agent type (model, repo_url, target_url, capabilities)

**Learnings:**
- `listAssignable` is the key endpoint for the UI — it provides a unified list for assignment dropdowns with visual separation between members and agents
- Agent task counts use Prisma `_count` with filtered relations for queue status

---

<!-- Each iteration adds an entry below. Format:

## [Date] — Task T-XXX: [Title]
**Status:** completed | partial | blocked
**Iteration:** N (which ralph loop iteration for this task)
**Files Changed:**
- path/to/file.ts (created | modified | deleted)

**What Was Implemented:**
- Bullet point summary of what was done

**Learnings:**
- Patterns discovered (add to Codebase Patterns section if reusable)
- Gotchas encountered
- Decisions made and WHY
- Dependencies or assumptions validated/invalidated

**Blockers (if any):**
- What blocked progress and what needs to happen next

---
-->

## [2026-04-14] — Task T-023: WXT Extension Project Setup and Auth
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/extension/wxt.config.ts (modified — added tabs, scripting, offscreen, host_permissions)
- apps/extension/postcss.config.mjs (created — Tailwind CSS PostCSS config)
- apps/extension/src/assets/globals.css (created — Tailwind with dark theme custom properties)
- apps/extension/src/lib/types.ts (created — AuthState, PopupMode, ExtensionMessage types)
- apps/extension/src/lib/constants.ts (created — APP_URL, STORAGE_KEYS, API_KEY_PREFIX)
- apps/extension/src/lib/auth.ts (created — session/API key auth with wxt/utils/storage persistence)
- apps/extension/src/lib/useAuth.ts (created — React hook for popup auth state management)
- apps/extension/src/entrypoints/background.ts (created — service worker with message handling)
- apps/extension/src/entrypoints/popup/main.tsx (rewritten — 3-mode popup with auth)
- apps/extension/src/components/NotLoggedIn.tsx (created — Quick Capture + sign in + API key fallback)
- apps/extension/src/components/NoCompany.tsx (created — Quick Capture + create team CTA)
- apps/extension/src/components/FullMode.tsx (created — full features with settings panel)
- apps/web/src/app/api/extension/me/route.ts (created — extension auth endpoint)
- apps/web/src/lib/auth.ts (modified — added EXTENSION_ORIGIN to trustedOrigins)

**What Was Implemented:**
- MV3 manifest with activeTab, storage, tabs, scripting, offscreen permissions and host_permissions
- Tailwind CSS setup with PostCSS and dark theme custom properties
- Auth library using wxt/utils/storage for persistent auth state in chrome.storage.local
- Two auth methods: session cookie (via web app login) and API key fallback
- Service worker (background.ts) handles all messaging: auth state, login, logout, company/project selection
- Tab listener detects web app login completion and refreshes auth automatically
- Three popup UI modes: not_logged_in (Quick Capture + sign in), no_company (Quick Capture + create team), full (capture bug + settings)
- Settings panel with company switcher and sign out
- Web app /api/extension/me endpoint returns user + companies for both session and API key auth
- Full monorepo build passes (6/6 workspaces)

**Learnings:**
- WXT 0.20.20 does NOT export `wxt/sandbox` — use auto-imported `defineBackground` directly
- WXT storage API is at `wxt/utils/storage`, not `wxt/storage`
- WXT auto-imports defineBackground, defineContentScript etc. — no explicit import needed for these
- Extension auth flow: open web app login in new tab → detect completion via tabs.onUpdated → refresh session cookie
- Better Auth trustedOrigins needs the extension's chrome-extension:// origin for cross-origin cookie access

---

## [2026-04-14] — Task T-024: rrweb Rolling Buffer Recording
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/extension/package.json (modified — added rrweb dependency)
- apps/extension/src/lib/recording.ts (created — RollingBuffer class, RecordingConfig, RecordingState types)
- apps/extension/src/lib/useRecording.ts (created — React hook for popup recording state)
- apps/extension/src/lib/types.ts (modified — added recording message types to ExtensionMessage)
- apps/extension/src/entrypoints/content.ts (created — rrweb content script with rolling buffer)
- apps/extension/src/entrypoints/background.ts (modified — recording message forwarding, badge indicator)
- apps/extension/src/components/FullMode.tsx (modified — wired Capture Bug + manual recording)

**What Was Implemented:**
- RollingBuffer class with configurable time window (30-60s), 50MB memory cap, mutation throttling (>500/s)
- rrweb content script (isolated world, document_idle) with maskAllInputs, mouse/scroll/input sampling
- Rolling buffer mode: always recording, "Capture Bug" snapshots the buffer
- Manual recording mode: explicit start/stop, captures everything in between
- Service worker forwards recording messages to active tab's content script
- Badge indicator: green "REC" when recording, yellow "!" when throttled
- Popup shows recording state (event count, memory usage, throttle status)

**Learnings:**
- rrweb 2.0.0-alpha.4 has a harmless `worker_threads` externalization warning from Vite — safe to ignore
- Content script stores buffer in its own memory (not SW), since service worker can sleep in MV3
- Recording message relay: popup → SW → content script (tabs.sendMessage) for cross-context communication

---

## [2026-04-14] — Task T-025: Console Log Capture (MAIN World)
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/extension/src/lib/console-types.ts (created — ConsoleEntry, LogLevel, ConsolePostMessage types)
- apps/extension/src/entrypoints/console-capture.content.ts (created — MAIN world console capture)
- apps/extension/src/entrypoints/content.ts (modified — added console log buffer + GET_CONSOLE_LOGS handler)
- apps/extension/src/lib/types.ts (modified — added GET_CONSOLE_LOGS, CLEAR_CONSOLE_LOGS messages)
- apps/extension/src/entrypoints/background.ts (modified — renamed set to CONTENT_SCRIPT_MESSAGES, added console log forwarding)

**What Was Implemented:**
- MAIN world content script (document_start) monkey-patches console.log/warn/error/info/debug
- Captures window.onerror (uncaught exceptions) and unhandledrejection events
- Safe serialization handles: circular references (WeakSet), DOM elements (tag#id.class), Symbols, BigInt, Functions, truncation at 10KB
- Original console behavior preserved (patched functions still output to DevTools)
- Relay via window.postMessage(__NOBUG_CONSOLE__) to ISOLATED world content script
- ISOLATED content script stores 500-entry console log buffer
- CAPTURE_BUFFER response now includes consoleLogs alongside rrweb events
- GET_CONSOLE_LOGS / CLEAR_CONSOLE_LOGS message handlers for direct log access

**Learnings:**
- WXT supports `world: 'MAIN'` in defineContentScript — generates manifest with world field automatically
- MAIN world scripts can't import WXT/browser APIs — use window.postMessage for relay
- Console capture must run at document_start to catch early errors; rrweb runs at document_idle
- performance.now() timestamps in MAIN world share the same time origin as ISOLATED world — aligns with rrweb

---

## [2026-04-14] — Task T-026: Network Request Capture
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/extension/src/lib/network-types.ts (created — NetworkEntry, PII_HEADERS, MAX_BODY_SIZE)
- apps/extension/src/entrypoints/network-capture.content.ts (created — MAIN world fetch/XHR capture)
- apps/extension/src/entrypoints/content.ts (modified — added network log buffer, GET_NETWORK_LOGS handler)
- apps/extension/src/lib/types.ts (modified — added GET_NETWORK_LOGS, CLEAR_NETWORK_LOGS)
- apps/extension/src/entrypoints/background.ts (modified — added network message forwarding)

**What Was Implemented:**
- MAIN world script patches window.fetch() and XMLHttpRequest (open/send/setRequestHeader)
- HAR-like NetworkEntry: URL, method, headers, status, timing (start/end/duration), body sizes
- PII header auto-masking: Authorization, Cookie, Set-Cookie, X-API-Key, etc → [REDACTED]
- Body capture opt-in (disabled by default) with 50KB truncation
- Failed request detection (status >= 400 or network error)
- XHR loadend listener captures response metadata after completion
- 200-entry rolling network buffer in ISOLATED content script
- CAPTURE_BUFFER now returns rrweb events + consoleLogs + networkLogs

**Learnings:**
- XHR patching requires storing metadata on the instance (__nobug) across open/send lifecycle
- fetch() clone not needed for headers — response.headers is readable without consuming body
- Both fetch errors (network failures) and 4xx/5xx responses are flagged as failed

---

## [2026-04-14] — Task T-027: Screenshot Capture and Fabric.js Annotation
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/extension/package.json (modified — added fabric dependency)
- apps/extension/src/lib/screenshot.ts (created — ScreenshotResult, AnnotationTool types, captureVisibleTab)
- apps/extension/src/entrypoints/annotate/index.html (created — annotation page)
- apps/extension/src/entrypoints/annotate/main.tsx (created — annotation page entry)
- apps/extension/src/components/AnnotationEditor.tsx (created — Fabric.js editor with 7 tools)
- apps/extension/src/lib/types.ts (modified — added screenshot message types)
- apps/extension/src/entrypoints/background.ts (modified — CAPTURE_SCREENSHOT, OPEN_ANNOTATION_EDITOR handlers)

**What Was Implemented:**
- chrome.tabs.captureVisibleTab() in service worker for viewport PNG capture
- Fabric.js annotation editor opens in a new tab (annotate.html)
- 7 tools: select, arrow, rectangle, ellipse, freehand draw, text, blur/redact
- 7 colors with visual picker
- Undo/redo via canvas JSON history
- Keyboard shortcuts: Escape (cancel), Enter (save), Ctrl+Z/Ctrl+Shift+Z (undo/redo)
- Blur tool: pixelation effect on selected area using canvas pixel manipulation
- Export: flattened PNG + annotations JSON stored in chrome.storage.local

**Learnings:**
- Fabric.js v6+ uses `fabric.FabricImage` (not `fabric.Image`) and `canvas.getScenePoint()`
- Annotation editor as a separate WXT unlisted page (annotate.html) — WXT auto-registers it
- Screenshot data passed via chrome.storage.local between SW and annotation page

---

## [2026-04-14] — Task T-028: PII Redaction Pipeline
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/extension/src/lib/pii-redaction.ts (created — redactString, redactConsoleLogs, redactNetworkLogs, redactRrwebEvents)
- apps/extension/src/lib/consent.ts (created — GDPR consent state with storage)
- apps/extension/src/lib/redaction-config.ts (created — per-category redaction toggle storage)
- apps/extension/src/components/ConsentDialog.tsx (created — GDPR consent UI)
- apps/extension/src/entrypoints/popup/main.tsx (modified — consent check before showing main UI)
- apps/extension/src/entrypoints/content.ts (modified — consent check before starting rrweb)
- apps/extension/src/entrypoints/background.ts (modified — consent/redaction config message handlers)
- apps/extension/src/lib/types.ts (modified — added consent/redaction message types)

**What Was Implemented:**
- PII redaction library using @nobug/shared PII_PATTERNS (email, CC, SSN, phone, auth headers, JWT)
- Applies to: console logs (message, args, stack), network entries (headers, URL, bodies), rrweb text nodes
- Per-category toggle config stored in chrome.storage.local
- Custom regex patterns support for company-specific redaction
- GDPR consent dialog shown on first popup open — must accept before recording starts
- Content script checks consent before initializing rrweb recorder
- Consent state persisted with version tracking for future consent version bumps

**Learnings:**
- rrweb text node redaction requires deep traversal of snapshot objects, targeting textContent/value/text keys
- PII_PATTERNS from shared package use global regex flags — must re-create or use replace() which resets lastIndex
- Consent check in content script uses async main() — WXT supports this in defineContentScript

---

## [2026-04-15] — Task T-029: Quick Capture Flow (Zero Friction)
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/server/routers/quick-capture.ts (created — QuickCapture tRPC router)
- apps/web/src/server/routers/_app.ts (modified — added quickCapture router)
- apps/web/src/app/api/extension/quick-capture/route.ts (created — REST endpoint for extension)
- apps/extension/src/lib/environment.ts (created — auto-detect browser, OS, viewport, framework)
- apps/extension/src/lib/capture.ts (created — capture orchestrator + submitQuickCapture)
- apps/extension/src/components/QuickCapture.tsx (created — multi-state Quick Capture UI)
- apps/extension/src/components/NotLoggedIn.tsx (modified — integrated QuickCapture)
- apps/extension/src/components/NoCompany.tsx (modified — integrated QuickCapture)
- apps/extension/src/components/FullMode.tsx (modified — integrated QuickCapture + performCapture)
- apps/extension/src/entrypoints/content.ts (modified — added GET_ENVIRONMENT handler)

**What Was Implemented:**
- Capture orchestrator: snapshots rrweb buffer + console + network + screenshot + environment in one call
- PII redaction applied to all captured data before upload
- Environment auto-detection: URL, browser/version, OS, viewport, devicePixelRatio, framework (Next.js, React, Vue, Angular, Svelte, Astro, Nuxt)
- QuickCapture tRPC router: create (public, anon allowed), getBySlug (with password/expiry check), list (user's captures)
- REST endpoint /api/extension/quick-capture for direct extension calls
- Multi-state popup UI: idle → capturing → form → uploading → success/error
- Form with optional title/description, capture summary badges, environment preview
- Password protection toggle, shareable link with copy button
- Expiry rules: 24hr anonymous, 30 days free signed-in
- Quick Capture accessible from all 3 popup modes (not logged in, no company, full)

**Learnings:**
- Prisma Json fields need `as any` cast for `Record<string, unknown>` — TypeScript strict mode doesn't like the union type
- REST API endpoint needed alongside tRPC for extension (cross-origin direct fetch is simpler than setting up tRPC client in extension)
- Environment detection must run in content script context (has access to window/document), not service worker

---

## 2026-04-15 — T-007: Better Auth — Password Reset and Email Verification

**Files changed:**
- `apps/web/src/lib/email.ts` (NEW) — Resend client, sendEmail, sendPasswordResetEmail, sendVerificationEmail
- `apps/web/src/lib/auth.ts` — Import email functions, replace TODO console.logs with actual email sending
- `apps/web/package.json` — Added `resend` dependency

**What was implemented:**
- Resend email client initialized from `RESEND_API_KEY` env var
- `sendEmail()` generic function with graceful fallback (console.warn) when API key not set
- `sendPasswordResetEmail(to, resetUrl)` — branded HTML template with reset button
- `sendVerificationEmail(to, verifyUrl)` — branded HTML template with verify button
- From address configurable via `EMAIL_FROM` env (default: `noreply@bugdetector.io`)
- auth.ts updated to call email functions while keeping console.log for dev observability
- Typecheck passes clean

**Learnings:**
- Resend client returns `{ error }` on failure — check and throw for proper error propagation
- Keep console.log alongside email send (not as fallback) for server-side observability in dev

---

## 2026-04-15 — T-048: Regression Suite and Test Case CRUD

**Files created:**
- `apps/web/src/server/routers/regression.ts`

**Files modified:**
- `STATUS.json` — marked T-048 completed

**What was implemented:**
- `regressionRouter` with 11 tRPC procedures:
  - Suite: `suiteCreate`, `suiteList`, `suiteGetById`, `suiteUpdate`, `suiteDelete`
  - TestCase: `testCaseCreate`, `testCaseList`, `testCaseGetById`, `testCaseUpdate`, `testCaseLinkBug`, `testCaseUnlinkBug`
- Write operations use `requirePermission('manage_projects')`, reads use `companyProcedure`
- Company ownership validated by traversing suite → project → company_id chain
- Suite list includes `_count` for test_cases and runs
- Test case list supports filters: tier, priority, folder, automated, search
- Test case getById includes bug_links with issue details and assignments
- Bug link requires `foundInRunId` (required by Prisma schema's `TestCaseBugLink.found_in_run_id`)
- Duplicate link prevention on `testCaseLinkBug`

**Learnings:**
- RegressionSuite model in Prisma does NOT have `tier` or `archived` fields — task description mentioned them but actual schema differs. Adapted accordingly: no tier on suite, hard delete instead of soft delete.
- TestCaseBugLink requires `found_in_run_id` (relation to RegressionRun), so linkBug needs a run context.

---

## [2026-04-15] — Task T-039: MCP Server Package — Core Bug Tools
**Status:** completed
**Iteration:** 1
**Files Changed:**
- packages/mcp-server/package.json (updated — added type:module, exports, bin, engines, keywords, @modelcontextprotocol/sdk + zod deps, @types/node devDep)
- packages/mcp-server/tsconfig.json (updated — explicit module/target for ESM)
- packages/mcp-server/src/index.ts (rewritten — McpServer setup with StdioServerTransport, startServer export, CLI entry point)
- packages/mcp-server/src/api-client.ts (created — HTTP client with Bearer auth, error handling for 401/403/404)
- packages/mcp-server/src/tools.ts (created — 6 MCP tools: list_bugs, get_bug, create_bug, update_bug, add_comment, search_bugs)

**What was implemented:**
- MCP server using `McpServer` from `@modelcontextprotocol/sdk` v1.29 with `StdioServerTransport`
- `ApiClient` class that reads `NOBUG_API_KEY` (nb_key_ prefix) and `NOBUG_API_URL` from env vars
- All 6 bug tools registered via `registerTool()` with Zod input schemas and detailed AI-friendly descriptions
- Tools call `/api/v1/*` REST endpoints (to be implemented in T-041)
- Package is executable via `npx @nobug/mcp-server` with shebang in dist/index.js
- Exports `createServer()` and `startServer()` for programmatic use

**Learnings:**
- MCP SDK v1.29 uses `registerTool()` (not deprecated `tool()`) with config object: `{ title, description, inputSchema, outputSchema, annotations }`
- `inputSchema` accepts Zod raw shapes (object with z.string(), z.number(), etc.) — NOT z.object()
- MCP SDK is ESM-only (`"type": "module"` required), needs `.js` extensions in imports
- `StdioServerTransport` is in `@modelcontextprotocol/sdk/server/stdio.js` (subpath export)
- REST API routes for MCP: Next.js App Router route handlers under `apps/web/src/app/api/v1/` — authenticate via `validateApiKey`, scope all queries to `company_id`

---

## 2026-04-15 — T-041: Backend REST API Routes for MCP

**Files created:**
- `apps/web/src/app/api/v1/bugs/route.ts` — GET (list with filters/pagination) + POST (create bug)
- `apps/web/src/app/api/v1/bugs/search/route.ts` — GET (search by query string)
- `apps/web/src/app/api/v1/bugs/[id]/route.ts` — GET (detail with comments/recordings/screenshots) + PATCH (update)
- `apps/web/src/app/api/v1/bugs/[id]/comments/route.ts` — POST (add comment)

**What was implemented:**
- 6 REST API endpoints that the MCP server package (`@nobug/mcp-server`) calls via its ApiClient
- All routes authenticate via `Authorization: Bearer nb_key_...` header using existing `validateApiKey`
- Company-scoped queries — API key provides `company_id`, optionally `project_id`
- Write operations check `permissions.write` on the API key
- Pagination with `page`, `limit`, `total`, `has_more` on list/search endpoints
- Search uses case-insensitive contains on title + description (same as tRPC issue.list)
- Reporter set to API key ID with `AGENT` type on create
- Comment author set to API key ID with `AGENT` type

**Learnings:**
- Next.js 15 App Router dynamic route params are now `Promise<{ id: string }>` (must await)
- REST routes mirror tRPC router logic but with simpler auth (API key vs session+membership)

---

## [2026-04-15] — Task T-040: MCP Server — Regression and Agent Tools
**Status:** completed
**Iteration:** 1
**Files Changed:**
- packages/mcp-server/src/tools.ts (modified — added 8 new MCP tools + 5 interface types)
- packages/mcp-server/src/api-client.ts (modified — added put() method)

**What Was Implemented:**
- 5 regression tools: list_regression_suites, get_regression_suite, create_regression_run, submit_test_result, get_run_summary
- 3 agent tools: get_agent_tasks, update_agent_task, claim_agent_task
- All tools follow same registerTool pattern as existing 6 bug tools
- Zod input validation with descriptive field descriptions for AI agents
- REST endpoints: /api/v1/regression/* and /api/v1/agents/* (to be created in future tasks)
- TypeScript interfaces: RegressionSuite, RegressionRun, TestResult, RunSummary, AgentTask
- Added put() to ApiClient for completeness

**Learnings:**
- MCP tools for regression and agent workflows follow identical pattern to bug tools — consistency is key for AI agent usability

---

## [2026-04-15] — Task T-051: Rate Limiting and Security Headers
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/lib/rate-limit.ts (created — rate limiting utility with 3 preset limiters)
- apps/web/src/lib/security-headers.ts (created — security headers helper)
- apps/web/src/middleware.ts (modified — added security headers + rate limiting)
- apps/web/package.json (modified — added rate-limiter-flexible dependency)

**What was implemented:**
- In-memory rate limiting using rate-limiter-flexible (RateLimiterMemory)
- Three preset limiters: authLimiter (5/min), apiLimiter (100/min), quickCaptureLimiter (10/hr)
- Generic rateLimit() helper that returns success/failure with retryAfter
- Security headers applied to all responses (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy)
- HSTS header only in production
- Rate limiting applied to /api/auth/* and /api/extension/quick-capture in middleware
- 429 Too Many Requests responses include Retry-After header
- Middleware matcher expanded to cover API routes (previously excluded /api/auth)

**Learnings:**
- NextRequest.ip is not available in Next.js 15 types — use x-forwarded-for/x-real-ip headers instead
- Edge middleware cannot use Node.js-only modules; rate-limiter-flexible's RateLimiterMemory works fine in edge runtime

---

## [2026-04-15] — Task T-042: Integration Adapter Framework
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/server/integrations/types.ts (created — IntegrationAdapter interface + supporting types)
- apps/web/src/server/integrations/base-adapter.ts (created — abstract base with retry, logging, error handling)
- apps/web/src/server/integrations/registry.ts (created — provider-to-adapter factory registry)
- apps/web/src/server/integrations/adapters/github.ts (created — stub GitHub adapter)
- apps/web/src/server/integrations/adapters/jira.ts (created — stub Jira adapter)
- apps/web/src/server/integrations/adapters/slack.ts (created — stub Slack adapter)
- apps/web/src/server/integrations/index.ts (created — barrel exports)
- apps/web/src/server/routers/integration.ts (created — tRPC router with 8 procedures)

**What Was Implemented:**
- IntegrationAdapter interface with connection lifecycle, issue sync, and webhook handling
- BaseAdapter abstract class with structured logging, exponential backoff retry, ensureConnected guard
- IntegrationError class with retryable flag and status code
- Adapter registry with getAdapter/hasAdapter/registerAdapter/getAvailableProviders
- Stub adapters for GitHub (T-043), Jira (T-044), Slack (T-046) — all throw "not implemented"
- tRPC router: create, list, getById, testConnection, delete, toggleEnabled, syncIssue, availableProviders
- Write ops use requirePermission('manage_integrations'), reads use companyProcedure
- syncIssue creates or updates ExternalRef records with sync_status tracking

**Learnings:**
- Prisma JSON fields need `as Prisma.InputJsonValue` cast when receiving `z.record(z.unknown())` input
- Import `Prisma` type from `@nobug/db` (not `@prisma/client`) since the db package re-exports everything
- Did NOT modify `_app.ts` per task instructions — router must be wired up separately

---

## Iteration — 2026-04-15 — T-050 Smart Re-Testing and Flaky Test Detection

**Files created:**
- `apps/web/src/server/routers/regression-analytics.ts`

**Files modified:**
- `STATUS.json` — marked T-050 completed
- `progress.md` — this entry

**What was implemented:**
- `regressionAnalyticsRouter` with 6 procedures:
  1. `detectFlaky` — analyzes last N completed runs, calculates flaky_score = failCount/totalRuns for mixed PASS/FAIL cases, batch updates TestCase.flaky_score
  2. `getFlakyCases` — lists test cases by flaky_score descending with threshold filter
  3. `suggestRetest` — finds failed test cases with flaky_score > 0.3 from a completed run
  4. `createRetestRun` — creates a new RegressionRun with retest metadata in stats_json
  5. `testCaseHistory` — returns pass/fail history for a test case across runs
  6. `suiteHealthReport` — aggregates totalCases, flakyCount, avgPassRate, lastRunDate, coverageByTier

**Learnings:**
- Reused `verifySuiteOwnership` and `verifyRunOwnership` helper patterns from `regression-run.ts`
- Used `Promise.all` for batch flaky_score updates to avoid sequential DB calls
- RegressionRun.trigger enum is `RunTrigger` (MANUAL/DEPLOY_WEBHOOK/SCHEDULED) — stored RETEST info in stats_json.retest_of instead of adding enum value
- Did NOT modify `_app.ts` per task instructions — router must be wired up separately

---

## [2026-04-15] — Task T-052: Sentry Observability and Structured Logging
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/sentry.client.config.ts (created — browser-side Sentry init with replay)
- apps/web/sentry.server.config.ts (created — server-side Sentry init)
- apps/web/sentry.edge.config.ts (created — edge runtime Sentry init)
- apps/web/src/lib/logger.ts (created — structured logging with Sentry integration)
- apps/web/src/app/global-error.tsx (created — Next.js global error boundary)
- apps/web/next.config.ts (modified — wrapped with withSentryConfig)
- apps/web/package.json (modified — added @sentry/nextjs dependency)

**What Was Implemented:**
- Sentry client/server/edge config files that read DSN from NEXT_PUBLIC_SENTRY_DSN, gracefully no-op when not set
- Client config includes replay integration (0.1 session rate, 1.0 error rate) with text masking and media blocking
- Traces sample rate: 0.1 in production, 1.0 in development
- Structured logger with createLogger(namespace) factory — debug/info/warn/error levels
- Dev mode: colored console output with namespace prefix; Production: JSON format for log aggregation
- logger.error() auto-reports to Sentry (captureException for Error objects, captureMessage otherwise)
- Global error boundary reports unhandled errors to Sentry and shows user-friendly reset UI
- next.config.ts conditionally wraps with withSentryConfig only when DSN is set
- Source map upload disabled when SENTRY_AUTH_TOKEN is not set
- Build verified passing with `pnpm turbo build --filter=@nobug/web`

**Learnings:**
- @sentry/nextjs withSentryConfig can be conditionally applied — check env var at config time
- Sentry sourcemaps.disable option prevents upload failures when no auth token is configured
- Logger Sentry calls (captureException/captureMessage) are no-ops when Sentry isn't initialized — safe to call unconditionally

---

## [2026-04-15] — Task T-054: Company and Project Settings Pages
**Status:** completed
**Iteration:** 1
**Files Created:**
- apps/web/src/components/settings/settings-shell.tsx (shared SettingsShell, SettingsSection, DangerZone, SettingsCard components)
- apps/web/src/components/settings/confirm-dialog.tsx (reusable confirmation dialog)
- apps/web/src/app/(dashboard)/[companySlug]/settings/page.tsx (company settings: name/slug editor, logo placeholder, plan display, danger zone)
- apps/web/src/app/(dashboard)/[companySlug]/settings/members/page.tsx (members: invitation list, invite modal, resend/revoke, role display)
- apps/web/src/app/(dashboard)/[companySlug]/[projectKey]/settings/page.tsx (project settings: name/description editor, JSON settings editor, archive)
- apps/web/src/app/(dashboard)/[companySlug]/settings/api-keys/page.tsx (API keys: list, generate with copy-once, revoke, usage docs)

**What was implemented:**
- 4 settings pages under (dashboard) route group with dark theme styling
- Shared settings layout components for consistent UI across all settings pages
- All pages use tRPC client queries/mutations for data operations
- Loading states with Skeleton, error states, empty states
- Confirmation dialogs for destructive actions (delete company, archive project, revoke key/invitation)
- API key page shows key exactly once with copy button and warning
- Members page integrates with invitation router (create, list, resend, revoke)
- Project settings includes JSON editor for advanced configuration

**Learnings:**
- company.getBySlug returns currentUserRole and _count — sufficient for permission checks in UI
- companyProcedure requires { companyId } input — all company-scoped mutations need this
- invitation.create uses requirePermission('manage_members') which chains companyProcedure — needs companyId in input
- apiKey.list/generate/revoke use requirePermission('manage_api_keys') — also needs companyId

---

### 2026-04-15 — T-044: Jira 2-Way Sync

**Files changed:**
- `apps/web/src/server/integrations/adapters/jira.ts` — replaced stub with full implementation

**What was implemented:**
- Full Jira REST API v3 adapter extending BaseAdapter
- `connect()` — validates credentials via GET /rest/api/3/myself on connect
- `disconnect()` — delegates to BaseAdapter (clears config/auth)
- `testConnection()` — calls /rest/api/3/myself, returns user display name
- `pushIssue()` — creates or updates Jira issues (create via POST, update via PUT); maps priority (CRITICAL/HIGH/MEDIUM/LOW to Highest/High/Medium/Low), converts description to ADF format, sets labels
- `pullIssue()` — fetches by issue key, maps fields back to IssueSyncData, extracts plain text from ADF descriptions
- `syncIssueStatus()` — fetches available transitions, finds matching transition by target status name, executes transition
- `handleWebhook()` — parses Jira webhook events (issue_created, issue_updated, issue_deleted), detects status changes via changelog
- Dual auth support: cloud (email+apiToken) and server (username+password) via Basic auth header
- Central `jiraFetch()` helper with auth/content-type headers
- Bidirectional priority and status mapping with fallback defaults
- Uses BaseAdapter's `withRetry()` for transient error resilience (429 rate limits)

**Learnings:**
- Jira Cloud requires ADF (Atlassian Document Format) for description fields — simple doc/paragraph/text structure
- Jira status changes require transitions, not direct field updates — must query available transitions first
- Jira status categories (new/indeterminate/done) are more reliable for mapping than status names (which are customizable per project)

---

### 2026-04-15 — T-046: Slack 2-Way Notifications

**Files changed:**
- `apps/web/src/server/integrations/adapters/slack.ts` — replaced stub with full implementation

**What was implemented:**
- Full Slack Web API adapter extending BaseAdapter using native fetch()
- `connect()` — validates bot token via auth.test, logs team/bot_id
- `disconnect()` — delegates to BaseAdapter
- `testConnection()` — calls auth.test with retry, returns bot user name
- `pushIssue()` — posts rich Block Kit messages (header, section fields for priority/status, assignee, description excerpt, divider, actions with View Bug button, context timestamp); updates existing messages via chat.update when externalId present in metadata; uses colored attachments for priority sidebar
- `pullIssue()` — returns minimal data (notification-only provider)
- `syncIssueStatus()` — posts threaded reply on original message with status emoji and text
- `handleWebhook()` — validates Slack signing secret headers (timestamp freshness, v0= format), handles url_verification challenge, block_actions for View Bug button clicks, /bugdetector slash command (help text or create_bug_from_slash action)
- Priority colors: CRITICAL=#ef4444, HIGH=#f97316, MEDIUM=#eab308, LOW=#3b82f6
- Status emojis for all issue states (OPEN, IN_PROGRESS, IN_REVIEW, RESOLVED, CLOSED, BACKLOG)
- Slack archive URL builder for message permalinks
- Rate limit detection (ok:false + error:ratelimited) triggers retryable error

**Learnings:**
- Slack returns HTTP 200 even for auth errors — must check response.ok field in JSON body
- Block Kit blocks go inside attachments (not top-level) when using colored sidebar
- Slack message permalinks use /archives/{channel}/p{ts_without_dot} format
- Full HMAC signature verification requires raw request body string — best done at route handler level, adapter validates structural requirements

---

### 2026-04-15 — T-043: GitHub Issues 2-Way Sync

**Files changed:**
- `apps/web/src/server/integrations/adapters/github.ts` — full implementation replacing stub
- `apps/web/package.json` — added `@octokit/rest` dependency

**What was implemented:**
- **connect** — validates GitHub token via `GET /user`, creates Octokit instance
- **disconnect** — clears Octokit instance, delegates to BaseAdapter
- **testConnection** — calls `GET /user`, returns login name on success
- **pushIssue** — creates or updates GitHub issues; maps BugDetector status to GitHub state (open/closed) with status labels for intermediate states; maps priority to labels (priority:critical/high/medium/low); supports update via `metadata.githubIssueNumber`
- **pullIssue** — fetches GitHub issue by number, reverse-maps labels back to BugDetector status/priority
- **syncIssueStatus** — updates GitHub issue state and swaps status labels atomically
- **handleWebhook** — HMAC-SHA256 signature verification with `X-Hub-Signature-256`, handles issues events (opened/closed/reopened/edited/labeled)

**Learnings:**
- GitHub issues only have two states (open/closed) — intermediate BugDetector statuses must be mapped via labels
- Webhook signature verification uses `timingSafeEqual` for constant-time comparison to prevent timing attacks
- GitHub issue creation always creates in "open" state — must follow up with a PATCH to close if target state is "closed"

---

## [2026-04-15] — Task T-053: GDPR Data Retention and Consent
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/lib/data-retention.ts (created — retention cleanup utilities)
- apps/web/src/server/routers/gdpr.ts (created — GDPR tRPC router with 7 procedures)

**What was implemented:**
- Data retention utility with 3 functions: cleanupExpiredCaptures, cleanupOldRecordings, anonymizeClosedIssues
- GDPR router with 7 procedures:
  - exportUserData: exports all user data (profile, memberships, issues, comments, recordings, screenshots, captures, notifications, sessions, activity logs, invitations) via Promise.all
  - deleteAccount: password-verified via better-auth/crypto verifyPassword, cascading deletion in transaction (anonymize issues/comments, delete recordings/screenshots/captures/notifications/activity/memberships/sessions/accounts/user)
  - getRetentionPolicy: reads latest RETENTION_POLICY_SET ActivityLog for company
  - updateRetentionPolicy: stores policy as ActivityLog entry (recording retention days, auto-delete captures, anonymize closed issues days)
  - runRetentionCleanup: manually triggers all 3 retention utility functions based on company policy
  - getConsentLog: paginated consent audit trail from ActivityLog
  - recordConsent: records CONSENT_GIVEN/CONSENT_REVOKED events with consent type enum

**Learnings:**
- Better Auth exports verifyPassword from `better-auth/crypto` (not `better-auth/crypto/password`)
- requirePermission() already chains off companyProcedure which includes companyId input — do not add redundant companyId input
- Retention policy stored as ActivityLog entries (action=RETENTION_POLICY_SET) avoids schema changes — latest entry wins

---

## [2026-04-15] — Task T-047: Webhooks and CI/CD Deploy Hooks
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/lib/webhook-sender.ts (new — webhook delivery utility with HMAC-SHA256 signing, retry logic)
- apps/web/src/server/routers/webhook.ts (new — tRPC router with 6 procedures + dispatchWebhooks helper)
- apps/web/src/app/api/webhooks/deploy/route.ts (new — inbound deploy hook REST endpoint)
- STATUS.json (updated)

**What was implemented:**
- `webhook-sender.ts`: `sendWebhook()` with HMAC-SHA256 signature in `X-NoBug-Signature` header, 3 retries with exponential backoff (1s/5s/30s), 10s timeout per attempt, delivery attempt logging
- `webhookRouter`: create (generates `whsec_` secret), list, update (url/events/enabled), delete, test (sends test.ping), listDeliveries (last 50 deliveries stored in config_json)
- Webhook config stored in Integration model with provider=WEBHOOK, config_json holds url/secret/events/enabled/deliveries
- `dispatchWebhooks()` exported helper: fire-and-forget delivery to all subscribed webhooks for a company+event
- Deploy hook at `/api/webhooks/deploy`: authenticates via `X-Deploy-Secret` header matched against company webhook integration's `deploy_hook_secret`, creates ActivityLog entry, triggers DEPLOY_WEBHOOK regression runs for all company suites, dispatches `deploy.completed` webhook
- Supported events: issue.created/updated/status_changed/assigned, comment.created, capture.created, regression.run_completed, deploy.completed

**Learnings:**
- Webhook delivery logs stored as JSON array in Integration.config_json (capped at 50 entries) avoids needing a separate table
- Deploy hook uses Integration config_json.deploy_hook_secret field for auth, separate from the webhook signing secret

## [2026-04-15] — Task T-031: S3 Upload Pipeline and Media Storage
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/lib/s3.ts (created — S3 client singleton, presigned URL generation, public URL helper)
- apps/web/src/server/routers/upload.ts (created — tRPC router with requestUploadUrl, confirmUpload, getDownloadUrl)
- apps/web/src/app/api/extension/upload/route.ts (created — REST endpoint mirroring tRPC for extension)
- apps/web/src/server/routers/_app.ts (modified — registered upload router)
- apps/web/.env.example (modified — added AWS S3 env vars)
- apps/web/package.json (modified — added @aws-sdk/client-s3, @aws-sdk/s3-request-presigner)

**What was implemented:**
- S3 client singleton (`getClient()`) initialized from env vars, returns null when not configured (graceful local dev)
- `isS3Configured()` check used by all functions to no-op safely
- `generateUploadUrl()` creates presigned PUT URLs (15 min expiry) with content-type and gzip encoding for JSON types
- `generateDownloadUrl()` creates presigned GET URLs (1 hour expiry)
- `getPublicUrl()` for Quick Capture viewer (public-read pattern)
- `buildObjectKey()` creates S3 keys: `{env}/{companyId}/{type}/{fileId}.{ext}` (with `.gz` suffix for gzip types)
- tRPC `upload.requestUploadUrl` validates size limits from @nobug/shared, generates presigned URL + download URL
- tRPC `upload.confirmUpload` creates Recording/Screenshot DB records, updates QuickCapture URLs for console/network logs
- tRPC `upload.getDownloadUrl` returns fresh presigned download URL
- REST POST `/api/extension/upload` mirrors requestUploadUrl with session cookie + API key auth
- UploadType: recordings, console-logs, network-logs, screenshots, annotated-screenshots

**Learnings:**
- S3 presigned URLs bypass the backend entirely — extension/client uploads directly to S3
- Gzip content-encoding set only for JSON-based types (recordings, console-logs, network-logs)
- Prisma JSON fields need explicit `as Prisma.InputJsonValue` cast for `z.record(z.unknown())` inputs
- REST extension endpoint validates same size limits as tRPC to prevent bypassing

---

## [2026-04-15] — Task T-032: Service Worker Lifecycle and IndexedDB Retry
**Status:** completed
**Iteration:** 1
**Files Created:**
- apps/extension/src/lib/db.ts (Dexie.js IndexedDB schema — pendingUploads + captureHistory tables)
- apps/extension/src/lib/upload-queue.ts (upload queue with exponential backoff retry)
- apps/extension/src/lib/useUploadQueue.ts (React hook for popup queue status display)

**Files Modified:**
- apps/extension/src/entrypoints/background.ts (added queue processing on install/startup/alarm/reconnect, QUEUE_STATUS/RETRY_QUEUE/CLEAR_FAILED_UPLOADS message handlers)
- apps/extension/wxt.config.ts (added 'alarms' permission)
- apps/extension/src/lib/types.ts (added QUEUE_STATUS, RETRY_QUEUE, CLEAR_FAILED_UPLOADS message types)
- apps/extension/package.json (added dexie dependency)

**What was implemented:**
- Dexie.js IndexedDB database `nobug_extension` with two tables:
  - `pendingUploads`: id, type, data, captureId, createdAt, retryCount, lastRetryAt, status — indexed by status and captureId
  - `captureHistory`: id, slug, title, shareUrl, screenshotThumb, createdAt, type — auto-prunes to 50 entries
- Upload queue (`upload-queue.ts`) with:
  - `enqueueUpload()` stores data in IndexedDB
  - `processQueue()` idempotent processing with exponential backoff (1m/5m/30m/2hr), max 5 retries
  - `getQueueStatus()` returns pending/uploading/failed counts
  - `clearFailedUploads()` removes permanently failed items
  - Badge count updates on extension icon for pending uploads
  - Actual S3 upload via presigned URLs from `/api/extension/upload`
- Service worker lifecycle:
  - `chrome.alarms` every 5 minutes triggers `processQueue()`
  - `self.addEventListener('online')` triggers queue on network reconnect
  - `onInstalled` and startup both process queue
  - Login completion triggers queue processing
- React hook `useUploadQueue` polls service worker every 10s for queue status

**Learnings:**
- Dexie.js EntityTable generic provides typed table access — `EntityTable<PendingUpload, 'id'>` for auto-increment primary key
- Service workers can listen for `online` event via `self.addEventListener('online')` for network reconnect detection
- chrome.alarms requires 'alarms' permission in manifest — minimum interval is 1 minute in production, but periodInMinutes works with 5
- Badge management needs care when both recording state and queue count use the badge — queue only overwrites non-recording badges

---

### 2026-04-15 — T-045: Azure DevOps 2-Way Sync

**Files changed:**
- `apps/web/src/server/integrations/adapters/azure-devops.ts` (CREATED)
- `apps/web/src/server/integrations/registry.ts` (modified — added AZURE_DEVOPS registration)
- `STATUS.json` (updated T-045 status)

**What was implemented:**
- Azure DevOps adapter extending BaseAdapter with full 2-way work item sync
- connect: validates PAT via GET /_apis/projects, stores org + project config
- disconnect: clears stored auth via super.disconnect()
- testConnection: verifies PAT validity by listing projects
- pushIssue: creates or updates work items using JSON Patch operations (System.Title, System.Description as HTML, Microsoft.VSTS.Common.Priority 1-4, System.State)
- pullIssue: fetches work item by ID, maps all fields back to IssueSyncData
- syncIssueStatus: updates just the System.State field
- handleWebhook: parses Azure DevOps service hook payloads (publisherId: tfs, workitem.created/updated/deleted)
- Registered adapter in registry as AZURE_DEVOPS

**Learnings:**
- Azure DevOps REST API uses JSON Patch (Content-Type: application/json-patch+json) for work item create/update — array of {op, path, value} operations
- PAT auth uses Basic auth with empty username: `Basic ${Buffer.from(':' + pat).toString('base64')}`
- New work items cannot set System.State at creation time in some process templates — must create first then update state separately
- Azure DevOps webhook payloads have publisherId 'tfs' and work item ID can be at resource.id, resource.workItemId, or resource.revision.id depending on event type

---

## [2026-04-15] — Task T-030: Full Platform Bug Submission Flow
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/extension/src/components/FullCapture.tsx (created — full platform capture + issue creation UI)
- apps/extension/src/components/FullMode.tsx (modified — wire Capture Bug to show FullCapture)
- apps/web/src/app/api/extension/projects/route.ts (created — GET projects for company)
- apps/web/src/app/api/extension/assignees/route.ts (created — GET members + agents for company)
- apps/web/src/app/api/extension/create-issue/route.ts (created — POST create issue from extension)

**What Was Implemented:**
- FullCapture component: multi-state UI (capturing/form/submitting/success/error), reuses performCapture() from capture.ts
- Form fields: title (required), AI description placeholder, optional notes, project selector, priority selector, assignee selector (members + agents grouped), labels multi-select, integration sync placeholder
- Three REST API endpoints for extension use: projects (company-scoped), assignees (members + agents), create-issue (full issue creation with activity log, agent task)
- All endpoints support dual auth: session cookie (credentials: include) and API key Bearer token
- FullMode updated: Capture Bug button now opens FullCapture flow instead of just calling performCapture
- Success state shows issue key, URL with copy button, and View Issue link

**Learnings:**
- User model uses `avatar_url` not `image` — Better Auth maps differently than typical NextAuth conventions
- AgentTaskType enum has BUG_ANALYSIS, CODE_REVIEW, etc. — not FIX_BUG (check schema enums before using string literals)
- Recording/Screenshot Prisma models require non-nullable uploader_id and storage_url — cannot create placeholder records without S3 URLs; media records should be created after S3 upload via the upload pipeline
- Extension REST endpoints follow pattern: auth check (API key or session) -> membership verification -> business logic -> JSON response

---

## [2026-04-15] — Task T-033: rrweb Replay Viewer Component
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/components/replay/ReplayViewer.tsx (created -- main rrweb player wrapper)
- apps/web/src/components/replay/ReplayControls.tsx (created -- custom playback controls)
- apps/web/src/app/(dashboard)/[companySlug]/[projectKey]/issues/[issueNumber]/recording/[recordingId]/page.tsx (created -- recording viewer page)
- apps/web/src/app/b/[slug]/page.tsx (created -- Quick Capture public viewer)
- apps/web/package.json (modified -- added rrweb-player and rrweb deps)

**What Was Implemented:**
- ReplayViewer component: dynamically imports rrweb-player (client-side only), responsive sizing via ResizeObserver, loading/error/empty states, dark theme, CSS override for hiding built-in controls
- ReplayControls component: play/pause, speed cycling (1x/2x/4x), seek bar with click-to-jump, time display, fullscreen toggle
- Recording viewer page: fetches recording by ID from issue data, gets S3 download URL via tRPC, decompresses gzip if needed, shows metadata (duration, event count, page URL, timestamp)
- Quick Capture viewer page: public (no auth), password prompt if protected, tabbed layout (Recording/Console/Network/Screenshot/Environment), fetches all data types from S3 URLs, console/network log panels with syntax coloring

**Learnings:**
- rrweb v2 alpha exports `eventWithTime` from `@rrweb/types` (transitive dep), not from `rrweb` directly -- use a local type alias to avoid adding another dep
- rrweb-player CSS needs dynamic import with `@ts-expect-error` since the `.css` module has no type declarations
- rrweb-player constructor takes `{ target, props }` pattern (Svelte component) -- use `$set()` for runtime updates
- `Uint8Array[]` is not assignable to `BlobPart[]` in strict TS -- cast through `unknown` at the boundary
- The `@next/next/no-img-element` ESLint rule is not available in the project's ESLint config -- avoid referencing it

## [2026-04-15] -- Task T-034: Synchronized Timeline with Console/Network Panels
**Status:** completed

**Files created:**
- `apps/web/src/components/replay/Timeline.tsx` -- Master timeline with markers, zoom, seek
- `apps/web/src/components/replay/ConsolePanel.tsx` -- Virtualized console log viewer with filters
- `apps/web/src/components/replay/NetworkPanel.tsx` -- Network request table with waterfall bars
- `apps/web/src/components/replay/SyncedViewer.tsx` -- Layout component orchestrating all panels

**What was implemented:**
- Timeline component with color-coded markers (console errors red, network failures orange, clicks blue, navigations green), zoom in/out/reset, time labels, click-to-seek, playhead indicator
- ConsolePanel with level filter buttons (All/Error/Warn/Info/Debug) with counts, text search, virtualized window of ±50 entries around current time, auto-scroll to active entry, expandable args and stack traces, color-coded by level
- NetworkPanel with status (all/success/failed) and method (GET/POST/PUT/PATCH/DELETE) filters, URL search, table with method/URL/status/duration/size/waterfall columns, expandable row detail with request/response headers and timing, failed requests highlighted red
- SyncedViewer orchestrates ReplayViewer + Timeline + tabbed Console/Network panels with time synchronization via DOM polling of ReplayViewer's seek bar aria-valuenow, and seek-back via simulated click events on the seek bar

**Learnings:**
- Since ReplayViewer cannot be modified (task constraint), synchronization is achieved by polling the seek bar's `aria-valuenow` attribute and simulating click events for seek-back -- a pragmatic approach that avoids modifying existing components
- Console/network entries use performance.now() timestamps that align with rrweb events; offset from first rrweb event timestamp gives the playback position
- rrweb event type 3 (IncrementalSnapshot) with data.source=2 (MouseInteraction) and data.type=2 represents clicks; type 4 (Meta) with data.href represents navigation

---

## [2026-04-16] — Task T-035: Environment Info Panel and Screenshot Gallery
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/components/replay/EnvironmentPanel.tsx (created)
- apps/web/src/components/replay/ScreenshotGallery.tsx (created)
- apps/web/src/components/replay/BugDetailSidebar.tsx (created)

**What Was Implemented:**
- EnvironmentPanel: Responsive 2-column grid displaying page URL (clickable with copy button), browser+version, OS (with mobile icon detection), viewport dimensions, device pixel ratio, framework (as colored badge), capture timestamp, and collapsible user agent. Handles null/missing fields gracefully.
- ScreenshotGallery: Grid of 2-3 thumbnails per row with hover zoom effect and annotated badge. Full lightbox with fixed overlay, keyboard navigation (arrows, Escape), scroll-to-zoom, click-and-drag pan at zoom>1, original/annotated toggle, download button, bottom thumbnail strip. Empty state with icon.
- BugDetailSidebar: Combines EnvironmentPanel + ScreenshotGallery + recording info into collapsible sidebar sections. Recording info shows duration, event count, file size. Capture metadata shows timestamp and mode (quick/full badge). Shareable link with copy button. "Promote to Issue" button for Quick Captures.

**Learnings:**
- EnvironmentInfo interface matches the extension's collectEnvironment() output shape from apps/extension/src/lib/environment.ts
- Pre-existing build error in ShareDialog.tsx (references nonexistent `share` tRPC router) does not affect these components; tsc --noEmit passes cleanly

---

## [2026-04-16] — Task T-036: Public Shareable Links and Promote-to-Issue
**Status:** completed
**Iteration:** 1
**Files Changed:**
- apps/web/src/server/routers/share.ts (created — shareRouter with 7 procedures)
- apps/web/src/server/routers/_app.ts (modified — added shareRouter registration)
- apps/web/src/components/share/ShareDialog.tsx (created — share dialog with URL copy, QR, embed, email, Slack, password, expiry)
- apps/web/src/components/share/PromoteToIssue.tsx (created — promote dialog with project/priority/assignee/label selection)
- apps/web/src/app/(dashboard)/[companySlug]/captures/page.tsx (created — captures list page with filtering)

**What Was Implemented:**
- tRPC shareRouter with 7 procedures: setPassword, removePassword, updateExpiry, getShareInfo, promoteToIssue, deleteCapture, listCaptures
- ShareDialog component: read-only URL field with copy button, QR code (SVG-based generator), password protection toggle, expiry extension (+7/30/90 days), embed code snippet, social share (email mailto:, Slack deep link, open in new tab)
- PromoteToIssue component: project selector, title (pre-filled from capture), priority, type, assignee (unified members+agents from listAssignable), labels for selected project. Creates Issue with linked Recording and Screenshot records. Updates QuickCapture.converted_to_issue_id. Success state shows issue link.
- Captures list page: grid with thumbnail, title, date, view count, expiry, password badge, promoted badge. Filter tabs (all/active/expired). Actions: copy link, share settings dialog, open, promote to issue, delete with confirmation. Infinite scroll pagination.
- promoteToIssue creates Recording (with console_logs_url, network_logs_url, environment_json) and Screenshot records linked to the new Issue.

**Learnings:**
- agent.listAssignable returns { members: [...], agents: [...] } object, not a flat array — need to spread both into a unified list for assignee dropdowns
- Share URL format: {APP_URL}/b/{slug}, embed URL: {APP_URL}/b/{slug}/embed
- protectedProcedure (user-owned operations) vs requirePermission('create_issue') (company-scoped promote) for different auth levels

## [2026-04-15] — Task T-055: End-to-End Smoke Test Suite
**Status:** completed

**Files changed:**
- `apps/web/playwright.config.ts` (new) — Playwright configuration with baseURL, timeouts, chromium project
- `apps/web/tests/smoke/helpers.ts` (new) — Test helpers: createTestUser, loginAs, createCompanyAndProject, generateApiKey
- `apps/web/tests/smoke/smoke.spec.ts` (new) — 15 test describe blocks: 5 implemented (auth, company, invitation, issue, board), 10 skipped stubs
- `apps/web/tests/smoke/README.md` (new) — Manual smoke test checklist with all 15 test cases, steps, and expected results
- `apps/web/package.json` (modified) — Added @playwright/test devDep and test:e2e script

**What was implemented:**
- Complete manual smoke test documentation with 15 test cases (ST-001 through ST-015) covering registration, company/project setup, invitations, issue CRUD, board view, extension flows, bug viewer, shareable links, promote-to-issue, dev/QA testing, MCP server, and regression testing
- Playwright config with baseURL from env, single chromium project, serial execution
- Test helpers for user registration, login, company+project creation, and API key generation
- 5 fully implemented Playwright tests using real selectors matching the app's UI patterns
- 10 skipped test stubs with detailed TODO comments describing what each test should verify
- Playwright successfully discovers all 9 active tests

**Learnings:**
- Playwright test.skip(true, 'reason') in a describe block skips the entire block and excludes from --list output
- test.describe.serial ensures shared state flows correctly between dependent tests
- Extension-related tests (ST-006 through ST-008) require chromium launch args for extension loading — cannot be tested with standard Playwright config

## [2026-04-15] — Task T-037: Dev Testing Flow with Recording Attachment
**Status:** completed

**Files created:**
- `apps/extension/src/components/AttachToIssue.tsx` — Extension UI for attaching recording to existing issue
- `apps/web/src/app/api/extension/attach-recording/route.ts` — REST endpoint to attach recording to issue
- `apps/web/src/app/api/extension/search-issues/route.ts` — REST endpoint for issue search
- `apps/web/src/server/routers/testing-workflow.ts` — tRPC router with moveToDevTesting, markReadyForQA, getTestingTimeline

**Files modified:**
- `apps/web/src/server/routers/_app.ts` — Added testingWorkflowRouter
- `apps/extension/src/components/FullMode.tsx` — Added "Attach to Issue" button

**What was implemented:**
- AttachToIssue extension component: captures test data via performCapture(), debounced issue search (by title or #number), recording type selector (DEV_TEST/QA_TEST), attach flow with success/error states
- attach-recording REST endpoint: creates Recording record, IssueComment (RECORDING_ATTACHED type), ActivityLog entry. Session + API key auth
- search-issues REST endpoint: search by title (case-insensitive) or by issue number (#N), company-scoped, optional project filter
- testingWorkflowRouter tRPC router: moveToDevTesting (IN_PROGRESS->DEV_TESTING with validation), markReadyForQA (DEV_TESTING->QA_TESTING), getTestingTimeline (unified chronological view of recordings + activity + comments)
- Status transition validation: rejects invalid transitions (e.g., can't go to DEV_TESTING unless IN_PROGRESS)
- Notifications: moveToDevTesting notifies reporter, markReadyForQA notifies QA role members + assignee

**Learnings:**
- Extension search-issues endpoint supports both title search (contains, case-insensitive) and issue number search (#N pattern) — check with regex first
- Testing workflow status transitions use a validation pattern: check current status before allowing transition, throw BAD_REQUEST with descriptive message if invalid

## [2026-04-15] — Task T-038: QA Testing Flow with Pass/Fail and Reopen
**Status:** completed

**Files changed:**
- `apps/web/src/server/routers/testing-workflow.ts` — added 4 procedures (submitQAVerdict, getQAContext, getReopenCount, getQAQueue)
- `apps/web/src/components/testing/QAVerdict.tsx` — created QA verdict component
- `apps/web/src/components/testing/TestingTimeline.tsx` — created visual testing timeline component
- `STATUS.json` — T-038 completed, 55/55 tasks done

**What was implemented:**
- submitQAVerdict: PASS closes issue, FAIL reopens. Creates ActivityLog + IssueComment with verdict. Notifies reporter + assignee. Links QA recording if provided. Status validation (must be QA_TESTING)
- getQAContext: returns original bug report, all recordings, comments, assignee info, reopen count, testing timeline
- getReopenCount: counts ActivityLog entries where status changed to REOPENED (uses Prisma JSON path filter)
- getQAQueue: lists QA_TESTING issues for a project, sorted by priority then updated_at
- QAVerdict component: shows bug summary, dev recordings, reopen count warning, pass/fail buttons with confirmation dialog, required notes on FAIL
- TestingTimeline component: lifecycle stage progress bar (Bug Report -> Dev Fix -> Dev Test -> QA Test -> Closed), color-coded (green=complete, blue=current, red=reopened), chronological activity log with recording links

**Learnings:**
- Prisma JSON path filtering (`metadata_json: { path: ['to'], equals: 'REOPENED' }`) works for counting specific status transitions in ActivityLog
- QA verdict pattern: PASS closes, FAIL reopens back to assignee's queue — the reopen cycle (REOPENED -> IN_PROGRESS -> DEV_TESTING -> QA_TESTING) reuses existing transition procedures
