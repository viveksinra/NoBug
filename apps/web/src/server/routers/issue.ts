import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, companyProcedure, requirePermission } from '../trpc';
import {
  createIssueSchema,
  ISSUE_STATUSES,
  PRIORITIES,
  ISSUE_TYPES,
  ACTOR_TYPES,
} from '@nobug/shared';

// Helper to get next issue number for a project
async function getNextIssueNumber(
  db: any,
  projectId: string,
): Promise<number> {
  const result = await db.issue.aggregate({
    where: { project_id: projectId },
    _max: { number: true },
  });
  return (result._max?.number ?? 0) + 1;
}

export const issueRouter = router({
  create: requirePermission('create_issue')
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        priority: z.enum(PRIORITIES).default('MEDIUM'),
        type: z.enum(ISSUE_TYPES).default('BUG'),
        assigneeId: z.string().nullable().optional(),
        assigneeType: z.enum(['MEMBER', 'AGENT']).nullable().optional(),
        labelIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, company_id: ctx.company.id },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      const number = await getNextIssueNumber(ctx.db, input.projectId);

      const issue = await ctx.db.$transaction(async (tx: any) => {
        const issue = await tx.issue.create({
          data: {
            project_id: input.projectId,
            number,
            title: input.title,
            description: input.description ?? '',
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
            data: input.labelIds.map((labelId) => ({
              issue_id: issue.id,
              label_id: labelId,
            })),
          });
        }

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

      return { ...issue, key: `${project.key}-${number}` };
    }),

  getByNumber: companyProcedure
    .input(
      z.object({
        projectKey: z.string(),
        issueNumber: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: {
          company_id_key: {
            company_id: ctx.company.id,
            key: input.projectKey,
          },
        },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      const issue = await ctx.db.issue.findFirst({
        where: {
          project_id: project.id,
          number: input.issueNumber,
        },
        include: {
          labels: { include: { label: true } },
          comments: {
            orderBy: { created_at: 'asc' },
            take: 50,
          },
          recordings: {
            orderBy: { created_at: 'desc' },
          },
          screenshots: {
            orderBy: { created_at: 'desc' },
          },
        },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      return { ...issue, key: `${project.key}-${issue.number}` };
    }),

  list: companyProcedure
    .input(
      z.object({
        projectId: z.string(),
        status: z.enum(ISSUE_STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        assigneeId: z.string().optional(),
        type: z.enum(ISSUE_TYPES).optional(),
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(25),
        sortBy: z.enum(['created_at', 'updated_at', 'priority', 'number']).default('created_at'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.limit;

      const where: any = {
        project_id: input.projectId,
        project: { company_id: ctx.company.id },
        ...(input.status && { status: input.status }),
        ...(input.priority && { priority: input.priority }),
        ...(input.assigneeId && { assignee_id: input.assigneeId }),
        ...(input.type && { type: input.type }),
        ...(input.search && {
          OR: [
            { title: { contains: input.search, mode: 'insensitive' as const } },
            { description: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }),
      };

      const [issues, total] = await Promise.all([
        ctx.db.issue.findMany({
          where,
          include: {
            labels: { include: { label: true } },
            _count: { select: { comments: true } },
          },
          orderBy: { [input.sortBy]: input.sortOrder },
          skip,
          take: input.limit,
        }),
        ctx.db.issue.count({ where }),
      ]);

      // Get project key for formatting
      const project = await ctx.db.project.findUnique({
        where: { id: input.projectId },
        select: { key: true },
      });

      return {
        data: issues.map((issue) => ({
          ...issue,
          key: `${project?.key}-${issue.number}`,
        })),
        pagination: {
          total,
          page: input.page,
          limit: input.limit,
          has_more: skip + issues.length < total,
        },
      };
    }),

  update: requirePermission('update_issue')
    .input(
      z.object({
        issueId: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        status: z.enum(ISSUE_STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        assigneeId: z.string().nullable().optional(),
        assigneeType: z.enum(['MEMBER', 'AGENT']).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { issueId, ...updateData } = input;

      const issue = await ctx.db.issue.findFirst({
        where: { id: issueId, project: { company_id: ctx.company.id } },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      const data: any = {};
      if (updateData.title !== undefined) data.title = updateData.title;
      if (updateData.description !== undefined) data.description = updateData.description;
      if (updateData.status !== undefined) {
        data.status = updateData.status;
        if (updateData.status === 'CLOSED') data.closed_at = new Date();
        if (updateData.status === 'REOPENED') data.closed_at = null;
      }
      if (updateData.priority !== undefined) data.priority = updateData.priority;
      if (updateData.assigneeId !== undefined) data.assignee_id = updateData.assigneeId;
      if (updateData.assigneeType !== undefined) data.assignee_type = updateData.assigneeType;
      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.issue.update({
          where: { id: issueId },
          data,
        });

        // Log status changes
        if (updateData.status && updateData.status !== issue.status) {
          await tx.activityLog.create({
            data: {
              entity_type: 'ISSUE',
              entity_id: issueId,
              actor_id: ctx.member.id,
              actor_type: 'MEMBER',
              action: 'STATUS_CHANGED',
              metadata_json: {
                from: issue.status,
                to: updateData.status,
              } as any,
            },
          });

          await tx.issueComment.create({
            data: {
              issue_id: issueId,
              author_id: ctx.member.id,
              author_type: 'MEMBER',
              content: `Status changed from ${issue.status} to ${updateData.status}`,
              type: 'STATUS_CHANGE',
            },
          });
        }

        // Log assignment changes
        if (updateData.assigneeId !== undefined && updateData.assigneeId !== issue.assignee_id) {
          await tx.activityLog.create({
            data: {
              entity_type: 'ISSUE',
              entity_id: issueId,
              actor_id: ctx.member.id,
              actor_type: 'MEMBER',
              action: 'ASSIGNED',
              metadata_json: {
                assignee_id: updateData.assigneeId,
                assignee_type: updateData.assigneeType,
              } as any,
            },
          });

          // Create AgentTask if assigned to agent
          if (updateData.assigneeType === 'AGENT' && updateData.assigneeId) {
            await tx.agentTask.create({
              data: {
                agent_id: updateData.assigneeId,
                company_id: ctx.company.id,
                task_type: 'FIX_BUG',
                entity_type: 'ISSUE',
                entity_id: issueId,
              },
            });
          }
        }

        return result;
      });

      return updated;
    }),

  addComment: requirePermission('create_issue')
    .input(
      z.object({
        issueId: z.string(),
        content: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const issue = await ctx.db.issue.findFirst({
        where: { id: input.issueId, project: { company_id: ctx.company.id } },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      const comment = await ctx.db.issueComment.create({
        data: {
          issue_id: input.issueId,
          author_id: ctx.member.id,
          author_type: 'MEMBER',
          content: input.content,
          type: 'COMMENT',
        },
      });

      await ctx.db.activityLog.create({
        data: {
          entity_type: 'ISSUE',
          entity_id: input.issueId,
          actor_id: ctx.member.id,
          actor_type: 'MEMBER',
          action: 'COMMENTED',
          metadata_json: { comment_id: comment.id } as any,
        },
      });

      return comment;
    }),

  // Label management
  createLabel: requirePermission('manage_projects')
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(50),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.label.create({
        data: {
          project_id: input.projectId,
          name: input.name,
          color: input.color,
        },
      });
    }),

  listLabels: companyProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.label.findMany({
        where: { project_id: input.projectId },
        orderBy: { name: 'asc' },
      });
    }),

  // T-021: Bulk status update
  bulkUpdateStatus: requirePermission('update_issue')
    .input(
      z.object({
        issueIds: z.array(z.string()).min(1).max(50),
        status: z.enum(ISSUE_STATUSES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.issue.updateMany({
        where: {
          id: { in: input.issueIds },
          project: { company_id: ctx.company.id },
        },
        data: {
          status: input.status,
          ...(input.status === 'CLOSED' ? { closed_at: new Date() } : {}),
        },
      });

      // Log bulk action
      await ctx.db.activityLog.create({
        data: {
          entity_type: 'ISSUE',
          entity_id: input.issueIds[0],
          actor_id: ctx.member.id,
          actor_type: 'MEMBER',
          action: 'BULK_STATUS_CHANGE',
          metadata_json: {
            issue_count: input.issueIds.length,
            new_status: input.status,
          } as any,
        },
      });

      return { updated: updated.count };
    }),

  // T-021: Bulk assign
  bulkAssign: requirePermission('update_issue')
    .input(
      z.object({
        issueIds: z.array(z.string()).min(1).max(50),
        assigneeId: z.string().nullable(),
        assigneeType: z.enum(['MEMBER', 'AGENT']).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.issue.updateMany({
        where: {
          id: { in: input.issueIds },
          project: { company_id: ctx.company.id },
        },
        data: {
          assignee_id: input.assigneeId,
          assignee_type: input.assigneeType,
        },
      });

      return { updated: updated.count };
    }),

  // T-021: Issue linking
  createLink: requirePermission('update_issue')
    .input(
      z.object({
        sourceIssueId: z.string(),
        targetIssueId: z.string(),
        linkType: z.enum(['RELATED', 'BLOCKS', 'BLOCKED_BY', 'DUPLICATE']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify both issues belong to this company
      const [source, target] = await Promise.all([
        ctx.db.issue.findFirst({
          where: { id: input.sourceIssueId, project: { company_id: ctx.company.id } },
        }),
        ctx.db.issue.findFirst({
          where: { id: input.targetIssueId, project: { company_id: ctx.company.id } },
        }),
      ]);

      if (!source || !target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      return ctx.db.issueLink.create({
        data: {
          source_issue_id: input.sourceIssueId,
          target_issue_id: input.targetIssueId,
          link_type: input.linkType,
        },
      });
    }),

  removeLink: requirePermission('update_issue')
    .input(z.object({ linkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.issueLink.delete({ where: { id: input.linkId } });
    }),

  // Get issue counts by status for a project (used by board view)
  statusCounts: companyProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const counts = await ctx.db.issue.groupBy({
        by: ['status'],
        where: {
          project_id: input.projectId,
          project: { company_id: ctx.company.id },
        },
        _count: { id: true },
      });

      return counts.reduce(
        (acc, c) => ({ ...acc, [c.status]: c._count.id }),
        {} as Record<string, number>,
      );
    }),
});
