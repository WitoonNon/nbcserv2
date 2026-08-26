import Link from 'next/link';
import { requirePermission, can } from '@/lib/auth/guard';
import { EmployeeForm } from '@/components/hr/EmployeeForm';

export const dynamic = 'force-dynamic';

export default async function NewEmployeePage() {
  const user = await requirePermission('employee.write', '/employees/new');

  return (
    <div className="space-y-4">
      <Link href="/employees" className="text-sm text-[var(--color-brand-blue-600)]">
        ← กลับไปทะเบียนพนักงาน
      </Link>
      <h1 className="text-2xl">เพิ่มพนักงาน</h1>
      <EmployeeForm canEditSensitive={can(user, 'employee.sensitive')} />
    </div>
  );
}
