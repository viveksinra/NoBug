import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, companyProcedure, requirePermission } from '../trpc';
import { REGRESSION_TIERS, ACTOR_TYPES } from '@nobug/shared';

// ── Helpers ─────────────────────────────────────────────────────────

const RUN_TRIGGERS = ['MANUAL', 'DEPLOY_WEBHOOK', 'SCHEDULED'] as const;
const EXECUTOR_TYPES = ['HUMAN', 'AI_AGENT', 'MIXED'] as const;
const RUN_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;
const TEST_RESULTS = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'] as const;

/** Validate that a suite belongs to the current company. Returns the suite with project. */
async function verifySuiteOwnership(
  db: any,
  suiteId: string,
  companyId: string,
) {
  const suite = await db.regressionSuite.findUnique({
    where: { id: suiteId },
    include: { project: { select: { company_id: true } } },
  });

  if (!suite) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Regression suite not found' });
  }

  if (suite.project.company_id !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Suite does not belong to this company' });
  }

  return suite;
}

/** Validate that a run belongs to the current company (via suite -> project). Returns run with suite+project. */
async function verifyRunOwnership(
  db: any,
  runId: string,
  companyId: string,
) {
  const run = await db.regressionRun.findUnique({
    where: { id: runId },
    include: {
      suite: {
        include: { project: { select: { company_id: true } } },
      },
    },
  });

  if (!run) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Regression run not found' });
  }

  if (run.suite.project.company_id !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Run does not belong to this company' });
  }

  return run;
}

// ── Router ──────────────────────────────────────────────────────────

