import 'server-only';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';
import type { EmploymentType, EmployeeStatus } from '@/generated/prisma';
import {
  encryptOptional,
  decryptOptional,
  digitsOnly,
  last4,
  isValidThaiNationalId,
} from '@/lib/crypto/field';

/**
 * The staff register.
 *
 * Two rules run through everything here.
 *
 * **The sensitive fields are opt-in, never incidental.** A national ID, a bank
 * account and a wage are not returned by the ordinary read — a caller has to
 * ask for them and prove it may. If they came back by default they would end
 * up in a list screen, a log line and a cache before anyone noticed, and the
 * encryption at rest would have bought nothing.
 *
 * **Asking is recorded.** `viewSensitive` writes who looked at whose file
 * before it hands anything back. Customer records carry no such trail and do
 * not need one; a personnel file does, because the rule about who may read it
 * is otherwise unverifiable after the fact.
 */

export class EmployeeError extends Error {}

export interface EmployeeRow {
  id: string;
  employeeCode: string;
  fullName: string;
  nickname: string | null;
  position: string;
  department: string | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  phone: string | null;
  hiredAt: string | null;
  isActive: boolean;
  hasLogin: boolean;
  isTechnician: boolean;
}

export interface EmployeeFilter {
  q?: string;
  status?: EmployeeStatus;
  department?: string;
  includeInactive?: boolean;
  page?: number;
  perPage?: number;
}

export const EMPLOYEES_PER_PAGE = 25;

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
}

function clampPage(raw: number | undefined, pages: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.min(Math.max(Math.floor(raw as number), 1), Math.max(1, pages));
}

function fullName(e: { titleTh: string | null; firstNameTh: string; lastNameTh: string }): string {
  return `${e.titleTh ?? ''}${e.firstNameTh} ${e.lastNameTh}`.trim();
}

export async function listEmployees(filter: EmployeeFilter = {}): Promise<Page<EmployeeRow>> {
  const perPage = Number.isFinite(filter.perPage)
    ? Math.min(Math.max(Math.floor(filter.perPage as number), 1), 100)
    : EMPLOYEES_PER_PAGE;

  const where: Prisma.EmployeeWhereInput = {};
  if (!filter.includeInactive) where.isActive = true;
  if (filter.status) where.status = filter.status;
  if (filter.department) where.department = filter.department;

  const q = filter.q?.trim();
  if (q) {
    where.OR = [
      { employeeCode: { contains: q, mode: 'insensitive' } },
      { firstNameTh: { contains: q, mode: 'insensitive' } },
      { lastNameTh: { contains: q, mode: 'insensitive' } },
      { nickname: { contains: q, mode: 'insensitive' } },
      { position: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      // The last four digits are in the clear precisely so this works. The
      // full number cannot be searched — it is encrypted with a random IV per
      // row, so equal numbers do not produce equal ciphertext.
      { nationalIdLast4: q.length === 4 ? q : undefined },
    ];
  }

  const total = await prisma.employee.count({ where });
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = clampPage(filter.page, pages);

  const rows = await prisma.employee.findMany({
    where,
    orderBy: [{ status: 'asc' }, { employeeCode: 'asc' }],
    skip: (page - 1) * perPage,
    take: perPage,
    select: {
      id: true,
      employeeCode: true,
      titleTh: true,
      firstNameTh: true,
      lastNameTh: true,
      nickname: true,
      position: true,
      department: true,
      employmentType: true,
      status: true,
      phone: true,
      hiredAt: true,
      isActive: true,
      userId: true,
      technician: { select: { id: true } },
      // wageRate, nationalIdEnc and bankAccountEnc are deliberately absent.
    },
  });

  return {
    rows: rows.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: fullName(e),
      nickname: e.nickname,
      position: e.position,
      department: e.department,
      employmentType: e.employmentType,
      status: e.status,
      phone: e.phone,
      hiredAt: e.hiredAt?.toISOString() ?? null,
      isActive: e.isActive,
      hasLogin: e.userId !== null,
      isTechnician: e.technician !== null,
    })),
    total,
    page,
    perPage,
  };
}

export interface EmployeeDetail extends EmployeeRow {
  titleTh: string | null;
  firstNameTh: string;
  lastNameTh: string;
  birthDate: string | null;
  email: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRel: string | null;
  probationEndAt: string | null;
  resignedAt: string | null;
  bankName: string | null;
  /** Masked always — 'xxx-x-x1234'. The full number needs viewSensitive. */
  bankAccountMasked: string | null;
  /** Masked always — 'x-xxxx-xxxxx-12-3'. */
  nationalIdMasked: string | null;
  note: string | null;
  loginEmail: string | null;
}

