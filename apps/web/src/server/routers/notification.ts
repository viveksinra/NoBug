import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

export const notificationRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().default(false),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const notifications = await ctx.db.notification.findMany({
        where: {
          user_id: ctx.user.id,
          ...(input.unreadOnly ? { read: false } : {}),
          ...(input.cursor ? { created_at: { lt: new Date(input.cursor) } } : {}),
        },
        orderBy: { created_at: 'desc' },
        take: input.limit + 1,
      });

      const hasMore = notifications.length > input.limit;
      if (hasMore) notifications.pop();

      return {
        data: notifications,
        nextCursor: hasMore ? notifications[notifications.length - 1]?.created_at.toISOString() : null,
      };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.count({
      where: { user_id: ctx.user.id, read: false },
    });
  }),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.notification.update({
        where: { id: input.notificationId, user_id: ctx.user.id },
        data: { read: true },
      });
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.db.notification.updateMany({
      where: { user_id: ctx.user.id, read: false },
      data: { read: true },
    });
  }),
});

// Helper to create notifications (called from other routers/services)
export async function createNotification(
  db: any,
  params: {
    userId: string;
    type: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
  },
) {
  return db.notification.create({
    data: {
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
    },
  });
}
