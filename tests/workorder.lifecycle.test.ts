import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  approveWorkOrder,
  createWorkOrder,
  getWorkOrder,
  payloadHash,
  returnWorkOrder,
  saveWorkOrderDraft,
  submitWorkOrder,
  WorkOrderError,
} from '../src/modules/workorders/workorder.service';

/**
 * Work-order lifecycle against real Postgres.
 *
 * The rules worth defending here are the ones that make a work order evidence
 * rather than a form: a draft must never lose the technician's typing, a
 * submitted document must not be editable behind the approver's back, and an
 * approved one must not change at all after it has been signed.
 *
 * Requires DATABASE_URL and a seeded database.
 */

const PHONE = '0899999002';

let jobId: string;
let actorId: string;

/**
 * Every required field of REPAIR v2, filled — and nothing else.
 *
 * Deliberately shaped like what FormRenderer actually sends: sections the
 * technician never opened are absent, not present-and-empty. Padding them with
 * `{}` here would hide the case that matters.
 */
function validPayload() {
  return {
    customer: { customerName: 'ลูกค้าทดสอบ', tel: PHONE },
    parts: [{ description: 'ล้างคอยล์', qty: '1', unit: 'เครื่อง' }],
    photosBefore: ['before.jpg'],
    photosAfter: ['after.jpg'],
    inspectorSign: { inspectorSignature: 'sig-customer' },
    technicianSign: { technicianSignature: 'sig-tech' },
  };
}

