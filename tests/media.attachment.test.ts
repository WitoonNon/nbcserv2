import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import { createWorkOrder, submitWorkOrder } from '../src/modules/workorders/workorder.service';
import {
  attachToWorkOrder,
  findAttachmentByKey,
  MAX_UPLOAD_BYTES,
  MediaError,
} from '../src/modules/media/attachment.service';
import { mediaKey, storage } from '../src/lib/storage';

/**
 * Field photographs against real Postgres and the local storage driver.
 *
 * A photo on a work order is evidence, so the rules under test are about
 * provenance rather than plumbing: what may be attached, to a document in what
 * state, and under a name nobody outside this process chose.
 *
 * Requires DATABASE_URL and a seeded database.
 */

const PHONE = '0899999003';

/** A real 1x1 PNG — attachToWorkOrder inspects the bytes it is handed. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let jobId: string;
let actorId: string;

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

  // Guarded: an unset filter in Prisma means "match everything", and a
  // deleteMany that wipes the attachments table is not something a test run
  // should be able to do.
  if (workOrders.length > 0) {
    await prisma.attachment.deleteMany({
      where: { entityType: 'WorkOrder', entityId: { in: workOrders.map((w) => w.id) } },
    });
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
      code: `CUS-MEDIA-${Date.now()}`,
      type: 'INDIVIDUAL',
      legalName: 'ลูกค้าทดสอบรูปภาพ',
      displayName: 'ลูกค้าทดสอบรูปภาพ',
      segment: 'RESIDENTIAL',
      phone: PHONE,
    },
  });
  const site = await prisma.customerSite.create({
    data: { customerId: customer.id, code: 'SITE-M01', name: 'หน้างานทดสอบ', address: 'ทดสอบ' },
  });
  const job = await prisma.job.create({
    data: {
      jobNo: `JOB-MEDIA-${Date.now()}`,
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

describe('attaching a field photograph', () => {
  it('stores the bytes and records what was stored', async () => {
    const workOrderId = await openDraft();

    const result = await attachToWorkOrder({
      workOrderId,
      kind: 'BEFORE',
      mime: 'image/png',
      body: PNG_1PX,
      actorId,
    });

    expect(result.bytes).toBe(PNG_1PX.byteLength);
    // The payload stores keys, and the URL always routes through the guarded
    // endpoint rather than at object storage directly.
    expect(result.url).toBe(`/api/media/${result.key}`);

    const row = await findAttachmentByKey(result.key);
    expect(row).not.toBeNull();
    expect(row?.mime).toBe('image/png');

    // The bytes are genuinely retrievable — a row pointing at nothing would
    // render as a permanently broken thumbnail.
    const roundTripped = await storage().get(result.key);
    expect(roundTripped.equals(PNG_1PX)).toBe(true);
  });

  it('files the photo under the work order and the kind it was taken for', async () => {
    const workOrderId = await openDraft();

    const before = await attachToWorkOrder({
      workOrderId, kind: 'BEFORE', mime: 'image/jpeg', body: PNG_1PX, actorId,
    });
    const after = await attachToWorkOrder({
      workOrderId, kind: 'AFTER', mime: 'image/jpeg', body: PNG_1PX, actorId,
    });

    expect(before.key).toContain(`/WorkOrder/${workOrderId}/BEFORE/`);
    expect(after.key).toContain(`/WorkOrder/${workOrderId}/AFTER/`);
    // Two shots of the same subject must not overwrite each other.
    expect(before.key).not.toBe(after.key);
  });

  it('refuses anything that is not an image', async () => {
    const workOrderId = await openDraft();

    await expect(
      attachToWorkOrder({
        workOrderId,
        kind: 'BEFORE',
        mime: 'application/pdf',
        body: PNG_1PX,
        actorId,
      }),
    ).rejects.toMatchObject({ status: 415 });
  });

  it('refuses a file too large to have come from our own form', async () => {
    const workOrderId = await openDraft();

    await expect(
      attachToWorkOrder({
        workOrderId,
        kind: 'BEFORE',
        mime: 'image/jpeg',
        body: Buffer.alloc(MAX_UPLOAD_BYTES + 1),
        actorId,
      }),
    ).rejects.toBeInstanceOf(MediaError);
  });

  it('will not add evidence to a form that has already been submitted', async () => {
    const workOrderId = await openDraft();
    await submitWorkOrder({
      workOrderId,
      actorId,
      payload: {
        customer: { customerName: 'ลูกค้าทดสอบ', tel: PHONE },
        photosBefore: ['x'],
        inspectorSign: { inspectorSignature: 'sig-a' },
        technicianSign: { technicianSignature: 'sig-b' },
      },
    });

    // The supervisor is looking at a fixed document; the set of photographs in
    // it must not change underneath them.
    await expect(
      attachToWorkOrder({
        workOrderId, kind: 'AFTER', mime: 'image/jpeg', body: PNG_1PX, actorId,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuses to attach to a work order that does not exist', async () => {
    await expect(
      attachToWorkOrder({
        workOrderId: 'does-not-exist',
        kind: 'BEFORE',
        mime: 'image/jpeg',
        body: PNG_1PX,
        actorId,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('storage keys', () => {
  it('never lets a supplied name escape its folder', () => {
    // The local driver turns keys straight into filesystem paths, so a
    // traversal here writes outside the storage root.
    const key = mediaKey({
      entityType: 'WorkOrder',
      entityId: '../../../etc',
      kind: 'BEFORE',
      filename: '../../passwd',
    });

    // Dots survive inside a segment — `_.._passwd` is just an odd filename.
    // What must not survive is a separator, because only a segment that IS
    // `..` walks up a directory.
    const segments = key.split('/');
    expect(segments).toHaveLength(5);
    expect(segments.every((s) => s !== '..' && s !== '.')).toBe(true);

    // The property that actually matters, stated directly.
    const root = path.resolve('.storage');
    expect(path.resolve(root, key).startsWith(root + path.sep)).toBe(true);
  });

  it('does not keep the name the uploader chose', async () => {
    const workOrderId = await openDraft();

    const { key } = await attachToWorkOrder({
      workOrderId, kind: 'BEFORE', mime: 'image/jpeg', body: PNG_1PX, actorId,
    });

    // attachToWorkOrder generates the filename outright — the caller's is
    // never part of the stored key.
    expect(key.endsWith('.jpg')).toBe(true);
    expect(key).toMatch(/\/[0-9a-f-]{36}\.jpg$/);
  });
});
