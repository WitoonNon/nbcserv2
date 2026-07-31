import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

/**
 * Customer portal shell.
 *
 * Visually continuous with nbcgroup.co.th so a customer following a CTA from
 * the marketing site never feels handed off to a third-party tool.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="brand-gradient text-white">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <Logo height={30} showWordmark={false} />
          </Link>
          <nav className="flex items-center gap-4 text-[13px]">
            <Link href="/booking" className="hover:text-white/80">
              จองคิว
            </Link>
            <Link href="/track" className="hover:text-white/80">
              ติดตามงาน
            </Link>
            <a
              href="tel:0970944419"
              className="bg-[var(--color-brand-orange)] rounded-[var(--radius-brand)] px-3 py-1.5 font-semibold"
            >
              โทร 097-094-4419
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6">{children}</main>

      <footer className="bg-[var(--color-brand-navy)] text-white/70 text-xs">
        <div className="mx-auto max-w-5xl px-4 py-6 space-y-1">
          <p className="text-white font-semibold">บริษัท เอ็นบีซี กรุ๊ป จำกัด</p>
          <p>105/26 หมู่ 2 ตำบลละหาร อำเภอบางบัวทอง จังหวัดนนทบุรี 11110</p>
          <p>เลขประจำตัวผู้เสียภาษี 0125561013342</p>
          <p>
            Call Center 02-000-7332 ต่อ 1-3 · 096-648-8886 · Hotline 097-094-4419 ·
            LINE @nbcservice · nbcservice@nbcgroup.co.th
          </p>
          <p className="pt-2">
            <a href="https://nbcgroup.co.th" className="underline hover:text-white">
              กลับสู่เว็บไซต์หลัก nbcgroup.co.th
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
