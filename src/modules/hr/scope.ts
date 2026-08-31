import 'server-only';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Whose attendance a person may see and decide on — ใบเสนอราคาข้อ 7.
 *
 * "หัวหน้าเห็นข้อมูลเฉพาะทีมของตนเอง" is a filter, not a permission. Holding
 * `hr.approve` says you may decide requests at all; this says whose. Without
 * both, a supervisor granted the permission would quietly get the whole
 * company, which is the failure this file exists to prevent.
 *
 * The team is the crews this person LEADS, taken through
 * Crew.leadTechnicianId — not the crews they are a member of. A technician who
 * happens to share a crew is a colleague, not a report.
 */

/**
 * `null` means no restriction. An empty array means "nobody", which is the
 * correct answer for a supervisor who leads no crew — never "everybody".
 */
export async function visibleEmployeeIds(user: SessionUser): Promise<string[] | null> {
  if (user.permissions.has('hr.approve.all')) return null;

  // No technician record means no crew to lead, so no team.
  if (!user.technicianId) return [];

  const crews = await prisma.crew.findMany({
    where: { leadTechnicianId: user.technicianId, isActive: true },
    select: {
      members: {
        // Members who have left the crew are not this supervisor's business
        // any more, the same rule dispatch uses.
        where: { validTo: null },
        select: { technician: { select: { employeeId: true } } },
      },
    },
  });

  const ids = new Set<string>();
  for (const crew of crews) {
    for (const member of crew.members) {
      if (member.technician.employeeId) ids.add(member.technician.employeeId);
    }
  }

  // A supervisor's own requests are their own to see, not to decide — the
  // services still refuse a self-approval path because deciding goes through
  // the same queue everybody else's does.
  const self = await prisma.employee.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (self) ids.add(self.id);

  return [...ids];
}

/**
 * Turn the scope into a Prisma filter fragment.
 *
 * Returns `{}` for unrestricted so it can be spread into any `where` clause
 * without the caller branching.
 */
export function employeeScopeWhere(ids: string[] | null): { employeeId?: { in: string[] } } {
  return ids === null ? {} : { employeeId: { in: ids } };
}

/** Whether this user may act on one specific employee's records. */
export function inScope(ids: string[] | null, employeeId: string): boolean {
  return ids === null || ids.includes(employeeId);
}
