import 'server-only';
import { prisma } from '@/lib/db';
import {
  assumptionCheck,
  backupCheck,
  holidayCoverageCheck,
  overallLevel,
  quotaRunwayCheck,
  type HealthCheck,
  type HealthLevel,
} from './health-rules';

/**
 * Is the system actually working, and what will stop working soon.
 *
 * Phase 3.5. Written to be polled by an external uptime monitor rather than by
 * a cron of our own: a health check that runs inside the thing it is checking
 * reports nothing at all on the day that thing is down, which is the only day
 * it matters. `/api/health` is the endpoint; point UptimeRobot or Better Stack
 * at it and let something outside Vercel do the watching.
 *
 * Each check is independent and its own failure is caught, so one broken
 * probe reports itself as broken instead of taking the whole report with it.
 */

export interface HealthReport {
  level: HealthLevel;
  checkedAt: string;
  checks: HealthCheck[];
}

/** The one check that decides whether anything else can be read at all. */
async function databaseCheck(): Promise<HealthCheck> {
  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - started;

    return {
      key: 'database',
      labelTh: 'ฐานข้อมูล',
      // The database is in Singapore and the functions are pinned to sin1.
      // A second of latency means that pinning has come undone, which is the
      // 1.7–5s page load this project has already been bitten by once.
      level: ms > 1000 ? 'WARN' : 'OK',
      detailTh: ms > 1000 ? `ตอบสนองช้า ${ms} ms — เช็ค region` : `ตอบสนอง ${ms} ms`,
    };
  } catch (e) {
    return {
      key: 'database',
      labelTh: 'ฐานข้อมูล',
      level: 'DOWN',
      detailTh: e instanceof Error ? e.message.slice(0, 200) : 'เชื่อมต่อไม่ได้',
    };
  }
}

async function quotaCheck(): Promise<HealthCheck> {
  const today = new Date();
  const furthest = await prisma.quotaDay.findFirst({
    orderBy: { quotaDate: 'desc' },
    select: { quotaDate: true },
  });
  if (!furthest) return quotaRunwayCheck(null);

  const days = Math.round((furthest.quotaDate.getTime() - today.getTime()) / 86_400_000);
  return quotaRunwayCheck(days);
}

async function holidaysCheck(): Promise<HealthCheck> {
  const [last, furthestQuota] = await Promise.all([
    prisma.holiday.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
    prisma.quotaDay.findFirst({ orderBy: { quotaDate: 'desc' }, select: { quotaDate: true } }),
  ]);

  return holidayCoverageCheck({
    lastHolidayOn: last?.date ?? null,
    bookableUntil: furthestQuota?.quotaDate ?? null,
    today: new Date(),
  });
}

export const BACKUP_CONFIG_KEY = 'ops.backup.lastRunAt';

async function backupsCheck(): Promise<HealthCheck> {
  const row = await prisma.appConfig.findUnique({
    where: { key: BACKUP_CONFIG_KEY },
    select: { value: true },
  });
  const raw = typeof row?.value === 'string' ? row.value : null;
  if (!raw) return backupCheck(null);

  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return backupCheck(null);
  return backupCheck((Date.now() - at.getTime()) / 3_600_000);
}

async function assumptionsCheck(): Promise<HealthCheck> {
  const rows = await prisma.appConfig.findMany({
    where: { isAssumption: true },
    select: { key: true },
    orderBy: { key: 'asc' },
  });
  return assumptionCheck(rows.map((r) => r.key));
}

/** Record that a backup finished. Called by scripts/backup.mjs. */
export async function recordBackupRun(at = new Date()): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: BACKUP_CONFIG_KEY },
    create: {
      key: BACKUP_CONFIG_KEY,
      value: at.toISOString(),
      description: 'เวลาที่สำรองข้อมูลสำเร็จครั้งล่าสุด — เขียนโดย scripts/backup.mjs',
      isAssumption: false,
    },
    update: { value: at.toISOString() },
  });
}

export async function healthReport(): Promise<HealthReport> {
  const db = await databaseCheck();

  // Nothing else can be read through a database that is not answering, and
  // five more timeouts would turn a fast, clear DOWN into a slow one.
  if (db.level === 'DOWN') {
    return { level: 'DOWN', checkedAt: new Date().toISOString(), checks: [db] };
  }

  const rest = await Promise.all(
    [quotaCheck, holidaysCheck, backupsCheck, assumptionsCheck].map(async (run) => {
      try {
        return await run();
      } catch (e) {
        return {
          key: run.name,
          labelTh: run.name,
          level: 'WARN' as HealthLevel,
          detailTh: e instanceof Error ? e.message.slice(0, 200) : 'ตรวจไม่สำเร็จ',
        };
      }
    }),
  );

  const checks = [db, ...rest];
  return { level: overallLevel(checks), checkedAt: new Date().toISOString(), checks };
}
