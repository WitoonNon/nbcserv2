#!/usr/bin/env node
/**
 * Populate a realistic working day for demos and screenshots.
 *
 * Jobs are created through the real booking path (quota is consumed, document
 * numbers are issued, the inspection fee is applied by policy) so what a
 * screenshot shows is genuinely what the system does — not hand-inserted rows.
 *
 *   node scripts/demo-day.mjs
 */
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';

try { process.loadEnvFile(path.join(process.cwd(), '.env')); } catch {}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const today = new Date();
const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

function renderDocNo(format, seq, at) {
  return format
    .replace(/\{BE\}/g, String(at.getFullYear() + 543))
    .replace(/\{SEQ:(\d+)\}/g, (_m, w) => String(seq).padStart(Number(w), '0'));
}

async function nextNo(code) {
  const seq = await prisma.documentSequence.findUniqueOrThrow({ where: { code } });
  const next = seq.currentValue + 1;
  await prisma.documentSequence.update({ where: { code }, data: { currentValue: next } });
  return renderDocNo(seq.format, next, new Date());
}

const PLAN = [
  { site: 'SITE-001', customer: 'CUS-00001', category: 'CLEANING_PM', units: 12, minutes: 480, problem: 'ล้างแอร์ตามรอบ PM ไตรมาส 3 โซนผลิต', crew: 'CREW-A', status: 'ON_SITE' },
  { site: 'SITE-002', customer: 'CUS-00001', category: 'CLEANING_PM', units: 6, minutes: 240, problem: 'ล้างแอร์อาคารสำนักงาน ชั้น 1-2', crew: 'CREW-B', status: 'EN_ROUTE' },
  { site: 'SITE-001', customer: 'CUS-00002', category: 'REPAIR', units: 2, minutes: 180, problem: 'แอร์ห้องพัก 402 ไม่เย็น น้ำหยดลงฝ้า', crew: 'CREW-C', status: 'ASSIGNED' },
  { site: 'SITE-001', customer: 'CUS-00003', category: 'INSPECTION_REPAIR', units: 1, minutes: 60, problem: 'แอร์ห้องนอนชั้น 2 มีเสียงดัง เปิดแล้วไม่เย็น', crew: null, status: 'SCHEDULED' },
  // Kept small on purpose: cleaning is capped at 840 crew-minutes a day and the
  // three jobs above already consume 720. A larger job here is refused by the
  // CHECK constraint — which is the system working, not a bug.
  { site: 'SITE-001', customer: 'CUS-00002', category: 'CLEANING_PM', units: 2, minutes: 80, problem: 'ล้างแอร์ห้องประชุมใหญ่', crew: null, status: 'SCHEDULED' },
];

