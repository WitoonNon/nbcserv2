import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma';

/**
 * Prisma 7 connects through a driver adapter; the connection string is read
 * here rather than from the schema file.
 *
 * A single instance is cached on globalThis so Next.js hot reload does not
 * exhaust the Postgres connection pool in development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — copy .env.example to .env');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * The budget every interactive transaction gets.
 *
 * Prisma's defaults — two seconds to acquire a connection, five to finish —
 * describe a database on the same machine. This one is in Singapore, reached
 * through a connection pooler, and a transaction that takes a `FOR UPDATE`
 * lock and makes four round trips can exceed both without anything being
 * wrong. The failure then reads as a bug rather than as latency: "Unable to
 * start a transaction in the given time" during a booking, on a slow evening.
 *
 * ReadCommitted rather than the default because these transactions serialise
 * on explicit row locks; they do not need snapshot isolation, and paying for
 * it invites serialisation failures that the callers do not retry.
 */
export const TX_OPTIONS = {
  isolationLevel: 'ReadCommitted',
  maxWait: 15_000,
  timeout: 15_000,
} as const;

export type { PrismaClient };
export * from '@/generated/prisma';
