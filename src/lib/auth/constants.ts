/**
 * Dependency-free auth constants.
 *
 * middleware.ts runs on the Edge runtime, which has no node:crypto and no
 * database driver. It must not pull in session.ts, so anything both sides
 * need lives here.
 */
export const SESSION_COOKIE = 'nbc_session';
export const SESSION_DAYS = 7;
