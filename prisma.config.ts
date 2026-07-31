import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer auto-loads .env. Node 24 can do it natively.
try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // .env is optional — CI and production supply real environment variables.
}

export default defineConfig({
  // Multi-file schema: one .prisma file per domain module.
  schema: path.join('prisma', 'schema'),
  migrations: {
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