/** The ordinary read. Never returns a wage, an ID number or an account number. */
export async function getEmployee(id: string): Promise<EmployeeDetail | null> {
  const e = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      employeeCode: true,
      titleTh: true,
      firstNameTh: true,
      lastNameTh: true,
      nickname: true,
      position: true,
      department: true,
      employmentType: true,
      status: true,
      phone: true,
      email: true,
      address: true,
      birthDate: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      emergencyContactRel: true,
      hiredAt: true,
      probationEndAt: true,
      resignedAt: true,
      bankName: true,
      bankAccountLast4: true,
      nationalIdLast4: true,
      note: true,
      isActive: true,
      userId: true,
      user: { select: { email: true } },
      technician: { select: { id: true } },
    },
  });
  if (!e) return null;

  return {
    id: e.id,
    employeeCode: e.employeeCode,
    fullName: fullName(e),
    titleTh: e.titleTh,
    firstNameTh: e.firstNameTh,
    lastNameTh: e.lastNameTh,
    nickname: e.nickname,
    position: e.position,
    department: e.department,
    employmentType: e.employmentType,
    status: e.status,
    phone: e.phone,
    email: e.email,
    address: e.address,
    birthDate: e.birthDate?.toISOString() ?? null,
    emergencyContactName: e.emergencyContactName,
    emergencyContactPhone: e.emergencyContactPhone,
    emergencyContactRel: e.emergencyContactRel,
    hiredAt: e.hiredAt?.toISOString() ?? null,
    probationEndAt: e.probationEndAt?.toISOString() ?? null,
    resignedAt: e.resignedAt?.toISOString() ?? null,
    bankName: e.bankName,
    bankAccountMasked: e.bankAccountLast4 ? `xxx-x-x${e.bankAccountLast4}` : null,
    nationalIdMasked: e.nationalIdLast4 ? `x-xxxx-xxxxx-${e.nationalIdLast4.slice(0, 2)}-${e.nationalIdLast4.slice(2)}` : null,
    note: e.note,
    isActive: e.isActive,
    hasLogin: e.userId !== null,
    loginEmail: e.user?.email ?? null,
    isTechnician: e.technician !== null,
  };
}

export interface SensitiveFields {
  nationalId: string | null;
  bankAccount: string | null;
  wageRate: number | null;
}

/**
 * The three fields the ordinary read withholds.
 *
 * Writes the access log BEFORE decrypting, and awaits it. If the log cannot be
 * written the data is not handed over — an unlogged read of a personnel file is
 * exactly the event this trail exists to make impossible.
 */
export async function viewSensitive(
  employeeId: string,
  actor: { id: string; name: string },
): Promise<SensitiveFields | null> {
  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { nationalIdEnc: true, bankAccountEnc: true, wageRate: true },
  });
  if (!e) return null;

  await prisma.employeeAccessLog.create({
    data: { employeeId, actorId: actor.id, actorName: actor.name, action: 'view_sensitive' },
  });

  return {
    nationalId: decryptOptional(e.nationalIdEnc),
    bankAccount: decryptOptional(e.bankAccountEnc),
    wageRate: e.wageRate === null ? null : Number(e.wageRate),
  };
}

export interface EmployeeInput {
  employeeCode: string;
  titleTh?: string | null;
  firstNameTh: string;
  lastNameTh: string;
  nickname?: string | null;
  nationalId?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRel?: string | null;
  position: string;
  department?: string | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  wageRate?: number | null;
  hiredAt?: string | null;
  probationEndAt?: string | null;
  resignedAt?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  note?: string | null;
  userId?: string | null;
}

