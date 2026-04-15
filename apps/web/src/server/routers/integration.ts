import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@nobug/db';
import { router, companyProcedure, requirePermission } from '../trpc';
import { INTEGRATION_PROVIDERS } from '@nobug/shared';
import { getAdapter, hasAdapter, getAvailableProviders } from '../integrations';

// ============================================================================
// Integration Router — CRUD + sync for external integrations
// ============================================================================

const integrationProviderEnum = z.enum(INTEGRATION_PROVIDERS);

export const integrationRouter = router({
  // ─── Create Integration ────────────────────────────────────────

  create: requirePermission('manage_integrations')
    .input(
      z.object({
        provider: integrationProviderEnum,
        projectId: z.string().optional(),
        configJson: z.record(z.unknown()).default({}),
        authJson: z.record(z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // If projectId provided, verify it belongs to the company
      if (input.projectId) {
        const project = await ctx.db.project.findFirst({
          where: { id: input.projectId, company_id: ctx.company.id },
        });
        if (!project) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
      }

      // Check for existing integration with same provider + project
      const existing = await ctx.db.integration.findFirst({
        where: {
          company_id: ctx.company.id,
          provider: input.provider,
          project_id: input.projectId ?? null,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `An integration for ${input.provider} already exists${input.projectId ? ' on this project' : ' at the company level'}.`,
        });
      }

      const integration = await ctx.db.integration.create({
        data: {
          company_id: ctx.company.id,
          provider: input.provider,
          project_id: input.projectId ?? null,
          config_json: input.configJson as Prisma.InputJsonValue,
          auth_json: input.authJson as Prisma.InputJsonValue,
          created_by: ctx.user.id,
        },
      });

      return integration;
    }),

  // ─── List Integrations ─────────────────────────────────────────

  list: companyProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        company_id: ctx.company.id,
      };

      if (input.projectId) {
        where.project_id = input.projectId;
      }

      const integrations = await ctx.db.integration.findMany({
        where,
        include: {
          project: { select: { id: true, name: true, key: true } },
          creator: { select: { id: true, name: true, email: true } },
          _count: { select: { external_refs: true } },
        },
        orderBy: { created_at: 'desc' },
      });

      return integrations;
    }),

  // ─── Get Integration by ID ─────────────────────────────────────

  getById: companyProcedure
    .input(z.object({ integrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const integration = await ctx.db.integration.findFirst({
        where: { id: input.integrationId, company_id: ctx.company.id },
        include: {
          project: { select: { id: true, name: true, key: true } },
          creator: { select: { id: true, name: true, email: true } },
          external_refs: {
            orderBy: { last_synced_at: 'desc' },
            take: 20,
            include: {
              issue: { select: { id: true, title: true, number: true } },
            },
          },
        },
      });

      if (!integration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integration not found' });
      }

      return integration;
    }),

  // ─── Test Connection ───────────────────────────────────────────

  testConnection: requirePermission('manage_integrations')
    .input(z.object({ integrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const integration = await ctx.db.integration.findFirst({
        where: { id: input.integrationId, company_id: ctx.company.id },
      });

      if (!integration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integration not found' });
      }

      if (!hasAdapter(integration.provider)) {
        return {
          ok: false,
          message: `No adapter available for provider: ${integration.provider}`,
        };
      }

      const adapter = getAdapter(integration.provider)!;

      try {
        await adapter.connect(
          integration.config_json as Record<string, unknown>,
          integration.auth_json as Record<string, unknown>,
        );
        const result = await adapter.testConnection();
        await adapter.disconnect();
        return result;
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : 'Unknown error testing connection',
        };
      }
    }),

  // ─── Delete Integration ────────────────────────────────────────

  delete: requirePermission('manage_integrations')
    .input(z.object({ integrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const integration = await ctx.db.integration.findFirst({
        where: { id: input.integrationId, company_id: ctx.company.id },
      });

      if (!integration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integration not found' });
      }

      // Delete cascades to external_refs via Prisma relation
      await ctx.db.integration.delete({
        where: { id: integration.id },
      });

      return { success: true };
    }),

  // ─── Toggle Enabled ────────────────────────────────────────────

  toggleEnabled: requirePermission('manage_integrations')
    .input(
      z.object({
        integrationId: z.string(),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const integration = await ctx.db.integration.findFirst({
        where: { id: input.integrationId, company_id: ctx.company.id },
      });

      if (!integration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integration not found' });
      }

      return ctx.db.integration.update({
        where: { id: integration.id },
        data: { sync_enabled: input.enabled },
      });
    }),

  // ─── Sync Issue ────────────────────────────────────────────────

  syncIssue: requirePermission('manage_integrations')
    .input(
      z.object({
        integrationId: z.string(),
        issueId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const integration = await ctx.db.integration.findFirst({
        where: { id: input.integrationId, company_id: ctx.company.id },
      });

      if (!integration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integration not found' });
      }

      if (!integration.sync_enabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Integration sync is disabled',
        });
      }

      // Verify issue belongs to the company
      const issue = await ctx.db.issue.findFirst({
        where: {
          id: input.issueId,
          project: { company_id: ctx.company.id },
        },
        include: {
          labels: { include: { label: true } },
        },
      });

      if (!issue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      }

      if (!hasAdapter(integration.provider)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No adapter available for provider: ${integration.provider}`,
        });
      }

      const adapter = getAdapter(integration.provider)!;

      try {
        await adapter.connect(
          integration.config_json as Record<string, unknown>,
          integration.auth_json as Record<string, unknown>,
        );

        // Check if we already have an external ref for this issue
        const existingRef = await ctx.db.externalRef.findFirst({
          where: {
            integration_id: integration.id,
            issue_id: issue.id,
          },
        });

        const issueSyncData = {
          issueId: issue.id,
          title: issue.title,
          description: issue.description ?? undefined,
          status: issue.status,
          priority: issue.priority,
          type: issue.type,
          labels: issue.labels.map((il) => il.label.name),
        };

        if (existingRef) {
          // Update existing — sync status
          await adapter.syncIssueStatus(existingRef.external_id, issue.status);

          await ctx.db.externalRef.update({
            where: { id: existingRef.id },
            data: {
              sync_status: 'SYNCED',
              last_synced_at: new Date(),
            },
          });

          await adapter.disconnect();

          return {
            action: 'updated',
            externalId: existingRef.external_id,
            externalUrl: existingRef.external_url,
          };
        } else {
          // Create new external issue
          const externalRef = await adapter.pushIssue(issueSyncData);

          await ctx.db.externalRef.create({
            data: {
              issue_id: issue.id,
              integration_id: integration.id,
              external_id: externalRef.externalId,
              external_url: externalRef.externalUrl,
              sync_status: 'SYNCED',
              last_synced_at: new Date(),
            },
          });

          await adapter.disconnect();

          return {
            action: 'created',
            externalId: externalRef.externalId,
            externalUrl: externalRef.externalUrl,
          };
        }
      } catch (error) {
        // Mark sync as errored if we have an existing ref
        const existingRef = await ctx.db.externalRef.findFirst({
          where: {
            integration_id: integration.id,
            issue_id: issue.id,
          },
        });

        if (existingRef) {
          await ctx.db.externalRef.update({
            where: { id: existingRef.id },
            data: { sync_status: 'ERROR' },
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Unknown error syncing issue',
        });
      }
    }),

  // ─── Available Providers ───────────────────────────────────────

  availableProviders: companyProcedure.query(() => {
    return {
      all: INTEGRATION_PROVIDERS,
      implemented: getAvailableProviders(),
    };
  }),
});
