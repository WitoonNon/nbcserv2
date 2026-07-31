import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * @client-confirm A7 — this is the low-resolution PNG lifted from the public
 * website. Replace with the vector original (.ai / .eps / .svg) before any
 * printed output goes to a customer.
 */
export function Logo({
  className,
  height = 32,
  showWordmark = true,
}: {
  className?: string;
  height?: number;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image
        src="/brand/nbc-logo.png"
        alt="NBC Group"
        width={Math.round(height * 1.78)}
        height={height}
        priority
        className="object-contain"
      />
      {showWordmark && (
        <span className="hidden sm:flex flex-col leading-tight">
          <span className="font-[family-name:var(--font-heading)] text-[13px] text-white/95">
            ระบบบริหารงานซ่อมและบริการ
          </span>
          <span className="text-[10px] text-white/55 tracking-wide">
            Service Management
          </span>
        </span>
      )}
    </span>
  );
}
