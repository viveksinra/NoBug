import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@nobug/db';
import { headers } from 'next/headers';
import { hasPermission, type Permission, type Role } from '@nobug/shared';

export type Context = {
  db: typeof db;
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
};

export async function createContext(): Promise<Context> {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  return {
    db,
    session,
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Authenticated user — no company context
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      user: ctx.session.user,
    },
  });
});

// Company-scoped procedure — validates membership and provides company + role context.
// Input must include { companyId: string }.
export const companyProcedure = protectedProcedure
  .input(z.object({ companyId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    const member = await ctx.db.member.findUnique({
      where: {
        company_id_user_id: {
          company_id: input.companyId,
          user_id: ctx.user.id,
        },
      },
      include: { company: true },
    });

    if (!member) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You are not a member of this company',
      });
    }

    return next({
      ctx: {
        ...ctx,
        company: member.company,
        member,
        role: member.role as Role,
      },
    });
  });

// Factory: creates a procedure that requires a specific permission in the current company.
export function requirePermission(...permissions: Permission[]) {
  return companyProcedure.use(async ({ ctx, next }) => {
    for (const permission of permissions) {
      if (!hasPermission(ctx.role, permission)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Missing permission: ${permission}. Your role (${ctx.role}) does not have access.`,
        });
      }
    }
    return next({ ctx });
  });
}
