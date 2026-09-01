import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, can } from '@/lib/auth/guard';
import { getEmployee, employeeAccessLog } from '@/modules/hr/employee.service';
import { SensitiveReveal } from '@/components/hr/SensitiveReveal';
import { WageHistory } from '@/components/hr/WageHistory';
import { EmployeeLogin } from '@/components/hr/EmployeeLogin';
import { wageHistory } from '@/modules/hr/wage.service';
import {
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_CLASS,
  ACCESS_ACTION_LABEL,
} from '@/lib/hr-labels';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-[var(--color-muted)]">{label}</dt>
      <dd className="text-sm">{value || <span className="text-[var(--color-muted)]">—</span>}</dd>
    </div>
  );
}

function thaiDate(iso: string | null): string | null {
  return iso ? formatThaiDate(new Date(iso)) : null;
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('employee.read', `/employees/${id}`);

  let employee;
  try {
    employee = await getEmployee(id);
  } catch (e) {
    console.error('[employees] detail failed', e);
    return (
      <div className="card p-5 bg-[var(--color-brand-orange-50)] max-w-2xl">
        <p className="text-sm">ยังเชื่อมต่อฐานข้อมูลไม่ได้</p>
      </div>
    );
  }
  if (!employee) notFound();

  const maySeeSensitive = can(user, 'employee.sensitive');
  // Both of these carry wages, so they are fetched only for a reader who is
  // allowed to see one — not fetched and then hidden in the markup.
  const [log, wages] = maySeeSensitive
    ? await Promise.all([
        employeeAccessLog(id).catch(() => []),
        wageHistory(id).catch(() => []),
      ])
    : [[], []];

  return (
    <div className="space-y-4 max-w-5xl">
      <Link href="/employees" className="text-sm text-[var(--color-brand-blue-600)]">
        ← กลับไปทะเบียนพนักงาน
      </Link>

      <div className="card p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl">
              {employee.fullName}
              {employee.nickname && (
                <span className="text-[var(--color-muted)] text-lg"> ({employee.nickname})</span>
              )}
            </h1>
            <p className="text-sm text-[var(--color-muted)] mt-0.5">
              <span className="font-mono">{employee.employeeCode}</span> · {employee.position}
              {employee.department ? ` · ${employee.department}` : ''}
            </p>
          </div>
          <div className="text-right space-y-1">
            <span
              className={`inline-block rounded-[3px] px-2 py-0.5 text-[12px] ${EMPLOYEE_STATUS_CLASS[employee.status]}`}
            >
              {EMPLOYEE_STATUS_LABEL[employee.status]}
            </span>
            {can(user, 'employee.write') && (
              <div>
                <Link
                  href={`/employees/${employee.id}/edit`}
                  className="inline-block border border-[var(--color-line)] rounded-[3px] px-4 py-1.5 text-sm hover:border-[var(--color-brand-blue)]"
                >
                  แก้ไขข้อมูล
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-base mb-3">ข้อมูลการจ้าง</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Field label="ประเภทค่าจ้าง" value={EMPLOYMENT_TYPE_LABEL[employee.employmentType]} />
          <Field label="วันเริ่มงาน" value={thaiDate(employee.hiredAt)} />
          <Field label="ครบทดลองงาน" value={thaiDate(employee.probationEndAt)} />
          {employee.status === 'RESIGNED' && (
            <Field label="วันที่ลาออก" value={thaiDate(employee.resignedAt)} />
          )}
          <Field label="ธนาคาร" value={employee.bankName} />
          <Field
            label="เลขบัญชี"
            value={employee.bankAccountMasked && <span className="font-mono">{employee.bankAccountMasked}</span>}
          />
        </dl>
      </div>

      <div className="card p-4">
        <h2 className="text-base mb-3">ข้อมูลส่วนตัว</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Field
            label="เลขบัตรประชาชน"
            value={employee.nationalIdMasked && <span className="font-mono">{employee.nationalIdMasked}</span>}
          />
          <Field label="วันเกิด" value={thaiDate(employee.birthDate)} />
          <Field label="เบอร์โทร" value={employee.phone} />
          <Field label="อีเมล" value={employee.email} />
          <div className="sm:col-span-3">
            <Field label="ที่อยู่ตามทะเบียนบ้าน" value={employee.address} />
          </div>
          <Field label="ผู้ติดต่อฉุกเฉิน" value={employee.emergencyContactName} />
          <Field label="เบอร์ผู้ติดต่อฉุกเฉิน" value={employee.emergencyContactPhone} />
          <Field label="ความสัมพันธ์" value={employee.emergencyContactRel} />
        </dl>
        {employee.note && (
          <p className="text-[13px] text-[var(--color-muted)] mt-3 pt-3 border-t border-[var(--color-line)]">
            {employee.note}
          </p>
        )}
      </div>

      {can(user, 'admin.users') && (
        <EmployeeLogin
          employeeId={employee.id}
          loginEmail={employee.loginEmail}
          suggestedEmail={employee.email}
        />
      )}

      {maySeeSensitive ? (
        <SensitiveReveal employeeId={employee.id} />
      ) : (
        <div className="card p-4">
          <h2 className="text-base mb-1">ข้อมูลอ่อนไหว</h2>
          <p className="text-[13px] text-[var(--color-muted)]">
            เลขบัตรประชาชน เลขบัญชีธนาคาร และค่าแรง — บัญชีของคุณไม่มีสิทธิ์เปิดดูส่วนนี้
          </p>
        </div>
      )}

      {maySeeSensitive && (
        <WageHistory
          employeeId={employee.id}
          history={wages}
          currentType={employee.employmentType}
          canEdit
        />
      )}

      {maySeeSensitive && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--color-line)]">
            <h2 className="text-base">ประวัติการเข้าถึงแฟ้มนี้</h2>
          </div>
          {log.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-muted)]">ยังไม่มีการเปิดดูหรือแก้ไข</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="[&_td:first-child]:pl-4">
                {log.map((l, i) => (
                  <tr key={i} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="py-2 pr-3">{l.actorName}</td>
                    <td className="py-2 pr-3 text-[13px]">
                      {ACCESS_ACTION_LABEL[l.action] ?? l.action}
                    </td>
                    <td className="py-2 pr-4 text-[12px] text-[var(--color-muted)] whitespace-nowrap">
                      {formatThaiDate(new Date(l.at))}{' '}
                      {new Date(l.at).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
