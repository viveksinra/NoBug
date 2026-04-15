import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, companyProcedure, requirePermission } from '../trpc';

// ── Helpers ─────────────────────────────────────────────────────────

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

// ── Constants ───────────────────────────────────────────────────────

const FLAKY_THRESHOLD_DEFAULT = 0.3;
const LOOKBACK_RUNS_DEFAULT = 10;

// ── Router ──────────────────────────────────────────────────────────

export const regressionAnalyticsRouter = router({
  /**
   * detectFlaky — Analyze test case results across recent runs to detect flaky tests.
   * A test is flaky if it alternates PASS/FAIL across runs.
   * flaky_score = failCount / totalRuns (if mix of PASS and FAIL), 0 otherwise.
   */
  detectFlaky: requirePermission('manage_projects')
    .input(
      z.object({
        suiteId: z.string(),
        lookbackRuns: z.number().int().min(2).max(100).default(LOOKBACK_RUNS_DEFAULT),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifySuiteOwnership(ctx.db, input.suiteId, ctx.company.id);

      // Get the last N runs for this suite, ordered by creation date
      const recentRuns = await ctx.db.regressionRun.findMany({
        where: { suite_id: input.suiteId, status: 'COMPLETED' },
        orderBy: { created_at: 'desc' },
        take: input.lookbackRuns,
        select: { id: true },
      });

      const runIds = recentRuns.map((r: { id: string }) => r.id);

      if (runIds.length === 0) {
        return { updated: 0 };
      }

      // Get all test cases in the suite
      const testCases = await ctx.db.testCase.findMany({
        where: { suite_id: input.suiteId },
        select: { id: true },
      });

      // Get all results for these runs
      const results = await ctx.db.testResult.findMany({
        where: {
          run_id: { in: runIds },
          test_case_id: { in: testCases.map((tc: { id: string }) => tc.id) },
          result: { in: ['PASS', 'FAIL'] },
        },
        select: {
          test_case_id: true,
          result: true,
        },
      });

      // Group results by test case
      const resultsByCase = new Map<string, string[]>();
      for (const r of results) {
        const existing = resultsByCase.get(r.test_case_id) ?? [];
        existing.push(r.result);
        resultsByCase.set(r.test_case_id, existing);
      }

      // Calculate flaky_score for each test case and batch update
      let updated = 0;
      const updates: Promise<any>[] = [];

      for (const tc of testCases) {
        const caseResults = resultsByCase.get(tc.id);

        if (!caseResults || caseResults.length === 0) {
          // No PASS/FAIL results — keep score at 0
          continue;
        }

        const hasPass = caseResults.includes('PASS');
        const hasFail = caseResults.includes('FAIL');

        let flakyScore = 0;
        if (hasPass && hasFail) {
          const failCount = caseResults.filter((r) => r === 'FAIL').length;
          flakyScore = failCount / caseResults.length;
        }

        updates.push(
          ctx.db.testCase.update({
            where: { id: tc.id },
            data: { flaky_score: flakyScore },
          }),
        );
        updated++;
      }

      await Promise.all(updates);

      return { updated };
    }),

  /**
   * getFlakyCases — List test cases sorted by flaky_score descending, with threshold filter.
   */
  getFlakyCases: companyProcedure
    .input(
      z.object({
        suiteId: z.string(),
        threshold: z.number().min(0).max(1).default(FLAKY_THRESHOLD_DEFAULT),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifySuiteOwnership(ctx.db, input.suiteId, ctx.company.id);

      return ctx.db.testCase.findMany({
        where: {
          suite_id: input.suiteId,
          flaky_score: { gte: input.threshold },
        },
        orderBy: { flaky_score: 'desc' },
        take: input.limit,
      });
    }),

  /**
   * suggestRetest — Given a completed run, suggest which failed test cases should be re-tested
   * (those with flaky_score > 0.3).
   */
  suggestRetest: companyProcedure
    .input(
      z.object({
        runId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const run = await verifyRunOwnership(ctx.db, input.runId, ctx.company.id);

      // Get failed results from this run
      const failedResults = await ctx.db.testResult.findMany({
        where: {
          run_id: input.runId,
          result: 'FAIL',
        },
        select: { test_case_id: true },
      });

      if (failedResults.length === 0) {
        return [];
      }

      const failedCaseIds = failedResults.map((r: { test_case_id: string }) => r.test_case_id);

      // Filter to those with high flaky_score
      const flakyCases = await ctx.db.testCase.findMany({
        where: {
          id: { in: failedCaseIds },
          flaky_score: { gt: FLAKY_THRESHOLD_DEFAULT },
        },
        select: { id: true, title: true, flaky_score: true },
        orderBy: { flaky_score: 'desc' },
      });

      return flakyCases;
    }),

  /**
   * createRetestRun — Create a new regression run containing only the suggested re-test cases.
   * Uses trigger_type 'RETEST' (stored in the trigger field).
   */
  createRetestRun: requirePermission('manage_projects')
    .input(
      z.object({
        originalRunId: z.string(),
        testCaseIds: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const originalRun = await verifyRunOwnership(ctx.db, input.originalRunId, ctx.company.id);

      // Verify all test case IDs belong to the same suite
      const testCases = await ctx.db.testCase.findMany({
        where: {
          id: { in: input.testCaseIds },
          suite_id: originalRun.suite_id,
        },
        select: { id: true },
      });

      if (testCases.length !== input.testCaseIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Some test case IDs are invalid or do not belong to the original run suite',
        });
      }

      // Create the retest run
      const retestRun = await ctx.db.regressionRun.create({
        data: {
          suite_id: originalRun.suite_id,
          release_version: originalRun.release_version,
          tier_filter: originalRun.tier_filter,
          trigger: 'MANUAL',
          executor_type: originalRun.executor_type,
          status: 'PENDING',
          stats_json: {
            total: input.testCaseIds.length,
            passed: 0,
            failed: 0,
            blocked: 0,
            skipped: 0,
            pass_rate: 0,
            retest_of: input.originalRunId,
          },
        },
      });

      return retestRun;
    }),

  /**
   * testCaseHistory — Get pass/fail history for a specific test case across runs.
   */
  testCaseHistory: companyProcedure
    .input(
      z.object({
        testCaseId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify ownership: test case -> suite -> project -> company
      const testCase = await ctx.db.testCase.findUnique({
        where: { id: input.testCaseId },
        include: {
          suite: {
            include: { project: { select: { company_id: true } } },
          },
        },
      });

      if (!testCase) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Test case not found' });
      }

      if (testCase.suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Test case does not belong to this company' });
      }

      const results = await ctx.db.testResult.findMany({
        where: { test_case_id: input.testCaseId },
        orderBy: { tested_at: 'desc' },
        take: input.limit,
        select: {
          run_id: true,
          result: true,
          tested_at: true,
        },
      });

      return results.map((r: { run_id: string; result: string; tested_at: Date }) => ({
        runId: r.run_id,
        result: r.result,
        date: r.tested_at,
      }));
    }),

  /**
   * suiteHealthReport — Aggregate suite health metrics.
   */
  suiteHealthReport: companyProcedure
    .input(
      z.object({
        suiteId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifySuiteOwnership(ctx.db, input.suiteId, ctx.company.id);

      // Total cases + flaky count
      const [totalCases, flakyCount] = await Promise.all([
        ctx.db.testCase.count({ where: { suite_id: input.suiteId } }),
        ctx.db.testCase.count({
          where: { suite_id: input.suiteId, flaky_score: { gt: FLAKY_THRESHOLD_DEFAULT } },
        }),
      ]);

      // Last 5 completed runs for pass rate calculation
      const recentRuns = await ctx.db.regressionRun.findMany({
        where: { suite_id: input.suiteId, status: 'COMPLETED' },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { id: true, stats_json: true, created_at: true },
      });

      // Calculate average pass rate from stats_json
      let avgPassRate = 0;
      const lastRunDate = recentRuns.length > 0 ? recentRuns[0].created_at : null;

      if (recentRuns.length > 0) {
        const passRates = recentRuns.map((run: { stats_json: any }) => {
          const stats = run.stats_json as any;
          return typeof stats.pass_rate === 'number' ? stats.pass_rate : 0;
        });
        avgPassRate = passRates.reduce((sum: number, r: number) => sum + r, 0) / passRates.length;
      }

      // Coverage by tier
      const tierCounts = await ctx.db.testCase.groupBy({
        by: ['tier'],
        where: { suite_id: input.suiteId },
        _count: { id: true },
      });

      const coverageByTier: Record<string, number> = {};
      for (const tc of tierCounts) {
        coverageByTier[tc.tier] = tc._count.id;
      }

      return {
        totalCases,
        flakyCount,
        avgPassRate: Math.round(avgPassRate * 100) / 100,
        lastRunDate,
        coverageByTier,
      };
    }),
});
