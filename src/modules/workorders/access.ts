import 'server-only';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Who a work order — and the photographs on it — is any of.
 *
 * `workorder.read` answers "may this account look at work orders at all". It
 * was being treated as if it also answered "at THIS one", and it does not:
 * the CUSTOMER role holds that permission, so the moment customers can log in
 * (Phase 2.6, LINE) one customer could fetch photographs taken inside another
 * customer's home. A technician could equally read another crew's jobs.
 *
 * The rule lives here rather than at each call site because there are two call
 * sites that must agree — serving a file and attaching one — and a rule copied
 * into two places is a rule that will be enforced in one.
 *
 * field-work.service.ts already scopes a technician's WRITES to their crew;
 * this is the same idea applied to work orders and their media.
 */

/** Roles that run the business and legitimately see every job. */
const OFFICE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'SUPERVISOR'];

export type AccessScope =
  /** The office: every work order. */
  | 'ALL'
  /** A technician: work orders on jobs their crew is assigned to. */
  | 'CREW'
  /** A customer: work orders on their own jobs. */
  | 'OWN_CUSTOMER'
  | 'NONE';

export function scopeFor(user: SessionUser): AccessScope {
  if (!user.permissions.has('workorder.read')) return 'NONE';
  if (OFFICE_ROLES.some((role) => user.roles.includes(role))) return 'ALL';
  if (user.technicianId) return 'CREW';
  if (user.roles.includes('CUSTOMER')) return 'OWN_CUSTOMER';
  // An account with the permission but none of the roles above has no basis
  // for seeing any particular job. Defaulting to "yes" here is the bug.
  return 'NONE';
}

/** The customer this login belongs to, if it is a customer login at all. */
async function customerIdFor(userId: string): Promise<string | null> {
  const contact = await prisma.customerContact.findFirst({
    where: { userId },
    select: { customerId: true },
  });
  return contact?.customerId ?? null;
}

/**
 * The set of work orders this user may see, as a query filter.
 *
 * Returned as a `where` rather than a boolean so that asking about ONE work
 * order and LISTING them use the same rule. A list built from its own
 * hand-written filter is a second copy of this policy, and the copy is the one
 * that eventually disagrees.
 *
 * `null` means "no work orders at all" — distinct from `{}`, which means
 * "every work order" and is what the office gets.
 */
export async function visibleWorkOrdersWhere(
  user: SessionUser,
): Promise<Prisma.WorkOrderWhereInput | null> {
  const scope = scopeFor(user);
  if (scope === 'NONE') return null;
  if (scope === 'ALL') return {};

  if (scope === 'CREW') {
    return {
      job: {
        assignments: {
          some: {
            // A withdrawn crew loses access with the assignment. The same
            // predicate decides what appears in their queue.
            unassignedAt: null,
            crew: { members: { some: { technicianId: user.technicianId!, validTo: null } } },
          },
        },
      },
    };
  }

  const customerId = await customerIdFor(user.id);
  if (!customerId) return null;
  return { job: { customerId } };
}

/** May this user see this work order? */
export async function canViewWorkOrder(user: SessionUser, workOrderId: string): Promise<boolean> {
  const where = await visibleWorkOrdersWhere(user);
  if (where === null) return false;

  const match = await prisma.workOrder.findFirst({
    where: { ...where, id: workOrderId },
    select: { id: true },
  });
  return match !== null;
}

/**
 * May this user add to this work order?
 *
 * Narrower than viewing on purpose. A customer may look at the photographs of
 * their own visit — that is the point of showing them — but filling in a work
 * order is the technician's job and the office's, and a customer able to
 * attach files to one could put anything into the company's own records.
 */
export async function canEditWorkOrder(user: SessionUser, workOrderId: string): Promise<boolean> {
  const scope = scopeFor(user);
  if (scope !== 'ALL' && scope !== 'CREW') return false;
  return canViewWorkOrder(user, workOrderId);
}
