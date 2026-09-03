/**
 * Take a backup, and prove it can be read back.
 *
 * Phase 3.5. Supabase's free plan takes NO automated backups — that is not an
 * oversight in the dashboard, it is what the plan includes — so until the
 * project moves to Pro this script is the only copy of the data that exists
 * anywhere other than the live database.
 *
 * ## Why a JSON export and not pg_dump
 *
 * pg_dump has to match the server's major version and is not installed on the
 * machines this project is developed on. A restore that cannot be run is not
 * a backup, so this uses the Prisma client that is already here and always
 * works. The trade-off is real and worth stating: this captures ROWS, not
 * schema, sequences, or storage objects. Restoring means `prisma migrate
 * deploy` onto an empty database first, then this file back in.
 *
 * ## Photos are NOT in here
 *
 * Attachments live in Supabase Storage. This file carries the rows that point
 * at them; the images themselves need their own copy. Said out loud because
 * the photos are the evidence in a customer dispute, and a backup that
 * silently omitted them would be discovered at the worst possible moment.
 *
 *   node scripts/backup.mjs                  # writes backups/<timestamp>.json
 *   node scripts/backup.mjs --out path.json
 *   node scripts/backup.mjs --verify path.json   # reads one back, counts rows
 */
import 'dotenv/config';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';

/**
 * Ordered so a restore can be replayed straight down the list: a table never
 * appears before something it points at. Getting this wrong turns a restore
 * into a foreign-key error at 3am.
 */
const TABLES = [
  'role', 'permission', 'rolePermission', 'user', 'userRole',
  'zone', 'quotaRule', 'quotaDay', 'holiday',
  'partCategory', 'part', 'serviceCatalogItem', 'formTemplate',
  'appConfig', 'featureFlag', 'notificationTemplate', 'approvalPolicy',
  'inspectionFeePolicy',
  'customer', 'customerSite', 'customerContact', 'customerIdentity',
  'asset', 'contract', 'contractSite', 'contractIncludedService',
  'technician', 'skill', 'technicianSkill', 'crew', 'crewMember',
  'technicianShift',
  'employee', 'employeeWageChange', 'employeeAccessLog',
  'timeClockEntry', 'overtimeRequest', 'leaveRequest',
  'payrollPeriod', 'payrollLine',
  'job', 'jobAsset', 'jobAssignment', 'jobStatusEvent', 'jobNote',
  'jobCharge', 'jobPart', 'jobReport',
  'quotation', 'quotationLine', 'workOrder', 'attachment',
  'notificationLog', 'auditLog',
];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

function client() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

async function verify(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  const counts = Object.entries(parsed.data ?? {});
  const total = counts.reduce((sum, [, rows]) => sum + rows.length, 0);

  console.log(`อ่านไฟล์สำรองได้: ${path}`);
  console.log(`  taken at : ${parsed.takenAt}`);
  console.log(`  tables   : ${counts.length}`);
  console.log(`  rows     : ${total}`);

  // The point of a verify step is that "the file exists" is not the same as
  // "the file has anything in it". A zero-row backup is the failure this
  // catches, and it fails loudly rather than reporting success.
  if (total === 0) {
    console.error('ไฟล์สำรองว่างเปล่า — ถือว่าไม่สำเร็จ');
    process.exit(1);
  }
  const empty = counts.filter(([, rows]) => rows.length === 0).map(([t]) => t);
  if (empty.length) console.log(`  ตารางที่ว่าง: ${empty.join(', ')}`);
}

async function main() {
  const verifyPath = arg('--verify');
  if (verifyPath) return verify(verifyPath);

  const prisma = client();
  const takenAt = new Date();
  const stamp = takenAt.toISOString().replace(/[:.]/g, '-');
  const out = arg('--out') ?? join('backups', `${stamp}.json`);

  const data = {};
  const skipped = [];
  let total = 0;

  for (const table of TABLES) {
    const model = prisma[table];
    if (!model?.findMany) {
      // A renamed model must not silently vanish from every future backup.
      skipped.push(table);
      continue;
    }
    const rows = await model.findMany();
    data[table] = rows;
    total += rows.length;
    process.stdout.write(`${table} ${rows.length}  `);
  }
  console.log('');

  await mkdir(dirname(out), { recursive: true });
  await writeFile(
    out,
    // BigInt and Decimal do not survive JSON.stringify on their own; both
    // appear in money and counter columns, so this is not optional.
    JSON.stringify(
      { takenAt: takenAt.toISOString(), tables: Object.keys(data).length, data },
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      0,
    ),
    'utf8',
  );

  if (skipped.length) {
    console.error(`⚠️  ข้ามตารางที่หาไม่เจอ (ชื่อโมเดลเปลี่ยน?): ${skipped.join(', ')}`);
  }
  console.log(`\nสำรองเสร็จ: ${out}  (${total} แถว)`);

  // Recorded in the database so /api/health can tell an operator that the
  // last backup is a week old — a backup nobody notices has stopped is the
  // same as no backup at all.
  await prisma.appConfig.upsert({
    where: { key: 'ops.backup.lastRunAt' },
    create: {
      key: 'ops.backup.lastRunAt',
      value: takenAt.toISOString(),
      description: 'เวลาที่สำรองข้อมูลสำเร็จครั้งล่าสุด — เขียนโดย scripts/backup.mjs',
      isAssumption: false,
    },
    update: { value: takenAt.toISOString() },
  });

  await verify(out);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('สำรองข้อมูลไม่สำเร็จ:', e);
  process.exit(1);
});
