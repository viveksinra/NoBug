import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'crypto';
import type { Prisma } from '@nobug/db';
import { router, companyProcedure, requirePermission } from '../trpc';
import {
  sendWebhook,
  buildWebhookPayload,
  WEBHOOK_EVENTS,
  type DeliveryResult,
} from '@/lib/webhook-sender';

// ============================================================================
// Webhook Router — CRUD for outbound webhooks + delivery log
// ============================================================================

const webhookEventSchema = z.enum(WEBHOOK_EVENTS);

/**
 * Helper: extract webhook config from an Integration record.
 * Webhook integrations store their config in config_json:
 * {
 *   url: string,
 *   secret: string,
 *   events: string[],
 *   enabled: boolean,
 *   deliveries: DeliveryLogEntry[],
 * }
 */
interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  deliveries: DeliveryLogEntry[];
}

interface DeliveryLogEntry {
  id: string;
  event: string;
  url: string;
  success: boolean;
  status_code: number | null;
  duration_ms: number;
  attempts: number;
  delivered_at: string;
}

function parseWebhookConfig(configJson: unknown): WebhookConfig {
  const config = configJson as Record<string, unknown>;
  return {
    url: (config.url as string) ?? '',
    secret: (config.secret as string) ?? '',
    events: (config.events as string[]) ?? [],
    enabled: config.enabled !== false,
    deliveries: (config.deliveries as DeliveryLogEntry[]) ?? [],
  };
}

function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

export const webhookRouter = router({
  // ─── Create Webhook ──────────────────────────────────────────
  create: requirePermission('manage_integrations')
    .input(
      z.object({
        url: z.string().url(),
        events: z.array(webhookEventSchema).min(1),
        secret: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const secret = input.secret || generateWebhookSecret();

      const config: WebhookConfig = {
        url: input.url,
        secret,
        events: input.events,
        enabled: true,
        deliveries: [],
      };

      const integration = await ctx.db.integration.create({
        data: {
          company_id: ctx.company.id,
          provider: 'WEBHOOK',
          config_json: config as unknown as Prisma.InputJsonValue,
          auth_json: {} as Prisma.InputJsonValue,
          created_by: ctx.user.id,
        },
      });

      return {
        id: integration.id,
        url: config.url,
        events: config.events,
        enabled: config.enabled,
        secret, // Show secret only at creation time
        created_at: integration.created_at,
      };
    }),

  // ─── List Webhooks ───────────────────────────────────────────
  list: companyProcedure.query(async ({ ctx }) => {
    const integrations = await ctx.db.integration.findMany({
      where: {
        company_id: ctx.company.id,
        provider: 'WEBHOOK',
      },
      orderBy: { created_at: 'desc' },
    });

    return integrations.map((i) => {
      const config = parseWebhookConfig(i.config_json);
      return {
        id: i.id,
        url: config.url,
        events: config.events,
        enabled: config.enabled,
        created_at: i.created_at,
        updated_at: i.updated_at,
        delivery_count: config.deliveries.length,
      };
    });
  }),

  // ─── Update Webhook ──────────────────────────────────────────
  update: requirePermission('manage_integrations')
    .input(
      z.object({
        webhookId: z.string(),
        url: z.string().url().optional(),
        events: z.array(webhookEventSchema).min(1).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.webhookId,
          company_id: ctx.company.id,
          provider: 'WEBHOOK',
        },
      });

      if (!integration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Webhook not found' });
      }

      const config = parseWebhookConfig(integration.config_json);

      if (input.url !== undefined) config.url = input.url;
      if (input.events !== undefined) config.events = input.events;
      if (input.enabled !== undefined) config.enabled = input.enabled;

      const updated = await ctx.db.integration.update({
        where: { id: integration.id },
        data: {
          config_json: config as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        id: updated.id,
        url: config.url,
        events: config.events,
        enabled: config.enabled,
        updated_at: updated.updated_at,
      };
    }),

  // ─── Delete Webhook ──────────────────────────────────────────
  delete: requirePermission('manage_integrations')
    .input(z.object({ webhookId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.webhookId,
          company_id: ctx.company.id,
          provider: 'WEBHOOK',
        },
      });

      if (!integration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Webhook not found' });
      }

      await ctx.db.integration.delete({
        where: { id: integration.id },
      });

      return { success: true };
    }),

  // ─── Test Webhook ────────────────────────────────────────────
  test: requirePermission('manage_integrations')
    .input(z.object({ webhookId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.webhookId,
          company_id: ctx.company.id,
          provider: 'WEBHOOK',
        },
      });

      if (!integration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Webhook not found' });
      }

      const config = parseWebhookConfig(integration.config_json);

      const payload = buildWebhookPayload('test.ping', {
        webhook_id: integration.id,
        company_id: ctx.company.id,
        message: 'This is a test webhook delivery from NoBug.',
      });

      const result: DeliveryResult = await sendWebhook(
        config.url,
        payload,
        config.secret,
      );

      // Log the delivery
      const deliveryEntry: DeliveryLogEntry = {
        id: randomBytes(8).toString('hex'),
        event: 'test.ping',
        url: config.url,
        success: result.success,
        status_code: result.attempts[result.attempts.length - 1]?.status_code ?? null,
        duration_ms: result.total_duration_ms,
        attempts: result.attempts.length,
        delivered_at: new Date().toISOString(),
      };

      // Keep last 50 deliveries
      config.deliveries = [deliveryEntry, ...config.deliveries].slice(0, 50);

      await ctx.db.integration.update({
        where: { id: integration.id },
        data: {
          config_json: config as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        success: result.success,
        attempts: result.attempts,
        total_duration_ms: result.total_duration_ms,
      };
    }),

  // ─── List Deliveries ─────────────────────────────────────────
  listDeliveries: companyProcedure
    .input(
      z.object({
        webhookId: z.string(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.webhookId,
          company_id: ctx.company.id,
          provider: 'WEBHOOK',
        },
      });

      if (!integration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Webhook not found' });
      }

      const config = parseWebhookConfig(integration.config_json);

      return {
        deliveries: config.deliveries.slice(0, input.limit),
        total: config.deliveries.length,
      };
    }),
});

