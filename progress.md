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
