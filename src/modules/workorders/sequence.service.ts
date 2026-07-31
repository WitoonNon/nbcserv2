import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';
import { sequencePeriodKey, toBuddhistYear } from '@/lib/date/buddhist';

/**
 * Document numbering.
 *
 * Gap-free and concurrency-safe: the counter row is locked FOR UPDATE, so two
 * technicians submitting at the same moment cannot receive the same number.
 *
 * Default pattern: NBC-{FORM}-{BE}-{SEQ:05}  ->  NBC-PM-2569-00001
 * @client-confirm A9 (format, per-form sequences, annual reset)
 * @client-confirm A10 (Buddhist vs Christian era)
 */

export const DEFAULT_FORMATS: Record<string, string> = {
  JOB: 'NBC-JOB-{BE}-{SEQ:05}',
  INSPECTION_REQUEST: 'NBC-CHK-{BE}-{SEQ:05}',
  CLEANING_PM: 'NBC-PM-{BE}-{SEQ:05}',
  REPAIR: 'NBC-REP-{BE}-{SEQ:05}',
  QUOTATION: 'NBC-QT-{BE}-{SEQ:05}',
  CUSTOMER: 'CUS-{SEQ:05}',
};

function render(format: string, seq: number, at: Date): string {
  return format
    .replace(/\{BE\}/g, String(toBuddhistYear(at)))
    .replace(/\{CE\}/g, String(at.getFullYear()))
    .replace(/\{MM\}/g, String(at.getMonth() + 1).padStart(2, '0'))
    .replace(/\{SEQ:(\d+)\}/g, (_m, width: string) => String(seq).padStart(Number(width), '0'))
    .replace(/\{SEQ\}/g, String(seq));
}

/**
 * Allocate the next number for `code`. Must run inside the caller's
 * transaction when the number is attached to a row being created, so a
 * rollback does not burn a number.
 */
export async function nextDocumentNo(
  code: string,
  tx?: Prisma.TransactionClient,
  at: Date = new Date(),
): Promise<string> {
  const db = tx ?? prisma;

  const rows = await db.$queryRaw<
    { id: string; format: string; currentValue: number; resetPolicy: string; lastResetKey: string | null }[]
  >`
    SELECT "id", "format", "currentValue", "resetPolicy", "lastResetKey"
      FROM "document_sequences"
     WHERE "code" = ${code}
     FOR UPDATE
  `;

  const row = rows[0];
  if (!row) {
    throw new Error(
      `No DocumentSequence configured for "${code}". Seed it in prisma/seed/01-platform.ts`,
    );
  }

  const policy = row.resetPolicy as 'NEVER' | 'YEARLY' | 'MONTHLY';
  const periodKey = sequencePeriodKey(at, policy);
  const shouldReset = policy !== 'NEVER' && row.lastResetKey !== periodKey;
  const nextValue = shouldReset ? 1 : row.currentValue + 1;

  await db.documentSequence.update({
    where: { id: row.id },
    data: { currentValue: nextValue, lastResetKey: periodKey },
  });

  return render(row.format, nextValue, at);
}

/** Exposed for unit tests and for previewing a format in the admin UI. */
export const __test = { render };
