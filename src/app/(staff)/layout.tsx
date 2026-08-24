import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { UserMenu } from '@/components/auth/UserMenu';
import { NavIcon, type NavIconName } from '@/components/ui/NavIcon';
import { requireUser } from '@/lib/auth/guard';

/**
 * Staff console shell — admin, dispatcher and supervisor. Desktop-first:
 * this is used at a desk with a dispatch board open all day.
 *
 * The nav is filtered by permission, so a dispatcher never sees a Settings
 * link they cannot open. Each page still enforces its own permission — this
 * only keeps the navigation honest.
 */

const NAV: { href: string; label: string; en: string; perm: string; icon: NavIconName }[] = [
  { href: '/dashboard', label: 'ภาพรวม', en: 'Dashboard', perm: 'job.read', icon: 'dashboard' },
  { href: '/jobs', label: 'งานทั้งหมด', en: 'Jobs', perm: 'job.read', icon: 'jobs' },
  { href: '/dispatch', label: 'จ่ายงาน', en: 'Dispatch', perm: 'dispatch.read', icon: 'dispatch' },
  { href: '/schedule', label: 'ตารางงาน', en: 'Schedule', perm: 'quota.read', icon: 'schedule' },
  { href: '/customers', label: 'ลูกค้า', en: 'Customers', perm: 'customer.read', icon: 'customers' },
  { href: '/assets', label: 'ทะเบียนเครื่อง', en: 'Assets', perm: 'customer.read', icon: 'assets' },
  { href: '/work-orders', label: 'ใบงาน', en: 'Work orders', perm: 'workorder.read', icon: 'workOrders' },
  { href: '/timesheet', label: 'ลงเวลางาน', en: 'Timesheet', perm: 'admin.config', icon: 'timesheet' },
  { href: '/payroll', label: 'เงินเดือน', en: 'Payroll', perm: 'admin.config', icon: 'payroll' },
  { href: '/reports', label: 'รายงาน', en: 'Reports', perm: 'report.read', icon: 'reports' },
  { href: '/settings', label: 'ตั้งค่า', en: 'Settings', perm: 'admin.config', icon: 'settings' },
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = NAV.filter((n) => user.permissions.has(n.perm));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="brand-gradient text-white shadow-sm">
        <div className="px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center">
            <Logo height={30} />
          </Link>
          <UserMenu name={user.name} roles={user.roles} />
        </div>
      </header>

      <div className="flex flex-1 w-full">
        <nav className="hidden lg:block w-52 shrink-0 border-r border-[var(--color-line)] bg-white">
          <ul className="py-3">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-ink)] hover:bg-[var(--color-brand-sky-50)] hover:text-[var(--color-brand-blue-600)] border-l-2 border-transparent hover:border-[var(--color-brand-orange)] transition-colors"
                >
                  {/* Same weight as the label it belongs to — the icons are
                      drawn to be read, not to sit behind the text. Colour is
                      inherited, so hover moves both together. */}
                  <NavIcon
                    name={item.icon}
                    className="size-[19px] shrink-0 group-hover:text-[var(--color-brand-orange)] transition-colors"
                  />
                  <span className="min-w-0">
                    {item.label}
                    <span className="block text-[10px] text-[var(--color-muted)]">{item.en}</span>
                  </span>
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
