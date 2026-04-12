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
