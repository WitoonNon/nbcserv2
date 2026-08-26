import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  createEmployee,
  updateEmployee,
  getEmployee,
  listEmployees,
  viewSensitive,
  employeeAccessLog,
  EmployeeError,
  type EmployeeInput,
} from '../src/modules/hr/employee.service';
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
const ACTOR = { id: 'test-actor', name: 'ผู้ทดสอบ' };

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
  const rows = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: 'TESTEMP-' } },
    select: { id: true },
  });
  // Guarded: an unset filter in Prisma matches everything.
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  await prisma.employeeAccessLog.deleteMany({ where: { employeeId: { in: ids } } });
  await prisma.employee.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(cleanUp);
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
