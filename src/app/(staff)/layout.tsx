import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

/**
 * Staff console shell — admin, dispatcher and supervisor. Desktop-first:
 * this is used at a desk with a dispatch board open all day.
 */

const NAV = [
  { href: '/dashboard', label: 'ภาพรวม', en: 'Dashboard' },
  { href: '/jobs', label: 'งานทั้งหมด', en: 'Jobs' },
  { href: '/dispatch', label: 'จ่ายงาน', en: 'Dispatch' },
  { href: '/schedule', label: 'ตารางงาน', en: 'Schedule' },
  { href: '/customers', label: 'ลูกค้า', en: 'Customers' },
  { href: '/assets', label: 'ทะเบียนเครื่อง', en: 'Assets' },
  { href: '/work-orders', label: 'ใบงาน', en: 'Work orders' },
  { href: '/reports', label: 'รายงาน', en: 'Reports' },
  { href: '/settings', label: 'ตั้งค่า', en: 'Settings' },
];

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="brand-gradient text-white shadow-sm">
        <div className="px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center">
            <Logo height={30} />
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <span className="hidden md:inline text-white/70">ผู้ดูแลระบบ</span>
            <span className="size-8 rounded-full bg-white/20 grid place-items-center text-[11px] font-semibold">
              NB
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 w-full">
        <nav className="hidden lg:block w-52 shrink-0 border-r border-[var(--color-line)] bg-white">
          <ul className="py-3">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block px-4 py-2.5 text-sm text-[var(--color-ink)] hover:bg-[var(--color-brand-sky-50)] hover:text-[var(--color-brand-blue-600)] border-l-2 border-transparent hover:border-[var(--color-brand-orange)] transition-colors"
                >
                  {item.label}
                  <span className="block text-[10px] text-[var(--color-muted)]">{item.en}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 min-w-0 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
