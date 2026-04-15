import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { randomBytes, createHash } from 'crypto';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  QUICK_CAPTURE_ANON_EXPIRY_HOURS,
  QUICK_CAPTURE_FREE_EXPIRY_DAYS,
} from '@nobug/shared';

function generateSlug(): string {
  return randomBytes(6).toString('base64url'); // 8-char URL-safe slug
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export const quickCaptureRouter = router({
  /**
   * Create a Quick Capture — public (anonymous allowed).
   *
   * For V1, recording/console/network data is stored as JSON in the DB.
   * S3 upload pipeline (T-031) will replace this with presigned URLs.
   */
  create: publicProcedure
    .input(
      z.object({
        title: z.string().max(200).optional(),
        description: z.string().max(5000).optional(),
        password: z.string().min(4).max(128).optional(),
        environment_json: z.record(z.unknown()).optional(),
        // Data URLs for S3 — for now stored as temporary JSON refs
        // Actual S3 integration comes in T-031
        recording_data: z.unknown().optional(),
        console_logs_data: z.unknown().optional(),
        network_logs_data: z.unknown().optional(),
        screenshot_data_url: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id ?? null;

      // Determine expiry based on auth state
      const expiresAt = !userId
        ? new Date(Date.now() + QUICK_CAPTURE_ANON_EXPIRY_HOURS * 60 * 60 * 1000)
        : new Date(Date.now() + QUICK_CAPTURE_FREE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      const slug = generateSlug();
      const passwordHash = input.password
        ? hashPassword(input.password)
        : null;

      const capture = await ctx.db.quickCapture.create({
        data: {
          slug,
          user_id: userId,
          title: input.title || null,
          description: input.description || null,
          environment_json: (input.environment_json as any) ?? undefined,
          password_hash: passwordHash,
          expires_at: expiresAt,
          // S3 URLs — null for now, will be set after S3 upload in T-031
          recording_url: null,
          console_logs_url: null,
          network_logs_url: null,
          screenshot_url: null,
        },
      });

      return {
        id: capture.id,
        slug: capture.slug,
        expires_at: capture.expires_at,
        share_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/b/${slug}`,
      };
    }),

  /** Get a Quick Capture by slug — public (for viewer) */
  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        password: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const capture = await ctx.db.quickCapture.findUnique({
        where: { slug: input.slug },
      });

      if (!capture) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Capture not found' });
      }

      // Check expiry
      if (capture.expires_at && capture.expires_at < new Date()) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Capture has expired' });
      }

      // Check password
      if (capture.password_hash) {
        if (!input.password) {
          return { requiresPassword: true, capture: null };
        }
        if (hashPassword(input.password) !== capture.password_hash) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Incorrect password' });
        }
      }

      // Increment view count (fire and forget)
      ctx.db.quickCapture
        .update({
          where: { id: capture.id },
          data: { view_count: { increment: 1 } },
        })
        .catch(() => {});

      return {
        requiresPassword: false,
        capture: {
          id: capture.id,
          slug: capture.slug,
          title: capture.title,
          description: capture.description,
          recording_url: capture.recording_url,
          console_logs_url: capture.console_logs_url,
          network_logs_url: capture.network_logs_url,
          screenshot_url: capture.screenshot_url,
          environment_json: capture.environment_json,
          view_count: capture.view_count + 1,
          expires_at: capture.expires_at,
          created_at: capture.created_at,
        },
      };
    }),

  /** List user's Quick Captures */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const captures = await ctx.db.quickCapture.findMany({
        where: { user_id: ctx.user.id },
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
        },
      });

      const hasMore = captures.length > input.limit;
      if (hasMore) captures.pop();

      return {
        captures,
        nextCursor: hasMore ? captures[captures.length - 1]?.id : null,
      };
    }),
});
