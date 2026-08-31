import 'server-only';
import { prisma } from '@/lib/db';
import type { EmploymentType } from '@/generated/prisma';
import { getSessionUser } from '@/lib/auth/session';

/**
 * Who the signed-in person is in the staff register.
 *
 * The one thing this file exists to guarantee: on every self-service screen,
 * `employeeId` is derived from the session and never read from the request.
 * The forms on /requests submit a request id and nothing else that identifies
 * a person, so a crafted POST can only ever act on the sender's own record —
 * there is no field to tamper with.
 *
 * Returns null rather than throwing for the two ordinary cases: not signed in,
 * and signed in on an account that was never linked to an employee row
 * (`Employee.userId` is nullable on purpose — a labourer who never signs in
 * still has to be paid). Both are states the screen explains, not errors.
 */
export interface SelfEmployee {
  id: string;
  employeeCode: string;
  firstNameTh: string;
  lastNameTh: string;
  nickname: string | null;
  employmentType: EmploymentType;
  isActive: boolean;
}

export async function currentEmployee(): Promise<SelfEmployee | null> {
  const user = await getSessionUser();
  if (!user) return null;

  return prisma.employee.findFirst({
    where: { userId: user.id },
    select: {
      id: true,
      employeeCode: true,
      firstNameTh: true,
      lastNameTh: true,
      nickname: true,
      employmentType: true,
      isActive: true,
    },
  });
}

/** The name to greet somebody by — nickname if the register has one. */
export function displayName(employee: SelfEmployee): string {
  return employee.nickname
    ? `${employee.firstNameTh} (${employee.nickname})`
    : `${employee.firstNameTh} ${employee.lastNameTh}`;
}
