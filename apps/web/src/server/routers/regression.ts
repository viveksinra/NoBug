import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, companyProcedure, requirePermission } from '../trpc';
import { REGRESSION_TIERS, PRIORITIES } from '@nobug/shared';

export const regressionRouter = router({
  // ─── Suite CRUD ──────────────────────────────────────────────

  suiteCreate: requirePermission('manage_projects')
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify project belongs to company
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, company_id: ctx.company.id },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      return ctx.db.regressionSuite.create({
        data: {
          project_id: input.projectId,
          name: input.name,
          description: input.description ?? null,
        },
      });
    }),

  suiteList: companyProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, company_id: ctx.company.id },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      const suites = await ctx.db.regressionSuite.findMany({
        where: { project_id: input.projectId },
        include: {
          _count: { select: { test_cases: true, runs: true } },
        },
        orderBy: { created_at: 'desc' },
      });

      return suites;
    }),

  suiteGetById: companyProcedure
    .input(
      z.object({
        suiteId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const suite = await ctx.db.regressionSuite.findUnique({
        where: { id: input.suiteId },
        include: {
          project: { select: { id: true, company_id: true, name: true, key: true } },
          test_cases: {
            orderBy: { created_at: 'desc' },
            include: {
              _count: { select: { bug_links: true } },
            },
          },
          _count: { select: { test_cases: true, runs: true } },
        },
      });

      if (!suite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Regression suite not found' });
      }

      if (suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Suite does not belong to this company' });
      }

      return suite;
    }),

  suiteUpdate: requirePermission('manage_projects')
    .input(
      z.object({
        suiteId: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const suite = await ctx.db.regressionSuite.findUnique({
        where: { id: input.suiteId },
        include: { project: { select: { company_id: true } } },
      });

      if (!suite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Regression suite not found' });
      }

      if (suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Suite does not belong to this company' });
      }

      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;

      return ctx.db.regressionSuite.update({
        where: { id: input.suiteId },
        data,
      });
    }),

  suiteDelete: requirePermission('manage_projects')
    .input(
      z.object({
        suiteId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const suite = await ctx.db.regressionSuite.findUnique({
        where: { id: input.suiteId },
        include: { project: { select: { company_id: true } } },
      });

      if (!suite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Regression suite not found' });
      }

      if (suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Suite does not belong to this company' });
      }

      // Hard delete — cascade will remove test cases, assignments, etc.
      await ctx.db.regressionSuite.delete({
        where: { id: input.suiteId },
      });

      return { deleted: true };
    }),

  // ─── Test Case CRUD ──────────────────────────────────────────

  testCaseCreate: requirePermission('manage_projects')
    .input(
      z.object({
        suiteId: z.string(),
        title: z.string().min(1).max(300),
        description: z.string().optional(),
        stepsJson: z.any().default([]),
        expectedResult: z.string().optional(),
        priority: z.enum(PRIORITIES).default('MEDIUM'),
        tier: z.enum(REGRESSION_TIERS).default('CORE'),
        tags: z.array(z.string()).optional(),
        folder: z.string().optional(),
        automated: z.boolean().optional(),
        playwrightScript: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify suite belongs to a project in this company
      const suite = await ctx.db.regressionSuite.findUnique({
        where: { id: input.suiteId },
        include: { project: { select: { company_id: true } } },
      });

      if (!suite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Regression suite not found' });
      }

      if (suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Suite does not belong to this company' });
      }

      return ctx.db.testCase.create({
        data: {
          suite_id: input.suiteId,
          title: input.title,
          description: input.description ?? null,
          steps_json: input.stepsJson,
          expected_result: input.expectedResult ?? null,
          priority: input.priority,
          tier: input.tier,
          tags: input.tags ?? [],
          folder: input.folder ?? null,
          automated: input.automated ?? false,
          playwright_script: input.playwrightScript ?? null,
        },
      });
    }),

  testCaseList: companyProcedure
    .input(
      z.object({
        suiteId: z.string(),
        tier: z.enum(REGRESSION_TIERS).optional(),
        priority: z.enum(PRIORITIES).optional(),
        folder: z.string().optional(),
        automated: z.boolean().optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify suite belongs to this company
      const suite = await ctx.db.regressionSuite.findUnique({
        where: { id: input.suiteId },
        include: { project: { select: { company_id: true } } },
      });

      if (!suite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Regression suite not found' });
      }

      if (suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Suite does not belong to this company' });
      }

      const where: any = {
        suite_id: input.suiteId,
        ...(input.tier && { tier: input.tier }),
        ...(input.priority && { priority: input.priority }),
        ...(input.folder && { folder: input.folder }),
        ...(input.automated !== undefined && { automated: input.automated }),
        ...(input.search && {
          OR: [
            { title: { contains: input.search, mode: 'insensitive' as const } },
            { description: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }),
      };

      const testCases = await ctx.db.testCase.findMany({
        where,
        include: {
          _count: { select: { bug_links: true } },
        },
        orderBy: { created_at: 'desc' },
      });

      return testCases;
    }),

  testCaseGetById: companyProcedure
    .input(
      z.object({
        testCaseId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const testCase = await ctx.db.testCase.findUnique({
        where: { id: input.testCaseId },
        include: {
          suite: {
            include: { project: { select: { company_id: true, name: true, key: true } } },
          },
          bug_links: {
            include: {
              issue: {
                select: { id: true, title: true, number: true, status: true, priority: true },
              },
            },
          },
          assignments: true,
        },
      });

      if (!testCase) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Test case not found' });
      }

      if (testCase.suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Test case does not belong to this company' });
      }

      return testCase;
    }),

  testCaseUpdate: requirePermission('manage_projects')
    .input(
      z.object({
        testCaseId: z.string(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().nullable().optional(),
        stepsJson: z.any().optional(),
        expectedResult: z.string().nullable().optional(),
        priority: z.enum(PRIORITIES).optional(),
        tier: z.enum(REGRESSION_TIERS).optional(),
        tags: z.array(z.string()).optional(),
        folder: z.string().nullable().optional(),
        automated: z.boolean().optional(),
        playwrightScript: z.string().nullable().optional(),
        flakyScore: z.number().min(0).max(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const testCase = await ctx.db.testCase.findUnique({
        where: { id: input.testCaseId },
        include: {
          suite: { include: { project: { select: { company_id: true } } } },
        },
      });

      if (!testCase) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Test case not found' });
      }

      if (testCase.suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Test case does not belong to this company' });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.stepsJson !== undefined) data.steps_json = input.stepsJson;
      if (input.expectedResult !== undefined) data.expected_result = input.expectedResult;
      if (input.priority !== undefined) data.priority = input.priority;
      if (input.tier !== undefined) data.tier = input.tier;
      if (input.tags !== undefined) data.tags = input.tags;
      if (input.folder !== undefined) data.folder = input.folder;
      if (input.automated !== undefined) data.automated = input.automated;
      if (input.playwrightScript !== undefined) data.playwright_script = input.playwrightScript;
      if (input.flakyScore !== undefined) data.flaky_score = input.flakyScore;

      return ctx.db.testCase.update({
        where: { id: input.testCaseId },
        data,
      });
    }),

  testCaseLinkBug: requirePermission('manage_projects')
    .input(
      z.object({
        testCaseId: z.string(),
        issueId: z.string(),
        foundInRunId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify test case belongs to this company
      const testCase = await ctx.db.testCase.findUnique({
        where: { id: input.testCaseId },
        include: {
          suite: { include: { project: { select: { company_id: true } } } },
        },
      });

      if (!testCase) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Test case not found' });
      }

      if (testCase.suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Test case does not belong to this company' });
      }

      // Verify issue belongs to this company
      const issue = await ctx.db.issue.findFirst({
        where: { id: input.issueId, project: { company_id: ctx.company.id } },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      // Verify run exists
      const run = await ctx.db.regressionRun.findUnique({
        where: { id: input.foundInRunId },
      });

      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Regression run not found' });
      }

      // Check for duplicate link
      const existing = await ctx.db.testCaseBugLink.findFirst({
        where: {
          test_case_id: input.testCaseId,
          issue_id: input.issueId,
          found_in_run_id: input.foundInRunId,
        },
      });

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Bug link already exists' });
      }

      return ctx.db.testCaseBugLink.create({
        data: {
          test_case_id: input.testCaseId,
          issue_id: input.issueId,
          found_in_run_id: input.foundInRunId,
        },
      });
    }),

  testCaseUnlinkBug: requirePermission('manage_projects')
    .input(
      z.object({
        linkId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the link's test case belongs to this company
      const link = await ctx.db.testCaseBugLink.findUnique({
        where: { id: input.linkId },
        include: {
          test_case: {
            include: {
              suite: { include: { project: { select: { company_id: true } } } },
            },
          },
        },
      });

      if (!link) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bug link not found' });
      }

      if (link.test_case.suite.project.company_id !== ctx.company.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Bug link does not belong to this company' });
      }

      await ctx.db.testCaseBugLink.delete({
        where: { id: input.linkId },
      });

      return { deleted: true };
    }),
});
