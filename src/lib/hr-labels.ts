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

/**
 * Roles the office may hand out when creating a staff login.
 *
 * Here rather than beside the service that uses it, because the form that
 * renders the dropdown is a client component: importing this from a module
 * marked `server-only` pulls prisma and node:crypto into the browser bundle,
 * and the build fails with an error that names the wrong file. Typecheck and
 * the test suite both pass in that state — only `next build` catches it.
 *
 * SUPER_ADMIN is deliberately absent. The office creates accounts for staff,
 * not administrators.
 */
export const ASSIGNABLE_ROLES = [
  'TECHNICIAN',
  'ADMIN',
  'SUPERVISOR',
  'DISPATCHER',
  'ACCOUNTING',
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ASSIGNABLE_ROLE_LABEL: Record<AssignableRole, string> = {
  TECHNICIAN: 'ช่างเทคนิค',
  ADMIN: 'ธุรการ / คอลเซ็นเตอร์',
  SUPERVISOR: 'หัวหน้างาน',
  DISPATCHER: 'ผู้จ่ายงาน',
  ACCOUNTING: 'บัญชี',
};
