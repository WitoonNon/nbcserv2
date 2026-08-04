'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, destroySession, sweepExpiredSessions } from '@/lib/auth/session';
import { getSessionUser } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/guard';

export interface LoginState {
  error?: string;
}

/** Simple in-process throttle. Real deployments should back this with Redis. */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;

function throttled(key: string): boolean {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '');

  if (!email || !password) return { error: 'กรุณากรอกอีเมลและรหัสผ่าน' };
  if (throttled(email)) {
    return { error: 'พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอ 10 นาที' };
  }

  let destination: string;
  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Same message for unknown account and wrong password: telling them apart
    // lets an attacker enumerate which staff emails exist.
    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    }

    const h = await headers();
    await createSession(user.id, {
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: h.get('user-agent') ?? undefined,
    });
    attempts.delete(email);
    void sweepExpiredSessions().catch(() => {});

    const session = await getSessionUser();
    destination = next.startsWith('/') ? next : session ? homeFor(session) : '/dashboard';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/closed the connection|ECONNREFUSED|P1001/i.test(msg)) {
      return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
    }
    return { error: `เข้าสู่ระบบไม่สำเร็จ: ${msg}` };
  }

  // redirect() throws — keep it outside the try so it is not caught as an error.
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
