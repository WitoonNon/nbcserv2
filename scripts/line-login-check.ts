#!/usr/bin/env node
/**
 * Ask LINE whether it accepts our authorize request — before a human tries.
 *
 *   npx tsx scripts/line-login-check.ts
 *
 * A redirect_uri that is not registered, or registered with one character
 * different, fails at LINE's end with a page the customer sees and nothing in
 * our own logs. This makes that failure visible from a terminal instead.
 *
 * Nothing here signs anybody in or consumes quota; it stops at LINE's own
 * consent screen, which is as far as a machine can go.
 */
import path from 'node:path';

process.loadEnvFile(path.join(process.cwd(), '.env'));

import { authorizeUrl, callbackUrl } from '../src/lib/notify/line-link.js';

async function main() {
  // The state's contents are irrelevant to whether LINE accepts the request —
  // it only reads client_id and redirect_uri at this stage — so the probe
  // passes a placeholder rather than importing the signer, which lives behind
  // `server-only` because it holds the channel secret.
  const url = authorizeUrl('probe-state');

  console.log('callback url :', callbackUrl());
  console.log('authorize    :', url.slice(0, 120) + '…');

  // Do not follow: a 302 to LINE's own login page is success. What matters is
  // that the request is not rejected outright.
  const res = await fetch(url, { redirect: 'manual' });
  const body = res.status < 400 ? '' : (await res.text()).slice(0, 400);

  console.log('');
  console.log('status       :', res.status);
  if (res.status >= 300 && res.status < 400) {
    console.log('redirects to :', (res.headers.get('location') ?? '').slice(0, 120));
  }

  if (res.status >= 400) {
    console.log('LINE says    :', body.replace(/\s+/g, ' ').slice(0, 300));
    console.log('');
    console.log('→ ตรวจ Callback URL ในคอนโซลว่าตรงกับด้านบนทุกตัวอักษร');
    process.exitCode = 1;
  } else {
    console.log('');
    console.log('→ LINE ยอมรับ client_id และ redirect_uri แล้ว พร้อมให้คนกดจริง');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
