import type { JobSize, ServiceCategory } from '@/generated/prisma';

export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  INSPECTION_REPAIR: 'ตรวจเช็ค/แจ้งซ่อม',
  CLEANING_PM: 'ล้างแอร์/PM',
  REPAIR: 'ซ่อม',
  INSTALLATION: 'ติดตั้ง',
};

export const JOB_SIZE_LABEL: Record<JobSize, string> = {
  S: 'S — งานเล็ก',
  M: 'M — งานกลาง',
  L: 'L — งานใหญ่',
  XL: 'XL — งานโครงการ',
};
