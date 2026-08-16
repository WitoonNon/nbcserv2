import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import type { SessionUser } from '../src/lib/auth/session';
import { canEditWorkOrder, canViewWorkOrder, scopeFor } from '../src/modules/workorders/access';
import { createWorkOrder } from '../src/modules/workorders/workorder.service';

/**
 * Who a work order is any of.
 *
 * The bug this pins: `workorder.read` was being read as "may see this work
 * order" when it only means "may see work orders". The CUSTOMER role holds
 * that permission, so once customers can log in, one customer could pull
 * photographs taken inside another customer's home — and a technician could
 * read another crew's jobs today.
 *
 * Requires DATABASE_URL and a seeded database.
 */

const PHONE_A = '0899999006';
const PHONE_B = '0899999007';

let workOrderA: string;
let myTechnicianId: string;
let otherTechnicianId: string;
let customerAUserId: string;
let customerBUserId: string;

function sessionUser(over: Partial<SessionUser> & { id: string }): SessionUser {
  return {
    name: 'ทดสอบ',
    email: null,
    roles: [],
    permissions: new Set(['workorder.read']),
    technicianId: null,
    mustChangePassword: false,
    ...over,
  };
}

async function makeCustomer(phone: string, code: string) {
  const customer = await prisma.customer.create({
    data: {
      code: `${code}-${Date.now()}`,
      type: 'INDIVIDUAL',
      legalName: 'ลูกค้าทดสอบสิทธิ์',
      displayName: 'ลูกค้าทดสอบสิทธิ์',
      segment: 'RESIDENTIAL',
      phone,
    },
  });
  const site = await prisma.customerSite.create({
    data: { customerId: customer.id, code: 'SITE-A01', name: 'หน้างาน', address: 'ทดสอบ' },
  });
  const job = await prisma.job.create({
    data: {
      jobNo: `JOB-ACL-${code}-${Date.now()}`,
      customerId: customer.id,
      siteId: site.id,
      category: 'REPAIR',
      jobSize: 'S',
      unitCount: 1,
      status: 'ASSIGNED',
      createdVia: 'ADMIN',
    },
  });

  // A portal login for this customer — how a CUSTOMER account is linked.
  const user = await prisma.user.create({
    data: {
      email: `portal-${phone}-${Date.now()}@example.test`,
      name: 'ลูกค้าล็อกอิน',
      passwordHash: 'x',
      mustChangePassword: false,
    },
  });
  await prisma.customerContact.create({
    data: { customerId: customer.id, userId: user.id, name: 'ผู้ติดต่อ', phone },
  });

  return { customerId: customer.id, jobId: job.id, userId: user.id };
}

