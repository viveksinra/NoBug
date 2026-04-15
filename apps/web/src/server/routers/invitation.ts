import { z } from 'zod';
import { randomBytes } from 'crypto';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, companyProcedure, requirePermission } from '../trpc';
import { ROLES } from '@nobug/shared';
import { sendInvitationEmail } from '@/lib/email';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const invitationRouter = router({
  /** Create and send an invitation email */
  create: requirePermission('manage_members')
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(ROLES).default('DEVELOPER'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { email, role } = input;
      const companyId = ctx.company.id;

      // Cannot invite as OWNER
      if (role === 'OWNER') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot invite someone as OWNER',
        });
      }

      // Check if already a member
      const existingMember = await ctx.db.member.findFirst({
        where: {
          company_id: companyId,
          user: { email },
        },
      });

      if (existingMember) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This user is already a member of this company',
        });
      }

      // Check for existing pending invitation
      const existingInvitation = await ctx.db.invitation.findFirst({
        where: {
          company_id: companyId,
          email,
          accepted_at: null,
          expires_at: { gt: new Date() },
        },
      });

      if (existingInvitation) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A pending invitation already exists for this email',
        });
      }

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invitation = await ctx.db.invitation.create({
        data: {
          company_id: companyId,
          email,
          role,
          token,
          invited_by: ctx.user.id,
          expires_at: expiresAt,
        },
      });

      const acceptUrl = `${BASE_URL}/invitations/accept?token=${token}`;

      await sendInvitationEmail(
        email,
        ctx.user.name || ctx.user.email,
        ctx.company.name,
        acceptUrl
      );

      return invitation;
    }),

  /** List pending invitations for a company */
  list: companyProcedure
    .query(async ({ ctx }) => {
      const invitations = await ctx.db.invitation.findMany({
        where: {
          company_id: ctx.company.id,
        },
        include: {
          inviter: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      return invitations;
    }),

  /** Revoke/cancel a pending invitation */
  revoke: requirePermission('manage_members')
    .input(
      z.object({
        invitationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.invitation.findFirst({
        where: {
          id: input.invitationId,
          company_id: ctx.company.id,
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      if (invitation.accepted_at) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot revoke an already accepted invitation',
        });
      }

      await ctx.db.invitation.delete({
        where: { id: invitation.id },
      });

      return { success: true };
    }),

  /** Accept an invitation using the token */
  accept: protectedProcedure
    .input(
      z.object({
        token: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.invitation.findUnique({
        where: { token: input.token },
        include: { company: true },
      });

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found or invalid token',
        });
      }

      if (invitation.accepted_at) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This invitation has already been accepted',
        });
      }

      if (invitation.expires_at < new Date()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This invitation has expired',
        });
      }

      // Check if user is already a member
      const existingMember = await ctx.db.member.findUnique({
        where: {
          company_id_user_id: {
            company_id: invitation.company_id,
            user_id: ctx.user.id,
          },
        },
      });

      if (existingMember) {
        // Mark invitation as accepted but don't create duplicate member
        await ctx.db.invitation.update({
          where: { id: invitation.id },
          data: { accepted_at: new Date() },
        });

        return { company: invitation.company, alreadyMember: true };
      }

      // Create member and mark invitation accepted in a transaction
      const result = await ctx.db.$transaction(async (tx) => {
        await tx.member.create({
          data: {
            company_id: invitation.company_id,
            user_id: ctx.user.id,
            role: invitation.role,
            joined_at: new Date(),
          },
        });

        await tx.invitation.update({
          where: { id: invitation.id },
          data: { accepted_at: new Date() },
        });

        return { company: invitation.company, alreadyMember: false };
      });

      return result;
    }),

  /** Resend the invitation email */
  resend: requirePermission('manage_members')
    .input(
      z.object({
        invitationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.invitation.findFirst({
        where: {
          id: input.invitationId,
          company_id: ctx.company.id,
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      if (invitation.accepted_at) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot resend an already accepted invitation',
        });
      }

      // Extend expiration on resend
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await ctx.db.invitation.update({
        where: { id: invitation.id },
        data: { expires_at: newExpiresAt },
      });

      const acceptUrl = `${BASE_URL}/invitations/accept?token=${invitation.token}`;

      await sendInvitationEmail(
        invitation.email,
        ctx.user.name || ctx.user.email,
        ctx.company.name,
        acceptUrl
      );

      return { success: true };
    }),
});
