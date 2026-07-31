import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/index.js';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // optional
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env');
}

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Marks a seeded value as a placeholder awaiting client confirmation. */
export function assumption(question: string, note: string): string {
  return `@client-confirm ${question} — ${note}`;
}

export function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}
