import type { EmploymentType, EmployeeStatus } from '@/generated/prisma';

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  DAILY: 'รายวัน',
  MONTHLY: 'รายเดือน',
};

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  PROBATION: 'ทดลองงาน',
  ACTIVE: 'พนักงานประจำ',
  ON_LEAVE: 'ลาระยะยาว',
  RESIGNED: 'ลาออกแล้ว',
};

/** Reuses the job-status palette deliberately — one vocabulary of colour. */
export const EMPLOYEE_STATUS_CLASS: Record<EmployeeStatus, string> = {
  PROBATION: 'bg-[var(--color-brand-orange-50)] text-[var(--color-brand-orange-600)]',
  ACTIVE: 'bg-[#e8f6ee] text-[#16a34a]',
  ON_LEAVE: 'bg-[#f1f5f9] text-[#64748b]',
  RESIGNED: 'bg-[#fdeaea] text-[#b42318]',
};

/** What the access log recorded, in words the office reads. */
export const ACCESS_ACTION_LABEL: Record<string, string> = {
  view_sensitive: 'เปิดดูข้อมูลอ่อนไหว',
  edit: 'แก้ไขข้อมูล',
  export: 'ส่งออกข้อมูล',
};
