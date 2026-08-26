'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { saveEmployeeAction, type EmployeeFormState } from '@/app/(staff)/employees/actions';
import { EMPLOYMENT_TYPE_LABEL, EMPLOYEE_STATUS_LABEL } from '@/lib/hr-labels';
import type { EmployeeDetail } from '@/modules/hr/employee.service';

/**
 * One form for both adding and editing.
 *
 * The two sensitive fields start empty even when editing, and that is not an
 * oversight. The form cannot show a stored national ID without decrypting it,
 * and decrypting it to fill a box would mean every edit — a corrected phone
 * number, a new department — silently became a read of the ID. So a blank box
 * means "leave what is stored alone"; typing replaces it.
 */

const input =
  'w-full border border-[var(--color-line)] rounded-[3px] px-3 py-2 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

function F({
  label,
  name,
  defaultValue,
  type = 'text',
  required,
  placeholder,
  hint,
  span,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  span?: boolean;
}) {
  return (
    <label className={`block ${span ? 'sm:col-span-3' : ''}`}>
      <span className="block text-[12px] text-[var(--color-muted)] mb-1">
        {label}
        {required && <span className="text-[var(--color-brand-orange)]"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        required={required}
        placeholder={placeholder}
        className={input}
      />
      {hint && <span className="block text-[11px] text-[var(--color-muted)] mt-1">{hint}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className="text-base mb-3">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-3">{children}</div>
    </div>
  );
}

export function EmployeeForm({
  employee,
  canEditSensitive,
}: {
  employee?: EmployeeDetail;
  /** Wage, national ID and bank account are a separate permission. */
  canEditSensitive: boolean;
}) {
  const [state, action, pending] = useActionState<EmployeeFormState, FormData>(
    saveEmployeeAction,
    {},
  );

  const isoDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

  return (
    <form action={action} className="space-y-4 max-w-5xl">
      {employee && <input type="hidden" name="id" value={employee.id} />}

      <Section title="ข้อมูลพนักงาน">
        <F label="รหัสพนักงาน" name="employeeCode" defaultValue={employee?.employeeCode} required placeholder="EMP-001" />
        <F label="คำนำหน้า" name="titleTh" defaultValue={employee?.titleTh} placeholder="นาย / นาง / นางสาว" />
        <F label="ชื่อเล่น" name="nickname" defaultValue={employee?.nickname} />
        <F label="ชื่อ" name="firstNameTh" defaultValue={employee?.firstNameTh} required />
        <F label="นามสกุล" name="lastNameTh" defaultValue={employee?.lastNameTh} required />
        <F label="วันเกิด" name="birthDate" type="date" defaultValue={isoDate(employee?.birthDate)} />
        <F label="เบอร์โทร" name="phone" defaultValue={employee?.phone} />
        <F label="อีเมล" name="email" type="email" defaultValue={employee?.email} />
        <div />
        <F label="ที่อยู่ตามทะเบียนบ้าน" name="address" defaultValue={employee?.address} span />
      </Section>

      <Section title="ผู้ติดต่อฉุกเฉิน">
        <F label="ชื่อ" name="emergencyContactName" defaultValue={employee?.emergencyContactName} />
        <F label="เบอร์โทร" name="emergencyContactPhone" defaultValue={employee?.emergencyContactPhone} />
        <F label="ความสัมพันธ์" name="emergencyContactRel" defaultValue={employee?.emergencyContactRel} placeholder="คู่สมรส / บิดา / มารดา" />
      </Section>

      <Section title="การจ้างงาน">
        <F label="ตำแหน่ง" name="position" defaultValue={employee?.position} required placeholder="ช่างเทคนิค" />
        <F label="แผนก" name="department" defaultValue={employee?.department} placeholder="ฝ่ายบริการ" />
        <label className="block">
          <span className="block text-[12px] text-[var(--color-muted)] mb-1">ประเภทค่าจ้าง</span>
          <select name="employmentType" defaultValue={employee?.employmentType ?? 'DAILY'} className={input}>
            {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[12px] text-[var(--color-muted)] mb-1">สถานะ</span>
          <select name="status" defaultValue={employee?.status ?? 'PROBATION'} className={input}>
            {Object.entries(EMPLOYEE_STATUS_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <F label="วันเริ่มงาน" name="hiredAt" type="date" defaultValue={isoDate(employee?.hiredAt)} />
        <F label="ครบทดลองงาน" name="probationEndAt" type="date" defaultValue={isoDate(employee?.probationEndAt)} />
        <F
          label="วันที่ลาออก"
          name="resignedAt"
          type="date"
          defaultValue={isoDate(employee?.resignedAt)}
          hint="กรอกเมื่อเลือกสถานะ ลาออกแล้ว"
        />
        <F label="ธนาคาร" name="bankName" defaultValue={employee?.bankName} placeholder="กสิกรไทย" />
        <F label="หมายเหตุ" name="note" defaultValue={employee?.note} />
      </Section>

      {canEditSensitive && (
        <div className="card p-4 border-[var(--color-brand-orange)]/40 bg-[var(--color-brand-orange-50)]/30">
          <h2 className="text-base mb-1">ข้อมูลอ่อนไหว</h2>
          <p className="text-[12px] text-[var(--color-muted)] mb-3">
            เก็บแบบเข้ารหัสในฐานข้อมูล · {employee ? 'เว้นว่างไว้ = ไม่แก้ไขของเดิม' : 'กรอกได้ภายหลัง'}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <F
              label="เลขบัตรประชาชน"
              name="nationalId"
              placeholder={employee?.nationalIdMasked ?? '13 หลัก'}
              hint="ระบบตรวจเลขหลักสุดท้ายให้ ถ้าพิมพ์ผิดจะไม่ให้บันทึก"
            />
            <F
              label="เลขบัญชีธนาคาร"
              name="bankAccount"
              placeholder={employee?.bankAccountMasked ?? 'เลขบัญชี'}
            />
            <F
              label="ค่าแรง (บาท)"
              name="wageRate"
              placeholder="ต่อวัน หรือ ต่อเดือน ตามประเภทค่าจ้าง"
              hint={employee ? 'เว้นว่าง = ล้างค่าเดิม' : undefined}
            />
          </div>
        </div>
      )}

      {state.error && (
        <div className="card p-3 bg-red-50 border-[#b42318]/30">
          <p className="text-sm text-[#b42318]">{state.error}</p>
        </div>
      )}
      {state.saved && !state.error && (
        <div className="card p-3 bg-[#e8f6ee] border-[#16a34a]/30">
          <p className="text-sm text-[#16a34a]">บันทึกแล้ว</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-6 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? 'กำลังบันทึก…' : employee ? 'บันทึกการแก้ไข' : 'เพิ่มพนักงาน'}
        </button>
        <Link
          href={employee ? `/employees/${employee.id}` : '/employees'}
          className="text-sm text-[var(--color-muted)]"
        >
          ยกเลิก
        </Link>
      </div>
    </form>
  );
}
