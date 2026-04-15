import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, requirePermission, companyProcedure } from '../trpc';
import { ISSUE_STATUSES, RECORDING_TYPES } from '@nobug/shared';
import { createNotification } from './notification';

// Valid status transitions for testing workflow
const VALID_TRANSITIONS: Record<string, string[]> = {
  DEV_TESTING: ['IN_PROGRESS'],
  QA_TESTING: ['DEV_TESTING'],
};

export const testingWorkflowRouter = router({
  /**
   * Transition issue from IN_PROGRESS to DEV_TESTING.
   * Creates ActivityLog + notification to reporter.
   */
  moveToDevTesting: requirePermission('update_issue')
    .input(
      z.object({
        issueId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const issue = await ctx.db.issue.findFirst({
        where: { id: input.issueId, project: { company_id: ctx.company.id } },
        include: { project: true },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      if (issue.status !== 'IN_PROGRESS') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot move to DEV_TESTING: issue is currently ${issue.status}. Must be IN_PROGRESS.`,
        });
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.issue.update({
          where: { id: input.issueId },
          data: { status: 'DEV_TESTING' },
        });

        // Activity log
        await tx.activityLog.create({
          data: {
            entity_type: 'ISSUE',
            entity_id: input.issueId,
            actor_id: ctx.member.id,
            actor_type: 'MEMBER',
            action: 'STATUS_CHANGED',
            metadata_json: {
              from: 'IN_PROGRESS',
              to: 'DEV_TESTING',
              workflow: 'testing',
            } as any,
          },
        });

        // Status change comment
        await tx.issueComment.create({
          data: {
            issue_id: input.issueId,
            author_id: ctx.member.id,
            author_type: 'MEMBER',
            content: 'Moved to Dev Testing',
            type: 'STATUS_CHANGE',
          },
        });

        return result;
      });

      // Notify the reporter
      if (issue.reporter_id && issue.reporter_type === 'MEMBER') {
        const reporterMember = await ctx.db.member.findUnique({
          where: { id: issue.reporter_id },
          select: { user_id: true },
        });
        if (reporterMember?.user_id) {
          await createNotification(ctx.db, {
            userId: reporterMember.user_id,
            type: 'STATUS_CHANGED',
            title: `Issue moved to Dev Testing`,
            body: `${issue.project.key}-${issue.number}: ${issue.title}`,
            entityType: 'ISSUE',
            entityId: issue.id,
          }).catch(() => {});
        }
      }

      return updated;
    }),

  /**
   * Transition issue from DEV_TESTING to QA_TESTING.
   * Notifies QA team / assigned tester.
   */
  markReadyForQA: requirePermission('update_issue')
    .input(
      z.object({
        issueId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const issue = await ctx.db.issue.findFirst({
        where: { id: input.issueId, project: { company_id: ctx.company.id } },
        include: { project: true },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      if (issue.status !== 'DEV_TESTING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot move to QA_TESTING: issue is currently ${issue.status}. Must be DEV_TESTING.`,
        });
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.issue.update({
          where: { id: input.issueId },
          data: { status: 'QA_TESTING' },
        });

        // Activity log
        await tx.activityLog.create({
          data: {
            entity_type: 'ISSUE',
            entity_id: input.issueId,
            actor_id: ctx.member.id,
            actor_type: 'MEMBER',
            action: 'STATUS_CHANGED',
            metadata_json: {
              from: 'DEV_TESTING',
              to: 'QA_TESTING',
              workflow: 'testing',
            } as any,
          },
        });

        // Status change comment
        await tx.issueComment.create({
          data: {
            issue_id: input.issueId,
            author_id: ctx.member.id,
            author_type: 'MEMBER',
            content: 'Marked ready for QA Testing',
            type: 'STATUS_CHANGE',
          },
        });

        return result;
      });

      // Notify QA team members (role = QA) in this company
      const qaMembers = await ctx.db.member.findMany({
        where: { company_id: ctx.company.id, role: 'QA' },
        select: { user_id: true },
      });

      // Also notify the assignee if they're a member
      if (issue.assignee_id && issue.assignee_type === 'MEMBER') {
        const assigneeMember = await ctx.db.member.findUnique({
          where: { id: issue.assignee_id },
          select: { user_id: true },
        });
        if (assigneeMember?.user_id) {
          const userIds = new Set([
            ...qaMembers.map((m: any) => m.user_id),
            assigneeMember.user_id,
          ]);
          for (const userId of userIds) {
            await createNotification(ctx.db, {
              userId,
              type: 'STATUS_CHANGED',
              title: `Issue ready for QA Testing`,
              body: `${issue.project.key}-${issue.number}: ${issue.title}`,
              entityType: 'ISSUE',
              entityId: issue.id,
            }).catch(() => {});
          }
        }
      } else {
        // Just notify QA members
        for (const qaMember of qaMembers) {
          await createNotification(ctx.db, {
            userId: qaMember.user_id,
            type: 'STATUS_CHANGED',
            title: `Issue ready for QA Testing`,
            body: `${issue.project.key}-${issue.number}: ${issue.title}`,
            entityType: 'ISSUE',
            entityId: issue.id,
          }).catch(() => {});
        }
      }

      return updated;
    }),

  /**
   * Submit QA verdict — PASS closes the issue, FAIL reopens it.
   */
  submitQAVerdict: requirePermission('update_issue')
    .input(
      z.object({
        issueId: z.string(),
        verdict: z.enum(['PASS', 'FAIL']),
        recordingId: z.string().optional(),
        notes: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const issue = await ctx.db.issue.findFirst({
        where: { id: input.issueId, project: { company_id: ctx.company.id } },
        include: { project: true },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      if (issue.status !== 'QA_TESTING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot submit QA verdict: issue is currently ${issue.status}. Must be QA_TESTING.`,
        });
      }

      const newStatus = input.verdict === 'PASS' ? 'CLOSED' : 'REOPENED';

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.issue.update({
          where: { id: input.issueId },
          data: { status: newStatus },
        });

        // Activity log
        await tx.activityLog.create({
          data: {
            entity_type: 'ISSUE',
            entity_id: input.issueId,
            actor_id: ctx.member.id,
            actor_type: 'MEMBER',
            action: 'STATUS_CHANGED',
            metadata_json: {
              from: 'QA_TESTING',
              to: newStatus,
              workflow: 'testing',
              qa_verdict: input.verdict,
              recording_id: input.recordingId ?? null,
              notes: input.notes,
            } as any,
          },
        });

        // Status change comment with verdict details
        const verdictLabel = input.verdict === 'PASS' ? 'QA Passed — Issue Closed' : 'QA Failed — Issue Reopened';
        await tx.issueComment.create({
          data: {
            issue_id: input.issueId,
            author_id: ctx.member.id,
            author_type: 'MEMBER',
            content: `${verdictLabel}\n\n${input.notes}`,
            type: 'STATUS_CHANGE',
          },
        });

        // If a QA recording was provided, link it to the issue
        if (input.recordingId) {
          await tx.recording.update({
            where: { id: input.recordingId },
            data: { issue_id: input.issueId },
          }).catch(() => {
            // Recording may already be linked or not exist — non-fatal
          });
        }

        return result;
      });

      // Notify reporter
      if (issue.reporter_id && issue.reporter_type === 'MEMBER') {
        const reporterMember = await ctx.db.member.findUnique({
          where: { id: issue.reporter_id },
          select: { user_id: true },
        });
        if (reporterMember?.user_id) {
          await createNotification(ctx.db, {
            userId: reporterMember.user_id,
            type: 'STATUS_CHANGED',
            title: input.verdict === 'PASS'
              ? `QA Passed — Issue closed`
              : `QA Failed — Issue reopened`,
            body: `${issue.project.key}-${issue.number}: ${issue.title}`,
            entityType: 'ISSUE',
            entityId: issue.id,
          }).catch(() => {});
        }
      }

      // Notify assignee (especially important on FAIL — issue returns to their queue)
      if (issue.assignee_id && issue.assignee_type === 'MEMBER') {
        const assigneeMember = await ctx.db.member.findUnique({
          where: { id: issue.assignee_id },
          select: { user_id: true },
        });
        if (assigneeMember?.user_id) {
          await createNotification(ctx.db, {
            userId: assigneeMember.user_id,
            type: 'STATUS_CHANGED',
            title: input.verdict === 'PASS'
              ? `QA Passed — Issue closed`
              : `QA Failed — Issue reopened and returned to your queue`,
            body: `${issue.project.key}-${issue.number}: ${issue.title}`,
            entityType: 'ISSUE',
            entityId: issue.id,
          }).catch(() => {});
        }
      }

      return updated;
    }),

  /**
   * Get everything QA needs to test an issue.
   */
  getQAContext: companyProcedure
    .input(
      z.object({
        issueId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const issue = await ctx.db.issue.findFirst({
        where: { id: input.issueId, project: { company_id: ctx.company.id } },
        include: {
          project: true,
          recordings: {
            orderBy: { created_at: 'asc' },
          },
          comments: {
            orderBy: { created_at: 'asc' },
          },
        },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      // Count reopens from activity log
      const reopenCount = await ctx.db.activityLog.count({
        where: {
          entity_type: 'ISSUE',
          entity_id: input.issueId,
          action: 'STATUS_CHANGED',
          metadata_json: {
            path: ['to'],
            equals: 'REOPENED',
          },
        },
      });

      // Get testing timeline (activity logs related to testing workflow)
      const testingTimeline = await ctx.db.activityLog.findMany({
        where: {
          entity_type: 'ISSUE',
          entity_id: input.issueId,
          action: { in: ['STATUS_CHANGED', 'CREATED', 'RECORDING_ATTACHED'] },
        },
        orderBy: { created_at: 'asc' },
      });

      // Get assignee info
      let assignee: { id: string; name: string; type: string } | null = null;
      if (issue.assignee_id && issue.assignee_type === 'MEMBER') {
        const member = await ctx.db.member.findUnique({
          where: { id: issue.assignee_id },
          include: { user: { select: { name: true } } },
        });
        if (member) {
          assignee = { id: member.id, name: member.user?.name ?? 'Unknown', type: 'MEMBER' };
        }
      } else if (issue.assignee_id && issue.assignee_type === 'AGENT') {
        const agent = await ctx.db.agent.findUnique({
          where: { id: issue.assignee_id },
          select: { id: true, name: true },
        });
        if (agent) {
          assignee = { id: agent.id, name: agent.name, type: 'AGENT' };
        }
      }

      return {
        issue: {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          description: issue.description,
          status: issue.status,
          priority: issue.priority,
          key: `${issue.project.key}-${issue.number}`,
          environment_json: issue.environment_json,
          created_at: issue.created_at,
        },
        recordings: issue.recordings,
        comments: issue.comments,
        assignee,
        reopenCount,
        testingTimeline,
      };
    }),

  /**
   * Get how many times an issue has been reopened.
   */
  getReopenCount: companyProcedure
    .input(
      z.object({
        issueId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify the issue belongs to this company
      const issue = await ctx.db.issue.findFirst({
        where: { id: input.issueId, project: { company_id: ctx.company.id } },
        select: { id: true },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      const count = await ctx.db.activityLog.count({
        where: {
          entity_type: 'ISSUE',
          entity_id: input.issueId,
          action: 'STATUS_CHANGED',
          metadata_json: {
            path: ['to'],
            equals: 'REOPENED',
          },
        },
      });

      return { issueId: input.issueId, reopenCount: count };
    }),

  /**
   * List issues in QA_TESTING status for a project (the QA queue).
   */
  getQAQueue: companyProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify project belongs to this company
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, company_id: ctx.company.id },
        select: { id: true, key: true },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      const issues = await ctx.db.issue.findMany({
        where: {
          project_id: input.projectId,
          status: 'QA_TESTING',
        },
        orderBy: [
          { priority: 'asc' }, // CRITICAL first (alphabetical: CRITICAL < HIGH < LOW < MEDIUM < NONE)
          { updated_at: 'desc' },
        ],
        include: {
          recordings: {
            select: { id: true, type: true, created_at: true },
          },
        },
      });

      return issues.map((issue) => ({
        ...issue,
        key: `${project.key}-${issue.number}`,
      }));
    }),

  /**
   * Get the full testing lifecycle for an issue:
   * all recordings (BUG, DEV_TEST, QA_TEST), status transitions, comments.
   * Ordered chronologically.
   */
  getTestingTimeline: companyProcedure
    .input(
      z.object({
        issueId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const issue = await ctx.db.issue.findFirst({
        where: { id: input.issueId, project: { company_id: ctx.company.id } },
        include: { project: true },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      // Fetch recordings, activity logs, and comments in parallel
      const [recordings, activityLogs, comments] = await Promise.all([
        ctx.db.recording.findMany({
          where: { issue_id: input.issueId },
          orderBy: { created_at: 'asc' },
        }),
        ctx.db.activityLog.findMany({
          where: {
            entity_type: 'ISSUE',
            entity_id: input.issueId,
            action: { in: ['STATUS_CHANGED', 'CREATED', 'RECORDING_ATTACHED'] },
          },
          orderBy: { created_at: 'asc' },
        }),
        ctx.db.issueComment.findMany({
          where: {
            issue_id: input.issueId,
            type: { in: ['STATUS_CHANGE', 'RECORDING_ATTACHED'] },
          },
          orderBy: { created_at: 'asc' },
        }),
      ]);

      // Merge into a unified timeline
      type TimelineEntry = {
        type: 'recording' | 'activity' | 'comment';
        timestamp: Date;
        data: any;
      };

      const timeline: TimelineEntry[] = [
        ...recordings.map((r) => ({
          type: 'recording' as const,
          timestamp: r.created_at,
          data: r,
        })),
        ...activityLogs.map((a) => ({
          type: 'activity' as const,
          timestamp: a.created_at,
          data: a,
        })),
        ...comments.map((c) => ({
          type: 'comment' as const,
          timestamp: c.created_at,
          data: c,
        })),
      ];

      // Sort chronologically
      timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return {
        issue: {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          status: issue.status,
          key: `${issue.project.key}-${issue.number}`,
        },
        timeline,
      };
    }),
});
