/**
 * Stand-in for Next's `server-only` marker.
 *
 * The real package exports a module that throws on import, and only Next's
 * bundler swaps it for an empty one via the `react-server` export condition.
 * Vitest resolves the throwing branch, so a server module that correctly marks
 * itself as server-only could not be unit-tested at all.
 *
 * Importing this file asserts nothing — the marker's job is to fail a CLIENT
 * bundle at build time, which is Next's business, not a test runner's.
 */
export {};