async function cleanUp() {
  for (const phone of [PHONE_A, PHONE_B]) {
    const customers = await prisma.customer.findMany({ where: { phone }, select: { id: true } });
    const ids = customers.map((c) => c.id);
    if (ids.length === 0) continue;

    const jobs = await prisma.job.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
    const jobIds = jobs.map((j) => j.id);

    // Guarded: an unset filter matches everything in Prisma, and these would
    // then empty the tables for the whole company.
    if (jobIds.length > 0) {
      await prisma.jobAssignment.deleteMany({ where: { jobId: { in: jobIds } } });
      await prisma.workOrder.deleteMany({ where: { jobId: { in: jobIds } } });
      await prisma.jobStatusEvent.deleteMany({ where: { jobId: { in: jobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    }

    const contacts = await prisma.customerContact.findMany({
      where: { customerId: { in: ids } },
      select: { userId: true },
    });
    await prisma.customerContact.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customerSite.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });

    const userIds = contacts.map((c) => c.userId).filter((id): id is string => Boolean(id));
    if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

beforeAll(async () => {
  const crews = await prisma.crew.findMany({
    where: { members: { some: { validTo: null } } },
    include: { members: { where: { validTo: null }, take: 1 } },
    take: 2,
  });
  if (crews.length < 2) throw new Error('ต้อง seed ทีมช่างอย่างน้อย 2 ทีมก่อนรันเทสต์นี้');
  myTechnicianId = crews[0]!.members[0]!.technicianId;
  otherTechnicianId = crews[1]!.members[0]!.technicianId;
});

beforeEach(async () => {
  await cleanUp();

  const a = await makeCustomer(PHONE_A, 'A');
  const b = await makeCustomer(PHONE_B, 'B');
  customerAUserId = a.userId;
  customerBUserId = b.userId;

  const myCrew = await prisma.crewMember.findFirstOrThrow({
    where: { technicianId: myTechnicianId, validTo: null },
    select: { crewId: true },
  });
  await prisma.jobAssignment.create({ data: { jobId: a.jobId, crewId: myCrew.crewId } });

  const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@nbcgroup.co.th' } });
  ({ workOrderId: workOrderA } = await createWorkOrder({
    jobId: a.jobId,
    code: 'REPAIR',
    actorId: admin.id,
  }));
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

describe('working out what an account may reach', () => {
  it('gives the office everything', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'SUPERVISOR']) {
      expect(scopeFor(sessionUser({ id: 'u', roles: [role] }))).toBe('ALL');
    }
  });

  it('scopes a technician to their crew and a customer to themselves', () => {
    expect(scopeFor(sessionUser({ id: 'u', roles: ['TECHNICIAN'], technicianId: 't1' }))).toBe('CREW');
    expect(scopeFor(sessionUser({ id: 'u', roles: ['CUSTOMER'] }))).toBe('OWN_CUSTOMER');
  });

  it('gives nothing to an account with the permission and no role to justify it', () => {
    // Defaulting to "yes" here is exactly the bug being fixed.
    expect(scopeFor(sessionUser({ id: 'u', roles: [] }))).toBe('NONE');
  });

  it('gives nothing without the permission at all', () => {
    expect(scopeFor(sessionUser({ id: 'u', roles: ['ADMIN'], permissions: new Set() }))).toBe('NONE');
  });
});

describe('reading a work order', () => {
  it('lets the office see it', async () => {
    const admin = sessionUser({ id: 'office', roles: ['ADMIN'] });
    expect(await canViewWorkOrder(admin, workOrderA)).toBe(true);
  });

  it('lets the crew it was assigned to see it', async () => {
    const mine = sessionUser({ id: 'tech', roles: ['TECHNICIAN'], technicianId: myTechnicianId });
    expect(await canViewWorkOrder(mine, workOrderA)).toBe(true);
  });

  it('refuses another crew', async () => {
    const theirs = sessionUser({ id: 'tech2', roles: ['TECHNICIAN'], technicianId: otherTechnicianId });
    expect(await canViewWorkOrder(theirs, workOrderA)).toBe(false);
  });

  it('refuses a crew that has been withdrawn from the job', async () => {
    const { jobId } = await prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderA },
      select: { jobId: true },
    });
    await prisma.jobAssignment.updateMany({
      where: { jobId },
      data: { unassignedAt: new Date() },
    });

    // Access ends with the assignment, the same way the job leaves their queue.
    const mine = sessionUser({ id: 'tech', roles: ['TECHNICIAN'], technicianId: myTechnicianId });
    expect(await canViewWorkOrder(mine, workOrderA)).toBe(false);
  });

  it('lets the customer whose job it is see it', async () => {
    const theirs = sessionUser({ id: customerAUserId, roles: ['CUSTOMER'] });
    expect(await canViewWorkOrder(theirs, workOrderA)).toBe(true);
  });

  it('refuses a DIFFERENT customer — the hole this closes', async () => {
    // Photographs taken inside someone's home. Holding workorder.read is not
    // a reason to see them.
    const other = sessionUser({ id: customerBUserId, roles: ['CUSTOMER'] });
    expect(await canViewWorkOrder(other, workOrderA)).toBe(false);
  });

  it('refuses a customer login not linked to any customer', async () => {
    const orphan = sessionUser({ id: 'no-such-user', roles: ['CUSTOMER'] });
    expect(await canViewWorkOrder(orphan, workOrderA)).toBe(false);
  });

  it('refuses a work order that does not exist', async () => {
    const admin = sessionUser({ id: 'office', roles: ['ADMIN'] });
    expect(await canViewWorkOrder(admin, 'does-not-exist')).toBe(false);
  });
});

describe('adding to a work order', () => {
  it('lets the office and the assigned crew attach', async () => {
    const admin = sessionUser({ id: 'office', roles: ['ADMIN'] });
    const mine = sessionUser({ id: 'tech', roles: ['TECHNICIAN'], technicianId: myTechnicianId });

    expect(await canEditWorkOrder(admin, workOrderA)).toBe(true);
    expect(await canEditWorkOrder(mine, workOrderA)).toBe(true);
  });

  it('refuses another crew', async () => {
    const theirs = sessionUser({ id: 'tech2', roles: ['TECHNICIAN'], technicianId: otherTechnicianId });
    expect(await canEditWorkOrder(theirs, workOrderA)).toBe(false);
  });

  it('refuses the customer, even on their own job', async () => {
    // Narrower than viewing on purpose: showing customers the photographs of
    // their visit is the point, letting them put files into the company's
    // records is not.
    const owner = sessionUser({ id: customerAUserId, roles: ['CUSTOMER'] });

    expect(await canViewWorkOrder(owner, workOrderA)).toBe(true);
    expect(await canEditWorkOrder(owner, workOrderA)).toBe(false);
  });
});
