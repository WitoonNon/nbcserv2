/**
 * Buddhist Era helpers.
 *
 * @client-confirm A10 — assumed BE (พ.ศ.) on all customer-facing documents,
 * which is the Thai business norm. Flip AppConfig `date.era` to switch.
 */
export const BE_OFFSET = 543;

export function toBuddhistYear(date: Date): number {
  return date.getFullYear() + BE_OFFSET;
}

export function fromBuddhistYear(beYear: number): number {
  return beYear - BE_OFFSET;
}

const TH_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const TH_MONTHS_LONG = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/** 27 ก.ค. 2569 */
export function formatThaiDate(date: Date, style: 'short' | 'long' = 'short'): string {
  const months = style === 'long' ? TH_MONTHS_LONG : TH_MONTHS_SHORT;
  return `${date.getDate()} ${months[date.getMonth()]} ${toBuddhistYear(date)}`;
}

/** The period key used by DocumentSequence when resetPolicy = YEARLY. */
export function sequencePeriodKey(date: Date, policy: 'NEVER' | 'YEARLY' | 'MONTHLY'): string {
  if (policy === 'NEVER') return 'ALL';
  const be = toBuddhistYear(date);
  if (policy === 'YEARLY') return String(be);
  return `${be}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
