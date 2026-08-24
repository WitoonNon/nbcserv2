import 'server-only';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';
import type { ServiceCategory, JobStatus } from '@/generated/prisma';

/**
 * The numbers behind the dashboard charts.
 *
 * Every series is grouped by Postgres and comes back already aggregated. The
 * alternative — pulling jobs and counting them in JavaScript — would drag a
 * year of rows across the network to produce twelve numbers, and the database
 * is in another region.
 *
 * Each series is also independently guarded. A chart that cannot be drawn must
 * leave a gap on the dashboard, not take the page down with it: the tiles above
 * are what the office actually opens this screen for.
 */

export interface MonthPoint {
  /** Buddhist-era label, e.g. 'ก.ย. 68'. */
  month: string;
  /** Sort key, 'YYYY-MM' in Gregorian — never shown. */
  key: string;
  category: string;
  jobs: number;
}

export interface StatusSlice {
  status: string;
  label: string;
  jobs: number;
}

export interface LoadPoint {
  /** Compact axis label, 'จ.25' — fourteen of these have to fit side by side. */
  day: string;
  /** 'จ. 25 ส.ค.' — the tooltip, where there is room to be unambiguous. */
  dayFull: string;
  key: string;
  booked: number;
  /** null means no quota was configured — which is not the same as zero. */
  capacity: number | null;
}

const TH_MONTH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

const CATEGORY_TH: Record<ServiceCategory, string> = {
  INSPECTION_REPAIR: 'ตรวจเช็ค',
  CLEANING_PM: 'ล้างแอร์/PM',
  REPAIR: 'ซ่อม',
  INSTALLATION: 'ติดตั้ง',
};

const STATUS_TH: Partial<Record<JobStatus, string>> = {
  SUBMITTED: 'รอจัดคิว',
  SCHEDULED: 'นัดแล้ว',
  ASSIGNED: 'จ่ายงานแล้ว',
  EN_ROUTE: 'กำลังเดินทาง',
  ON_SITE: 'ถึงหน้างาน',
  IN_PROGRESS: 'กำลังทำงาน',
  PENDING_QUOTE: 'รอเสนอราคา',
  QUOTE_APPROVED: 'อนุมัติราคาแล้ว',
  COMPLETED: 'ทำงานเสร็จ',
  REPORT_APPROVED: 'ตรวจใบงานแล้ว',
};

/**
 * Jobs per month for the last `months` months, split by category.
 *
 * Bucketed at Asia/Bangkok rather than UTC. Grouping timestamps in UTC moves
 * every job created after 5pm Thai time into the next day, and at a month
 * boundary into the next month — which would quietly misreport the figure the
 * owner is looking at.
 */
export async function jobsByMonth(months = 12): Promise<MonthPoint[]> {
  const rows = await prisma.$queryRaw<
    { bucket: Date; category: ServiceCategory; jobs: bigint }[]
  >(Prisma.sql`
    SELECT date_trunc('month', "createdAt" AT TIME ZONE 'Asia/Bangkok') AS bucket,
           "category",
           COUNT(*) AS jobs
      FROM "jobs"
     WHERE "createdAt" >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Bangkok')
                          - MAKE_INTERVAL(months => ${months - 1})
       AND "status" <> 'CANCELLED'
     GROUP BY 1, 2
  `);

  // Months with no work still have to appear, or the axis silently closes the
  // gap and a quiet season reads as a busy one.
  const now = new Date();
  const buckets: { key: string; month: string }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      month: `${TH_MONTH[d.getUTCMonth()]} ${String((d.getUTCFullYear() + 543) % 100).padStart(2, '0')}`,
    });
  }

  const found = new Map<string, number>();
  for (const r of rows) {
    const d = r.bucket;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    found.set(`${key}|${r.category}`, Number(r.jobs));
  }

  const categories: ServiceCategory[] = ['CLEANING_PM', 'REPAIR', 'INSPECTION_REPAIR', 'INSTALLATION'];
  const out: MonthPoint[] = [];
  for (const b of buckets) {
    for (const c of categories) {
      out.push({
        ...b,
        category: CATEGORY_TH[c],
        jobs: found.get(`${b.key}|${c}`) ?? 0,
      });
    }
  }
  return out;
}

