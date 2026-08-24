import type { AcType } from '@/generated/prisma';
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

/**
 * Every machine type, including the two NBC no longer sells.
 *
 * The booking form offers a shorter list — CONCEALED_SMALL and CONCEALED_LARGE
 * were retired in favour of a single CONCEALED on 5 ส.ค. 2569. But units
 * installed under the old classification are still on customers' ceilings and
 * still in the register, so anything that DISPLAYS a type needs all of them.
 * A register row reading "OTHER" because its own label was deleted is a worse
 * answer than the truth.
 */
export const AC_TYPE_LABEL: Record<AcType, string> = {
  WALL: 'ติดผนัง',
  CEILING: 'แขวน',
  STANDING: 'ตู้ตั้ง',
  CASSETTE_4WAY: 'ฝังฝ้า 4 ทิศทาง',
  CASSETTE_1WAY: 'ฝังฝ้าทิศทางเดียว',
  CONCEALED: 'เปลือยซ่อนฝ้า',
  CONCEALED_SMALL: 'ซ่อนในฝ้า (เล็ก)',
  CONCEALED_LARGE: 'ซ่อนในฝ้า (ใหญ่)',
  VRV_VRF: 'VRV / VRF',
  AHU: 'AHU',
  CHILLER: 'Chiller',
  OTHER: 'อื่นๆ',
};
