'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getSessionUser, SESSION_COOKIE } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/guard';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';

export interface ChangePasswordState {
  error?: string;
}

/** @client-confirm G8 — minimum length assumed 10 for staff accounts. */
const MIN_LENGTH = 10;

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const current = String(formData.get('currentPassword') ?? '');
  const next = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  const session = await getSessionUser();
  if (!session) redirect('/login');

  if (next.length < MIN_LENGTH) {
    return { error: `รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_LENGTH} ตัวอักษร` };
  }
  if (next !== confirm) return { error: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน' };

  let destination: string;
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });

    if (!verifyPassword(current, user.passwordHash)) {
      return { error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };
    }
    // Blocks the obvious way around the gate: "change" it to the same shared
    // password everyone already knows.
    if (verifyPassword(next, user.passwordHash)) {
      return { error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม' };
    }

    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    const currentTokenHash = token ? createHash('sha256').update(token).digest('hex') : null;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(next),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });

      // Changing a password must end every other session. If the old password
      // was shared or leaked — which is exactly why this screen exists — those
      // sessions are the thing being revoked.
      await tx.session.deleteMany({
        where: {
          userId: user.id,
          ...(currentTokenHash ? { NOT: { token: currentTokenHash } } : {}),
        },
      });
    });

    destination = homeFor(session);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/closed the connection|ECONNREFUSED|P1001/i.test(msg)) {
      return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
    }
    return { error: `เปลี่ยนรหัสผ่านไม่สำเร็จ: ${msg}` };
  }

  redirect(destination);
}
