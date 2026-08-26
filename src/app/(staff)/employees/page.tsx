import Link from 'next/link';
import { requirePermission, can } from '@/lib/auth/guard';
import {
  listEmployees,
  departments,
  EMPLOYEES_PER_PAGE,
  type EmployeeRow,
} from '@/modules/hr/employee.service';
import { Pagination, pageParam } from '@/components/ui/Pagination';
import { EMPLOYMENT_TYPE_LABEL, EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_CLASS } from '@/lib/hr-labels';
import { formatThaiDate } from '@/lib/date/buddhist';
import type { EmployeeStatus } from '@/generated/prisma';

export const dynamic = 'force-dynamic';

/**
 * ทะเบียนประวัติพนักงาน — the staff register.
 *
 * Names, positions and start dates only. Wages, national IDs and bank accounts
 * are not on this screen at any permission level: a list is the easiest thing
 * in an application to leave open on a shared monitor, and there is no version
 * of "everyone's salary at a glance" that belongs on one.
 */

interface Search {
  q?: string;
  status?: string;
  department?: string;
  inactive?: string;
  page?: string;
}

const inputCls =
  'border border-[var(--color-line)] rounded-[3px] px-3 py-2 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

function StatusPill({ status }: { status: EmployeeStatus }) {
  return (
    <span className={`inline-block rounded-[3px] px-2 py-0.5 text-[11px] ${EMPLOYEE_STATUS_CLASS[status]}`}>
      {EMPLOYEE_STATUS_LABEL[status]}
    </span>
  );
}

function Row({ e }: { e: EmployeeRow }) {
  return (
    <tr className="border-b border-[var(--color-line)] align-top">
      <td className="py-2.5 pr-3">
        <Link href={`/employees/${e.id}`} className="font-mono text-[13px] text-[var(--color-brand-blue-600)]">
          {e.employeeCode}
        </Link>
      </td>
      <td className="py-2.5 pr-3">
        {e.fullName}
        {e.nickname && <span className="text-[var(--color-muted)]"> ({e.nickname})</span>}
        <span className="block text-[11px] text-[var(--color-muted)]">
          {e.isTechnician ? 'ช่าง · มีในระบบจ่ายงาน' : e.hasLogin ? 'มีบัญชีเข้าระบบ' : 'ไม่มีบัญชีเข้าระบบ'}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        {e.position}
        {e.department && <span className="block text-[11px] text-[var(--color-muted)]">{e.department}</span>}
      </td>
      <td className="py-2.5 pr-3 text-[13px]">{EMPLOYMENT_TYPE_LABEL[e.employmentType]}</td>
      <td className="py-2.5 pr-3 whitespace-nowrap text-[13px]">
        {e.hiredAt ? formatThaiDate(new Date(e.hiredAt)) : <span className="text-[var(--color-muted)]">—</span>}
      </td>
      <td className="py-2.5 pr-3 text-[13px]">
        {e.phone ?? <span className="text-[var(--color-muted)]">—</span>}
      </td>
      <td className="py-2.5 pr-4">
        <StatusPill status={e.status} />
      </td>
    </tr>
  );
}

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission('employee.read', '/employees');
  const sp = await searchParams;

  const filter = {
    q: sp.q,
    status: sp.status ? (sp.status as EmployeeStatus) : undefined,
    department: sp.department,
    includeInactive: sp.inactive === '1',
  };

  let rows: EmployeeRow[] = [];
  let total = 0;
  let page = 1;
  let depts: string[] = [];
  let dbDown = false;
  try {
    const [result, d] = await Promise.all([
      listEmployees({ ...filter, page: pageParam(sp.page) }),
      departments(),
    ]);
    rows = result.rows;
    total = result.total;
    page = result.page;
    depts = d;
  } catch (e) {
    console.error('[employees] list failed', e);
    dbDown = true;
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">ทะเบียนประวัติพนักงาน</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            ข้อมูลพนักงานทุกคน ไม่ใช่เฉพาะช่าง — เป็นฐานของระบบลงเวลาและเงินเดือน
          </p>
        </div>
        {can(user, 'employee.write') && (
          <Link
            href="/employees/new"
            className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-4 py-2 text-sm font-semibold whitespace-nowrap"
          >
            + เพิ่มพนักงาน
          </Link>
        )}
      </div>

      <form method="get" className="card p-3 flex flex-wrap gap-2 items-end">
        <label className="block">
          <span className="block text-[12px] text-[var(--color-muted)] mb-1">ค้นหา</span>
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="รหัส · ชื่อ · ชื่อเล่น · ตำแหน่ง · เบอร์"
            className={inputCls + ' w-64'}
          />
        </label>
        <label className="block">
          <span className="block text-[12px] text-[var(--color-muted)] mb-1">สถานะ</span>
          <select name="status" defaultValue={sp.status ?? ''} className={inputCls}>
            <option value="">ทั้งหมด</option>
            {Object.entries(EMPLOYEE_STATUS_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {depts.length > 0 && (
          <label className="block">
            <span className="block text-[12px] text-[var(--color-muted)] mb-1">แผนก</span>
            <select name="department" defaultValue={sp.department ?? ''} className={inputCls}>
              <option value="">ทั้งหมด</option>
              {depts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm h-[38px]">
          <input
            type="checkbox"
            name="inactive"
            value="1"
            defaultChecked={sp.inactive === '1'}
            className="size-4 accent-[var(--color-brand-orange)]"
          />
          รวมพนักงานที่ปิดใช้งาน
        </label>
        <button className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-6 py-2 text-sm font-semibold h-[38px]">
          ค้นหา
        </button>
      </form>

      {dbDown && (
        <div className="card p-4 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          ยังเชื่อมต่อฐานข้อมูลไม่ได้
        </div>
      )}

      <div className="card overflow-hidden">
        {rows.length === 0 && !dbDown ? (
          <div className="p-6 text-sm">
            <p>ยังไม่มีพนักงานในทะเบียน</p>
            <p className="text-[13px] text-[var(--color-muted)] mt-1">
              ต้องมีข้อมูลพนักงานก่อน จึงจะคำนวณเวลาทำงานและเงินเดือนได้
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-[12px] text-[var(--color-muted)] border-b border-[var(--color-line)]">
                  <th className="py-2 pl-4 pr-3 font-normal">รหัส</th>
                  <th className="py-2 pr-3 font-normal">ชื่อ-นามสกุล</th>
                  <th className="py-2 pr-3 font-normal">ตำแหน่ง / แผนก</th>
                  <th className="py-2 pr-3 font-normal">ประเภทค่าจ้าง</th>
                  <th className="py-2 pr-3 font-normal">วันเริ่มงาน</th>
                  <th className="py-2 pr-3 font-normal">เบอร์โทร</th>
                  <th className="py-2 pr-4 font-normal">สถานะ</th>
                </tr>
              </thead>
              <tbody className="[&_td:first-child]:pl-4">
                {rows.map((e) => (
                  <Row key={e.id} e={e} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <Pagination
            page={page}
            total={total}
            perPage={EMPLOYEES_PER_PAGE}
            basePath="/employees"
            params={{ q: sp.q, status: sp.status, department: sp.department, inactive: sp.inactive }}
            unit="คน"
          />
        )}
      </div>

      <p className="text-[11px] text-[var(--color-muted)]">
        เลขบัตรประชาชน เลขบัญชีธนาคาร และค่าแรง ไม่แสดงในหน้ารายการนี้ —
        ดูได้ในหน้ารายละเอียดของแต่ละคน และระบบจะบันทึกไว้ว่าใครเปิดดูเมื่อไหร่
      </p>
    </div>
  );
}
