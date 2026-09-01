import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  updateConfigValue,
  parseValue,
  kindOf,
  recentConfigChanges,
  ConfigError,
} from '../src/modules/platform/config.service';

/**
 * Editing configuration.
 *
 * The screen has promised since it was built that these values change without
 * touching code. They are rows rather than constants, so that was half true —
 * but nothing could write one, and the promise was used as an argument when
 * the client's leave policy was agreed below the statutory figures.
 *
 * What is defended: the type a key already has survives the edit, because the
 * code reading it expects one shape and a wrong one fails somewhere else
 * entirely; and every change is attributable, because these rows decide the
 * inspection fee, the paid leave allowance and the radius that says whether
 * somebody was at work.
 *
 * Requires DATABASE_URL and a seeded database.
 */

const KEY = 'test.config.playground';

/**
 * A real user id, because AuditLog.actorId is a foreign key.
 *
 * An invented id fails the constraint, and that constraint is right: the actor
 * always comes from the session, and a change trail pointing at an account
 * that never existed answers "who changed the inspection fee" with nothing.
 */
let ACTOR: string;

async function seedKey(value: unknown) {
  await prisma.appConfig.upsert({
    where: { key: KEY },
    create: { key: KEY, value: value as never, description: 'ทดสอบ', isAssumption: true },
    update: { value: value as never, isAssumption: true },
  });
}

async function cleanUp() {
  await prisma.auditLog.deleteMany({ where: { entityId: KEY } });
  await prisma.appConfig.deleteMany({ where: { key: KEY } });
}

beforeAll(async () => {
  const user = await prisma.user.findFirstOrThrow({
    where: { email: 'admin@nbcgroup.co.th' },
    select: { id: true },
  });
  ACTOR = user.id;
});

beforeEach(cleanUp);
afterAll(cleanUp);

describe('reading the shape of a value', () => {
  it('names the editor each type needs', () => {
    expect(kindOf(500)).toBe('number');
    expect(kindOf(true)).toBe('boolean');
    expect(kindOf('BE')).toBe('string');
    expect(kindOf({ a: 1 })).toBe('json');
    expect(kindOf([1, 2])).toBe('json');
  });
});

describe('parsing what the form sent', () => {
  it('keeps a number a number', () => {
    expect(parseValue('750', 500)).toBe(750);
    // Typed with a thousands separator, as anybody would.
    expect(parseValue('1,500', 500)).toBe(1500);
  });

  it('refuses text where a number belongs', () => {
    // The failure this prevents is not here — it is inside whatever arithmetic
    // later reads the key and gets "abc" instead of a number.
    expect(() => parseValue('abc', 500)).toThrow(ConfigError);
    expect(() => parseValue('', 500)).toThrow(ConfigError);
  });

  it('takes only true or false for a boolean', () => {
    expect(parseValue('true', false)).toBe(true);
    expect(parseValue('false', true)).toBe(false);
    expect(() => parseValue('yes', true)).toThrow(ConfigError);
    expect(() => parseValue('1', true)).toThrow(ConfigError);
  });

  it('refuses an empty string', () => {
    expect(() => parseValue('   ', 'BE')).toThrow(ConfigError);
  });

  it('refuses JSON that does not parse, rather than storing the text', () => {
    expect(() => parseValue('{ not json', { a: 1 })).toThrow(ConfigError);
    expect(parseValue('{"a":2}', { a: 1 })).toEqual({ a: 2 });
  });
});

describe('writing a value', () => {
  it('stores it and records who changed it', async () => {
    await seedKey(500);
    const result = await updateConfigValue({ key: KEY, raw: '750', actorId: ACTOR });

    expect(result.unchanged).toBe(false);
    const row = await prisma.appConfig.findUniqueOrThrow({ where: { key: KEY } });
    expect(row.value).toBe(750);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: KEY, action: 'config.update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.before).toBe(500);
    expect(audit?.after).toBe(750);
    expect(audit?.actorId).toBe(ACTOR);
  });

  it('stops being an assumption once a person has set it', async () => {
    await seedKey(500);
    expect((await prisma.appConfig.findUniqueOrThrow({ where: { key: KEY } })).isAssumption).toBe(true);

    await updateConfigValue({ key: KEY, raw: '750', actorId: ACTOR });

    // "Assumption" means nobody has checked this. Somebody just typed it in on
    // purpose, so leaving the flag set would keep a settled decision on the
    // list of open questions for good.
    expect((await prisma.appConfig.findUniqueOrThrow({ where: { key: KEY } })).isAssumption).toBe(false);
  });

  it('writes nothing when the value is unchanged', async () => {
    await seedKey(500);
    const result = await updateConfigValue({ key: KEY, raw: '500', actorId: ACTOR });

    expect(result.unchanged).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityId: KEY } })).toBe(0);
    // And the assumption flag is left alone — re-saving the same number is not
    // somebody confirming it.
    expect((await prisma.appConfig.findUniqueOrThrow({ where: { key: KEY } })).isAssumption).toBe(true);
  });

  it('refuses a key that does not exist', async () => {
    // A key is a contract with the code that reads it; inventing one from a
    // form produces a row nothing consults.
    await expect(
      updateConfigValue({ key: 'test.config.nonexistent', raw: '1', actorId: ACTOR }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it('leaves the stored value alone when the new one is rejected', async () => {
    await seedKey(500);
    await expect(
      updateConfigValue({ key: KEY, raw: 'not-a-number', actorId: ACTOR }),
    ).rejects.toBeInstanceOf(ConfigError);

    expect((await prisma.appConfig.findUniqueOrThrow({ where: { key: KEY } })).value).toBe(500);
    expect(await prisma.auditLog.count({ where: { entityId: KEY } })).toBe(0);
  });

  it('handles a structured value', async () => {
    await seedKey({ S: 5, M: 15 });
    await updateConfigValue({ key: KEY, raw: '{"S":6,"M":20}', actorId: ACTOR });
    expect(await prisma.appConfig.findUniqueOrThrow({ where: { key: KEY } })).toMatchObject({
      value: { S: 6, M: 20 },
    });
  });
});

describe('the change history', () => {
  it('shows the most recent edits first', async () => {
    await seedKey(500);
    await updateConfigValue({ key: KEY, raw: '600', actorId: ACTOR });
    await updateConfigValue({ key: KEY, raw: '700', actorId: ACTOR });

    const changes = (await recentConfigChanges(50)).filter((c) => c.key === KEY);
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(changes[0]!.after).toBe(700);
    expect(changes[0]!.before).toBe(600);
  });
});
