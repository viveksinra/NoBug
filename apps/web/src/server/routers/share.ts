import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createHash } from 'crypto';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { PRIORITIES, ISSUE_TYPES } from '@nobug/shared';

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

// Helper to get next issue number for a project
async function getNextIssueNumber(db: any, projectId: string): Promise<number> {
  const result = await db.issue.aggregate({
    where: { project_id: projectId },
    _max: { number: true },
  });
  return (result._max?.number ?? 0) + 1;
}

export const shareRouter = router({
  /**
   * Set or update password on a Quick Capture.
   * Must be the capture owner.
   */
  setPassword: protectedProcedure
    .input(
      z.object({
        captureId: z.string(),
        password: z.string().min(4).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await ctx.db.quickCapture.findUnique({
        where: { id: input.captureId },
      });

      if (!capture) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Capture not found' });
      }
      if (capture.user_id !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this capture' });
      }

      await ctx.db.quickCapture.update({
        where: { id: input.captureId },
        data: { password_hash: hashPassword(input.password) },
      });

      return { success: true };
    }),

  /**
   * Remove password protection from a Quick Capture.
   */
  removePassword: protectedProcedure
    .input(z.object({ captureId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const capture = await ctx.db.quickCapture.findUnique({
        where: { id: input.captureId },
      });

      if (!capture) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Capture not found' });
      }
      if (capture.user_id !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this capture' });
      }

      await ctx.db.quickCapture.update({
        where: { id: input.captureId },
        data: { password_hash: null },
      });

      return { success: true };
    }),

  /**
   * Extend expiry date on a Quick Capture.
   */
  updateExpiry: protectedProcedure
    .input(
      z.object({
        captureId: z.string(),
        expiresAt: z.string().datetime(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await ctx.db.quickCapture.findUnique({
        where: { id: input.captureId },
      });

      if (!capture) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Capture not found' });
      }
      if (capture.user_id !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this capture' });
      }

      const newExpiry = new Date(input.expiresAt);
      if (newExpiry <= new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Expiry must be in the future' });
      }

      const updated = await ctx.db.quickCapture.update({
        where: { id: input.captureId },
        data: { expires_at: newExpiry },
      });

      return { expires_at: updated.expires_at };
    }),

  /**
   * Get share metadata for a Quick Capture (URL, password status, expiry, view count).
   */
  getShareInfo: protectedProcedure
    .input(z.object({ captureId: z.string() }))
    .query(async ({ ctx, input }) => {
      const capture = await ctx.db.quickCapture.findUnique({
        where: { id: input.captureId },
      });

      if (!capture) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Capture not found' });
      }
      if (capture.user_id !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this capture' });
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const shareUrl = `${appUrl}/b/${capture.slug}`;
      const embedUrl = `${appUrl}/b/${capture.slug}/embed`;

      return {
        id: capture.id,
        slug: capture.slug,
        title: capture.title,
        shareUrl,
        embedUrl,
        embedCode: `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`,
        passwordProtected: !!capture.password_hash,
        expiresAt: capture.expires_at,
        viewCount: capture.view_count,
        convertedToIssueId: capture.converted_to_issue_id,
        createdAt: capture.created_at,
      };
    }),

  /**
   * Promote a Quick Capture to a tracked Issue.
   * Requires company context (for project/assignee access).
   */
  promoteToIssue: requirePermission('create_issue')
    .input(
      z.object({
        captureId: z.string(),
        projectId: z.string(),
        title: z.string().min(1).max(200),
        priority: z.enum(PRIORITIES).default('MEDIUM'),
        type: z.enum(ISSUE_TYPES).default('BUG'),
        assigneeId: z.string().nullable().optional(),
        assigneeType: z.enum(['MEMBER', 'AGENT']).nullable().optional(),
        labelIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify capture exists and user owns it
      const capture = await ctx.db.quickCapture.findUnique({
        where: { id: input.captureId },
      });

      if (!capture) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Capture not found' });
      }
      if (capture.user_id !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this capture' });
      }
      if (capture.converted_to_issue_id) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This capture has already been promoted to an issue',
        });
      }

      // Verify project belongs to company
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, company_id: ctx.company.id },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      const number = await getNextIssueNumber(ctx.db, input.projectId);

      const result = await ctx.db.$transaction(async (tx: any) => {
        // Create the issue
        const issue = await tx.issue.create({
          data: {
            project_id: input.projectId,
            number,
            title: input.title,
            description: capture.description || '',
            status: 'OPEN',
            priority: input.priority,
            type: input.type,
            reporter_id: ctx.member.id,
            reporter_type: 'MEMBER',
            assignee_id: input.assigneeId ?? null,
            assignee_type: input.assigneeType ?? null,
          },
        });

        // Attach labels
        if (input.labelIds?.length) {
          await tx.issueLabel.createMany({
            data: input.labelIds.map((labelId: string) => ({
              issue_id: issue.id,
              label_id: labelId,
            })),
          });
        }

        // Link recording if available
        if (capture.recording_url) {
          await tx.recording.create({
            data: {
              issue_id: issue.id,
              uploader_id: ctx.member.id,
              uploader_type: 'MEMBER',
              type: 'RRWEB',
              storage_url: capture.recording_url,
              console_logs_url: capture.console_logs_url,
              network_logs_url: capture.network_logs_url,
              environment_json: capture.environment_json ?? undefined,
            },
          });
        }

        // Link screenshot if available
        if (capture.screenshot_url) {
          await tx.screenshot.create({
            data: {
              issue_id: issue.id,
              uploader_id: ctx.member.id,
              original_url: capture.screenshot_url,
            },
          });
        }

        // Update QuickCapture with converted issue reference
        await tx.quickCapture.update({
          where: { id: input.captureId },
          data: { converted_to_issue_id: issue.id },
        });

        // Create activity log
        await tx.activityLog.create({
          data: {
            entity_type: 'ISSUE',
            entity_id: issue.id,
            actor_id: ctx.member.id,
            actor_type: 'MEMBER',
            action: 'CREATED',
            metadata_json: {
              issue_number: number,
              project_key: project.key,
              promoted_from_capture: capture.slug,
            } as any,
          },
        });

        // If assigned to an agent, create AgentTask
        if (input.assigneeType === 'AGENT' && input.assigneeId) {
          await tx.agentTask.create({
            data: {
              agent_id: input.assigneeId,
              company_id: ctx.company.id,
              task_type: 'FIX_BUG',
              entity_type: 'ISSUE',
              entity_id: issue.id,
            },
          });
        }

        return issue;
      });

      return {
        issueId: result.id,
        issueNumber: number,
        issueKey: `${project.key}-${number}`,
      };
    }),

  /**
   * Delete a Quick Capture. Must be the owner.
   */
  deleteCapture: protectedProcedure
    .input(z.object({ captureId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const capture = await ctx.db.quickCapture.findUnique({
        where: { id: input.captureId },
      });

      if (!capture) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Capture not found' });
      }
      if (capture.user_id !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this capture' });
      }

      await ctx.db.quickCapture.delete({ where: { id: input.captureId } });

      return { success: true };
    }),

  /**
   * List user's Quick Captures with filtering.
   */
  listCaptures: protectedProcedure
    .input(
      z.object({
        filter: z.enum(['all', 'active', 'expired']).default('all'),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const where: any = { user_id: ctx.user.id };

      if (input.filter === 'active') {
        where.OR = [
          { expires_at: null },
          { expires_at: { gt: now } },
        ];
      } else if (input.filter === 'expired') {
        where.expires_at = { lte: now };
      }

      const captures = await ctx.db.quickCapture.findMany({
        where,
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          slug: true,
          title: true,
          screenshot_url: true,
          view_count: true,
          expires_at: true,
          created_at: true,
          converted_to_issue_id: true,
          password_hash: true,
        },
      });

      const hasMore = captures.length > input.limit;
      if (hasMore) captures.pop();

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      return {
        captures: captures.map((c) => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          screenshotUrl: c.screenshot_url,
          viewCount: c.view_count,
          expiresAt: c.expires_at,
          createdAt: c.created_at,
          convertedToIssueId: c.converted_to_issue_id,
          passwordProtected: !!c.password_hash,
          shareUrl: `${appUrl}/b/${c.slug}`,
          isExpired: c.expires_at ? c.expires_at < now : false,
        })),
        nextCursor: hasMore ? captures[captures.length - 1]?.id : null,
      };
    }),
});
