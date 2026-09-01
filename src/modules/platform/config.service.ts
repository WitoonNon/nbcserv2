import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Editing a configuration value.
 *
 * The assumptions screen has claimed since it was built that every value here
 * is "แก้ไขได้โดยไม่ต้องแก้โค้ด". That was half true: the values are rows
 * rather than constants, so they *can* change without a deploy — but nothing
 * in the application could write one. Changing the paid sick-leave allowance
 * meant running SQL by hand, which is not what the sentence on the screen
 * promises and not what was described when the client's policy was agreed.
 *
 * So this is the missing half. It is deliberately narrow: it edits the value
 * of a key that already exists and nothing else. Creating and deleting keys
 * stays with the seed, because a key is a contract with the code that reads
 * it — inventing one from a form produces a row nothing consults, and deleting
 * one takes a value out from under a running feature.
 */

export class ConfigError extends Error {}

/** What kind of editor the screen should offer for a value. */
export type ConfigValueKind = 'number' | 'string' | 'boolean' | 'json';

export function kindOf(value: unknown): ConfigValueKind {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  return 'json';
}

/**
 * Parse what the form sent, against the type the value already has.
 *
 * The type is taken from the stored value rather than from the input, because
 * the code reading the key expects one shape. Letting `inspection.fee.default`
 * become the string "500" would not fail here — it would fail later, inside
 * whatever arithmetic consumed it, with an error naming a file that has
 * nothing to do with the edit.
 */
export function parseValue(raw: string, current: unknown): unknown {
  const kind = kindOf(current);
  const text = raw.trim();

  if (kind === 'number') {
    // Checked before conversion: Number('') is 0, so an empty box would set an
    // inspection fee or a leave allowance to zero and report success.
    if (!text) throw new ConfigError('ค่านี้ว่างไม่ได้');
    const n = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(n)) throw new ConfigError('ค่านี้ต้องเป็นตัวเลข');
    return n;
  }

  if (kind === 'boolean') {
    if (text === 'true') return true;
    if (text === 'false') return false;
    throw new ConfigError('ค่านี้ต้องเป็น true หรือ false');
  }

  if (kind === 'string') {
    if (!text) throw new ConfigError('ค่านี้ว่างไม่ได้');
    return text;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ConfigError('รูปแบบ JSON ไม่ถูกต้อง');
  }
}

export interface UpdateResult {
  key: string;
  before: unknown;
  after: unknown;
  unchanged: boolean;
}

/**
 * Write a new value and record who did it.
 *
 * `isAssumption` clears on the first human edit. The flag means "we invented
 * this and nobody has checked it"; once somebody has typed it in deliberately
 * that is no longer true, and leaving it set would keep a settled decision on
 * a list of open questions forever.
 *
 * The audit row is written in the same transaction as the value. A changed
 * fee with no record of who changed it is the kind of thing that gets argued
 * about months later, and these rows decide money — the inspection fee, the
 * paid leave allowance, the radius that says whether somebody was at work.
 */
export async function updateConfigValue(params: {
  key: string;
  raw: string;
  actorId: string;
}): Promise<UpdateResult> {
  const existing = await prisma.appConfig.findUnique({
    where: { key: params.key },
    select: { key: true, value: true, isAssumption: true },
  });
  if (!existing) throw new ConfigError('ไม่พบค่าตั้งค่านี้ในระบบ');

  const after = parseValue(params.raw, existing.value);
  const before = existing.value;

  if (JSON.stringify(before) === JSON.stringify(after)) {
    return { key: params.key, before, after, unchanged: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.appConfig.update({
      where: { key: params.key },
      data: { value: after as never, isAssumption: false },
    });
    await tx.auditLog.create({
      data: {
        actorId: params.actorId,
        action: 'config.update',
        entityType: 'AppConfig',
        entityId: params.key,
        before: before as never,
        after: after as never,
      },
    });
  });

  return { key: params.key, before, after, unchanged: false };
}

export interface ConfigChangeRow {
  key: string;
  before: unknown;
  after: unknown;
  actorName: string | null;
  at: string;
}

/** Recent edits, so a surprising value can be traced to whoever set it. */
export async function recentConfigChanges(take = 20): Promise<ConfigChangeRow[]> {
  const rows = await prisma.auditLog.findMany({
    where: { action: 'config.update' },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      entityId: true,
      before: true,
      after: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    key: r.entityId,
    before: r.before,
    after: r.after,
    actorName: r.actor?.name ?? null,
    at: r.createdAt.toISOString(),
  }));
}
