import Link from 'next/link';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function load() {
  try {
    const [users, roles] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        include: {
          roles: { include: { role: true } },
          technician: { include: { skills: { include: { skill: true } } } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.role.findMany({
        include: { permissions: true, _count: { select: { users: true } } },
        orderBy: { code: 'asc' },
      }),
    ]);
    return { users, roles };
  } catch {
    return null;
  }
}

export default async function UsersPage() {
  const data = await load();

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <Link href="/settings" className="text-sm text-[var(--color-brand-blue-600)]">← ตั้งค่าระบบ</Link>
        <h1 className="text-2xl">ผู้ใช้งานและสิทธิ์</h1>
      </div>

      {!data ? (
        <div className="card p-5 bg-[var(--color-brand-orange-50)] text-sm">ยังเชื่อมต่อฐานข้อมูลไม่ได้</div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[var(--color-line)]">
              <h2 className="text-base">บัญชีผู้ใช้ ({data.users.length})</h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)] bg-[var(--color-surface-alt)]">
                    <th className="px-4 py-2 font-normal">ชื่อ</th>
                    <th className="px-4 py-2 font-normal">อีเมล</th>
                    <th className="px-4 py-2 font-normal">บทบาท</th>
                    <th className="px-4 py-2 font-normal">รหัสพนักงาน</th>
                    <th className="px-4 py-2 font-normal">การรับรอง</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-b border-[var(--color-line)] last:border-0">
                      <td className="px-4 py-2">{u.name}</td>
                      <td className="px-4 py-2 text-xs text-[var(--color-muted)]">{u.email ?? '—'}</td>
                      <td className="px-4 py-2">
                        {u.roles.map((r) => (
                          <span key={r.roleId}
                            className="text-[11px] bg-[var(--color-brand-sky-50)] text-[var(--color-brand-blue-600)] rounded-full px-2 py-0.5 mr-1">
                            {r.role.nameTh}
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{u.technician?.employeeCode ?? '—'}</td>
                      <td className="px-4 py-2">
                        {u.technician?.skills.map((s) => (
                          <span key={s.skillId} className="text-[10px] border border-[var(--color-line)] rounded-full px-1.5 py-0.5 mr-1">
                            {s.skill.code}
                          </span>
                        )) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[var(--color-line)]">
              <h2 className="text-base">บทบาทและสิทธิ์</h2>
              <p className="text-[11px] text-[var(--color-muted)]">
                สิทธิ์ถูกตรวจที่ชั้น service ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ
              </p>
            </header>
            <ul className="divide-y divide-[var(--color-line)]">
              {data.roles.map((r) => (
                <li key={r.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="text-sm">
                      {r.nameTh}
                      <span className="text-[11px] text-[var(--color-muted)] ml-2 font-mono">{r.code}</span>
                    </span>
                    <span className="text-[11px] text-[var(--color-muted)]">
                      {r._count.users} คน · {r.permissions.length} สิทธิ์
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
