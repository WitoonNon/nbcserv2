import { env } from '@/lib/env';

/**
 * The parts of the LINE link flow that carry no secret.
 *
 * Separate from line-login.ts because that module is `server-only`, and
 * `server-only` resolves only inside a Next build — so anything importing it
 * cannot be reached from a plain Node script. The pre-deploy check needs the
 * callback URL, and a check that derives the value a second way could pass
 * while the real one differs, which is worse than no check.
 */

/**
 * Where LINE sends the customer back.
 *
 * LINE compares this against the console entry as an exact string. A different
 * host, a stray trailing slash, or an APP_URL nobody updated after moving
 * domain all fail identically: the customer taps the button, lands on an error
 * page, and nothing in our logs says why.
 */
export function callbackUrl(): string {
  return `${env().APP_URL.replace(/\/+$/, '')}/api/line/callback`;
}

/**
 * The cookie that says "this browser just booked this job".
 *
 * Its own module because the booking action sets it, the link route reads it,
 * and the callback clears it — three files that must agree on one string, and
 * a name typed three times is a name that will eventually be typed twice.
 */
export const LINK_JOB_COOKIE = 'nbc_line_link_job';

/** Long enough to read the confirmation and decide, short enough to expire. */
export const LINK_JOB_COOKIE_MAX_AGE = 30 * 60;
