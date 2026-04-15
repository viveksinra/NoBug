import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { verifyPassword } from 'better-auth/crypto';
import {
  cleanupExpiredCaptures,
  cleanupOldRecordings,
  anonymizeClosedIssues,
} from '@/lib/data-retention';

// ============================================================================
// GDPR Data Retention and Consent Router
// ============================================================================

export const gdprRouter = router({
  // --------------------------------------------------------------------------
  // exportUserData — GDPR Article 20: Data Portability
  // Returns all user data as a JSON object.
  // --------------------------------------------------------------------------
  exportUserData: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const [
      user,
      memberships,
      issuesCreated,
      comments,
      recordings,
      screenshots,
      quickCaptures,
      notifications,
      sessions,
      activityLogs,
      invitationsSent,
    ] = await Promise.all([
      // Profile
      ctx.db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatar_url: true,
          email_verified: true,
          created_at: true,
          updated_at: true,
        },
      }),

      // Company memberships
      ctx.db.member.findMany({
        where: { user_id: userId },
        include: {
          company: {
            select: { id: true, name: true, slug: true },
          },
        },
      }),

      // Issues reported by this user
      ctx.db.issue.findMany({
        where: { reporter_id: userId, reporter_type: 'MEMBER' },
        select: {
          id: true,
          number: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          type: true,
          created_at: true,
          updated_at: true,
          closed_at: true,
          environment_json: true,
          project: { select: { id: true, name: true, key: true } },
        },
      }),

      // Comments authored by user
      ctx.db.issueComment.findMany({
        where: { author_id: userId, author_type: 'MEMBER' },
        select: {
          id: true,
          issue_id: true,
          content: true,
          type: true,
          created_at: true,
        },
      }),

      // Recordings uploaded by user
      ctx.db.recording.findMany({
        where: { uploader_id: userId, uploader_type: 'MEMBER' },
        select: {
          id: true,
          issue_id: true,
          type: true,
          storage_url: true,
          duration_ms: true,
          console_logs_url: true,
          network_logs_url: true,
          environment_json: true,
          created_at: true,
        },
      }),

      // Screenshots uploaded by user
      ctx.db.screenshot.findMany({
        where: { uploader_id: userId },
        select: {
          id: true,
          issue_id: true,
          original_url: true,
          annotated_url: true,
          created_at: true,
        },
      }),

      // Quick captures
      ctx.db.quickCapture.findMany({
        where: { user_id: userId },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          recording_url: true,
          screenshot_url: true,
          environment_json: true,
          created_at: true,
          expires_at: true,
        },
      }),

      // Notifications
      ctx.db.notification.findMany({
        where: { user_id: userId },
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          read: true,
          created_at: true,
        },
      }),

      // Sessions (login history)
      ctx.db.session.findMany({
        where: { user_id: userId },
        select: {
          id: true,
          ip_address: true,
          user_agent: true,
          created_at: true,
          expires_at: true,
        },
      }),

      // Activity logs (user actions)
      ctx.db.activityLog.findMany({
        where: { actor_id: userId, actor_type: 'MEMBER' },
        select: {
          id: true,
          entity_type: true,
          entity_id: true,
          action: true,
          metadata_json: true,
          created_at: true,
        },
      }),

      // Invitations sent
      ctx.db.invitation.findMany({
        where: { invited_by: userId },
        select: {
          id: true,
          email: true,
          role: true,
          created_at: true,
          accepted_at: true,
        },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      memberships,
      issuesCreated,
      comments,
      recordings,
      screenshots,
      quickCaptures,
      notifications,
      sessions,
      activityLogs,
      invitationsSent,
    };
  }),

  // --------------------------------------------------------------------------
  // deleteAccount — GDPR Article 17: Right to Erasure
  // Requires password confirmation. Cascades through all user data.
  // --------------------------------------------------------------------------
  deleteAccount: protectedProcedure
    .input(
      z.object({
        password: z.string().min(1, 'Password is required'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Verify password via Better Auth — check credential account
      const account = await ctx.db.account.findFirst({
        where: {
          user_id: userId,
          provider_id: 'credential',
        },
      });

      if (!account?.password) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No password-based account found. Cannot verify identity.',
        });
      }

      // Verify password using Better Auth's own password utility
      const passwordValid = await verifyPassword({
        hash: account.password,
        password: input.password,
      });

      if (!passwordValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Incorrect password.',
        });
      }

      // Perform cascading deletion in a transaction
      await ctx.db.$transaction(async (tx) => {
        // 1. Anonymize issues reported by this user (don't delete — other people need them)
        await tx.issue.updateMany({
          where: { reporter_id: userId, reporter_type: 'MEMBER' },
          data: { reporter_id: 'DELETED', reporter_type: 'SYSTEM' },
        });

        // 2. Anonymize issue assignments
        await tx.issue.updateMany({
          where: { assignee_id: userId, assignee_type: 'MEMBER' },
          data: { assignee_id: null, assignee_type: null },
        });

        // 3. Anonymize comments
        await tx.issueComment.updateMany({
          where: { author_id: userId, author_type: 'MEMBER' },
          data: { author_id: 'DELETED', author_type: 'SYSTEM' },
        });

        // 4. Delete recordings uploaded by user
        await tx.recording.deleteMany({
          where: { uploader_id: userId, uploader_type: 'MEMBER' },
        });

        // 5. Delete screenshots uploaded by user
        await tx.screenshot.deleteMany({
          where: { uploader_id: userId },
        });

        // 6. Delete quick captures
        await tx.quickCapture.deleteMany({
          where: { user_id: userId },
        });

        // 7. Delete notifications
        await tx.notification.deleteMany({
          where: { user_id: userId },
        });

        // 8. Delete activity logs by user
        await tx.activityLog.deleteMany({
          where: { actor_id: userId, actor_type: 'MEMBER' },
        });

        // 9. Delete memberships
        await tx.member.deleteMany({
          where: { user_id: userId },
        });

        // 10. Delete sessions
        await tx.session.deleteMany({
          where: { user_id: userId },
        });

        // 11. Delete accounts (OAuth + credential)
        await tx.account.deleteMany({
          where: { user_id: userId },
        });

        // 12. Delete the user record
        await tx.user.delete({
          where: { id: userId },
        });
      });

      return { success: true, message: 'Account and all associated data have been deleted.' };
    }),

  // --------------------------------------------------------------------------
  // getRetentionPolicy — Get company data retention settings
  // --------------------------------------------------------------------------
  getRetentionPolicy: requirePermission('manage_settings')
    .query(async ({ ctx }) => {
      const company = ctx.company;
      // Retention policy is stored in a well-known ActivityLog entry
      const policyLog = await ctx.db.activityLog.findFirst({
        where: {
          entity_type: 'COMPANY',
          entity_id: company.id,
          action: 'RETENTION_POLICY_SET',
        },
        orderBy: { created_at: 'desc' },
      });

      const defaultPolicy = {
        recordingRetentionDays: 365,
        autoDeleteExpiredCaptures: true,
        anonymizeClosedIssuesDays: 730, // 2 years
      };

      if (!policyLog?.metadata_json) {
        return defaultPolicy;
      }

      const metadata = policyLog.metadata_json as Record<string, unknown>;
      return {
        recordingRetentionDays: (metadata.recordingRetentionDays as number) ?? defaultPolicy.recordingRetentionDays,
        autoDeleteExpiredCaptures: (metadata.autoDeleteExpiredCaptures as boolean) ?? defaultPolicy.autoDeleteExpiredCaptures,
        anonymizeClosedIssuesDays: (metadata.anonymizeClosedIssuesDays as number) ?? defaultPolicy.anonymizeClosedIssuesDays,
      };
    }),

  // --------------------------------------------------------------------------
  // updateRetentionPolicy — Update company data retention settings
  // --------------------------------------------------------------------------
  updateRetentionPolicy: requirePermission('manage_settings')
    .input(
      z.object({
        recordingRetentionDays: z.number().min(30).max(3650).optional(),
        autoDeleteExpiredCaptures: z.boolean().optional(),
        anonymizeClosedIssuesDays: z.number().min(90).max(3650).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const policy = {
        recordingRetentionDays: input.recordingRetentionDays ?? 365,
        autoDeleteExpiredCaptures: input.autoDeleteExpiredCaptures ?? true,
        anonymizeClosedIssuesDays: input.anonymizeClosedIssuesDays ?? 730,
      };

      await ctx.db.activityLog.create({
        data: {
          entity_type: 'COMPANY',
          entity_id: ctx.company.id,
          actor_id: ctx.user.id,
          actor_type: 'MEMBER',
          action: 'RETENTION_POLICY_SET',
          metadata_json: policy,
        },
      });

      return policy;
    }),

  // --------------------------------------------------------------------------
  // runRetentionCleanup — Manually trigger retention cleanup
  // --------------------------------------------------------------------------
  runRetentionCleanup: requirePermission('manage_settings')
    .mutation(async ({ ctx }) => {
      const companyId = ctx.company.id;

      // Get current retention policy
      const policyLog = await ctx.db.activityLog.findFirst({
        where: {
          entity_type: 'COMPANY',
          entity_id: companyId,
          action: 'RETENTION_POLICY_SET',
        },
        orderBy: { created_at: 'desc' },
      });

      const metadata = (policyLog?.metadata_json ?? {}) as Record<string, unknown>;
      const recordingRetentionDays = (metadata.recordingRetentionDays as number) ?? 365;
      const autoDeleteExpiredCaptures = (metadata.autoDeleteExpiredCaptures as boolean) ?? true;
      const anonymizeClosedIssuesDays = (metadata.anonymizeClosedIssuesDays as number) ?? 730;

      const results = {
        expiredCapturesDeleted: 0,
        oldRecordingsDeleted: 0,
        issuesAnonymized: 0,
      };

      // 1. Clean up expired captures (global — not company-scoped)
      if (autoDeleteExpiredCaptures) {
        results.expiredCapturesDeleted = await cleanupExpiredCaptures(ctx.db);
      }

      // 2. Clean up old recordings for this company
      results.oldRecordingsDeleted = await cleanupOldRecordings(
        ctx.db,
        companyId,
        recordingRetentionDays,
      );

      // 3. Anonymize old closed issues
      results.issuesAnonymized = await anonymizeClosedIssues(
        ctx.db,
        companyId,
        anonymizeClosedIssuesDays,
      );

      // Log the cleanup run
      await ctx.db.activityLog.create({
        data: {
          entity_type: 'COMPANY',
          entity_id: companyId,
          actor_id: ctx.user.id,
          actor_type: 'MEMBER',
          action: 'RETENTION_CLEANUP_RUN',
          metadata_json: results,
        },
      });

      return results;
    }),

  // --------------------------------------------------------------------------
  // getConsentLog — Get consent audit trail for the current user
  // --------------------------------------------------------------------------
  getConsentLog: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const logs = await ctx.db.activityLog.findMany({
        where: {
          actor_id: ctx.user.id,
          actor_type: 'MEMBER',
          action: { in: ['CONSENT_GIVEN', 'CONSENT_REVOKED'] },
          ...(input.cursor ? { created_at: { lt: new Date(input.cursor) } } : {}),
        },
        orderBy: { created_at: 'desc' },
        take: input.limit + 1,
      });

      const hasMore = logs.length > input.limit;
      if (hasMore) logs.pop();

      return {
        data: logs.map((log) => ({
          id: log.id,
          action: log.action,
          consentType: (log.metadata_json as Record<string, unknown>)?.consentType ?? null,
          details: (log.metadata_json as Record<string, unknown>)?.details ?? null,
          createdAt: log.created_at,
        })),
        nextCursor: hasMore ? logs[logs.length - 1]?.created_at.toISOString() : null,
      };
    }),

  // --------------------------------------------------------------------------
  // recordConsent — Record a consent event
  // --------------------------------------------------------------------------
  recordConsent: protectedProcedure
    .input(
      z.object({
        consentType: z.enum([
          'extension_recording',
          'cookie_consent',
          'data_processing',
          'marketing_emails',
          'analytics',
        ]),
        granted: z.boolean(),
        details: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const action = input.granted ? 'CONSENT_GIVEN' : 'CONSENT_REVOKED';

      const log = await ctx.db.activityLog.create({
        data: {
          entity_type: 'USER',
          entity_id: ctx.user.id,
          actor_id: ctx.user.id,
          actor_type: 'MEMBER',
          action,
          metadata_json: {
            consentType: input.consentType,
            granted: input.granted,
            details: input.details ?? null,
            userAgent: undefined, // Could be added from request headers
            timestamp: new Date().toISOString(),
          },
        },
      });

      return {
        id: log.id,
        action: log.action,
        consentType: input.consentType,
        granted: input.granted,
        createdAt: log.created_at,
      };
    }),
});
