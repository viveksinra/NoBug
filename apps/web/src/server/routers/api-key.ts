import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { randomBytes, createHash } from 'crypto';
import { router, requirePermission, companyProcedure } from '../trpc';

const API_KEY_PREFIX = 'nb_key_';

function generateApiKey(): { raw: string; hash: string } {
  const raw = API_KEY_PREFIX + randomBytes(24).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export const apiKeyRouter = router({
  generate: requirePermission('manage_api_keys')
    .input(
      z.object({
        name: z.string().min(1).max(100),
        projectId: z.string().nullable().default(null),
        permissions: z
          .object({
            read: z.boolean().default(true),
            write: z.boolean().default(false),
          })
          .default({ read: true, write: false }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.projectId) {
        const project = await ctx.db.project.findFirst({
          where: { id: input.projectId, company_id: ctx.company.id },
        });
        if (!project) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found in this company' });
        }
      }

      const { raw, hash } = generateApiKey();
      const prefix = raw.slice(0, 12) + '...';

      const apiKey = await ctx.db.apiKey.create({
        data: {
          company_id: ctx.company.id,
          project_id: input.projectId,
          name: input.name,
          key_hash: hash,
          prefix,
          permissions: input.permissions as any,
        },
      });

      // Return the raw key ONCE — it cannot be retrieved again
      return {
        id: apiKey.id,
        name: apiKey.name,
        key: raw,
        project_id: apiKey.project_id,
        permissions: apiKey.permissions,
        created_at: apiKey.created_at,
      };
    }),

  list: requirePermission('manage_api_keys')
    .input(
      z.object({
        projectId: z.string().nullable().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.apiKey.findMany({
        where: {
          company_id: ctx.company.id,
          revoked_at: null,
          ...(input.projectId ? { project_id: input.projectId } : {}),
        },
        select: {
          id: true,
          name: true,
          project_id: true,
          permissions: true,
          last_used_at: true,
          created_at: true,
          // Never return key_hash
        },
        orderBy: { created_at: 'desc' },
      });
    }),

  revoke: requirePermission('manage_api_keys')
    .input(z.object({ keyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = await ctx.db.apiKey.findFirst({
        where: { id: input.keyId, company_id: ctx.company.id, revoked_at: null },
      });

      if (!apiKey) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found or already revoked' });
      }

      return ctx.db.apiKey.update({
        where: { id: input.keyId },
        data: { revoked_at: new Date() },
      });
    }),
});

// Utility: validate an API key from a raw Bearer token
// Used by REST API routes and MCP endpoint
export async function validateApiKey(
  db: typeof import('@nobug/db').db,
  rawKey: string,
): Promise<{
  apiKey: { id: string; company_id: string; project_id: string | null; permissions: unknown };
} | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null;

  const hash = hashApiKey(rawKey);
  const apiKey = await db.apiKey.findFirst({
    where: { key_hash: hash, revoked_at: null },
  });

  if (!apiKey) return null;

  // Update last_used_at (fire and forget)
  db.apiKey.update({ where: { id: apiKey.id }, data: { last_used_at: new Date() } }).catch(() => {});

  return {
    apiKey: {
      id: apiKey.id,
      company_id: apiKey.company_id,
      project_id: apiKey.project_id,
      permissions: apiKey.permissions,
    },
  };
}
