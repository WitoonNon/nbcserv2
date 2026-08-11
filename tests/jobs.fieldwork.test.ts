import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  advanceFieldJob,
  FieldWorkError,
  nextStepFor,
  hasSubmittedWorkOrder,
} from '../src/modules/jobs/field-work.service';
import { createWorkOrder, submitWorkOrder } from '../src/modules/workorders/workorder.service';

/**
 * The technician's field sequence against real Postgres.
 *
 * The status machine already decides which transitions are legal. What is
 * defended here is WHO may make them: a technician moving a job that belongs
 * to another crew would be writing into someone else's day, and the button
 * being hidden on their screen is presentation, not a gate.
 *
 * Requires DATABASE_URL and a seeded database.
 */

const PHONE = '0899999005';

let jobId: string;
let mineTechnicianId: string;
let theirsTechnicianId: string;
let actorId: string;

async function cleanUp() {
  const customers = await prisma.customer.findMany({ where: { phone: PHONE }, select: { id: true } });
  const ids = customers.map((c) => c.id);
  if (ids.length === 0) return;

  const jobs = await prisma.job.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);

  // Guarded: an unset filter in Prisma matches everything, and these
  // deleteMany calls would then empty the tables for the whole company.
  if (jobIds.length > 0) {
    await prisma.jobAssignment.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.workOrder.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobStatusEvent.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobCharge.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  }
  await prisma.customerSite.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  const user = await prisma.user.findFirstOrThrow({ where: { email: 'admin@nbcgroup.co.th' } });
  actorId = user.id;

  // Two seeded crews with different members: one is "mine", one is not.
  const crews = await prisma.crew.findMany({
    where: { members: { some: { validTo: null } } },
    include: { members: { where: { validTo: null }, take: 1 } },
    take: 2,
  });
  if (crews.length < 2) throw new Error('ต้อง seed ทีมช่างอย่างน้อย 2 ทีมก่อนรันเทสต์นี้');

  mineTechnicianId = crews[0]!.members[0]!.technicianId;
  theirsTechnicianId = crews[1]!.members[0]!.technicianId;
});

