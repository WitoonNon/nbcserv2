import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, can } from '@/lib/auth/guard';
import { getEmployee } from '@/modules/hr/employee.service';
import { EmployeeForm } from '@/components/hr/EmployeeForm';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('employee.write', `/employees/${id}/edit`);

  const employee = await getEmployee(id);
  if (!employee) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/employees/${id}`} className="text-sm text-[var(--color-brand-blue-600)]">
        ← กลับไปข้อมูลพนักงาน
      </Link>
      <h1 className="text-2xl">
        แก้ไขข้อมูล · <span className="text-[var(--color-muted)]">{employee.fullName}</span>
      </h1>
      <EmployeeForm employee={employee} canEditSensitive={can(user, 'employee.sensitive')} />
    </div>
  );
}
