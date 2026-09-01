import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/db';
import { verifyPassword } from '../src/lib/auth/password';
import { createEmployee } from '../src/modules/hr/employee.service';
import {
  createLoginForEmployee,
  resetEmployeePassword,
  unlinkLogin,
  generateInitialPassword,
  EmployeeLoginError,
} from '../src/modules/hr/employee-login.service';

/**
 * Giving an employee a way in.
 *
 * The clock sits behind a login, so this is the difference between a person
 * who can punch and one who can only be recorded. What is defended: the
 * credential shown on screen is the one that works, it cannot be handed out
 * twice, and it never survives as something anyone could look up afterwards.
 *
 * Requires DATABASE_URL and a seeded database.
 */

const ACTOR = { id: 'test-actor', name: 'ผู้ทดสอบ' };
const PREFIX = 'TESTLOGIN-';
const EMAIL = 'testlogin.employee@nbcgroup.co.th';
let employeeId: string;

async function cleanUp() {
  const rows = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: PREFIX } },
    select: { id: true, userId: true },
  });
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'testlogin.' } },
    select: { id: true },
  });
  const userIds = [...new Set([...rows.map((r) => r.userId), ...users.map((u) => u.id)])].filter(
    (v): v is string => Boolean(v),
  );

  // Guarded: an unset filter in Prisma matches every row.
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    await prisma.employeeWageChange.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employeeAccessLog.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  }
  if (userIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

beforeEach(async () => {
  await cleanUp();
  employeeId = await createEmployee(
    {
      employeeCode: `${PREFIX}001`,
      firstNameTh: 'ทดสอบ',
      lastNameTh: 'บัญชี',
      position: 'ช่างเทคนิค',
      employmentType: 'DAILY',
      status: 'ACTIVE',
    },
    ACTOR,
  );
});
afterAll(cleanUp);

describe('the first password', () => {
  it('avoids characters that are misheard when read aloud', () => {
    // Dictated across a workshop; l/1/I and O/0 turn into a support call.
    for (let i = 0; i < 50; i++) {
      expect(generateInitialPassword()).not.toMatch(/[l1IO0]/);
    }
  });

  it('is different every time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateInitialPassword()));
    expect(seen.size).toBe(50);
  });
});

describe('creating the account', () => {
  it('produces a credential that actually signs in', async () => {
    const issued = await createLoginForEmployee({
      employeeId,
      email: EMAIL,
      role: 'TECHNICIAN',
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: EMAIL },
      select: {
        passwordHash: true,
        isActive: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });

    // The password shown on screen is the one that works. Anything else and
    // the office hands somebody a credential that fails at the door.
    expect(verifyPassword(issued.password, user.passwordHash)).toBe(true);
    expect(user.isActive).toBe(true);
    expect(user.roles.map((r) => r.role.code)).toEqual(['TECHNICIAN']);
  });

  it('forces a replacement at first sign-in', async () => {
    await createLoginForEmployee({ employeeId, email: EMAIL, role: 'TECHNICIAN' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    // Until it is replaced the account proves nothing about who is using it,
    // which matters most here — a punch is supposed to identify a person.
    expect(user.mustChangePassword).toBe(true);
  });

  it('never stores the password in a readable form', async () => {
    const issued = await createLoginForEmployee({ employeeId, email: EMAIL, role: 'TECHNICIAN' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.passwordHash).not.toContain(issued.password);
    expect(user.passwordHash?.startsWith('scrypt$')).toBe(true);
  });

  it('attaches the account to the employee', async () => {
    await createLoginForEmployee({ employeeId, email: EMAIL, role: 'TECHNICIAN' });
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { userId: true, email: true },
    });
    expect(employee.userId).toBeTruthy();
    expect(employee.email).toBe(EMAIL);
  });

  it('refuses a second account for the same person', async () => {
    await createLoginForEmployee({ employeeId, email: EMAIL, role: 'TECHNICIAN' });
    await expect(
      createLoginForEmployee({
        employeeId,
        email: 'testlogin.other@nbcgroup.co.th',
        role: 'TECHNICIAN',
      }),
    ).rejects.toBeInstanceOf(EmployeeLoginError);
  });

  it('refuses an email somebody else already uses', async () => {
    await expect(
      createLoginForEmployee({ employeeId, email: 'admin@nbcgroup.co.th', role: 'TECHNICIAN' }),
    ).rejects.toBeInstanceOf(EmployeeLoginError);
  });

  it('refuses a malformed email', async () => {
    await expect(
      createLoginForEmployee({ employeeId, email: 'not-an-email', role: 'TECHNICIAN' }),
    ).rejects.toBeInstanceOf(EmployeeLoginError);
  });

  it('will not hand out SUPER_ADMIN', async () => {
    // The office creates accounts for staff; it does not create administrators.
    await expect(
      createLoginForEmployee({
        employeeId,
        email: EMAIL,
        role: 'SUPER_ADMIN' as never,
      }),
    ).rejects.toBeInstanceOf(EmployeeLoginError);
  });
});

describe('resetting a forgotten password', () => {
  it('issues a working one and retires the old', async () => {
    const first = await createLoginForEmployee({ employeeId, email: EMAIL, role: 'TECHNICIAN' });
    const second = await resetEmployeePassword(employeeId);

    expect(second.password).not.toBe(first.password);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(verifyPassword(second.password, user.passwordHash)).toBe(true);
    expect(verifyPassword(first.password, user.passwordHash)).toBe(false);
    expect(user.mustChangePassword).toBe(true);
  });

  it('signs the account out everywhere', async () => {
    await createLoginForEmployee({ employeeId, email: EMAIL, role: 'TECHNICIAN' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    await prisma.session.create({
      data: {
        userId: user.id,
        token: 'testlogin-session-token',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await resetEmployeePassword(employeeId);

    // A reset is the answer to "somebody else may have this account". Leaving
    // the old sessions alive would answer it with nothing.
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('refuses for somebody with no account', async () => {
    await expect(resetEmployeePassword(employeeId)).rejects.toBeInstanceOf(EmployeeLoginError);
  });
});

describe('removing the account', () => {
  it('detaches and deactivates without deleting the record', async () => {
    await createLoginForEmployee({ employeeId, email: EMAIL, role: 'TECHNICIAN' });
    await unlinkLogin(employeeId);

    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { userId: true },
    });
    expect(employee.userId).toBeNull();

    // Kept, because jobs, work orders and punches point at this user; deleting
    // it would orphan the record of who did what.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.isActive).toBe(false);
  });

  it('lets the person be given a fresh account afterwards', async () => {
    await createLoginForEmployee({ employeeId, email: EMAIL, role: 'TECHNICIAN' });
    await unlinkLogin(employeeId);

    const again = await createLoginForEmployee({
      employeeId,
      email: 'testlogin.again@nbcgroup.co.th',
      role: 'ADMIN',
    });
    expect(again.password).toBeTruthy();
  });
});
