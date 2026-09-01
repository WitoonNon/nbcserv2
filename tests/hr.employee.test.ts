import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  EmployeeError,
  canDeleteEmployee,
  createEmployee,
  deleteEmployee,
  employeeAccessLog,
  getEmployee,
  listEmployees,
  type EmployeeInput,
  updateEmployee,
  viewSensitive,
} from '../src/modules/hr/employee.service';
import { setWageFromEmployeeForm } from '../src/modules/hr/wage.service';
import { createLoginForEmployee } from '../src/modules/hr/employee-login.service';
import {
  encryptField,
  decryptField,
  isValidThaiNationalId,
  last4,
  FieldCryptoError,
} from '../src/lib/crypto/field';

/**
 * The staff register against real Postgres.
 *
 * What is defended here is not that the screens work. It is that the three
 * fields this module exists to protect cannot escape by accident:
 *
 *  - they are never in the ciphertext-free form anywhere in the row,
 *  - they are never in the ordinary read, at any permission level,
 *  - and asking for them is always recorded.
 *
 * Each of those is a single line of code away from silently reversing, and
 * none of them would show up as a broken screen if it did.
 *
 * Requires DATABASE_URL, FIELD_ENCRYPTION_KEY and a seeded database.
 */

// Real-looking but deliberately synthetic: valid check digit, not a real person.
const NID = '1101700207366';
const ACCOUNT = '123-4-56789-0';
const CODE = 'TESTEMP-001';
/**
 * A real user, because deleting a record writes an AuditLog row and
 * `AuditLog.actorId` is a foreign key.
 *
 * EmployeeAccessLog deliberately has no such constraint — that trail has to
 * survive the account it might be about — but a deletion is recorded against
 * the system audit log, where the actor is always a live session user.
 */
const ACTOR = { id: '', name: 'ผู้ทดสอบ' };

function base(): EmployeeInput {
  return {
    employeeCode: CODE,
    titleTh: 'นาย',
    firstNameTh: 'ทดสอบ',
    lastNameTh: 'ระบบพนักงาน',
    nickname: 'เทส',
    position: 'ช่างเทคนิค',
    department: 'ฝ่ายบริการ',
    employmentType: 'DAILY',
    status: 'ACTIVE',
    phone: '0899999888',
  };
}

async function cleanUp() {
  // Guarded on a prefix throughout: an unset filter in Prisma matches every
  // row, and these deleteMany calls would then empty the tables for the whole
  // company.
  const rows = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: 'TESTEMP-' } },
    select: { id: true },
  });
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    await prisma.overtimeRequest.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.payrollLine.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employeeWageChange.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employeeAccessLog.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  }

  // Accounts the login test creates. Without this a run that fails part-way
  // leaves the address taken, and every later run then fails on the clash
  // rather than on whatever it was checking — which is what just happened.
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'testemp.' } },
    select: { id: true },
  });
  if (users.length > 0) {
    const userIds = users.map((u) => u.id);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  // The throwaway period the payroll-blocker test needs.
  await prisma.payrollPeriod.deleteMany({ where: { code: '2500-01' } });
}

beforeAll(async () => {
  const user = await prisma.user.findFirstOrThrow({
    where: { email: 'admin@nbcgroup.co.th' },
    select: { id: true },
  });
  ACTOR.id = user.id;
  await cleanUp();
});
afterAll(cleanUp);

describe('field encryption', () => {
  it('round-trips a value', () => {
    expect(decryptField(encryptField(NID))).toBe(NID);
  });

  it('produces different ciphertext for the same value every time', () => {
    // A fresh IV per value. Without it, equal plaintexts give equal
    // ciphertexts, and anyone with the table can tell which two employees
    // share a bank account without decrypting anything.
    const a = encryptField(NID);
    const b = encryptField(NID);
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe(decryptField(b));
  });

  it('refuses a value that was tampered with', () => {
    const good = encryptField(NID);
    const parts = good.split('.');
    // Flip a byte of ciphertext; GCM's tag must reject it rather than
    // returning some other plaintext.
    const data = Buffer.from(parts[3]!, 'base64');
    data[0]! ^= 0xff;
    const bad = [parts[0], parts[1], parts[2], data.toString('base64')].join('.');
    expect(() => decryptField(bad)).toThrow();
  });

  it('refuses a format it does not recognise', () => {
    expect(() => decryptField('not-encrypted-at-all')).toThrow(FieldCryptoError);
  });

  it('validates the Thai national ID check digit', () => {
    expect(isValidThaiNationalId(NID)).toBe(true);
    expect(isValidThaiNationalId('1101700207361')).toBe(false); // check digit should be 6
    expect(isValidThaiNationalId('123')).toBe(false);
  });

  it('takes the last four digits ignoring punctuation', () => {
    expect(last4(ACCOUNT)).toBe('7890');
  });
});

