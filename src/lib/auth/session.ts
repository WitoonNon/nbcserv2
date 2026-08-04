import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE, SESSION_DAYS } from './constants';

/**
 * Session handling.
 *
 * Sessions live in the database (the Session model) rather than in a signed
 * cookie, so an account can be revoked instantly — important when a technician
 * leaves and their phone is still logged in. The cookie carries only a random
 * token; the database stores its SHA-256, so a leaked database backup cannot be
 * replayed as a live session.
 */

export { SESSION_COOKIE } from './constants';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
  permissions: Set<string>;
  technicianId: string | null;
}

export async function createSession(userId: string, meta?: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await prisma.session.create({
    data: {
      userId,
      token: hashToken(token),
      expiresAt,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Current user, or null. `cache` dedupes this within a single request so a
 * page that checks permissions in several places still issues one query.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token: hashToken(token) },
    include: {
      user: {
        include: {
          technician: { select: { id: true } },
          roles: {
            include: {
              role: { include: { permissions: { include: { permission: true } } } },
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;

  const permissions = new Set<string>();
  for (const ur of session.user.roles) {
    for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    roles: session.user.roles.map((r) => r.role.code),
    permissions,
    technicianId: session.user.technician?.id ?? null,
  };
});

/** Delete expired rows. Called by the login flow so the table self-maintains. */
export async function sweepExpiredSessions(): Promise<number> {
  const res = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}
