import { prisma } from '@/lib/db';
import type { QuotaDayStatus, ServiceCategory } from '@/generated/prisma';
import { dateOnly } from './quota.service';

/**
 * Read + admin operations for the quota calendar (Phase 1).
 *
 * The calendar is the operator-facing view of the same buckets the customer
 * booking flow consumes, so what the office sees here is exactly what a
 * customer can book.
 */

export interface CalendarDay {
  date: string;
  quotaDayId: string;
  isHoliday: boolean;
  holidayName?: string;
  usedJobs: number;
  capacityJobs: number | null;
  usedUnits: number;
  capacityUnits: number | null;
  usedMinutes: number;
  capacityMinutes: number | null;
  status: QuotaDayStatus;
}

export async function getMonthCalendar(params: {
  year: number;
  month: number; // 1-12
  zoneId: string;
  category: ServiceCategory;
}): Promise<CalendarDay[]> {
  const from = new Date(Date.UTC(params.year, params.month - 1, 1));
  const to = new Date(Date.UTC(params.year, params.month, 0));

  const [days, holidays] = await Promise.all([
    prisma.quotaDay.findMany({
      where: {
        zoneId: params.zoneId,
        category: params.category,
        quotaDate: { gte: from, lte: to },
      },
      orderBy: { quotaDate: 'asc' },
    }),
    prisma.holiday.findMany({ where: { date: { gte: from, lte: to } } }),
  ]);

  const holidayByIso = new Map(
    holidays.map((h) => [dateOnly(h.date).toISOString().slice(0, 10), h.nameTh]),
  );

  return days.map((d) => {
    const iso = dateOnly(d.quotaDate).toISOString().slice(0, 10);
    return {
      date: iso,
      quotaDayId: d.id,
      isHoliday: holidayByIso.has(iso),
      holidayName: holidayByIso.get(iso),
      usedJobs: d.usedJobs,
      capacityJobs: d.capacityJobs,
      usedUnits: d.usedUnits,
      capacityUnits: d.capacityUnits,
      usedMinutes: d.usedMinutes,
      capacityMinutes: d.capacityMinutes,
      status: d.status,
    };
  });
}

/**
 * Manually open or close a whole day.
 *
 * @client-confirm C9 — every manual close is written to QuotaOverrideLog with
 * the actor and a reason. Closing a day must never be an untraceable action.
 */
export async function setDayStatus(params: {
  date: Date;
  zoneId: string;
  category: ServiceCategory;
  status: 'OPEN' | 'MANUALLY_CLOSED';
  reason: string;
  actorId?: string | null;
}): Promise<number> {
  const day = dateOnly(params.date);

  return prisma.$transaction(async (tx) => {
    const buckets = await tx.quotaDay.findMany({
      where: { quotaDate: day, zoneId: params.zoneId, category: params.category },
    });

    // Never reopen a public holiday by accident.
    const targets = buckets.filter((b) => b.status !== 'HOLIDAY');

    for (const b of targets) {
      await tx.quotaDay.update({ where: { id: b.id }, data: { status: params.status } });
      await tx.quotaOverrideLog.create({
        data: {
          quotaDayId: b.id,
          actorId: params.actorId ?? null,
          reason: `${params.status === 'OPEN' ? 'เปิดรับงาน' : 'ปิดรับงาน'}: ${params.reason}`,
        },
      });
    }

    return targets.length;
  });
}

export async function getQuotaRules() {
  return prisma.quotaRule.findMany({
    where: { isActive: true },
    include: { zone: true },
    orderBy: [{ category: 'asc' }, { priority: 'desc' }],
  });
}

// ---------------------------------------------------------------------------
// Quota rule administration
//
// This is the screen the client asked about first: "can we set how many jobs a
// day we accept?". The rule is the durable configuration; QuotaDay rows are
// derived from it by materialiseQuota(). Editing a rule therefore changes
// nothing until the calendar is re-materialised, which is deliberate — an
// accidental keystroke must not silently reprice tomorrow's capacity.
// ---------------------------------------------------------------------------

export interface QuotaRuleInput {
  name: string;
  category: ServiceCategory;
  zoneId: string | null;
  weekdayMask: number;
  maxJobs: number | null;
  maxUnits: number | null;
  maxTechnicianMinutes: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  priority: number;
}

export class QuotaRuleError extends Error {}

/**
 * All three axes NULL would mean "unlimited on every axis", which is not a
 * capacity rule at all — it is an unbounded day wearing a rule's clothes. The
 * client's whole requirement is a ceiling, so refuse to store a rule that has
 * none rather than let a day quietly accept infinite work.
 */
function assertValidRule(input: QuotaRuleInput): void {
  if (!input.name.trim()) throw new QuotaRuleError('กรุณาตั้งชื่อกฎ');
  if (input.weekdayMask === 0) throw new QuotaRuleError('กรุณาเลือกอย่างน้อย 1 วันในสัปดาห์');

  if (
    input.maxJobs === null &&
    input.maxUnits === null &&
    input.maxTechnicianMinutes === null
  ) {
    throw new QuotaRuleError(
      'ต้องกำหนดอย่างน้อย 1 แกน (งาน / เครื่อง / เวลาช่าง) — ไม่งั้นวันนั้นจะรับงานไม่จำกัด',
    );
  }

  for (const [label, v] of [
    ['จำนวนงาน', input.maxJobs],
    ['จำนวนเครื่อง', input.maxUnits],
    ['เวลาช่าง', input.maxTechnicianMinutes],
  ] as const) {
    if (v !== null && (!Number.isInteger(v) || v < 1)) {
      throw new QuotaRuleError(`${label} ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป`);
    }
  }

  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    throw new QuotaRuleError('วันสิ้นสุดต้องไม่มาก่อนวันเริ่มมีผล');
  }
}

