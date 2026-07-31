import { prisma } from '@/lib/db';
import type { JobSize, QuotaDayStatus, ServiceCategory } from '@/generated/prisma';
import { dateOnly } from './quota.service';

/**
 * Read + admin operations for the quota calendar (Phase 1).
 *
 * The calendar is the operator-facing view of the same buckets the customer
 * booking flow consumes, so what the office sees here is exactly what a
 * customer can book.
 */

export interface CalendarSize {
  jobSize: JobSize;
  quotaDayId: string;
  status: QuotaDayStatus;
  capacityJobs: number | null;
  capacityMinutes: number | null;
  usedJobs: number;
  usedMinutes: number;
}

export interface CalendarDay {
  date: string;
  isHoliday: boolean;
  holidayName?: string;
  sizes: CalendarSize[];
  usedJobs: number;
  capacityJobs: number | null;
  usedMinutes: number;
  capacityMinutes: number | null;
  /** OPEN unless every size bucket is closed/full. */
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
      orderBy: [{ quotaDate: 'asc' }, { jobSize: 'asc' }],
    }),
    prisma.holiday.findMany({ where: { date: { gte: from, lte: to } } }),
  ]);

  const holidayByIso = new Map(
    holidays.map((h) => [dateOnly(h.date).toISOString().slice(0, 10), h.nameTh]),
  );

  const byDate = new Map<string, CalendarDay>();
  for (const d of days) {
    const iso = dateOnly(d.quotaDate).toISOString().slice(0, 10);
    let entry = byDate.get(iso);
    if (!entry) {
      entry = {
        date: iso,
        isHoliday: holidayByIso.has(iso),
        holidayName: holidayByIso.get(iso),
        sizes: [],
        usedJobs: 0,
        capacityJobs: null,
        usedMinutes: 0,
        capacityMinutes: null,
        status: 'OPEN',
      };
      byDate.set(iso, entry);
    }
    entry.sizes.push({
      jobSize: d.jobSize,
      quotaDayId: d.id,
      status: d.status,
      capacityJobs: d.capacityJobs,
      capacityMinutes: d.capacityMinutes,
      usedJobs: d.usedJobs,
      usedMinutes: d.usedMinutes,
    });
    entry.usedJobs += d.usedJobs;
    entry.usedMinutes += d.usedMinutes;
    if (d.capacityJobs !== null) entry.capacityJobs = (entry.capacityJobs ?? 0) + d.capacityJobs;
    if (d.capacityMinutes !== null) entry.capacityMinutes = (entry.capacityMinutes ?? 0) + d.capacityMinutes;
  }

  for (const entry of byDate.values()) {
    if (entry.sizes.every((s) => s.status === 'HOLIDAY')) entry.status = 'HOLIDAY';
    else if (entry.sizes.every((s) => s.status === 'MANUALLY_CLOSED')) entry.status = 'MANUALLY_CLOSED';
    else if (entry.sizes.every((s) => s.status !== 'OPEN')) entry.status = 'FULL';
    else entry.status = 'OPEN';
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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
