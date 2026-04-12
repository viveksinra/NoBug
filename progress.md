# BugDetector -- Progress & Learnings Log

> This file is APPEND-ONLY. Never replace existing entries. Add new entries at the bottom.
> The "Codebase Patterns" section at the top is updated as general patterns are discovered.

---

## Codebase Patterns

> Consolidate reusable patterns here. Read this section FIRST before starting any task.
> These patterns apply across the entire codebase.

_(No patterns discovered yet — will be populated during execution)_

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