const STEPS = {
  SCHEDULED: ['DRAFT', 'SUBMITTED', 'SCHEDULED'],
  ASSIGNED: ['DRAFT', 'SUBMITTED', 'SCHEDULED', 'ASSIGNED'],
  EN_ROUTE: ['DRAFT', 'SUBMITTED', 'SCHEDULED', 'ASSIGNED', 'EN_ROUTE'],
  ON_SITE: ['DRAFT', 'SUBMITTED', 'SCHEDULED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'IN_PROGRESS'],
};

async function main() {
  const zone = await prisma.zone.findFirstOrThrow({ where: { isActive: true } });
  const dispatcher = await prisma.user.findUnique({ where: { email: 'dispatch@nbcgroup.co.th' } });

  // Start from a clean day so the script is re-runnable.
  const existing = await prisma.job.findMany({ where: { scheduledDate: day }, select: { id: true } });
  if (existing.length) {
    await prisma.job.deleteMany({ where: { id: { in: existing.map((j) => j.id) } } });
    await prisma.quotaDay.updateMany({
      where: { quotaDate: day },
      data: { usedJobs: 0, usedUnits: 0, usedMinutes: 0, status: 'OPEN' },
    });
    console.log(`cleared ${existing.length} existing job(s) for today`);
  }

  let made = 0;
  for (const p of PLAN) {
    const customer = await prisma.customer.findUniqueOrThrow({ where: { code: p.customer } });
    const site = await prisma.customerSite.findFirstOrThrow({
      where: { customerId: customer.id, code: p.site },
    });
    const contract = await prisma.contract.findFirst({
      where: { customerId: customer.id, status: 'ACTIVE' },
    });

    const bucket = await prisma.quotaDay.findUnique({
      where: { quotaDate_zoneId_category: { quotaDate: day, zoneId: zone.id, category: p.category } },
    });
    if (!bucket || bucket.status !== 'OPEN') {
      console.log(`skip ${p.category}: no open quota bucket today`);
      continue;
    }

    // Respect the same limits the booking flow enforces, so this script can
    // never quietly push the day past what the crews can actually absorb.
    const overJobs = bucket.capacityJobs !== null && bucket.usedJobs + 1 > bucket.capacityJobs;
    const overUnits = bucket.capacityUnits !== null && bucket.usedUnits + p.units > bucket.capacityUnits;
    const overMin = bucket.capacityMinutes !== null && bucket.usedMinutes + p.minutes > bucket.capacityMinutes;
    if (overJobs || overUnits || overMin) {
      console.log(
        `skip ${p.category}: would exceed the daily cap ` +
          `(${bucket.usedMinutes}+${p.minutes} of ${bucket.capacityMinutes} min)`,
      );
      continue;
    }

    const jobNo = await nextNo('JOB');
    const job = await prisma.job.create({
      data: {
        jobNo,
        customerId: customer.id,
        siteId: site.id,
        contractId: contract?.id ?? null,
        zoneId: zone.id,
        category: p.category,
        jobSize: p.units > 15 ? 'L' : p.units > 5 ? 'M' : 'S',
        status: p.status,
        scheduledDate: day,
        requestedDate: day,
        unitCount: p.units,
        estimatedMinutes: p.minutes,
        problemDescription: p.problem,
        createdVia: 'PHONE',
        quotaDayId: bucket.id,
        feeWaivedReason: contract ? 'CONTRACT' : null,
        slaDueAt: new Date(Date.now() + 24 * 3600_000),
      },
    });

    // Consume quota exactly as a real booking would.
    await prisma.quotaDay.update({
      where: { id: bucket.id },
      data: {
        usedJobs: { increment: 1 },
        usedUnits: { increment: p.units },
        usedMinutes: { increment: p.minutes },
      },
    });

    // Append the status history so the timeline and KPIs have real events.
    const steps = STEPS[p.status];
    for (let i = 0; i < steps.length; i += 1) {
      await prisma.jobStatusEvent.create({
        data: {
          jobId: job.id,
          fromStatus: i === 0 ? null : steps[i - 1],
          toStatus: steps[i],
          actorRole: i <= 1 ? 'ADMIN' : i <= 3 ? 'DISPATCHER' : 'TECHNICIAN',
          occurredAt: new Date(Date.now() - (steps.length - i) * 40 * 60_000),
        },
      });
    }
    await prisma.job.update({ where: { id: job.id }, data: { status: steps[steps.length - 1] } });

    // Inspection visits carry the fee unless the customer is on contract.
    if (p.category === 'INSPECTION_REPAIR' && !contract) {
      const policy = await prisma.inspectionFeePolicy.findFirst({ where: { isActive: true } });
      if (policy) {
        await prisma.jobCharge.create({
          data: {
            jobId: job.id,
            type: 'INSPECTION_FEE',
            description: 'ค่าเข้าตรวจเช็คหน้างาน',
            qty: 1,
            unitPrice: policy.amount,
            amountSigned: policy.amount,
            source: 'AUTO_POLICY',
            policyId: policy.id,
          },
        });
      }
    }

    if (p.crew) {
      const crew = await prisma.crew.findUniqueOrThrow({ where: { code: p.crew } });
      const n = await prisma.jobAssignment.count({ where: { crewId: crew.id, unassignedAt: null } });
      await prisma.jobAssignment.create({
        data: {
          jobId: job.id,
          crewId: crew.id,
          assignedById: dispatcher?.id ?? null,
          sequenceNo: n + 1,
        },
      });
    }

    made += 1;
    console.log(`  ${jobNo}  ${p.category.padEnd(18)} ${String(p.units).padStart(2)} เครื่อง  ${p.crew ?? 'ยังไม่จ่ายงาน'}`);
  }

  console.log(`\ncreated ${made} job(s) for ${day.toISOString().slice(0, 10)}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
