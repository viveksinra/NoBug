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
