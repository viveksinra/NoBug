// @nobug/db — Prisma client singleton
// Import this in apps/web and packages/mcp-server, never instantiate PrismaClient directly.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export type { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