describe('storing a personnel record', () => {
  let id: string;

  it('creates one', async () => {
    id = await createEmployee({ ...base(), nationalId: NID, bankAccount: ACCOUNT }, ACTOR);
    expect(id).toBeTruthy();
  });

  it('never writes the national ID or account number in the clear', async () => {
    // Read the raw row, not the service's view of it.
    const raw = await prisma.employee.findUniqueOrThrow({
      where: { id },
      select: { nationalIdEnc: true, bankAccountEnc: true, nationalIdLast4: true, bankAccountLast4: true },
    });

    expect(raw.nationalIdEnc).not.toContain(NID);
    expect(raw.bankAccountEnc).not.toContain('1234567890');
    expect(raw.nationalIdEnc?.startsWith('v1.')).toBe(true);

    // Only the last four are readable, and that is deliberate.
    expect(raw.nationalIdLast4).toBe('7366');
    expect(raw.bankAccountLast4).toBe('7890');
  });

  it('keeps the ordinary read free of the sensitive fields', async () => {
    const e = await getEmployee(id);
    const serialised = JSON.stringify(e);

    expect(serialised).not.toContain(NID);
    expect(serialised).not.toContain('1234567890');
    // Not even under another name: no wage anywhere in the shape.
    expect(serialised).not.toMatch(/wageRate/);

    // Masked, so the office can still confirm a number against a passbook
    // without the whole number ever reaching the screen.
    expect(e!.nationalIdMasked).toBe('x-xxxx-xxxxx-73-66');
    expect(e!.bankAccountMasked).toBe('xxx-x-x7890');
  });

  it('keeps them out of the list as well', async () => {
    const page = await listEmployees({ q: CODE });
    const serialised = JSON.stringify(page);
    expect(serialised).not.toContain(NID);
    expect(serialised).not.toMatch(/wageRate|nationalId|bankAccount/);
  });

  it('rejects a national ID with a bad check digit', async () => {
    await expect(
      createEmployee({ ...base(), employeeCode: 'TESTEMP-BAD', nationalId: '1101700207361' }, ACTOR),
    ).rejects.toBeInstanceOf(EmployeeError);
  });

  it('rejects a duplicate employee code', async () => {
    await expect(createEmployee(base(), ACTOR)).rejects.toBeInstanceOf(EmployeeError);
  });

  it('requires a resignation date once someone has resigned', async () => {
    await expect(
      updateEmployee(id, { ...base(), status: 'RESIGNED' }, ACTOR),
    ).rejects.toBeInstanceOf(EmployeeError);
  });
});

describe('reading the sensitive fields', () => {
  let id: string;

  beforeAll(async () => {
    id = await createEmployee(
      { ...base(), employeeCode: 'TESTEMP-002', nationalId: NID, bankAccount: ACCOUNT, wageRate: 650 },
      ACTOR,
    );
  });

  it('decrypts them back to what was entered, digits only', async () => {
    const f = await viewSensitive(id, ACTOR);
    expect(f!.nationalId).toBe(NID);
    expect(f!.bankAccount).toBe('1234567890');
    expect(f!.wageRate).toBe(650);
  });

  it('records who looked, before handing anything over', async () => {
    const before = await employeeAccessLog(id);
    await viewSensitive(id, { id: 'someone-else', name: 'สมหญิง' });
    const after = await employeeAccessLog(id);

    expect(after.length).toBe(before.length + 1);
    expect(after[0]!.actorName).toBe('สมหญิง');
    expect(after[0]!.action).toBe('view_sensitive');
  });

  it('records an edit too', async () => {
    await updateEmployee(id, { ...base(), employeeCode: 'TESTEMP-002' }, ACTOR);
    const log = await employeeAccessLog(id);
    expect(log[0]!.action).toBe('edit');
  });
});