function dateOrNull(v: string | null | undefined): Date | null {
  if (!v) return null;
  // Parsed as a plain calendar date. `new Date('2026-08-25')` is UTC midnight,
  // which in Bangkok is the 25th at 07:00 — fine for @db.Date, but the parts
  // are taken explicitly so a change of column type cannot silently shift it.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function validate(input: EmployeeInput): void {
  if (!input.employeeCode.trim()) throw new EmployeeError('กรุณากรอกรหัสพนักงาน');
  if (!input.firstNameTh.trim() || !input.lastNameTh.trim()) {
    throw new EmployeeError('กรุณากรอกชื่อและนามสกุล');
  }
  if (!input.position.trim()) throw new EmployeeError('กรุณากรอกตำแหน่ง');

  const nid = input.nationalId?.trim();
  if (nid && !isValidThaiNationalId(nid)) {
    // Checked here rather than left to the payroll run: once encrypted, a
    // wrong digit cannot be spotted by looking at it.
    throw new EmployeeError('เลขบัตรประชาชนไม่ถูกต้อง — ตรวจสอบอีกครั้ง');
  }

  if (input.wageRate !== null && input.wageRate !== undefined) {
    if (!Number.isFinite(input.wageRate) || input.wageRate < 0) {
      throw new EmployeeError('ค่าแรงต้องเป็นตัวเลขและไม่ติดลบ');
    }
  }

  if (input.status === 'RESIGNED' && !input.resignedAt) {
    throw new EmployeeError('พนักงานที่ลาออกแล้วต้องระบุวันที่ลาออก');
  }
}

function toRow(input: EmployeeInput) {
  const nid = input.nationalId?.trim();
  const acct = input.bankAccount?.trim();

  return {
    employeeCode: input.employeeCode.trim(),
    titleTh: input.titleTh?.trim() || null,
    firstNameTh: input.firstNameTh.trim(),
    lastNameTh: input.lastNameTh.trim(),
    nickname: input.nickname?.trim() || null,
    birthDate: dateOrNull(input.birthDate),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    emergencyContactName: input.emergencyContactName?.trim() || null,
    emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
    emergencyContactRel: input.emergencyContactRel?.trim() || null,
    position: input.position.trim(),
    department: input.department?.trim() || null,
    employmentType: input.employmentType,
    status: input.status,
    wageRate:
      input.wageRate === null || input.wageRate === undefined
        ? null
        : new Prisma.Decimal(input.wageRate.toFixed(2)),
    hiredAt: dateOrNull(input.hiredAt),
    probationEndAt: dateOrNull(input.probationEndAt),
    resignedAt: dateOrNull(input.resignedAt),
    bankName: input.bankName?.trim() || null,
    note: input.note?.trim() || null,
    userId: input.userId || null,
    ...(nid
      ? { nationalIdEnc: encryptOptional(digitsOnly(nid)), nationalIdLast4: last4(nid) }
      : {}),
    ...(acct
      ? { bankAccountEnc: encryptOptional(digitsOnly(acct)), bankAccountLast4: last4(acct) }
      : {}),
  };
}

export async function createEmployee(
  input: EmployeeInput,
  actor: { id: string; name: string },
): Promise<string> {
  validate(input);

  const clash = await prisma.employee.findUnique({
    where: { employeeCode: input.employeeCode.trim() },
    select: { id: true },
  });
  if (clash) throw new EmployeeError('รหัสพนักงานนี้มีอยู่แล้ว');

  const created = await prisma.employee.create({ data: toRow(input), select: { id: true } });
  await prisma.employeeAccessLog.create({
    data: { employeeId: created.id, actorId: actor.id, actorName: actor.name, action: 'edit' },
  });
  return created.id;
}

export async function updateEmployee(
  id: string,
  input: EmployeeInput,
  actor: { id: string; name: string },
): Promise<void> {
  validate(input);

  const existing = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, employeeCode: true },
  });
  if (!existing) throw new EmployeeError('ไม่พบพนักงานที่ระบุ');

  const code = input.employeeCode.trim();
  if (code !== existing.employeeCode) {
    const clash = await prisma.employee.findUnique({
      where: { employeeCode: code },
      select: { id: true },
    });
    if (clash) throw new EmployeeError('รหัสพนักงานนี้มีอยู่แล้ว');
  }

  // An empty ID or account field means "leave it alone", not "erase it" — the
  // edit form cannot show the stored value, so a blank box is the normal state
  // and treating it as a deletion would wipe the data on every ordinary save.
  await prisma.employee.update({ where: { id }, data: toRow(input) });
  await prisma.employeeAccessLog.create({
    data: { employeeId: id, actorId: actor.id, actorName: actor.name, action: 'edit' },
  });
}

export interface DeletionCheck {
  canDelete: boolean;
  /** Why not, in words the office reads. */
  reasonTh: string | null;
  blockers: { label: string; count: number }[];
}

