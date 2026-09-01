import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/guard';
import { NavIcon } from '@/components/ui/NavIcon';

export const dynamic = 'force-dynamic';

export default async function ForbiddenPage() {
  const user = await getSessionUser();

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card p-8 max-w-md text-center">
        <NavIcon name="locked" className="mx-auto size-12 text-[var(--color-muted)] mb-3" />
        <h1 className="text-xl">ไม่มีสิทธิ์เข้าถึงส่วนนี้</h1>
        <p className="text-sm text-[var(--color-muted)] mt-2">
          บัญชีของคุณไม่มีสิทธิ์ใช้งานหน้านี้ หากคิดว่าเป็นความผิดพลาด
          กรุณาติดต่อผู้ดูแลระบบ
        </p>
        {user && (
          <p className="text-xs text-[var(--color-muted)] mt-3">
            เข้าสู่ระบบเป็น {user.name} ({user.roles.join(', ') || 'ไม่มีบทบาท'})
          </p>
        )}
        <Link
          href={user ? homeFor(user) : '/login'}
          className="inline-block mt-5 bg-[var(--color-brand-orange)] text-white rounded-[3px] px-5 py-2 text-sm font-semibold"
        >
          กลับหน้าหลัก
        </Link>
      </div>
    </div>
  );
}
