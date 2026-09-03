/**
 * Dependency-free auth constants.
 *
 * middleware.ts runs on the Edge runtime, which has no node:crypto and no
 * database driver. It must not pull in session.ts, so anything both sides
 * need lives here.
 */
export const SESSION_COOKIE = 'nbc_session';
export const SESSION_DAYS = 7;

/**
 * Paths the edge gate lets through without a session cookie.
 *
 * The `/api` entries are NOT open — each authenticates itself and answers with
 * a status code. They are listed because redirecting an API call to a login
 * PAGE is worse than refusing it: the caller reads the page's 200 as success.
 * That is how a queued write from a technician's phone was being deleted
 * without ever reaching the server.
 *
 * Lives here rather than in middleware.ts so it can be asserted in a test —
 * middleware.ts runs on the Edge runtime and cannot be imported by one.
 */
export const PUBLIC_PREFIXES = [
  '/login',
  '/forbidden',
  '/booking',
  '/track',
  '/api/media',
  '/api/cron',
  '/api/field',
  // Customers linking their LINE account are not signed in — that is the
  // whole point of the flow.
  '/api/line',
  // An uptime monitor has no session and must not be given a credential to
  // store. What it can read is operational only — whether the database
  // answered, how many days of quota calendar remain — and never a name, a
  // job, or a count of anything a competitor would want.
  '/api/health',
] as const;

/** Endpoints replayed from the offline queue, which must be able to answer 401. */
export const OFFLINE_QUEUE_PREFIXES = ['/api/media', '/api/field'] as const;
