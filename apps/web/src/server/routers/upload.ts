import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@nobug/db';
import { router, protectedProcedure } from '../trpc';
import {
  MAX_RECORDING_SIZE_BYTES,
  MAX_SCREENSHOT_SIZE_BYTES,
} from '@nobug/shared';
import {
  generateUploadUrl,
  generateDownloadUrl,
  isS3Configured,
  type UploadType,
} from '@/lib/s3';

// ---------------------------------------------------------------------------
// Shared types / helpers
// ---------------------------------------------------------------------------

const uploadTypeEnum = z.enum([
  'recordings',
  'console-logs',
  'network-logs',
  'screenshots',
  'annotated-screenshots',
]);

/** Map upload type to max size in bytes. */
function getMaxSize(type: UploadType): number {
  switch (type) {
    case 'screenshots':
    case 'annotated-screenshots':
      return MAX_SCREENSHOT_SIZE_BYTES;
    case 'recordings':
    case 'console-logs':
    case 'network-logs':
      return MAX_RECORDING_SIZE_BYTES;
  }
}

/** Derive file extension from content type. */
function extensionFromContentType(contentType: string): string {
  if (contentType.startsWith('image/png')) return 'png';
  if (contentType.startsWith('image/jpeg')) return 'jpg';
  if (contentType.startsWith('image/webp')) return 'webp';
  if (contentType.includes('json')) return 'json';
  return 'bin';
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const uploadRouter = router({
  /**
   * Generate a presigned upload URL.
   * Client uploads directly to S3 using this URL.
   */
  requestUploadUrl: protectedProcedure
    .input(
      z.object({
        type: uploadTypeEnum,
        filename: z.string().min(1),
        contentType: z.string().min(1),
        size: z.number().positive(),
        companyId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isS3Configured()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'S3 is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME.',
        });
      }

      // Validate size
      const maxSize = getMaxSize(input.type);
      if (input.size > maxSize) {
        throw new TRPCError({
          code: 'PAYLOAD_TOO_LARGE',
          message: `File too large. Max ${Math.round(maxSize / (1024 * 1024))}MB for ${input.type}.`,
        });
      }

      const ext = extensionFromContentType(input.contentType);
      const fileId = crypto.randomUUID();

      const result = await generateUploadUrl({
        companyId: input.companyId,
        type: input.type,
        fileId,
        extension: ext,
        contentType: input.contentType,
      });

      if (!result) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate upload URL',
        });
      }

      // Pre-generate a download URL for convenience
      const downloadUrl = await generateDownloadUrl(result.key);

      return {
        uploadUrl: result.uploadUrl,
        key: result.key,
        downloadUrl,
      };
    }),

  /**
   * Confirm an upload completed and create a DB record.
   */
  confirmUpload: protectedProcedure
    .input(
      z.object({
        type: uploadTypeEnum,
        key: z.string().min(1),
        issueId: z.string().optional(),
        quickCaptureId: z.string().optional(),
        durationMs: z.number().optional(),
        environmentJson: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { type, key, issueId, quickCaptureId, durationMs, environmentJson } = input;

      // Create the appropriate DB record
      if (type === 'recordings') {
        const recording = await ctx.db.recording.create({
          data: {
            issue_id: issueId ?? null,
            uploader_id: ctx.user.id,
            uploader_type: 'MEMBER',
            type: 'RRWEB',
            storage_url: key,
            duration_ms: durationMs ?? null,
            environment_json: (environmentJson as Prisma.InputJsonValue) ?? undefined,
          },
        });

        // If this is for a QuickCapture, update the recording_url
        if (quickCaptureId) {
          await ctx.db.quickCapture.update({
            where: { id: quickCaptureId },
            data: { recording_url: key },
          });
        }

        return { id: recording.id, type: 'recording' as const, key };
      }

      if (type === 'screenshots' || type === 'annotated-screenshots') {
        const screenshot = await ctx.db.screenshot.create({
          data: {
            issue_id: issueId ?? null,
            uploader_id: ctx.user.id,
            ...(type === 'annotated-screenshots'
              ? { original_url: '', annotated_url: key }
              : { original_url: key }),
          },
        });

        // If this is for a QuickCapture, update the screenshot_url
        if (quickCaptureId) {
          await ctx.db.quickCapture.update({
            where: { id: quickCaptureId },
            data: { screenshot_url: key },
          });
        }

        return { id: screenshot.id, type: 'screenshot' as const, key };
      }

      if (type === 'console-logs') {
        // Console logs are stored as a URL on a Recording or QuickCapture
        if (quickCaptureId) {
          await ctx.db.quickCapture.update({
            where: { id: quickCaptureId },
            data: { console_logs_url: key },
          });
        }
        // If an issueId is provided, update the latest recording
        if (issueId) {
          const recording = await ctx.db.recording.findFirst({
            where: { issue_id: issueId },
            orderBy: { created_at: 'desc' },
          });
          if (recording) {
            await ctx.db.recording.update({
              where: { id: recording.id },
              data: { console_logs_url: key },
            });
          }
        }

        return { id: null, type: 'console-logs' as const, key };
      }

      if (type === 'network-logs') {
        if (quickCaptureId) {
          await ctx.db.quickCapture.update({
            where: { id: quickCaptureId },
            data: { network_logs_url: key },
          });
        }
        if (issueId) {
          const recording = await ctx.db.recording.findFirst({
            where: { issue_id: issueId },
            orderBy: { created_at: 'desc' },
          });
          if (recording) {
            await ctx.db.recording.update({
              where: { id: recording.id },
              data: { network_logs_url: key },
            });
          }
        }

        return { id: null, type: 'network-logs' as const, key };
      }

      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Unknown upload type: ${type}`,
      });
    }),

  /**
   * Get a fresh presigned download URL for a stored file.
   */
  getDownloadUrl: protectedProcedure
    .input(z.object({ key: z.string().min(1) }))
    .query(async ({ input }) => {
      if (!isS3Configured()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'S3 is not configured.',
        });
      }

      const url = await generateDownloadUrl(input.key);
      if (!url) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate download URL',
        });
      }

      return { downloadUrl: url, key: input.key };
    }),
});
