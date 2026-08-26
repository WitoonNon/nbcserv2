import { prisma } from './client.js';
import { seedPlatform } from './01-platform.js';
import { seedRbac } from './02-rbac.js';
import { seedCatalog } from './03-catalog.js';
import { seedScheduling } from './04-scheduling.js';
import { seedBilling } from './05-billing.js';
import { seedForms } from './06-forms.js';
import { seedDemo } from './07-demo.js';
import { seedEmployees } from './08-employees.js';

/**
 * Seed order matters: platform config and RBAC first, then reference data,
 * then demo operational data that depends on it.
 *
 * Everything is idempotent (upsert) so `npm run db:seed` can be re-run safely.
 */
async function main() {
  console.log('\nSeeding NBC Group service management database\n');

  await seedPlatform();
  await seedRbac();
  await seedCatalog();
  await seedScheduling();
  await seedBilling();
  await seedForms();
  await seedDemo();
  // After demo: staff records are built from the users and technicians that
  // the steps above created.
  await seedEmployees();

  // Materialise quota buckets so the booking calendar has something to render.
  const { materialiseQuota } = await import('../../src/modules/scheduling/quota.service.js');
  const from = new Date();
  const to = new Date(Date.now() + 90 * 86_400_000);
  const buckets = await materialiseQuota(from, to);
  console.log(`  quota: materialised ${buckets} daily buckets for the next 90 days`);

  const assumptions = await prisma.appConfig.count({ where: { isAssumption: true } });
  console.log(`\nDone. ${assumptions} config values are placeholders awaiting client confirmation.`);
  console.log('Run `npm run client-confirm` for the full list.\n');
}

main()
  .catch((e) => {
    console.error('\nSeed failed:\n', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
