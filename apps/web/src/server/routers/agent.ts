import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, companyProcedure, requirePermission } from '../trpc';
import { AGENT_TYPES, AGENT_STATUSES } from '@nobug/shared';

const createAgentInput = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(AGENT_TYPES),
  avatar_url: z.string().url().nullable().optional(),
  config_json: z
    .object({
      model: z.string().default('claude-sonnet-4-6'),
      repo_url: z.string().optional(),
      target_url: z.string().optional(),
      max_retries: z.number().min(0).max(10).default(3),
      auto_assign: z.boolean().default(false),
      capabilities: z.array(z.string()).default([]),
    })
    .default({}),
});

export const agentRouter = router({
  create: requirePermission('manage_agents')
    .input(createAgentInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.agent.create({
        data: {
          company_id: ctx.company.id,
          name: input.name,
          type: input.type,
          avatar_url: input.avatar_url ?? null,
          config_json: input.config_json,
          created_by: ctx.user.id,
        },
      });
    }),

  getById: companyProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const agent = await ctx.db.agent.findFirst({
        where: { id: input.agentId, company_id: ctx.company.id },
        include: {
          _count: { select: { agent_tasks: true } },
        },
      });

      if (!agent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
      }

      return agent;
    }),

  list: companyProcedure
    .input(
      z
        .object({
          status: z.enum(AGENT_STATUSES).optional(),
          type: z.enum(AGENT_TYPES).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.agent.findMany({
        where: {
          company_id: ctx.company.id,
          ...(input?.status ? { status: input.status } : {}),
          ...(input?.type ? { type: input.type } : {}),
        },
        include: {
          _count: {
            select: {
              agent_tasks: { where: { status: 'QUEUED' } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });
    }),

  // List assignable entities: both human members and active agents
  listAssignable: companyProcedure.query(async ({ ctx }) => {
    const [members, agents] = await Promise.all([
      ctx.db.member.findMany({
        where: { company_id: ctx.company.id },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      }),
      ctx.db.agent.findMany({
        where: { company_id: ctx.company.id, status: 'ACTIVE' },
        select: { id: true, name: true, type: true, avatar_url: true },
      }),
    ]);

    return {
      members: members.map((m) => ({
        id: m.id,
        type: 'MEMBER' as const,
        name: m.user.name ?? m.user.email,
        email: m.user.email,
        avatar: m.user.image,
        role: m.role,
      })),
      agents: agents.map((a) => ({
        id: a.id,
        type: 'AGENT' as const,
        name: a.name,
        agentType: a.type,
        avatar: a.avatar_url,
      })),
    };
  }),

  update: requirePermission('manage_agents')
    .input(
      z.object({
        agentId: z.string(),
        data: z.object({
          name: z.string().min(1).max(100).optional(),
          status: z.enum(AGENT_STATUSES).optional(),
          avatar_url: z.string().url().nullable().optional(),
          config_json: z.record(z.unknown()).optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agent = await ctx.db.agent.findFirst({
        where: { id: input.agentId, company_id: ctx.company.id },
      });

      if (!agent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
      }

      return ctx.db.agent.update({
        where: { id: input.agentId },
        data: input.data,
      });
    }),

  // Agent task queue
  listTasks: companyProcedure
    .input(
      z
        .object({
          agentId: z.string().optional(),
          status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
          limit: z.number().min(1).max(100).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.agentTask.findMany({
        where: {
          company_id: ctx.company.id,
          ...(input?.agentId ? { agent_id: input.agentId } : {}),
          ...(input?.status ? { status: input.status } : {}),
        },
        include: {
          agent: { select: { name: true, type: true } },
        },
        orderBy: { created_at: 'desc' },
        take: input?.limit ?? 20,
      });
    }),
});
