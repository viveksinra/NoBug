import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { auth } from '@/lib/auth';
import { db } from '@nobug/db';
import { headers } from 'next/headers';

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
