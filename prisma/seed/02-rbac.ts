import { prisma } from './client.js';
// One hashing implementation only — the seed must produce hashes the login
// flow can actually verify.
export { hashPassword } from '../../src/lib/auth/password.js';
import { hashPassword } from '../../src/lib/auth/password.js';

const ROLES = [
  { code: 'SUPER_ADMIN', nameTh: 'ผู้ดูแลระบบสูงสุด', nameEn: 'Super Admin' },
  { code: 'ADMIN', nameTh: 'ธุรการ / คอลเซ็นเตอร์', nameEn: 'Admin / Call Centre' },
  { code: 'DISPATCHER', nameTh: 'ผู้จ่ายงาน', nameEn: 'Dispatcher' },
  { code: 'SUPERVISOR', nameTh: 'หัวหน้างาน / วิศวกร', nameEn: 'Supervisor / Engineer' },
  { code: 'TECHNICIAN', nameTh: 'ช่างเทคนิค', nameEn: 'Technician' },
  { code: 'ACCOUNTING', nameTh: 'บัญชี', nameEn: 'Accounting' },
  { code: 'CUSTOMER', nameTh: 'ลูกค้า', nameEn: 'Customer' },
];

const PERMISSIONS = [
  'job.read', 'job.create', 'job.update', 'job.cancel',
  'quota.read', 'quota.configure', 'quota.override',
  'dispatch.read', 'dispatch.assign',
  'workorder.read', 'workorder.submit', 'workorder.approve',
  'quotation.read', 'quotation.create', 'quotation.approve',
  'charge.read', 'charge.create',
  'customer.read', 'customer.write',
  'catalog.read', 'catalog.write',
  'report.read',
  // Staff records. Split three ways on purpose: reading the register is an
  // everyday thing, editing it is not, and the national ID / bank account /
  // wage are a third class again — a supervisor who needs to know when a
  // technician started must not thereby see what everyone is paid.
  'employee.read', 'employee.write', 'employee.sensitive',
  // Attendance and requests. Split from admin.config so a supervisor can decide
  // their own team's overtime without also holding pricing, quota and user
  // administration — the quotation asks for the former and implies none of the
  // latter. `.all` lifts the team restriction; see modules/hr/scope.ts.
  'hr.approve', 'hr.approve.all',
  // Payroll again as its own pair: what people are paid is the owner-only
  // permission the client asked for on 26 ส.ค.
  'payroll.read', 'payroll.run',
  'admin.users', 'admin.config', 'admin.forms',
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: PERMISSIONS,
  ADMIN: [
    'job.read', 'job.create', 'job.update', 'job.cancel',
    'quota.read', 'dispatch.read',
    'workorder.read', 'quotation.read', 'quotation.create',
    'charge.read', 'charge.create',
    'customer.read', 'customer.write', 'catalog.read', 'report.read',
    // The office runs attendance for everybody. It still does not see payroll.
    'employee.read', 'hr.approve', 'hr.approve.all',
  ],
  DISPATCHER: [
    'job.read', 'job.update',
    'quota.read', 'quota.override',
    'dispatch.read', 'dispatch.assign',
    'workorder.read', 'customer.read', 'catalog.read', 'report.read',
  ],
  SUPERVISOR: [
    // Sees who works here and when they started; not what they earn.
    'employee.read',
    'job.read', 'job.update',
    'quota.read', 'dispatch.read', 'dispatch.assign',
    'workorder.read', 'workorder.approve',
    'quotation.read', 'quotation.create', 'quotation.approve',
    'charge.read', 'charge.create',
    'customer.read', 'catalog.read', 'report.read',
    // Decides overtime and leave for their OWN crew. Deliberately without
    // 'hr.approve.all' — the queues are filtered in modules/hr/scope.ts, and
    // the permission on its own is not the boundary.
    'hr.approve',
  ],
  TECHNICIAN: ['job.read', 'workorder.read', 'workorder.submit', 'customer.read', 'catalog.read'],
  // Reads the staff register but NOT the wage or the bank account.
  //
  // Accounting is the role that would normally need those, and it was given
  // them when this was built. The client answered on 26 ส.ค. 2569 that salary
  // and bank details are for the owner alone, so `employee.sensitive` now
  // belongs to SUPER_ADMIN only. If payroll processing later needs it, add a
  // dedicated role rather than widening this one — the point of splitting the
  // permission three ways was that seeing who works here and seeing what they
  // earn are different questions.
  ACCOUNTING: [
    'job.read', 'charge.read', 'quotation.read', 'customer.read', 'report.read',
    'employee.read',
  ],
  CUSTOMER: ['job.read', 'workorder.read', 'quotation.read'],
};

/** @client-confirm G7 — replace with the client's real staff list. */
const DEMO_USERS = [
  { email: 'admin@nbcgroup.co.th', name: 'ผู้ดูแลระบบ', roles: ['SUPER_ADMIN'] },
  { email: 'office@nbcgroup.co.th', name: 'ธุรการ สมหญิง', roles: ['ADMIN'] },
  { email: 'dispatch@nbcgroup.co.th', name: 'ผู้จ่ายงาน สมชาย', roles: ['DISPATCHER'] },
  { email: 'supervisor@nbcgroup.co.th', name: 'หัวหน้าช่าง ประสิทธิ์', roles: ['SUPERVISOR'] },
];

export async function seedRbac() {
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { code: r.code },
      create: { ...r, isSystem: true },
      update: { nameTh: r.nameTh, nameEn: r.nameEn },
    });
  }

  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
  }

  // Grants are made to match the list exactly — including taking away what is
  // no longer on it.
  //
  // This used to only add. Removing a permission from ROLE_PERMISSIONS
  // therefore did nothing at all to a database that already had it: the code
  // said one thing and every existing deployment kept doing another, with no
  // error anywhere. It was found when `employee.sensitive` was taken off
  // ACCOUNTING — the client had asked that salary and bank details be the
  // owner's alone — and the role still had it after a reseed.
  //
  // A permission list that cannot revoke is not a permission list.
  for (const [roleCode, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });

    const wanted = await prisma.permission.findMany({
      where: { code: { in: perms } },
      select: { id: true, code: true },
    });
    if (wanted.length !== perms.length) {
      const found = new Set(wanted.map((p) => p.code));
      throw new Error(
        `Unknown permission(s) for ${roleCode}: ${perms.filter((c) => !found.has(c)).join(', ')} — add them to PERMISSIONS`,
      );
    }

    for (const perm of wanted) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
    }

    // Guarded by roleId: an unset filter in Prisma matches every row, and this
    // one would empty the whole permission table.
    const removed = await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: wanted.map((p) => p.id) } },
    });
    if (removed.count > 0) {
      console.log(`  rbac: revoked ${removed.count} permission(s) from ${roleCode}`);
    }
  }

  // Dev password only. These four accounts are exempt from the first-login
  // password change because their password is published in the README and they
  // exist to be logged into repeatedly during development and demos. Every
  // account created through /settings/users starts flagged instead, so the
  // client's real staff cannot keep a password an admin chose for them.
  const devHash = hashPassword('nbc-dev-1234');
  for (const u of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        passwordHash: devHash,
        mustChangePassword: false,
      },
      update: { name: u.name, mustChangePassword: false },
    });
    for (const roleCode of u.roles) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {},
      });
    }
  }

  console.log(`  rbac: ${ROLES.length} roles, ${PERMISSIONS.length} permissions, ${DEMO_USERS.length} staff users`);
}
