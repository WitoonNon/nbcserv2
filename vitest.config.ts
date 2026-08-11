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
    env: { STORAGE_DRIVER: 'local' },
    // Concurrency tests hit real Postgres and must not run against each other.
    fileParallelism: false,
    testTimeout: 30_000,
    // Setup and teardown open their own connections to a hosted database in
    // another region. The 10s default is a network-latency tripwire, not a
    // signal that anything is wrong, so it matches testTimeout.
    hookTimeout: 30_000,
    // .tsx files are component tests. They opt into jsdom with a
    // `@vitest-environment jsdom` docblock rather than switching the default,
    // because every other test talks to Postgres and gains nothing from a DOM.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts'],
  },
});
