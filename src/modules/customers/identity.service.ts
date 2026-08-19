import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Attaching a LINE account to the person who booked.
 *
 * The unit of identity is a CustomerContact, not a Customer. A hotel is one
 * customer with a maintenance manager, an engineer and an accountant, and the
 * one who books wants the message about the technician arriving — sending it
 * to whoever happens to be first in the customer record would be wrong more
 * often than right.
 */

export class IdentityError extends Error {}

export interface LinkResult {
  contactId: string;
  contactName: string;
  /** True when this LINE account was already attached to this contact. */
  alreadyLinked: boolean;
}

/**
 * Point a LINE userId at the contact who booked a given job.
 *
 * Idempotent: a customer who taps the link twice, or books again next month,
 * ends up with the same single row rather than an error.
 */
export async function linkLineToJobContact(params: {
  jobId: string;
  lineUserId: string;
  displayName?: string;
}): Promise<LinkResult> {
  const { jobId, lineUserId } = params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      customerId: true,
      siteId: true,
      customer: { select: { displayName: true } },
    },
  });
  if (!job) throw new IdentityError('ไม่พบงานที่ระบุ');

  // The contact for this job's site, falling back to the customer's primary.
  // A booking always creates or reuses a contact, so the first branch is the
  // normal case; the fallback covers a job entered by the office by hand.
  const contact =
    (await prisma.customerContact.findFirst({
      where: { customerId: job.customerId, siteId: job.siteId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true },
    })) ??
    (await prisma.customerContact.findFirst({
      where: { customerId: job.customerId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true },
    }));

  if (!contact) throw new IdentityError('งานนี้ยังไม่มีผู้ติดต่อให้ผูกบัญชี');

  const existing = await prisma.customerIdentity.findUnique({
    where: { provider_externalId: { provider: 'LINE', externalId: lineUserId } },
    select: { id: true, contactId: true },
  });

  if (existing?.contactId === contact.id) {
    return { contactId: contact.id, contactName: contact.name, alreadyLinked: true };
  }

  if (existing) {
    // The same LINE account booking for somebody else — a landlord arranging a
    // clean for a tenant, an office manager for two sites. The account follows
    // the person using it, so it moves rather than being refused or duplicated:
    // `provider + externalId` is unique, and two rows cannot exist anyway.
    await prisma.customerIdentity.update({
      where: { id: existing.id },
      data: { contactId: contact.id },
    });
    return { contactId: contact.id, contactName: contact.name, alreadyLinked: false };
  }

  await prisma.customerIdentity.create({
    data: { contactId: contact.id, provider: 'LINE', externalId: lineUserId },
  });

  return { contactId: contact.id, contactName: contact.name, alreadyLinked: false };
}

/**
 * The LINE userId to notify about a job, if there is one.
 *
 * Returns null rather than throwing when nobody has linked: not being on LINE
 * is the ordinary state of a customer, not an error, and a job must never fail
 * because a notification has nowhere to go.
 */
export async function lineRecipientForJob(jobId: string): Promise<string | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { customerId: true, siteId: true },
  });
  if (!job) return null;

  const identity = await prisma.customerIdentity.findFirst({
    where: {
      provider: 'LINE',
      contact: { customerId: job.customerId },
    },
    orderBy: [
      // Prefer whoever is attached to this job's site over another site's
      // contact at the same customer.
      { contact: { siteId: job.siteId ? 'asc' : 'desc' } },
      { createdAt: 'desc' },
    ],
    select: { externalId: true, contact: { select: { siteId: true } } },
  });

  if (!identity) return null;

  // A contact on a different site is still better than nobody, but only when
  // this job has no site of its own to disagree with.
  if (job.siteId && identity.contact.siteId && identity.contact.siteId !== job.siteId) {
    const sameSite = await prisma.customerIdentity.findFirst({
      where: { provider: 'LINE', contact: { customerId: job.customerId, siteId: job.siteId } },
      select: { externalId: true },
    });
    return sameSite?.externalId ?? identity.externalId;
  }

  return identity.externalId;
}
