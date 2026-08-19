#!/usr/bin/env node
/**
 * Talk to the real LINE Messaging API and report what it says.
 *
 *   npx tsx scripts/line-check.ts
 *
 * Every call here is free and consumes no message quota, so it is safe to run
 * against the live account. It exists because the credentials we were handed
 * looked right and were not: a long-lived access token of exactly the correct
 * length and shape that returned 401 from every endpoint. Nothing short of
 * asking LINE would have told us.
 *
 * The last two checks push for real, on purpose — one recipient the adapter
 * must refuse without calling out at all, and one well-formed userId that does
 * not exist, which exercises auth, headers and error classification end to
 * end. Neither delivers a message, and the quota is read either side to prove
 * it.
 */
import path from 'node:path';

process.loadEnvFile(path.join(process.cwd(), '.env'));
process.env.NOTIFY_DRIVER = 'line';

import { lineAccessToken, botInfo, messageQuota } from '../src/lib/notify/line.js';
import { callbackUrl } from '../src/lib/notify/line-link.js';
import { notifier } from '../src/lib/notify/index.js';

const line = (label: string, value: unknown) =>
  console.log(`${label.padEnd(18)}${typeof value === 'string' ? value : JSON.stringify(value)}`);

async function main() {
  const first = await lineAccessToken();
  const second = await lineAccessToken();
  line('token', `${first.slice(0, 10)}… · reused on 2nd call: ${first === second}`);

  const info = await botInfo();
  line('bot', `${info.displayName} · ${info.basicId} · ${info.premiumId ?? '(no premium id)'}`);
  line('bot userId', info.userId);

  const before = await messageQuota();
  line('quota', before);

  const n = notifier();
  line('driver', n.name);

  // A phone number is not a LINE userId and never can be — no API converts one
  // into the other. The adapter must say so without spending a call.
  line('phone recipient', await n.send({ recipient: '0812345678', body: 'ทดสอบ' }));

  // Well-formed but nobody. Proves the push path works and that the failure is
  // classified as permanent rather than queued for retry forever.
  line(
    'unknown userId',
    await n.send({ recipient: `U${'0'.repeat(32)}`, body: 'ทดสอบระบบแจ้งเตือน' }),
  );

  const after = await messageQuota();
  line('quota after', `${JSON.stringify(after)} · consumed: ${after.used - before.used}`);

  // Printed so it can be compared by eye against the LINE console before a
  // deploy. LINE matches this string exactly — a different host, a stray
  // trailing slash, or an APP_URL nobody updated after moving domain all fail
  // the same way: the customer taps the button and lands on an error page,
  // and nothing in our own logs says why.
  console.log('');
  line('callback url', callbackUrl());
  line('', 'ต้องตรงกับที่ลงทะเบียนไว้ใน LINE console เป๊ะทุกตัวอักษร');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
