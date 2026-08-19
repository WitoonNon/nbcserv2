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
