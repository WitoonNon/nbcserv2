#!/usr/bin/env node
/**
 * Empty the staff register so the client can enter their own people.
 *
 * The personnel records and everything hanging off them go — wages, punches,
 * overtime, leave, payroll. Logins and technicians stay.
 *
 * That last part is the whole point, and it was nearly got wrong. The first
 * version of this deleted the demo user accounts too, and `Technician.userId`
 * is `onDelete: Cascade`: removing six technician logins would have taken six
 * technicians, eight skills, six crew memberships and 252 shifts with them,
 * emptying the dispatch board and the schedule. The instruction was to clear
 * the staff register and KEEP the job side, and dispatch is the job side.
 *
 * So the client opens a clean register to type into, and every other screen
 * still demonstrates a working system.
 *
 *   node scripts/clean-demo-staff.mjs          # count only, changes nothing
 *   node scripts/clean-demo-staff.mjs --apply  # delete, in one transaction
 *
 * Dry run by default, and the counting query is the same one the delete uses,
 * so the number shown is the number removed. A cleanup script in this project
 * has already deleted more than intended once — `asset.deleteMany({ customerId })`
 * matched on a field Asset does not have, threw part-way, and left the
 * database half-emptied — so this one prints first and asks second.
 *
 * Everything runs inside a single transaction. On a connection that drops
 * mid-run, which is the condition this was written under, a partial delete
 * would leave employees gone and their logins behind.
 */
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';

try { process.loadEnvFile(path.join(process.cwd(), '.env')); } catch {}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes('--apply');

async function main() {
  // Every personnel record goes, the owner's included. They are the company
  // owner and will enter the real list themselves, starting with their own.
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeCode: true,
      firstNameTh: true,
      lastNameTh: true,
      userId: true,
    },
    orderBy: { employeeCode: 'asc' },
  });
  const employeeIds = employees.map((e) => e.id);

  const counts = {
    'time_clock_entries': employeeIds.length
      ? await prisma.timeClockEntry.count({ where: { employeeId: { in: employeeIds } } })
      : 0,
    'overtime_requests': employeeIds.length
      ? await prisma.overtimeRequest.count({ where: { employeeId: { in: employeeIds } } })
      : 0,
    'leave_requests': employeeIds.length
      ? await prisma.leaveRequest.count({ where: { employeeId: { in: employeeIds } } })
      : 0,
    'payroll_lines': employeeIds.length
      ? await prisma.payrollLine.count({ where: { employeeId: { in: employeeIds } } })
      : 0,
    'employee_wage_changes': employeeIds.length
      ? await prisma.employeeWageChange.count({ where: { employeeId: { in: employeeIds } } })
      : 0,
    'employee_access_logs': employeeIds.length
      ? await prisma.employeeAccessLog.count({ where: { employeeId: { in: employeeIds } } })
      : 0,
    'payroll_periods': await prisma.payrollPeriod.count(),
    'employees': employees.length,
  };

  // What is deliberately NOT touched, printed so the scope is visible rather
  // than assumed.
  const kept = {
    users: await prisma.user.count(),
    technicians: await prisma.technician.count(),
    crews: await prisma.crew.count(),
    technician_shifts: await prisma.technicianShift.count(),
    job_assignments: await prisma.jobAssignment.count(),
    customers: await prisma.customer.count(),
    customer_sites: await prisma.customerSite.count(),
    assets: await prisma.asset.count(),
    jobs: await prisma.job.count(),
    work_orders: await prisma.workOrder.count(),
    app_config: await prisma.appConfig.count(),
  };

  console.log(`\n${APPLY ? '=== กำลังลบจริง ===' : '=== นับอย่างเดียว ยังไม่ลบ ==='}\n`);

  console.log('พนักงานที่จะถูกลบ');
  for (const e of employees) {
    console.log(`  ${e.employeeCode.padEnd(12)} ${e.firstNameTh} ${e.lastNameTh}`);
  }
  console.log('\nบัญชีผู้ใช้: ไม่ลบสักบัญชี — ช่างและทีมยังอยู่ครบ จ่ายงานใช้ได้ตามปกติ');

  console.log('\nจำนวนแถวที่จะลบ');
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(30)} ${n}`);
  }

  console.log('\nไม่แตะต้อง');
  for (const [table, n] of Object.entries(kept)) {
    console.log(`  ${table.padEnd(30)} ${n}`);
  }

  if (!APPLY) {
    console.log('\nยังไม่ได้ลบอะไร — รันซ้ำด้วย --apply เพื่อลบจริง\n');
    return;
  }

  // One transaction: a connection that drops half way must leave the database
  // as it was, not with employees gone and their logins behind.
  await prisma.$transaction(
    async (tx) => {
      if (employeeIds.length > 0) {
        const where = { employeeId: { in: employeeIds } };
        await tx.timeClockEntry.deleteMany({ where });
        await tx.overtimeRequest.deleteMany({ where });
        await tx.leaveRequest.deleteMany({ where });
        await tx.payrollLine.deleteMany({ where });
        await tx.employeeWageChange.deleteMany({ where });
        await tx.employeeAccessLog.deleteMany({ where });
        // Dispatch points at the staff record; detach rather than delete the
        // technician, which crews and job assignments still reference.
        await tx.technician.updateMany({
          where: { employeeId: { in: employeeIds } },
          data: { employeeId: null },
        });
        await tx.employee.deleteMany({ where: { id: { in: employeeIds } } });
      }

      // Periods describe runs over staff that no longer exist.
      await tx.payrollPeriod.deleteMany({});
    },
    { timeout: 120_000, maxWait: 60_000 },
  );

  const after = {
    employees: await prisma.employee.count(),
    users: await prisma.user.count(),
    technicians: await prisma.technician.count(),
    technician_shifts: await prisma.technicianShift.count(),
    customers: await prisma.customer.count(),
    assets: await prisma.asset.count(),
    jobs: await prisma.job.count(),
  };
  console.log('\nหลังลบ');
  for (const [t, n] of Object.entries(after)) console.log(`  ${t.padEnd(30)} ${n}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('\nล้มเหลว — ไม่มีอะไรถูกลบ (rollback แล้ว):\n', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
