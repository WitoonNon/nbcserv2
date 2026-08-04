import path from 'node:path';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // optional
}

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  test: {
    environment: 'node',
    // Concurrency tests hit real Postgres and must not run against each other.
    fileParallelism: false,
    testTimeout: 30_000,
    // Setup and teardown open their own connections to a hosted database in
    // another region. The 10s default is a network-latency tripwire, not a
    // signal that anything is wrong, so it matches testTimeout.
    hookTimeout: 30_000,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
