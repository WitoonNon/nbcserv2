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
  ],
  TECHNICIAN: ['job.read', 'workorder.read', 'workorder.submit', 'customer.read', 'catalog.read'],
  // Accounting pays people, so it is the one non-admin role that needs the
  // bank account and the wage.
  ACCOUNTING: [
    'job.read', 'charge.read', 'quotation.read', 'customer.read', 'report.read',
    'employee.read', 'employee.sensitive',
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

  for (const [roleCode, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    for (const permCode of perms) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { code: permCode } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
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
