import path from 'node:path';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // optional
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      // Next resolves this marker to an empty module through the `react-server`
      // export condition; outside Next it resolves to one that throws on
      // import. See the stub for why that is a bundler concern, not ours.
      'server-only': path.resolve(process.cwd(), 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    // Tests write real files. Once a developer points their .env at Supabase
    // to try the real thing, every run would otherwise pour throwaway
    // attachments into the live bucket — so the suite pins itself to the
    // local driver. storage.supabase.test.ts sets its own env and is
    // unaffected.
    //
    // The same reasoning applies to notifications, and the failure is worse.
    // Switching NOTIFY_DRIVER to `line` for manual testing made the suite push
    // to the real LINE account — against userIds invented inside the tests, on
    // a plan with 300 messages a month. It also turned every notifying test
    // into a network round trip, which starved the connection pool and timed
    // out unrelated tests in other files.
    env: { STORAGE_DRIVER: 'local', NOTIFY_DRIVER: 'console' },
    // Concurrency tests hit real Postgres and must not run against each other.
    fileParallelism: false,
    testTimeout: 30_000,
    // Setup and teardown open their own connections to a hosted database in
    // another region. The 10s default is a network-latency tripwire, not a
    // signal that anything is wrong.
    //
    // Longer than testTimeout on purpose. A `beforeAll` may seed a whole
    // fixture — scheduling.pm.test.ts materialises ninety days of quota
    // buckets — which is one slow write loop against Singapore, not a hung
    // test. At 30s that file failed its hook and its thirteen tests were
    // reported as skipped, so the PM planner had no passing coverage at all
    // while the suite still looked mostly green. A hook timeout that fires on
    // latency does not protect anything; it just hides a file.
    hookTimeout: 180_000,
    // .tsx files are component tests. They opt into jsdom with a
    // `@vitest-environment jsdom` docblock rather than switching the default,
    // because every other test talks to Postgres and gains nothing from a DOM.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts'],
  },
});
