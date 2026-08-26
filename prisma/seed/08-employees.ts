import { prisma } from './client.js';

/**
 * Staff records for the accounts that already exist.
 *
 * Built from `User` and `Technician` rather than invented, so the register
 * agrees with the people the rest of the system already knows about and the
 * link between a technician and their staff record is real from day one.
 *
 * No national IDs, no bank accounts, no wages. Those are the client's real
 * personal data; a seed that filled them with plausible-looking numbers would
 * put fake identity data into a production database, and somebody would
 * eventually mistake it for the truth.
 *
 * @client-confirm H2 — positions and departments are placeholders taken from
 * each account's role. The client's real org chart replaces them.
 */

const POSITION_BY_ROLE: Record<string, { position: string; department: string }> = {
  SUPER_ADMIN: { position: 'ผู้ดูแลระบบ', department: 'สำนักงาน' },
  ADMIN: { position: 'ธุรการ / คอลเซ็นเตอร์', department: 'สำนักงาน' },
  DISPATCHER: { position: 'ผู้จ่ายงาน', department: 'ฝ่ายบริการ' },
  SUPERVISOR: { position: 'หัวหน้าช่าง', department: 'ฝ่ายบริการ' },
  TECHNICIAN: { position: 'ช่างเทคนิค', department: 'ฝ่ายบริการ' },
  ACCOUNTING: { position: 'บัญชี', department: 'สำนักงาน' },
};

/** Splits "ธุรการ สมหญิง" into a first and last name without losing anything. */
function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0]!, last: '-' };
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1)! };
}

export async function seedEmployees() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      roles: { select: { role: { select: { code: true } } } },
      technician: { select: { id: true, employeeCode: true, nickname: true, phone: true, hiredAt: true } },
      employee: { select: { id: true } },
    },
    orderBy: { email: 'asc' },
  });

  let seq = 0;
  for (const u of users) {
    seq += 1;
    if (u.employee) continue; // already has a staff record — leave it alone

    const roleCode = u.roles[0]?.role.code ?? 'ADMIN';
    const role = POSITION_BY_ROLE[roleCode] ?? POSITION_BY_ROLE.ADMIN!;
    const { first, last } = splitName(u.name);

    // A technician's existing employeeCode wins: it is already printed on
    // paperwork and referenced by dispatch.
    const code = u.technician?.employeeCode ?? `EMP-${String(seq).padStart(3, '0')}`;

    const employee = await prisma.employee.upsert({
      where: { employeeCode: code },
      create: {
        userId: u.id,
        employeeCode: code,
        firstNameTh: first,
        lastNameTh: last,
        nickname: u.technician?.nickname ?? null,
        phone: u.technician?.phone ?? u.phone ?? null,
        email: u.email,
        position: role.position,
        department: role.department,
        employmentType: roleCode === 'TECHNICIAN' ? 'DAILY' : 'MONTHLY',
        status: 'ACTIVE',
        hiredAt: u.technician?.hiredAt ?? null,
      },
      update: { userId: u.id },
      select: { id: true },
    });

    if (u.technician) {
      await prisma.technician.update({
        where: { id: u.technician.id },
        data: { employeeId: employee.id },
      });
    }
  }

  const total = await prisma.employee.count();
  console.log(`  employees: ${total}`);
}