export const regressionRunRouter = router({
  // ─── runCreate ────────────────────────────────────────────────────
  // Create a regression run for a suite.
  runCreate: requirePermission('manage_projects')
    .input(
      z.object({
        suiteId: z.string(),
        trigger: z.enum(RUN_TRIGGERS).default('MANUAL'),
        executorType: z.enum(EXECUTOR_TYPES).default('HUMAN'),
        tierFilter: z.enum(REGRESSION_TIERS),
        releaseVersion: z.string().optional(),
        testCaseIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifySuiteOwnership(ctx.db, input.suiteId, ctx.company.id);

      // If a subset of test case IDs is provided, verify they belong to this suite
      if (input.testCaseIds && input.testCaseIds.length > 0) {
        const validCases = await ctx.db.testCase.findMany({
          where: {
            id: { in: input.testCaseIds },
            suite_id: input.suiteId,
          },
          select: { id: true },
        });

        const validIds = new Set(validCases.map((c: { id: string }) => c.id));
        const invalid = input.testCaseIds.filter((id) => !validIds.has(id));

        if (invalid.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Test case(s) not found in suite: ${invalid.join(', ')}`,
          });
        }
      }

      const run = await ctx.db.regressionRun.create({
        data: {
          suite_id: input.suiteId,
          trigger: input.trigger,
          executor_type: input.executorType,
          tier_filter: input.tierFilter,
          release_version: input.releaseVersion ?? null,
          status: 'PENDING',
          stats_json: {},
        },
      });

      return run;
    }),

  // ─── runList ──────────────────────────────────────────────────────
  // List runs for a suite with cursor-based pagination.
  runList: companyProcedure
    .input(
      z.object({
        suiteId: z.string(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifySuiteOwnership(ctx.db, input.suiteId, ctx.company.id);

      const runs = await ctx.db.regressionRun.findMany({
        where: { suite_id: input.suiteId },
        take: input.limit + 1,
        ...(input.cursor && {
          cursor: { id: input.cursor },
          skip: 1,
        }),
        orderBy: { created_at: 'desc' },
        include: {
          _count: { select: { results: true } },
        },
      });

      let nextCursor: string | undefined;
      if (runs.length > input.limit) {
        const next = runs.pop();
        nextCursor = next?.id;
      }

      return { runs, nextCursor };
    }),

  // ─── runGetById ───────────────────────────────────────────────────
  // Get a run with all test results and evidence.
  runGetById: companyProcedure
    .input(
      z.object({
        runId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.regressionRun.findUnique({
        where: { id: input.runId },
        include: {
          suite: {
            include: {
              project: { select: { id: true, company_id: true, name: true, key: true } },
            },
          },
          results: {
            include: {
              test_case: {
                select: { id: true, title: true, tier: true, priority: true },
              },
              recording: {
                select: { id: true, storage_url: true, thumbnail_url: true },
              },
              screenshot: {
                select: { id: true, original_url: true, annotated_url: true },
              },
            },
            orderBy: { tested_at: 'desc' },
          },
        },
      });

      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Regression run not found' });
      }

      if (run.suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Run does not belong to this company' });
      }

      return run;
    }),

  // ─── runStart ─────────────────────────────────────────────────────
  // Start executing a run: set started_at and create TestCaseAssignment records.
  runStart: requirePermission('manage_projects')
    .input(
      z.object({
        runId: z.string(),
        assignments: z.array(
          z.object({
            testCaseId: z.string(),
            assigneeId: z.string(),
            assigneeType: z.enum(['MEMBER', 'AGENT']),
          }),
        ).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const run = await verifyRunOwnership(ctx.db, input.runId, ctx.company.id);

      if (run.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot start a run with status "${run.status}". Only PENDING runs can be started.`,
        });
      }

      // Get test cases for this suite (filtered by the run's tier_filter)
      const testCases = await ctx.db.testCase.findMany({
        where: {
          suite_id: run.suite_id,
          tier: run.tier_filter,
        },
        select: { id: true },
      });

      if (testCases.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No test cases match the tier filter for this run',
        });
      }

      // Create assignments if provided
      const assignmentData = input.assignments ?? [];

      await ctx.db.$transaction(async (tx: any) => {
        // Update run status
        await tx.regressionRun.update({
          where: { id: input.runId },
          data: {
            status: 'IN_PROGRESS',
            started_at: new Date(),
          },
        });

        // Create TestCaseAssignment records for each assignment
        if (assignmentData.length > 0) {
          await tx.testCaseAssignment.createMany({
            data: assignmentData.map((a) => ({
              test_case_id: a.testCaseId,
              assignee_id: a.assigneeId,
              assignee_type: a.assigneeType,
            })),
          });
        }
      });

      return ctx.db.regressionRun.findUnique({
        where: { id: input.runId },
        include: {
          _count: { select: { results: true } },
        },
      });
    }),

  // ─── submitResult ─────────────────────────────────────────────────
  // Submit a test result for a test case in a run.
  submitResult: requirePermission('manage_projects')
    .input(
      z.object({
        runId: z.string(),
        testCaseId: z.string(),
        result: z.enum(TEST_RESULTS),
        testerId: z.string(),
        testerType: z.enum(['MEMBER', 'AGENT']).default('MEMBER'),
        recordingId: z.string().optional(),
        screenshotId: z.string().optional(),
        notes: z.string().optional(),
        executionLogUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const run = await verifyRunOwnership(ctx.db, input.runId, ctx.company.id);

      if (run.status !== 'IN_PROGRESS') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot submit results for a run with status "${run.status}". Run must be IN_PROGRESS.`,
        });
      }

      // Verify the test case belongs to this suite
      const testCase = await ctx.db.testCase.findFirst({
        where: {
          id: input.testCaseId,
          suite_id: run.suite_id,
        },
      });

      if (!testCase) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Test case not found in this suite',
        });
      }

      // Check for duplicate result (same run + test case)
      const existing = await ctx.db.testResult.findFirst({
        where: {
          run_id: input.runId,
          test_case_id: input.testCaseId,
        },
      });

      if (existing) {
        // Update existing result instead of creating duplicate
        return ctx.db.testResult.update({
          where: { id: existing.id },
          data: {
            result: input.result,
            tester_id: input.testerId,
            tester_type: input.testerType,
            recording_id: input.recordingId ?? null,
            screenshot_id: input.screenshotId ?? null,
            notes: input.notes ?? null,
            execution_log_url: input.executionLogUrl ?? null,
            tested_at: new Date(),
          },
        });
      }

      return ctx.db.testResult.create({
        data: {
          run_id: input.runId,
          test_case_id: input.testCaseId,
          result: input.result,
          tester_id: input.testerId,
          tester_type: input.testerType,
          recording_id: input.recordingId ?? null,
          screenshot_id: input.screenshotId ?? null,
          notes: input.notes ?? null,
          execution_log_url: input.executionLogUrl ?? null,
        },
      });
    }),

  // ─── runComplete ──────────────────────────────────────────────────
  // Complete a run: set completed_at, calculate summary stats.
  runComplete: requirePermission('manage_projects')
    .input(
      z.object({
        runId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const run = await verifyRunOwnership(ctx.db, input.runId, ctx.company.id);

      if (run.status !== 'IN_PROGRESS') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot complete a run with status "${run.status}". Run must be IN_PROGRESS.`,
        });
      }

      // Calculate summary from results
      const results = await ctx.db.testResult.findMany({
        where: { run_id: input.runId },
        select: { result: true },
      });

      const total = results.length;
      const passed = results.filter((r: { result: string }) => r.result === 'PASS').length;
      const failed = results.filter((r: { result: string }) => r.result === 'FAIL').length;
      const skipped = results.filter((r: { result: string }) => r.result === 'SKIPPED').length;
      const blocked = results.filter((r: { result: string }) => r.result === 'BLOCKED').length;
      const passRate = total > 0 ? Math.round((passed / total) * 10000) / 10000 : 0;

      const statsJson = { total, passed, failed, skipped, blocked, pass_rate: passRate };

      const completedRun = await ctx.db.regressionRun.update({
        where: { id: input.runId },
        data: {
          status: 'COMPLETED',
          completed_at: new Date(),
          stats_json: statsJson,
        },
      });

      return completedRun;
    }),

  // ─── runSummary ───────────────────────────────────────────────────
  // Get aggregate stats for a suite's recent runs (pass rate trend).
  runSummary: companyProcedure
    .input(
      z.object({
        suiteId: z.string(),
        lastN: z.number().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifySuiteOwnership(ctx.db, input.suiteId, ctx.company.id);

      const runs = await ctx.db.regressionRun.findMany({
        where: {
          suite_id: input.suiteId,
          status: 'COMPLETED',
        },
        orderBy: { completed_at: 'desc' },
        take: input.lastN,
        select: {
          id: true,
          tier_filter: true,
          trigger: true,
          release_version: true,
          status: true,
          started_at: true,
          completed_at: true,
          stats_json: true,
          created_at: true,
        },
      });

      // Aggregate across all returned runs
      let totalTests = 0;
      let totalPassed = 0;
      let totalFailed = 0;
      let totalSkipped = 0;
      let totalBlocked = 0;

      const trend = runs.map((run: any) => {
        const stats = (run.stats_json ?? {}) as Record<string, number>;
        totalTests += stats.total ?? 0;
        totalPassed += stats.passed ?? 0;
        totalFailed += stats.failed ?? 0;
        totalSkipped += stats.skipped ?? 0;
        totalBlocked += stats.blocked ?? 0;

        return {
          runId: run.id,
          tierFilter: run.tier_filter,
          trigger: run.trigger,
          releaseVersion: run.release_version,
          completedAt: run.completed_at,
          stats: stats,
        };
      });

      const overallPassRate =
        totalTests > 0
          ? Math.round((totalPassed / totalTests) * 10000) / 10000
          : 0;

      return {
        suiteId: input.suiteId,
        runsAnalyzed: runs.length,
        aggregate: {
          total: totalTests,
          passed: totalPassed,
          failed: totalFailed,
          skipped: totalSkipped,
          blocked: totalBlocked,
          pass_rate: overallPassRate,
        },
        trend,
      };
    }),
});
