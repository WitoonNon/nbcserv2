import 'server-only';
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

/**
 * Giving an employee a way to sign in.
 *
 * The clock is behind a login, so an employee with no account cannot punch —
 * they can be recorded, paid and rostered, but the QR on the wall does nothing
 * for them. Until now accounts existed only because the seed made them, and
 * there was no screen anywhere that could create one: the office could enter
 * their eleventh member of staff and only discover the gap after printing the
 * sign and standing them in front of it.
 *
 * The account is deliberately created here rather than alongside every
 * employee record. Somebody who never touches a phone still needs a personnel
 * file and a wage, and manufacturing a credential for them would be one more
 * live password protecting nothing.
 */

export class EmployeeLoginError extends Error {}

/** Roles the office may hand out. SUPER_ADMIN is not one of them. */
export const ASSIGNABLE_ROLES = [
  'TECHNICIAN',
  'ADMIN',
  'SUPERVISOR',
  'DISPATCHER',
  'ACCOUNTING',
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/**
 * A first password that survives being read down a phone line.
 *
 * No l/1/I or O/0, because this gets dictated across a workshop and a
 * misheard character is a support call. Long enough to be a real barrier for
 * the days it lives, and it does not need to be memorable — it is replaced on
 * first use.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateInitialPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export interface CreatedLogin {
  email: string;
  /** Shown once, never stored in the clear, never recoverable afterwards. */
  password: string;
}

/**
 * Create the account and attach it to the employee.
 *
 * `mustChangePassword` is on, so this credential reaches exactly one screen:
 * the one that replaces it. Until the holder does that, the account proves
 * nothing about who is using it — which matters here more than elsewhere,
 * because the whole point of the clock is that a punch identifies a person.
 */
export async function createLoginForEmployee(params: {
  employeeId: string;
  email: string;
  role: AssignableRole;
}): Promise<CreatedLogin> {
  const email = params.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new EmployeeLoginError('รูปแบบอีเมลไม่ถูกต้อง');
  }
  if (!ASSIGNABLE_ROLES.includes(params.role)) {
    throw new EmployeeLoginError('บทบาทไม่ถูกต้อง');
  }

  const employee = await prisma.employee.findUnique({
    where: { id: params.employeeId },
    select: { id: true, userId: true, firstNameTh: true, lastNameTh: true, isActive: true },
  });
  if (!employee) throw new EmployeeLoginError('ไม่พบพนักงานที่ระบุ');
  if (employee.userId) throw new EmployeeLoginError('พนักงานคนนี้มีบัญชีเข้าระบบอยู่แล้ว');
  if (!employee.isActive) throw new EmployeeLoginError('พนักงานคนนี้ถูกปิดใช้งานอยู่');

  const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (clash) throw new EmployeeLoginError('อีเมลนี้มีผู้ใช้อยู่แล้ว');

  const role = await prisma.role.findUnique({
    where: { code: params.role },
    select: { id: true },
  });
  if (!role) throw new EmployeeLoginError('ไม่พบบทบาทที่ระบุ');

  const password = generateInitialPassword();

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: `${employee.firstNameTh} ${employee.lastNameTh}`.trim(),
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        roles: { create: { roleId: role.id } },
      },
      select: { id: true },
    });

    await tx.employee.update({
      where: { id: employee.id },
      data: { userId: user.id, email },
    });
  });

  return { email, password };
}

/**
 * Issue a new first password for somebody who has forgotten theirs.
 *
 * Sets `mustChangePassword` again, so a reset lands the holder on the same
 * screen a new joiner sees. Sessions are cleared: a reset is the response to
 * "somebody else may have this account", and leaving the old sessions alive
 * would answer that with nothing.
 */
export async function resetEmployeePassword(employeeId: string): Promise<CreatedLogin> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (!employee?.userId || !employee.user?.email) {
    throw new EmployeeLoginError('พนักงานคนนี้ยังไม่มีบัญชีเข้าระบบ');
  }

  const password = generateInitialPassword();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: employee.userId! },
      data: { passwordHash: hashPassword(password), mustChangePassword: true },
    });
    await tx.session.deleteMany({ where: { userId: employee.userId! } });
  });

  return { email: employee.user.email, password };
}

/** Detach the login without deleting it — the audit trail still points at it. */
export async function unlinkLogin(employeeId: string): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { userId: true },
  });
  if (!employee?.userId) throw new EmployeeLoginError('พนักงานคนนี้ยังไม่มีบัญชีเข้าระบบ');

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employeeId }, data: { userId: null } });
    // Deactivated rather than deleted: jobs, work orders and punches reference
    // this user, and removing it would orphan the record of who did what.
    await tx.user.update({ where: { id: employee.userId! }, data: { isActive: false } });
    await tx.session.deleteMany({ where: { userId: employee.userId! } });
  });
}
