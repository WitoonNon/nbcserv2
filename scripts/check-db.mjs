#!/usr/bin/env node
/**
 * Connection preflight.
 *
 * Verifies the database is reachable and, crucially, that the connection
 * supports what this system depends on:
 *
 *   1. transactions with row-level locking (SELECT ... FOR UPDATE) — the quota
 *      engine is built on it, and Supabase's *transaction* pooler silently
 *      breaks it. Better to fail here than to discover it via a double-booking.
 *   2. advisory/DDL permission — migrations need to create types and tables.
 *
 * Never prints the password.
 */
import path from 'node:path';
import pg from 'pg';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  /* env may come from the shell */
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set — edit .env first.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error('DATABASE_URL is not a valid URL.');
  process.exit(1);
}

console.log(`host     : ${parsed.hostname}`);
console.log(`port     : ${parsed.port || 5432}`);
console.log(`database : ${parsed.pathname.slice(1)}`);
console.log(`user     : ${parsed.username}`);

if (parsed.port === '6543') {
  console.error("\n✗ Port 6543 is Supabase's TRANSACTION pooler.");
  console.error('  Migrations and SELECT ... FOR UPDATE will not work. Use the');
  console.error('  Session pooler (port 5432) or the direct connection instead.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: /supabase|neon|render|amazonaws/.test(parsed.hostname) ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15_000,
});

try {
  const t0 = Date.now();
  await client.connect();
  const latency = Date.now() - t0;

  const { rows: v } = await client.query('SELECT version() AS v, current_database() AS db');
  console.log(`\n✓ connected in ${latency} ms`);
  console.log(`  ${v[0].v.split(',')[0]}`);

  // Row-level locking must work — the quota engine depends on it.
  await client.query('BEGIN');
  await client.query('CREATE TEMP TABLE _preflight(id int primary key, n int) ON COMMIT DROP');
  await client.query('INSERT INTO _preflight VALUES (1, 0)');
  await client.query('SELECT * FROM _preflight WHERE id = 1 FOR UPDATE');
  await client.query('COMMIT');
  console.log('✓ transactions + SELECT ... FOR UPDATE work (quota engine requirement)');

  // DDL permission — migrations create tables, enums and constraints.
  await client.query('CREATE TABLE IF NOT EXISTS _preflight_ddl (id int)');
  await client.query('DROP TABLE _preflight_ddl');
  console.log('✓ DDL permitted (migrations can run)');

  const { rows: tables } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  console.log(`\npublic schema currently has ${tables[0].n} table(s)`);
  console.log(tables[0].n === 0 ? 'ready for: npx prisma migrate deploy' : 'note: schema is not empty');
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  if (/password|SASL|authentication/i.test(err.message)) {
    console.error('  Check the password in DATABASE_URL.');
  } else if (/ENOTFOUND|EAI_AGAIN/i.test(err.message)) {
    console.error('  Host not found — check the hostname, or try the Session pooler URI.');
  } else if (/ETIMEDOUT|ECONNREFUSED/i.test(err.message)) {
    console.error('  Cannot reach the host. If using Supabase Direct connection, it is');
    console.error('  IPv6-only — switch to the Session pooler URI (IPv4).');
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
