import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { createCompanySchema, updateCompanySchema } from '@nobug/shared';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export const companyRouter = router({
  create: protectedProcedure.input(createCompanySchema).mutation(async ({ ctx, input }) => {
    // Check slug uniqueness
    const existing = await ctx.db.company.findUnique({ where: { slug: input.slug } });
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Company slug already taken' });
    }

    // Create company + owner membership in a transaction
    const company = await ctx.db.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: input.name,
          slug: input.slug,
        },
      });

      await tx.member.create({
        data: {
          company_id: company.id,
          user_id: ctx.user.id,
          role: 'OWNER',
          joined_at: new Date(),
        },
      });

      return company;
    });

    return company;
  }),

  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const company = await ctx.db.company.findUnique({
        where: { slug: input.slug },
        include: {
          members: {
            where: { user_id: ctx.user.id },
            select: { role: true, id: true },
          },
          _count: { select: { members: true, projects: true } },
        },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      if (company.members.length === 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this company' });
      }

      return {
        ...company,
        currentUserRole: company.members[0].role,
        currentMemberId: company.members[0].id,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const company = await ctx.db.company.findUnique({
        where: { id: input.id },
        include: {
          members: {
            where: { user_id: ctx.user.id },
            select: { role: true },
          },
        },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      if (company.members.length === 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this company' });
      }

      return { ...company, currentUserRole: company.members[0].role };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.member.findMany({
      where: { user_id: ctx.user.id },
      include: {
        company: {
          include: {
            _count: { select: { members: true, projects: true } },
          },
        },
      },
      orderBy: { joined_at: 'desc' },
    });

    return memberships.map((m) => ({
      ...m.company,
      role: m.role,
      memberId: m.id,
    }));
  }),

  update: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        data: updateCompanySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user is Owner or Admin
      const member = await ctx.db.member.findUnique({
        where: {
          company_id_user_id: {
            company_id: input.companyId,
            user_id: ctx.user.id,
          },
        },
      });

      if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only Owner or Admin can update company' });
      }

      // Check slug uniqueness if changing
      if (input.data.slug) {
        const existing = await ctx.db.company.findUnique({
          where: { slug: input.data.slug },
        });
        if (existing && existing.id !== input.companyId) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Company slug already taken' });
        }
      }

      return ctx.db.company.update({
        where: { id: input.companyId },
        data: input.data,
      });
    }),

  suggestSlug: protectedProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ ctx, input }) => {
      const base = slugify(input.name);
      let slug = base;
      let counter = 1;

      while (await ctx.db.company.findUnique({ where: { slug } })) {
        slug = `${base}-${counter}`;
        counter++;
      }

      return { slug };
    }),
});
