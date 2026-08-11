import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  createWorkOrder,
  getWorkOrder,
  saveWorkOrderDraft,
  signWorkOrder,
  submitWorkOrder,
  WorkOrderError,
} from '../src/modules/workorders/workorder.service';
import { writeSignatureKey } from '../src/lib/forms/types';
import { FORM_TEMPLATES_CURRENT } from '../src/lib/forms/templates';

/**
 * Signatures against real Postgres.
 *
 * The rule worth defending is the one that makes a signature evidence rather
 * than a picture: the hash is taken over the form AS SIGNED, so an edit
 * afterwards is detectable. Everything else here exists to stop that binding
 * being quietly broken.
 *
 * Requires DATABASE_URL and a seeded database.
 */

const PHONE = '0899999004';

let jobId: string;
let actorId: string;

function payloadWith(extra: Record<string, unknown> = {}) {
  return {
    customer: { customerName: 'ลูกค้าทดสอบ', tel: PHONE },
    photosBefore: ['before.jpg'],
    ...extra,
  };
}

async function cleanUp() {
  const customers = await prisma.customer.findMany({ where: { phone: PHONE }, select: { id: true } });
  const ids = customers.map((c) => c.id);
  if (ids.length === 0) return;

  const jobs = await prisma.job.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);
  const workOrders = await prisma.workOrder.findMany({
    where: { jobId: { in: jobIds } },
    select: { id: true },
  });

  // Guarded: an unset filter means "match everything" in Prisma, and a
  // deleteMany that empties the signatures table is not something a test run
  // should be able to do.
  if (workOrders.length > 0) {
    await prisma.signature.deleteMany({ where: { workOrderId: { in: workOrders.map((w) => w.id) } } });
  }
  await prisma.workOrder.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.jobStatusEvent.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.jobCharge.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.customerSite.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  const user = await prisma.user.findFirstOrThrow({ where: { email: 'admin@nbcgroup.co.th' } });
  actorId = user.id;
});

