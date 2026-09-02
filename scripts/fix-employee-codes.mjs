/**
 * Strip stray Thai combining marks from employee codes.
 *
 * The client entered their register with a Thai keyboard active and seven
 * codes came out with a leading ◌ฺ (U+0E3A) — one with two. The mark has no
 * letter to attach to, so it renders as almost nothing and the code looks
 * correct on every screen. It is not correct: U+0E3A sorts above every Latin
 * letter, so those codes sink to the bottom of any list ordered by code, and
 * searching for the code as typed finds nothing.
 *
 * saveEmployee now normalises on write, so this is only for rows entered
 * before that. Dry run by default; pass --apply to write.
 *
 *   node scripts/fix-employee-codes.mjs
 *   node scripts/fix-employee-codes.mjs --apply
 */
import { PrismaClient } from '../src/generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const APPLY = process.argv.includes('--apply');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const clean = (raw) =>
  raw
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/(^|[^\u0E01-\u0E2E\u0E40-\u0E44])[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+/g, '$1')
    .trim();

const rows = await db.employee.findMany({
  select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true },
  orderBy: { employeeCode: 'asc' },
});

const changes = rows
  .map((r) => ({ ...r, next: clean(r.employeeCode) }))
  .filter((r) => r.next !== r.employeeCode);

if (changes.length === 0) {
  console.log('ไม่มีรหัสที่ต้องแก้');
  await db.$disconnect();
  process.exit(0);
}

console.log(`รหัสที่จะแก้ ${changes.length} รายการ\n`);
for (const c of changes) {
  console.log(`  ${JSON.stringify(c.employeeCode).padEnd(14)} → ${JSON.stringify(c.next).padEnd(9)}  ${c.firstNameTh} ${c.lastNameTh}`);
}

// A cleaned code can collide with one somebody already typed correctly.
// Better to stop and let a person decide than to merge two people's codes.
const taken = new Set(rows.map((r) => r.employeeCode));
const clashes = changes.filter((c) => taken.has(c.next));
if (clashes.length > 0) {
  console.log('\n🔴 หยุด — รหัสใหม่ซ้ำกับที่มีอยู่แล้ว:');
  for (const c of clashes) console.log(`  ${c.next}`);
  await db.$disconnect();
  process.exit(1);
}

if (!APPLY) {
  console.log('\nยังไม่ได้แก้อะไร — รันซ้ำด้วย --apply เพื่อแก้จริง');
  await db.$disconnect();
  process.exit(0);
}

await db.$transaction(
  changes.map((c) =>
    db.employee.update({ where: { id: c.id }, data: { employeeCode: c.next } }),
  ),
);
console.log(`\n✓ แก้แล้ว ${changes.length} รายการ`);

const after = await db.employee.findMany({ orderBy: { employeeCode: 'asc' }, select: { employeeCode: true } });
console.log('\nลำดับใหม่:\n  ' + after.map((r) => r.employeeCode).join(' · '));
await db.$disconnect();
