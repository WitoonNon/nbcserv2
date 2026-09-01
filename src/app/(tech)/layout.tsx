import Link from 'next/link';
import { requireUser } from '@/lib/auth/guard';
import { redirect } from 'next/navigation';
import { NavIcon, type NavIconName } from '@/components/ui/NavIcon';

/**
 * Technician PWA shell — mobile-first, offline-first.
 *
 * NBC's work happens in factory plant rooms, hotel basements, mall service
 * corridors and on rooftops, where mobile signal is unreliable. The layout is
 * deliberately simple, high-contrast and large-target: technicians use it
 * one-handed, often wearing gloves, sometimes in direct sun.
 *
 * The tab bar previously listed /t/history and /t/profile, neither of which
 * existed — both were a 404 for anybody who pressed them, which QA found in
 * minutes and a technician would have found on their first shift. It also had
 * no way to reach the requests screen, so overtime and leave could only be
 * filed by somebody who already knew the URL, and no way to sign out at all.
 *
 * Four tabs is the ceiling at this width; each one is something a technician
 * does rather than a section of the application.
 */

const TABS: { href: string; label: string; icon: NavIconName }[] = [
  { href: '/t/today', label: 'งานวันนี้', icon: 'jobs' },
  { href: '/clock', label: 'ลงเวลา', icon: 'clock' },
  { href: '/requests', label: 'คำขอ', icon: 'requests' },
  { href: '/t/me', label: 'ฉัน', icon: 'me' },
];

export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/t/today');

  // Office staff opening a technician URL by mistake get sent somewhere useful
  // rather than an empty queue that looks broken.
  if (!user.technicianId && !user.permissions.has('workorder.submit')) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="brand-gradient text-white sticky top-0 z-20">
        <div className="px-4 h-12 flex items-center justify-between gap-2">
          <span className="font-[family-name:var(--font-heading)] text-sm truncate">
            {user.name}
          </span>
          {/* Replaced by a live connectivity indicator once the sync queue lands. */}
          <span className="text-[11px] bg-white/20 rounded-full px-2 py-0.5 shrink-0">ออนไลน์</span>
        </div>
      </header>

      <main className="flex-1 pb-20">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-[var(--color-line)] z-20">
        <ul className="grid grid-cols-4">
          {TABS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="flex flex-col items-center justify-center gap-1 min-h-[58px] text-[11px] text-[var(--color-ink)] active:bg-[var(--color-brand-sky-50)]"
              >
                <NavIcon name={t.icon} className="size-[22px]" />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