async function cleanUp() {
  const customers = await prisma.customer.findMany({ where: { phone: PHONE }, select: { id: true } });
  const ids = customers.map((c) => c.id);
  if (ids.length === 0) return;

  const jobs = await prisma.job.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);

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
      code: `CUS-WO-${Date.now()}`,
      type: 'INDIVIDUAL',
      legalName: 'ลูกค้าทดสอบใบงาน',
      displayName: 'ลูกค้าทดสอบใบงาน',
      segment: 'RESIDENTIAL',
      phone: PHONE,
    },
  });
  const site = await prisma.customerSite.create({
    data: { customerId: customer.id, code: 'SITE-001', name: 'หน้างานทดสอบ', address: 'ทดสอบ' },
  });
  const job = await prisma.job.create({
    data: {
      jobNo: `JOB-WO-${Date.now()}`,
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

describe('work order lifecycle', () => {
  it('opens a draft with a document number and freezes the template version', async () => {
    const { workOrderId, docNo, reused } = await createWorkOrder({
      jobId,
      code: 'REPAIR',
      actorId,
    });

    expect(reused).toBe(false);
    expect(docNo).toMatch(/^NBC-REP-\d{4}-\d{5}$/);

    const wo = await getWorkOrder(workOrderId);
    expect(wo?.status).toBe('DRAFT');
    // v2 is the version built from the client's real paper form.
    expect(wo?.templateVersion).toBe(2);
  });

  it('resumes the existing draft instead of burning another document number', async () => {
    const first = await createWorkOrder({ jobId, code: 'REPAIR', actorId });
    const second = await createWorkOrder({ jobId, code: 'REPAIR', actorId });

    expect(second.reused).toBe(true);
    expect(second.workOrderId).toBe(first.workOrderId);
    expect(second.docNo).toBe(first.docNo);
  });

  it('saves an incomplete draft without validating it', async () => {
    const { workOrderId } = await createWorkOrder({ jobId, code: 'REPAIR', actorId });

    // A technician halfway through a visit has almost nothing filled in.
    await saveWorkOrderDraft({
      workOrderId,
      payload: { customer: { customerName: 'กรอกค้างไว้' } },
      actorId,
    });

    const wo = await getWorkOrder(workOrderId);
    expect(wo?.status).toBe('DRAFT');
    expect((wo?.payload.customer as Record<string, unknown>).customerName).toBe('กรอกค้างไว้');
  });

  it('refuses to submit an incomplete form but keeps what was typed', async () => {
    const { workOrderId } = await createWorkOrder({ jobId, code: 'REPAIR', actorId });

    const partial = { customer: { customerName: 'ยังกรอกไม่ครบ' } };
    const result = await submitWorkOrder({ workOrderId, payload: partial, actorId });

    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors ?? {}).length).toBeGreaterThan(0);

    // Losing the technician's work to report a validation error would be worse
    // than the error itself.
    const wo = await getWorkOrder(workOrderId);
    expect(wo?.status).toBe('DRAFT');
    expect((wo?.payload.customer as Record<string, unknown>).customerName).toBe('ยังกรอกไม่ครบ');
  });

  it('submits a complete form and then locks it against edits', async () => {
    const { workOrderId } = await createWorkOrder({ jobId, code: 'REPAIR', actorId });

    const result = await submitWorkOrder({ workOrderId, payload: validPayload(), actorId });
    expect(result.ok).toBe(true);

    const wo = await getWorkOrder(workOrderId);
    expect(wo?.status).toBe('SUBMITTED');
    expect(wo?.submittedAt).toBeTruthy();

    // Editing behind the approver's back would mean they approve something
    // other than what they read.
    await expect(
      saveWorkOrderDraft({ workOrderId, payload: { customer: { customerName: 'แอบแก้' } }, actorId }),
    ).rejects.toBeInstanceOf(WorkOrderError);
  });

  it('returns a submitted form with a reason and makes it editable again', async () => {
    const { workOrderId } = await createWorkOrder({ jobId, code: 'REPAIR', actorId });
    await submitWorkOrder({ workOrderId, payload: validPayload(), actorId });

    await returnWorkOrder({ workOrderId, reason: 'ยังไม่ได้ระบุสาเหตุ', actorId });

    const wo = await getWorkOrder(workOrderId);
    expect(wo?.status).toBe('RETURNED');
    expect(wo?.returnReason).toBe('ยังไม่ได้ระบุสาเหตุ');

    await expect(
      saveWorkOrderDraft({ workOrderId, payload: validPayload(), actorId }),
    ).resolves.toBeTruthy();
  });

  it('refuses to return without a reason', async () => {
    const { workOrderId } = await createWorkOrder({ jobId, code: 'REPAIR', actorId });
    await submitWorkOrder({ workOrderId, payload: validPayload(), actorId });

    await expect(
      returnWorkOrder({ workOrderId, reason: '   ', actorId }),
    ).rejects.toBeInstanceOf(WorkOrderError);
  });

  it('clears the previous rejection when a returned form is resubmitted', async () => {
    const { workOrderId } = await createWorkOrder({ jobId, code: 'REPAIR', actorId });
    await submitWorkOrder({ workOrderId, payload: validPayload(), actorId });
    await returnWorkOrder({ workOrderId, reason: 'แก้ด้วย', actorId });
    await submitWorkOrder({ workOrderId, payload: validPayload(), actorId });

    const wo = await getWorkOrder(workOrderId);
    expect(wo?.status).toBe('SUBMITTED');
    // A stale reason on a resubmitted form reads as a fresh rejection.
    expect(wo?.returnReason).toBeNull();
  });

  it('freezes an approved form completely', async () => {
    const { workOrderId } = await createWorkOrder({ jobId, code: 'REPAIR', actorId });
    await submitWorkOrder({ workOrderId, payload: validPayload(), actorId });
    await approveWorkOrder({ workOrderId, actorId });

    const wo = await getWorkOrder(workOrderId);
    expect(wo?.status).toBe('APPROVED');
    expect(wo?.approvedAt).toBeTruthy();

    await expect(
      saveWorkOrderDraft({ workOrderId, payload: validPayload(), actorId }),
    ).rejects.toBeInstanceOf(WorkOrderError);
    await expect(
      submitWorkOrder({ workOrderId, payload: validPayload(), actorId }),
    ).rejects.toBeInstanceOf(WorkOrderError);
  });

  it('cannot approve a form that was never submitted', async () => {
    const { workOrderId } = await createWorkOrder({ jobId, code: 'REPAIR', actorId });

    await expect(approveWorkOrder({ workOrderId, actorId })).rejects.toBeInstanceOf(WorkOrderError);
  });
});

describe('payload hashing', () => {
  it('ignores key order so re-saving unchanged content is not seen as tampering', () => {
    const a = payloadHash({ b: 2, a: { y: 1, x: [1, 2] } });
    const b = payloadHash({ a: { x: [1, 2], y: 1 }, b: 2 });
    expect(a).toBe(b);
  });

  it('changes when any value changes — this is what binds a signature', () => {
    const before = payloadHash({ findings: 'คอมเพรสเซอร์เสีย' });
    const after = payloadHash({ findings: 'คอมเพรสเซอร์ปกติ' });
    expect(after).not.toBe(before);
  });

  it('distinguishes array order, which changes what a parts list says', () => {
    expect(payloadHash([1, 2])).not.toBe(payloadHash([2, 1]));
  });
});
