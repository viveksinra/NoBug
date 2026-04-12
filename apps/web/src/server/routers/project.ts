import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, companyProcedure, requirePermission } from '../trpc';
import { createProjectSchema, updateProjectSchema } from '@nobug/shared';

function generateKey(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10) || 'PRJ';
}

export const projectRouter = router({
  create: requirePermission('manage_projects')
    .input(createProjectSchema)
    .mutation(async ({ ctx, input }) => {
      // Check key uniqueness within company
      const existing = await ctx.db.project.findUnique({
        where: {
          company_id_key: {
            company_id: ctx.company.id,
            key: input.key,
          },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Project key "${input.key}" already exists in this company`,
        });
      }

      return ctx.db.project.create({
        data: {
          company_id: ctx.company.id,
          name: input.name,
          key: input.key,
          description: input.description,
          settings_json: {
            issue_counter: 0,
          },
        },
      });
    }),

  getByKey: companyProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: {
          company_id_key: {
            company_id: ctx.company.id,
            key: input.key,
          },
        },
        include: {
          _count: { select: { issues: true } },
        },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      return project;
    }),

  getById: companyProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findFirst({
        where: {
          id: input.projectId,
          company_id: ctx.company.id,
        },
        include: {
          _count: { select: { issues: true } },
        },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      return project;
    }),

  list: companyProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const skip = (page - 1) * limit;

      const where = {
        company_id: ctx.company.id,
        ...(input?.search
          ? { name: { contains: input.search, mode: 'insensitive' as const } }
          : {}),
      };

      const [projects, total] = await Promise.all([
        ctx.db.project.findMany({
          where,
          include: {
            _count: { select: { issues: true } },
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: limit,
        }),
        ctx.db.project.count({ where }),
      ]);

      return {
        data: projects,
        pagination: {
          total,
          page,
          limit,
          has_more: skip + projects.length < total,
        },
      };
    }),

  update: requirePermission('manage_projects')
    .input(
      z.object({
        projectId: z.string(),
        data: updateProjectSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, company_id: ctx.company.id },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      return ctx.db.project.update({
        where: { id: input.projectId },
        data: input.data,
      });
    }),

  delete: requirePermission('manage_projects')
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, company_id: ctx.company.id },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      // Soft delete — update settings to mark as archived
      return ctx.db.project.update({
        where: { id: input.projectId },
        data: {
          settings_json: {
            ...(project.settings_json as Record<string, unknown>),
            archived: true,
            archived_at: new Date().toISOString(),
          },
        },
      });
    }),

  suggestKey: companyProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ ctx, input }) => {
      const base = generateKey(input.name);
      let key = base;
      let counter = 1;

      while (
        await ctx.db.project.findUnique({
          where: { company_id_key: { company_id: ctx.company.id, key } },
        })
      ) {
        key = `${base}${counter}`;
        counter++;
      }

      return { key };
    }),
});