describe('editing without erasing', () => {
  it('leaves a stored ID alone when the form field comes back empty', async () => {
    const id = await createEmployee(
      { ...base(), employeeCode: 'TESTEMP-003', nationalId: NID },
      ACTOR,
    );

    // The edit form cannot show the stored value, so a blank box is the normal
    // state of an ordinary save. Treating it as a deletion would wipe the
    // number every time somebody corrected a phone number.
    await updateEmployee(id, { ...base(), employeeCode: 'TESTEMP-003', phone: '0811111111' }, ACTOR);

    const f = await viewSensitive(id, ACTOR);
    expect(f!.nationalId).toBe(NID);

    const e = await getEmployee(id);
    expect(e!.phone).toBe('0811111111');
  });
});

describe('removing a record typed in by mistake', () => {
  it('allows it while nothing depends on the person', async () => {
    const id = await createEmployee({ ...base(), employeeCode: 'TESTEMP-DEL1' }, ACTOR);

    const check = await canDeleteEmployee(id);
    expect(check.canDelete).toBe(true);
    expect(check.blockers).toEqual([]);

    await deleteEmployee(id, ACTOR);
    expect(await getEmployee(id)).toBeNull();
  });

  it('refuses once payroll has been run against them', async () => {
    // The whole reason there is no general delete: removing this record takes
    // the basis of a payment with it, and "why was this person paid" has to
    // stay answerable.
    const id = await createEmployee({ ...base(), employeeCode: 'TESTEMP-DEL2' }, ACTOR);
    const period = await prisma.payrollPeriod.create({
      data: {
        code: '2500-01',
        from: new Date(Date.UTC(1957, 0, 1)),
        to: new Date(Date.UTC(1957, 0, 31)),
      },
      select: { id: true },
    });
    await prisma.payrollLine.create({
      data: { periodId: period.id, employeeId: id, wageRate: 500, employmentType: 'DAILY' },
    });

    const check = await canDeleteEmployee(id);
    expect(check.canDelete).toBe(false);
    expect(check.reasonTh).toContain('ลาออกแล้ว');
    expect(check.blockers.some((b) => b.label === 'รายการเงินเดือน')).toBe(true);

    await expect(deleteEmployee(id, ACTOR)).rejects.toBeInstanceOf(EmployeeError);
    expect(await getEmployee(id)).not.toBeNull();

  });

  it('re-checks at the moment of deleting, not when the button was drawn', async () => {
    const id = await createEmployee({ ...base(), employeeCode: 'TESTEMP-DEL3' }, ACTOR);
    // Deletable when the screen rendered.
    expect((await canDeleteEmployee(id)).canDelete).toBe(true);

    // Somebody files overtime in the meantime.
    await prisma.overtimeRequest.create({
      data: {
        employeeId: id,
        workDate: new Date(Date.UTC(2026, 0, 5)),
        kind: 'WORKDAY_OT',
        hours: 2,
        reason: 'ทดสอบ',
      },
    });

    await expect(deleteEmployee(id, ACTOR)).rejects.toBeInstanceOf(EmployeeError);
  });

  it('takes the wage history with it and leaves the login deactivated', async () => {
    const id = await createEmployee(
      { ...base(), employeeCode: 'TESTEMP-DEL4', wageRate: 500 },
      ACTOR,
    );
    await setWageFromEmployeeForm(
      { employeeId: id, wageRate: 500, employmentType: 'DAILY', hiredAt: null },
      ACTOR,
    );
    const login = await createLoginForEmployee({
      employeeId: id,
      email: 'testemp.del4@nbcgroup.co.th',
      role: 'TECHNICIAN',
    });

    await deleteEmployee(id, ACTOR);

    expect(await prisma.employeeWageChange.count({ where: { employeeId: id } })).toBe(0);
    // Kept but disabled: jobs and work orders point at the user, not the
    // employee, and deleting it would orphan the record of who did what.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: login.email } });
    expect(user.isActive).toBe(false);

  });
});