beforeEach(async () => {
  await cleanUp();

  const customer = await prisma.customer.create({
    data: {
      code: `CUS-SIG-${Date.now()}`,
      type: 'INDIVIDUAL',
      legalName: 'ลูกค้าทดสอบลายเซ็น',
      displayName: 'ลูกค้าทดสอบลายเซ็น',
      segment: 'RESIDENTIAL',
      phone: PHONE,
    },
  });
  const site = await prisma.customerSite.create({
    data: { customerId: customer.id, code: 'SITE-S01', name: 'หน้างานทดสอบ', address: 'ทดสอบ' },
  });
  const job = await prisma.job.create({
    data: {
      jobNo: `JOB-SIG-${Date.now()}`,
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
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

async function openDraft(): Promise<string> {
  const { workOrderId } = await createWorkOrder({ jobId, code: 'REPAIR', actorId });
  return workOrderId;
}

describe('signing binds a signature to what was signed', () => {
  it('records who signed, when, and against which content', async () => {
    const workOrderId = await openDraft();

    const { signedAt, payloadHash } = await signWorkOrder({
      workOrderId,
      signerRole: 'CUSTOMER',
      signerName: 'คุณสมหมาย',
      signerPosition: 'เจ้าของบ้าน',
      storageKey: 'sig/customer.png',
      payload: payloadWith(),
      actorId,
    });

    expect(signedAt).toBeTruthy();
    expect(payloadHash).toMatch(/^[0-9a-f]{64}$/);

    const view = await getWorkOrder(workOrderId);
    expect(view!.signatures).toHaveLength(1);
    expect(view!.signatures[0]!.signerName).toBe('คุณสมหมาย');
    expect(view!.signatures[0]!.matchesCurrentPayload).toBe(true);
  });

  it('stores the payload it hashed, so the two can never disagree', async () => {
    const workOrderId = await openDraft();
    const signed = payloadWith({ note: { noteText: 'ลูกค้ารับทราบ' } });

    await signWorkOrder({
      workOrderId, signerRole: 'CUSTOMER', signerName: 'ผู้เซ็น',
      storageKey: 'sig/a.png', payload: signed, actorId,
    });

    // Hashing content the caller merely claimed was on screen would let the
    // stored document and the signed document drift apart.
    const view = await getWorkOrder(workOrderId);
    expect(view!.payload).toMatchObject({ note: { noteText: 'ลูกค้ารับทราบ' } });
    expect(view!.signatures[0]!.matchesCurrentPayload).toBe(true);
  });

  it('flags the signature once the form is edited afterwards', async () => {
    const workOrderId = await openDraft();

    await signWorkOrder({
      workOrderId, signerRole: 'CUSTOMER', signerName: 'ผู้เซ็น',
      storageKey: 'sig/a.png', payload: payloadWith(), actorId,
    });

    // THE point of the hash: an amount changed after the customer signed must
    // not silently ride along on their signature.
    await saveWorkOrderDraft({
      workOrderId,
      payload: payloadWith({ parts: [{ description: 'คอมเพรสเซอร์', qty: '1', unit: 'ตัว' }] }),
      actorId,
    });

    const view = await getWorkOrder(workOrderId);
    expect(view!.signatures[0]!.matchesCurrentPayload).toBe(false);
  });

  it('is satisfied again when the same content is re-signed', async () => {
    const workOrderId = await openDraft();
    const edited = payloadWith({ note: { noteText: 'แก้ไขแล้ว' } });

    await signWorkOrder({
      workOrderId, signerRole: 'CUSTOMER', signerName: 'ผู้เซ็น',
      storageKey: 'sig/a.png', payload: payloadWith(), actorId,
    });
    await saveWorkOrderDraft({ workOrderId, payload: edited, actorId });
    expect((await getWorkOrder(workOrderId))!.signatures[0]!.matchesCurrentPayload).toBe(false);

    await signWorkOrder({
      workOrderId, signerRole: 'CUSTOMER', signerName: 'ผู้เซ็น',
      storageKey: 'sig/b.png', payload: edited, actorId,
    });

    const view = await getWorkOrder(workOrderId);
    expect(view!.signatures).toHaveLength(1); // replaced, not stacked
    expect(view!.signatures[0]!.storageKey).toBe('sig/b.png');
    expect(view!.signatures[0]!.matchesCurrentPayload).toBe(true);
  });

  it('keeps each role separate', async () => {
    const workOrderId = await openDraft();
    const payload = payloadWith();

    await signWorkOrder({
      workOrderId, signerRole: 'CUSTOMER', signerName: 'ลูกค้า',
      storageKey: 'sig/customer.png', payload, actorId,
    });
    await signWorkOrder({
      workOrderId, signerRole: 'TECHNICIAN', signerName: 'ช่าง',
      storageKey: 'sig/tech.png', payload, actorId,
    });

    const roles = (await getWorkOrder(workOrderId))!.signatures.map((s) => s.signerRole);
    expect(roles).toContain('CUSTOMER');
    expect(roles).toContain('TECHNICIAN');
  });
});

describe('what signing refuses', () => {
  it('refuses a signature with no name', async () => {
    const workOrderId = await openDraft();

    // A signature that identifies nobody is decoration.
    await expect(
      signWorkOrder({
        workOrderId, signerRole: 'CUSTOMER', signerName: '   ',
        storageKey: 'sig/a.png', payload: payloadWith(), actorId,
      }),
    ).rejects.toBeInstanceOf(WorkOrderError);
  });

  it('refuses a signature with no image', async () => {
    const workOrderId = await openDraft();

    await expect(
      signWorkOrder({
        workOrderId, signerRole: 'CUSTOMER', signerName: 'ผู้เซ็น',
        storageKey: '', payload: payloadWith(), actorId,
      }),
    ).rejects.toBeInstanceOf(WorkOrderError);
  });

  it('cannot sign a document that has been submitted', async () => {
    const workOrderId = await openDraft();
    await submitWorkOrder({
      workOrderId,
      actorId,
      payload: payloadWith({
        inspectorSign: { inspectorSignature: 'sig/a.png' },
        technicianSign: { technicianSignature: 'sig/b.png' },
      }),
    });

    // Adding a signature behind the approver's back would change what they
    // are being asked to approve.
    await expect(
      signWorkOrder({
        workOrderId, signerRole: 'SUPERVISOR', signerName: 'หัวหน้างาน',
        storageKey: 'sig/c.png', payload: payloadWith(), actorId,
      }),
    ).rejects.toBeInstanceOf(WorkOrderError);
  });
});

describe('placing the key where the schema says it goes', () => {
  const schema = FORM_TEMPLATES_CURRENT.REPAIR;

  it('writes into the section that holds that signer', () => {
    const next = writeSignatureKey(schema, {}, 'TECHNICIAN', 'sig/tech.png');

    // Not at the top level: the validator reads technicianSign.technicianSignature.
    expect(next).toEqual({ technicianSign: { technicianSignature: 'sig/tech.png' } });
  });

  it('leaves the rest of the payload alone', () => {
    const before = { customer: { customerName: 'ลูกค้า' }, photosBefore: ['a.jpg'] };
    const next = writeSignatureKey(schema, before, 'CUSTOMER', 'sig/cust.png');

    expect(next.customer).toEqual({ customerName: 'ลูกค้า' });
    expect(next.photosBefore).toEqual(['a.jpg']);
    expect(next.inspectorSign).toEqual({ inspectorSignature: 'sig/cust.png' });
    // The original is not mutated — the caller still needs it to compare.
    expect(before).not.toHaveProperty('inspectorSign');
  });

  it('keeps other fields already typed into that section', () => {
    const before = { inspectorSign: { inspectorName: 'คุณสมหมาย' } };
    const next = writeSignatureKey(schema, before, 'CUSTOMER', 'sig/cust.png');

    expect(next.inspectorSign).toEqual({
      inspectorName: 'คุณสมหมาย',
      inspectorSignature: 'sig/cust.png',
    });
  });
});
