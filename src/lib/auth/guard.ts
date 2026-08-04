import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from './session';

/**
 * Authorisation guards.
 *
 * These run on the server and are the real gate. Hiding a button in the UI is
 * presentation; every server action and page that touches data calls one of
 * these, so a crafted request cannot bypass the navigation.
 */

export class ForbiddenError extends Error {
  constructor(readonly permission: string) {
    super(`ไม่มีสิทธิ์ใช้งานส่วนนี้ (${permission})`);
    this.name = 'ForbiddenError';
  }
}

/** Page guard: bounce to login, preserving where the user was heading. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login');
  }
  return user;
}

export async function requirePermission(permission: string, returnTo?: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!user.permissions.has(permission)) redirect('/forbidden');
  return user;
}

/**
 * Server-action guard. Throws instead of redirecting so the action can return
 * a friendly message rather than a confusing navigation mid-submit.
 */
export async function assertPermission(permission: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError('ยังไม่ได้เข้าสู่ระบบ');
  if (!user.permissions.has(permission)) throw new ForbiddenError(permission);
  return user;
}

export function can(user: SessionUser | null, permission: string): boolean {
  return Boolean(user?.permissions.has(permission));
}

export function hasRole(user: SessionUser | null, ...roles: string[]): boolean {
  return Boolean(user && roles.some((r) => user.roles.includes(r)));
}

/** Where a user should land after login, based on what they actually do. */
export function homeFor(user: SessionUser): string {
  if (hasRole(user, 'TECHNICIAN') && !hasRole(user, 'SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'SUPERVISOR')) {
    return '/t/today';
  }
  if (hasRole(user, 'CUSTOMER')) return '/track';
  return '/dashboard';
}