// ============================================================================
// Exported helper: dispatch webhooks for a given event to all subscribed
// webhooks in a company. Fire-and-forget — errors are logged but not thrown.
// ============================================================================

export async function dispatchWebhooks(
  db: import('@nobug/db').PrismaClient,
  companyId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const integrations = await db.integration.findMany({
      where: {
        company_id: companyId,
        provider: 'WEBHOOK',
      },
    });

    const payload = buildWebhookPayload(event, data);

    const deliveries = integrations
      .map((integration) => {
        const config = parseWebhookConfig(integration.config_json);

        if (!config.enabled) return null;
        if (!config.events.includes(event)) return null;

        return { integration, config };
      })
      .filter(Boolean) as Array<{
      integration: (typeof integrations)[number];
      config: WebhookConfig;
    }>;

    // Send webhooks in parallel — fire and forget
    await Promise.allSettled(
      deliveries.map(async ({ integration, config }) => {
        const result = await sendWebhook(config.url, payload, config.secret);

        // Log delivery
        const deliveryEntry: DeliveryLogEntry = {
          id: randomBytes(8).toString('hex'),
          event,
          url: config.url,
          success: result.success,
          status_code:
            result.attempts[result.attempts.length - 1]?.status_code ?? null,
          duration_ms: result.total_duration_ms,
          attempts: result.attempts.length,
          delivered_at: new Date().toISOString(),
        };

        config.deliveries = [deliveryEntry, ...config.deliveries].slice(0, 50);

        await db.integration.update({
          where: { id: integration.id },
          data: {
            config_json: config as unknown as Prisma.InputJsonValue,
          },
        });
      }),
    );
  } catch {
    // Fire-and-forget: swallow top-level errors
    console.error(`[webhook] Failed to dispatch webhooks for event ${event}`);
  }
}
