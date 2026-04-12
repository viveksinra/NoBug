# BugDetector Ralph Loop Prompt

You are building BugDetector, an AI-native bug tracking platform.

## Your Protocol

1. Read `STATUS.json` to find your current task (the first task where `status` is `"pending"` and all `depends_on` tasks have `"passes": true`, or the task marked `"in_progress"`).

2. Read the task details in `TASKS.md` for the matching task ID (e.g., search for "## Task 1:" or "## Task 2:").

3. Read the **Codebase Patterns** section at the top of `progress.md` before writing any code.

4. Read `CLAUDE.md` for project rules and tech stack constraints.

5. Implement the task. Follow the requirements and acceptance criteria exactly.

6. Verify ALL acceptance criteria listed in the task. Run any verification commands.

7. Update `STATUS.json`:
   - Set the task's `status` to `"completed"` and `passes` to `true`
   - Set `completed_at` to current ISO timestamp
   - Increment `iteration_count` for the task
   - Update root `completed` count
   - Set root `in_progress` to `null`
   - Update `last_updated` and `last_task_completed`

8. Append a new entry to `progress.md` with:
   - Date and task ID
   - Files changed
   - What was implemented
   - Learnings discovered
   - If you found a reusable pattern, add it to the Codebase Patterns section at the top

9. If you completed the task successfully, output:
   ```
   <promise>TASK COMPLETE</promise>
   ```

10. If you are BLOCKED and cannot proceed, set task status to `"blocked"` in STATUS.json, document why in progress.md, then look for the next available task. If no tasks are available, output:
    ```
    <promise>BLOCKED</promise>
    ```

## Rules

- ONE task per iteration. Do not skip ahead.
- Follow dependency order in STATUS.json — never start a task whose dependencies aren't complete.
- Never modify: PLAN.md, FINAL-RESEARCH.md, CLAUDE.md, .ralph/ directory.
- Always use pnpm, never npm or yarn.
- Import Prisma client from @bugdetector/db, never instantiate directly.
- Import Zod schemas from @bugdetector/shared, never duplicate validation.
- Console/network logs go to S3 files, NEVER inline JSONB in PostgreSQL.
- rrweb ONLY for recording in V1 — no MediaRecorder/video.
- Quick Capture works WITHOUT company/project setup.