/** Open jobs by status — what is in the pipeline right now. */
export async function jobStatusMix(): Promise<StatusSlice[]> {
  const rows = await prisma.job.groupBy({
    by: ['status'],
    where: { status: { notIn: ['DRAFT', 'CLOSED', 'CANCELLED', 'QUOTE_REJECTED', 'RESCHEDULED'] } },
    _count: { status: true },
  });

  return rows
    .map((r) => ({
      status: r.status,
      label: STATUS_TH[r.status] ?? r.status,
      jobs: r._count.status,
    }))
    .filter((r) => r.jobs > 0)
    .sort((a, b) => b.jobs - a.jobs);
}

/**
 * Booked work against capacity for the next `days` days.
 *
 * Capacity is summed across zones and categories because the dashboard asks a
 * whole-company question: is next week already full? The per-zone breakdown a
 * dispatcher needs lives on the schedule screen, which is linked from here.
 *
 * OPEN and FULL only. A day that is FULL is precisely the one worth seeing —
 * it is the bar touching the line — but a holiday or a manually closed day is
 * not part of the queue at all, and drawing it as an empty bar would read as a
 * quiet day rather than a day nobody can book.
 */
export async function upcomingLoad(days = 14): Promise<LoadPoint[]> {
  const rows = await prisma.$queryRaw<
    { quotaDate: Date; used: bigint | null; capacity: bigint | null }[]
  >(Prisma.sql`
    SELECT "quotaDate",
           SUM("usedJobs")     AS used,
           SUM("capacityJobs") AS capacity
      FROM "quota_days"
     WHERE "quotaDate" >= CURRENT_DATE
       AND "quotaDate" <  CURRENT_DATE + MAKE_INTERVAL(days => ${days})
       AND "status" IN ('OPEN', 'FULL')
     GROUP BY 1
     ORDER BY 1
  `);

  return rows.map((r) => {
    const d = r.quotaDate;
    return {
      key: d.toISOString().slice(0, 10),
      day: `${TH_DOW[d.getUTCDay()]}${d.getUTCDate()}`,
      dayFull: `${TH_DOW[d.getUTCDay()]} ${d.getUTCDate()} ${TH_MONTH[d.getUTCMonth()]}`,
      booked: Number(r.used ?? 0),
      capacity: r.capacity === null ? null : Number(r.capacity),
    };
  });
}

export interface DashboardCharts {
  months: MonthPoint[] | null;
  statuses: StatusSlice[] | null;
  load: LoadPoint[] | null;
}

/**
 * All three series at once.
 *
 * `allSettled`, not `all`: one failing series must not blank the other two.
 */
export async function loadDashboardCharts(): Promise<DashboardCharts> {
  const [months, statuses, load] = await Promise.allSettled([
    jobsByMonth(),
    jobStatusMix(),
    upcomingLoad(),
  ]);

  // A series that fails leaves a gap on the dashboard by design — but a gap
  // nobody can explain is how a broken query survives for weeks. The first
  // version of this swallowed a bad enum comparison in silence and the chart
  // simply was not there.
  for (const [name, r] of [
    ['jobsByMonth', months],
    ['jobStatusMix', statuses],
    ['upcomingLoad', load],
  ] as const) {
    if (r.status === 'rejected') console.error(`[dashboard] ${name} failed:`, r.reason);
  }

  return {
    months: months.status === 'fulfilled' ? months.value : null,
    statuses: statuses.status === 'fulfilled' ? statuses.value : null,
    load: load.status === 'fulfilled' ? load.value : null,
  };
}
