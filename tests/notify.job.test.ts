import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  linkLineToJobContact,
  lineRecipientForJob,
} from '../src/modules/customers/identity.service';
import { notifyJob } from '../src/modules/notifications/notify.service';

/**
 * Linking a LINE account, and what gets sent afterwards.
 *
 * Two rules are being pinned here, and both are about a notification never
 * being allowed to matter more than the job it describes:
 *
 * 1. A customer who has not linked LINE — which is most of them — produces no
 *    error, no log row and no exception. Their job is an ordinary job.
 * 2. Booking confirmation goes out exactly once, even though it is attempted
 *    at two different moments. It has to be attempted twice because a
 *    first-time customer has no LINE account at booking time and links
 *    seconds later, while a returning customer is reachable immediately.
 *
 * Runs against the real database. NOTIFY_DRIVER stays on `console`, so the
 * send succeeds without touching LINE and without spending any of the 300
 * messages a month the account actually has.
 */

const PHONE = '0899999311';
const LINE_USER_A = `U${'a'.repeat(32)}`;
const LINE_USER_B = `U${'b'.repeat(32)}`;

let customerId: string;
let siteId: string;
let jobId: string;
let contactId: string;

async function cleanUp() {
  const customers = await prisma.customer.findMany({ where: { phone: PHONE }, select: { id: true } });
  const ids = customers.map((c) => c.id);
  if (ids.length === 0) return;

  const jobs = await prisma.job.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);

  // Guarded: an absent filter matches every row in Prisma, and these would
  // then empty the tables for the whole company.
  if (jobIds.length > 0) {
    await prisma.notificationLog.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobStatusEvent.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  }
  const contacts = await prisma.customerContact.findMany({
    where: { customerId: { in: ids } },
    select: { id: true },
  });
  if (contacts.length > 0) {
    await prisma.customerIdentity.deleteMany({
      where: { contactId: { in: contacts.map((c) => c.id) } },
    });
  }
  await prisma.customerContact.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customerSite.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  await cleanUp();

  const customer = await prisma.customer.create({
    data: {
      code: `NOTIFY-${Date.now()}`,
      type: 'INDIVIDUAL',
      legalName: 'ลูกค้าทดสอบแจ้งเตือน',
      displayName: 'ลูกค้าทดสอบแจ้งเตือน',
      segment: 'RESIDENTIAL',
      phone: PHONE,
    },
  });
  customerId = customer.id;

  const site = await prisma.customerSite.create({
    data: { customerId, code: 'SITE-N01', name: 'หน้างานทดสอบ', address: 'ทดสอบ' },
  });
  siteId = site.id;

  const contact = await prisma.customerContact.create({
    data: { customerId, siteId, name: 'ผู้ติดต่อทดสอบ', phone: PHONE, isPrimary: true },
  });
  contactId = contact.id;

  const job = await prisma.job.create({
    data: {
      jobNo: `JOB-NOTIFY-${Date.now()}`,
      customerId,
      siteId,
      category: 'CLEANING_PM',
      jobSize: 'S',
      unitCount: 1,
      status: 'SCHEDULED',
      createdVia: 'WEB',
      scheduledDate: new Date('2026-09-01T00:00:00Z'),
    },
  });
  jobId = job.id;
});

afterAll(cleanUp);

beforeEach(async () => {
  await prisma.notificationLog.deleteMany({ where: { jobId } });
  await prisma.customerIdentity.deleteMany({ where: { contactId } });
});

describe('before anybody has linked a LINE account', () => {
  it('has no recipient for the job', async () => {
    expect(await lineRecipientForJob(jobId)).toBeNull();
  });

  it('skips quietly instead of failing the job', async () => {
    const result = await notifyJob({ jobId, templateCode: 'JOB_CONFIRMED' });

    // Most customers will never link LINE. Their bookings are ordinary
    // bookings, and treating that as an error would turn the common case into
    // noise that buries the real failures.
    expect(result.status).toBe('SKIPPED');
    expect(await prisma.notificationLog.count({ where: { jobId } })).toBe(0);
  });
});