/**
 * Whether a record can be removed outright, and what stops it.
 *
 * There is deliberately no general delete. A personnel record is referenced by
 * payroll that has been run and punches that were counted; removing one would
 * take the basis of a payment with it, and "why was this person paid" is a
 * question that has to stay answerable. Resigning somebody is the normal end
 * of their record, and that is what the status field is for.
 *
 * But a record typed in by mistake — a duplicate, a test row, a name entered
 * against the wrong person — has none of that behind it, and leaving it as a
 * permanent "resigned" entry means the register never matches the company.
 * QA hit exactly this: four test employees that could only be hidden, never
 * removed, and the only way out was hand-written SQL.
 *
 * So: deletable while nothing depends on it, and refused with the reason once
 * anything does.
 */
export async function canDeleteEmployee(id: string): Promise<DeletionCheck> {
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!employee) {
    return { canDelete: false, reasonTh: 'ไม่พบพนักงานที่ระบุ', blockers: [] };
  }

  const [punches, overtime, leave, payrollLines, technician] = await Promise.all([
    prisma.timeClockEntry.count({ where: { employeeId: id } }),
    prisma.overtimeRequest.count({ where: { employeeId: id } }),
    prisma.leaveRequest.count({ where: { employeeId: id } }),
    prisma.payrollLine.count({ where: { employeeId: id } }),
    prisma.technician.count({ where: { employeeId: id } }),
  ]);

  const blockers = [
    { label: 'การลงเวลา', count: punches },
    { label: 'คำขอโอที', count: overtime },
    { label: 'คำขอลา', count: leave },
    { label: 'รายการเงินเดือน', count: payrollLines },
    { label: 'ผูกกับช่างในระบบจ่ายงาน', count: technician },
  ].filter((b) => b.count > 0);

  if (blockers.length === 0) return { canDelete: true, reasonTh: null, blockers: [] };

  return {
    canDelete: false,
    reasonTh:
      'ลบถาวรไม่ได้เพราะมีข้อมูลอ้างถึงอยู่ — ถ้าคนนี้ลาออก ให้เปลี่ยนสถานะเป็น "ลาออกแล้ว" แทน',
    blockers,
  };
}

/**
 * Remove a record that nothing depends on.
 *
 * Re-checks rather than trusting the screen: the button is only rendered when
 * the record looks deletable, and between rendering and pressing somebody may
 * have filed overtime against it.
 *
 * The wage history and access log go with it — they describe a person who is
 * about to stop existing and reference nothing else. The login is detached and
 * deactivated rather than deleted, on the same reasoning as unlinkLogin: jobs
 * and work orders point at the user, not the employee.
 */
export async function deleteEmployee(
  id: string,
  actor: { id: string; name: string },
): Promise<void> {
  const check = await canDeleteEmployee(id);
  if (!check.canDelete) {
    throw new EmployeeError(check.reasonTh ?? 'ลบไม่ได้');
  }

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id },
    select: { id: true, userId: true, employeeCode: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.employeeWageChange.deleteMany({ where: { employeeId: id } });
    await tx.employeeAccessLog.deleteMany({ where: { employeeId: id } });
    await tx.employee.delete({ where: { id } });

    if (employee.userId) {
      await tx.session.deleteMany({ where: { userId: employee.userId } });
      await tx.user.update({ where: { id: employee.userId }, data: { isActive: false } });
    }

    // Recorded against no employee, because there is no longer one to point
    // at — the entityId keeps the code so the row can still be read.
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'employee.delete',
        entityType: 'Employee',
        entityId: employee.employeeCode,
        before: { employeeCode: employee.employeeCode },
      },
    });
  });
}

export interface AccessLogRow {
  actorName: string;
  action: string;
  at: string;
}

/** Who has opened this file. */
export async function employeeAccessLog(employeeId: string, take = 20): Promise<AccessLogRow[]> {
  const rows = await prisma.employeeAccessLog.findMany({
    where: { employeeId },
    orderBy: { at: 'desc' },
    take,
    select: { actorName: true, action: true, at: true },
  });
  return rows.map((r) => ({ actorName: r.actorName, action: r.action, at: r.at.toISOString() }));
}

/** Distinct departments, for the filter box. */
export async function departments(): Promise<string[]> {
  const rows = await prisma.employee.findMany({
    where: { department: { not: null }, isActive: true },
    distinct: ['department'],
    select: { department: true },
    orderBy: { department: 'asc' },
  });
  return rows.map((r) => r.department!).filter(Boolean);
}