beforeEach(async () => {
  await cleanUp();

  const customer = await prisma.customer.create({
    data: {
      code: `CUS-FW-${Date.now()}`,
      type: 'INDIVIDUAL',
      legalName: 'ลูกค้าทดสอบงานภาคสนาม',
      displayName: 'ลูกค้าทดสอบงานภาคสนาม',
      segment: 'RESIDENTIAL',
      phone: PHONE,
    },
  });
  const site = await prisma.customerSite.create({
    data: { customerId: customer.id, code: 'SITE-F01', name: 'หน้างานทดสอบ', address: 'ทดสอบ' },
  });
  const job = await prisma.job.create({
    data: {
      jobNo: `JOB-FW-${Date.now()}`,
      customerId: customer.id,
      siteId: site.id,
      category: 'REPAIR',
      jobSize: 'S',
      unitCount: 1,
      status: 'ASSIGNED',
      createdVia: 'ADMIN',
    },
  });
  jobId = job.id;

  const myCrew = await prisma.crewMember.findFirstOrThrow({
    where: { technicianId: mineTechnicianId, validTo: null },
    select: { crewId: true },
  });
  await prisma.jobAssignment.create({ data: { jobId, crewId: myCrew.crewId } });
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

describe('walking a job through the day', () => {
  it('offers one next step at a time, in order', () => {
    // A menu of every possible state is not a thing to hand someone on a roof.
    expect(nextStepFor('ASSIGNED')?.to).toBe('EN_ROUTE');
    expect(nextStepFor('EN_ROUTE')?.to).toBe('ON_SITE');
    expect(nextStepFor('ON_SITE')?.to).toBe('IN_PROGRESS');
    expect(nextStepFor('IN_PROGRESS')?.to).toBe('COMPLETED');
    expect(nextStepFor('COMPLETED')).toBeNull();
  });

  it('advances through the whole sequence', async () => {
    for (const to of ['EN_ROUTE', 'ON_SITE', 'IN_PROGRESS', 'COMPLETED'] as const) {
      await advanceFieldJob({ jobId, technicianId: mineTechnicianId, to, actorId });
    }

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('COMPLETED');
  });

  it('leaves an event trail, which is what the tracker and the KPIs read', async () => {
    await advanceFieldJob({ jobId, technicianId: mineTechnicianId, to: 'EN_ROUTE', actorId });
    await advanceFieldJob({ jobId, technicianId: mineTechnicianId, to: 'ON_SITE', actorId });

    const events = await prisma.jobStatusEvent.findMany({
      where: { jobId },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => e.toStatus)).toEqual(['EN_ROUTE', 'ON_SITE']);
    expect(events[0]!.actorRole).toBe('TECHNICIAN');
  });

  it('records where the technician was when they set off', async () => {
    await advanceFieldJob({
      jobId, technicianId: mineTechnicianId, to: 'EN_ROUTE', actorId,
      lat: 13.7417, lng: 100.5,
    });

    const event = await prisma.jobStatusEvent.findFirstOrThrow({ where: { jobId, toStatus: 'EN_ROUTE' } });
    expect(event.lat).toBeCloseTo(13.7417, 4);
    expect(event.lng).toBeCloseTo(100.5, 4);
  });

  it('proceeds without coordinates when the phone has no fix', async () => {
    // A basement plant room has no GPS, and the technician standing in one
    // still has to be able to say they have arrived.
    await advanceFieldJob({ jobId, technicianId: mineTechnicianId, to: 'EN_ROUTE', actorId });

    const event = await prisma.jobStatusEvent.findFirstOrThrow({ where: { jobId, toStatus: 'EN_ROUTE' } });
    expect(event.lat).toBeNull();
  });

  it('keeps the time of the tap, not the time the request landed', async () => {
    // A tap in a lift that reaches us two minutes later is evidence about the
    // earlier moment.
    const tappedAt = new Date(Date.now() - 5 * 60_000);
    await advanceFieldJob({
      jobId, technicianId: mineTechnicianId, to: 'EN_ROUTE', actorId, occurredAt: tappedAt,
    });

    const event = await prisma.jobStatusEvent.findFirstOrThrow({ where: { jobId, toStatus: 'EN_ROUTE' } });
    expect(Math.abs(event.occurredAt.getTime() - tappedAt.getTime())).toBeLessThan(1000);
  });
});

describe('what a technician may not do', () => {
  it('refuses a job assigned to another crew', async () => {
    await expect(
      advanceFieldJob({ jobId, technicianId: theirsTechnicianId, to: 'EN_ROUTE', actorId }),
    ).rejects.toBeInstanceOf(FieldWorkError);

    expect((await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('ASSIGNED');
  });

  it('refuses once the crew has been withdrawn from the job', async () => {
    await prisma.jobAssignment.updateMany({ where: { jobId }, data: { unassignedAt: new Date() } });

    await expect(
      advanceFieldJob({ jobId, technicianId: mineTechnicianId, to: 'EN_ROUTE', actorId }),
    ).rejects.toBeInstanceOf(FieldWorkError);
  });

  it('refuses an account with no technician record', async () => {
    await expect(
      advanceFieldJob({ jobId, technicianId: null, to: 'EN_ROUTE', actorId }),
    ).rejects.toBeInstanceOf(FieldWorkError);
  });

  it('refuses statuses that belong to the office', async () => {
    // Cancelling and quoting are commercial decisions, not field ones.
    await expect(
      advanceFieldJob({ jobId, technicianId: mineTechnicianId, to: 'CANCELLED', actorId }),
    ).rejects.toBeInstanceOf(FieldWorkError);
    await expect(
      advanceFieldJob({ jobId, technicianId: mineTechnicianId, to: 'CLOSED', actorId }),
    ).rejects.toBeInstanceOf(FieldWorkError);
  });

  it('explains a stale screen instead of leaking a transition error', async () => {
    await advanceFieldJob({ jobId, technicianId: mineTechnicianId, to: 'EN_ROUTE', actorId });

    // Skipping ON_SITE: two taps on a slow connection, or the office moved it
    // first. Either way the technician needs to know to refresh.
    await expect(
      advanceFieldJob({ jobId, technicianId: mineTechnicianId, to: 'COMPLETED', actorId }),
    ).rejects.toThrow(/รีเฟรช/);
  });

  it('is idempotent when the same step arrives twice', async () => {
    await advanceFieldJob({ jobId, technicianId: mineTechnicianId, to: 'EN_ROUTE', actorId });
    await advanceFieldJob({ jobId, technicianId: mineTechnicianId, to: 'EN_ROUTE', actorId });

    // A double tap must not write a second event and pollute the SLA figures.
    const events = await prisma.jobStatusEvent.count({ where: { jobId, toStatus: 'EN_ROUTE' } });
    expect(events).toBe(1);
  });
});

describe('closing a job without paperwork', () => {
  it('knows whether the work order was handed in', async () => {
    expect(await hasSubmittedWorkOrder(jobId)).toBe(false);

    const { workOrderId } = await createWorkOrder({ jobId, code: 'REPAIR', actorId });
    expect(await hasSubmittedWorkOrder(jobId)).toBe(false); // a draft is not handed in

    await submitWorkOrder({
      workOrderId,
      actorId,
      payload: {
        customer: { customerName: 'ลูกค้าทดสอบ', tel: PHONE },
        inspectorSign: { inspectorSignature: 'sig-a' },
        technicianSign: { technicianSignature: 'sig-b' },
      },
    });
    expect(await hasSubmittedWorkOrder(jobId)).toBe(true);
  });

  it('still allows the job to be closed', async () => {
    // Said out loud on screen, not blocked: a form that will not submit must
    // never trap a technician who has finished the actual work.
    for (const to of ['EN_ROUTE', 'ON_SITE', 'IN_PROGRESS', 'COMPLETED'] as const) {
      await advanceFieldJob({ jobId, technicianId: mineTechnicianId, to, actorId });
    }

    expect((await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('COMPLETED');
    expect(await hasSubmittedWorkOrder(jobId)).toBe(false);
  });
});
