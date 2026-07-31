import Link from 'next/link';

/**
 * Technician PWA shell — mobile-first, offline-first.
 *
 * NBC's work happens in factory plant rooms, hotel basements, mall service
 * corridors and on rooftops, where mobile signal is unreliable. The layout is
 * deliberately simple, high-contrast and large-target: technicians use it
 * one-handed, often wearing gloves, sometimes in direct sun.
 */

const TABS = [
  { href: '/t/today', label: 'งานวันนี้', icon: '📋' },
  { href: '/t/history', label: 'ประวัติ', icon: '🕘' },
  { href: '/t/profile', label: 'โปรไฟล์', icon: '👤' },
];

export default function TechLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="brand-gradient text-white sticky top-0 z-20">
        <div className="px-4 h-12 flex items-center justify-between">
          <span className="font-[family-name:var(--font-heading)] text-sm">NBC ช่าง</span>
          {/* Replaced by a live connectivity indicator once the sync queue lands. */}
          <span className="text-[11px] bg-white/20 rounded-full px-2 py-0.5">ออนไลน์</span>
        </div>
      </header>

      <main className="flex-1 pb-20">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-[var(--color-line)] z-20">
        <ul className="grid grid-cols-3">
          {TABS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] text-[var(--color-ink)] active:bg-[var(--color-brand-sky-50)]"
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