describe('linking', () => {
  it('attaches the account to the contact who booked', async () => {
    const result = await linkLineToJobContact({ jobId, lineUserId: LINE_USER_A });

    expect(result.contactId).toBe(contactId);
    expect(result.alreadyLinked).toBe(false);
    expect(await lineRecipientForJob(jobId)).toBe(LINE_USER_A);
  });

  it('is idempotent when the customer taps twice', async () => {
    await linkLineToJobContact({ jobId, lineUserId: LINE_USER_A });
    const second = await linkLineToJobContact({ jobId, lineUserId: LINE_USER_A });

    expect(second.alreadyLinked).toBe(true);
    expect(await prisma.customerIdentity.count({ where: { contactId } })).toBe(1);
  });

  it('moves an account that books for somebody else', async () => {
    // A landlord arranging a clean for a tenant, or an office manager covering
    // a second site. The account follows the person holding the phone.
    await linkLineToJobContact({ jobId, lineUserId: LINE_USER_A });

    const otherSite = await prisma.customerSite.create({
      data: { customerId, code: `SITE-N02-${Date.now()}`, name: 'อีกหน้างาน', address: 'ทดสอบ' },
    });
    const otherContact = await prisma.customerContact.create({
      data: { customerId, siteId: otherSite.id, name: 'ผู้ติดต่ออีกคน', phone: PHONE },
    });
    const otherJob = await prisma.job.create({
      data: {
        jobNo: `JOB-NOTIFY2-${Date.now()}`,
        customerId,
        siteId: otherSite.id,
        category: 'REPAIR',
        jobSize: 'S',
        unitCount: 1,
        status: 'SCHEDULED',
        createdVia: 'WEB',
      },
    });

    await linkLineToJobContact({ jobId: otherJob.id, lineUserId: LINE_USER_A });

    const rows = await prisma.customerIdentity.findMany({ where: { externalId: LINE_USER_A } });
    // provider + externalId is unique, so two rows could not exist anyway —
    // what matters is that it moved rather than being refused.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.contactId).toBe(otherContact.id);

    await prisma.notificationLog.deleteMany({ where: { jobId: otherJob.id } });
    await prisma.job.delete({ where: { id: otherJob.id } });
    await prisma.customerIdentity.deleteMany({ where: { contactId: otherContact.id } });
    await prisma.customerContact.delete({ where: { id: otherContact.id } });
    await prisma.customerSite.delete({ where: { id: otherSite.id } });
  });

  it('keeps two different accounts apart', async () => {
    await linkLineToJobContact({ jobId, lineUserId: LINE_USER_A });
    await linkLineToJobContact({ jobId, lineUserId: LINE_USER_B });

    // The newer link wins for this contact; the point is that A's id is not
    // silently handed B's notifications.
    expect(await lineRecipientForJob(jobId)).toBe(LINE_USER_B);
  });
});

describe('once a LINE account is linked', () => {
  beforeEach(async () => {
    await linkLineToJobContact({ jobId, lineUserId: LINE_USER_A });
  });

  it('records what was sent', async () => {
    const result = await notifyJob({ jobId, templateCode: 'TECH_ON_SITE', vars: { jobNo: 'X' } });

    expect(result.status).toBe('SENT');
    const log = await prisma.notificationLog.findFirst({ where: { jobId } });
    expect(log).toMatchObject({ status: 'SENT', recipient: LINE_USER_A, channel: 'LINE' });
    expect(log!.sentAt).not.toBeNull();
  });

  it('sends the booking confirmation exactly once across both attempts', async () => {
    // Attempted at booking, and again when the customer links — because a
    // first-time customer is unreachable at the first moment and a returning
    // one is reachable at both.
    const first = await notifyJob({ jobId, templateCode: 'JOB_CONFIRMED', once: true });
    const second = await notifyJob({ jobId, templateCode: 'JOB_CONFIRMED', once: true });

    expect(first.status).toBe('SENT');
    expect(second.status).toBe('SKIPPED');
    expect(
      await prisma.notificationLog.count({ where: { jobId, templateCode: 'JOB_CONFIRMED' } }),
    ).toBe(1);
  });

  it('still allows a different message about the same job', async () => {
    await notifyJob({ jobId, templateCode: 'JOB_CONFIRMED', once: true });
    const onSite = await notifyJob({ jobId, templateCode: 'TECH_ON_SITE', once: true });

    expect(onSite.status).toBe('SENT');
  });

  it('does not throw when the template has not been published', async () => {
    // @ts-expect-error — deliberately a code no template row exists for.
    const result = await notifyJob({ jobId, templateCode: 'NO_SUCH_TEMPLATE' });
    expect(result.status).toBe('SKIPPED');
  });
});