export async function createQuotaRule(input: QuotaRuleInput) {
  assertValidRule(input);
  return prisma.quotaRule.create({
    data: {
      name: input.name.trim(),
      scopeType: input.effectiveTo ? 'DATE_RANGE' : 'WEEKDAY',
      category: input.category,
      zoneId: input.zoneId,
      weekdayMask: input.weekdayMask,
      maxJobs: input.maxJobs,
      maxUnits: input.maxUnits,
      maxTechnicianMinutes: input.maxTechnicianMinutes,
      effectiveFrom: dateOnly(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? dateOnly(input.effectiveTo) : null,
      priority: input.priority,
    },
  });
}

export async function updateQuotaRule(id: string, input: QuotaRuleInput) {
  assertValidRule(input);
  return prisma.quotaRule.update({
    where: { id },
    data: {
      name: input.name.trim(),
      scopeType: input.effectiveTo ? 'DATE_RANGE' : 'WEEKDAY',
      category: input.category,
      zoneId: input.zoneId,
      weekdayMask: input.weekdayMask,
      maxJobs: input.maxJobs,
      maxUnits: input.maxUnits,
      maxTechnicianMinutes: input.maxTechnicianMinutes,
      effectiveFrom: dateOnly(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? dateOnly(input.effectiveTo) : null,
      priority: input.priority,
    },
  });
}

/**
 * Rules are retired, never deleted. A deleted rule would make it impossible to
 * explain why a day in the past had the capacity it had.
 */
export async function deactivateQuotaRule(id: string) {
  return prisma.quotaRule.update({ where: { id }, data: { isActive: false } });
}

// ---------------------------------------------------------------------------
// Per-day capacity override
// ---------------------------------------------------------------------------

/**
 * Adjust one day's ceiling without touching the rule behind it — "this Saturday
 * we only have two crews".
 *
 * Lowering a ceiling below what is already booked is allowed and does NOT
 * cancel anything: those jobs are already promised to customers. The day simply
 * stops selling. Refusing the edit instead would leave the office unable to
 * record reality.
 */
export async function setDayCapacity(params: {
  date: Date;
  zoneId: string;
  category: ServiceCategory;
  capacityJobs: number | null;
  capacityUnits: number | null;
  capacityMinutes: number | null;
  reason: string;
  actorId?: string | null;
}): Promise<{ updated: number; nowFull: boolean }> {
  const day = dateOnly(params.date);

  return prisma.$transaction(async (tx) => {
    const buckets = await tx.quotaDay.findMany({
      where: { quotaDate: day, zoneId: params.zoneId, category: params.category },
    });
    if (buckets.length === 0) {
      throw new QuotaRuleError('ยังไม่มีช่องโควตาของวันนี้ — กดคำนวณปฏิทินใหม่ก่อน');
    }

    let nowFull = false;

    for (const b of buckets) {
      const exhausted =
        (params.capacityJobs !== null && b.usedJobs >= params.capacityJobs) ||
        (params.capacityUnits !== null && b.usedUnits >= params.capacityUnits) ||
        (params.capacityMinutes !== null && b.usedMinutes >= params.capacityMinutes);

      // A day that was FULL and has just been given more room must reopen,
      // otherwise raising the ceiling would have no visible effect.
      const status =
        b.status === 'HOLIDAY' || b.status === 'MANUALLY_CLOSED'
          ? b.status
          : exhausted
            ? ('FULL' as const)
            : ('OPEN' as const);

      nowFull ||= exhausted;

      await tx.quotaDay.update({
        where: { id: b.id },
        data: {
          capacityJobs: params.capacityJobs,
          capacityUnits: params.capacityUnits,
          capacityMinutes: params.capacityMinutes,
          status,
        },
      });

      await tx.quotaOverrideLog.create({
        data: {
          quotaDayId: b.id,
          actorId: params.actorId ?? null,
          reason: `ปรับโควตารายวัน: ${params.reason}`,
          deltaJobs: (params.capacityJobs ?? 0) - (b.capacityJobs ?? 0),
          deltaUnits: (params.capacityUnits ?? 0) - (b.capacityUnits ?? 0),
          deltaMinutes: (params.capacityMinutes ?? 0) - (b.capacityMinutes ?? 0),
        },
      });
    }

    return { updated: buckets.length, nowFull };
  });
}

/** One day's buckets plus the override history behind them. */
export async function getDayDetail(params: {
  date: Date;
  zoneId: string;
  category: ServiceCategory;
}) {
  const day = dateOnly(params.date);
  const bucket = await prisma.quotaDay.findUnique({
    where: {
      quotaDate_zoneId_category: {
        quotaDate: day,
        zoneId: params.zoneId,
        category: params.category,
      },
    },
    include: {
      overrides: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { actor: { select: { name: true } } },
      },
    },
  });
  return bucket;
}
