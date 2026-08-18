import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The brand mark, 2000x1185 with transparency — supplied by the client on
 * 19 ส.ค. 2569, replacing the 439x260 export scraped from their website.
 *
 * Width is derived from the height rather than passed separately so the
 * proportions cannot drift: the previous callers hardcoded pairs like 150x84,
 * which is 1.79:1 against the artwork's 1.69:1, and quietly stretched the logo
 * sideways everywhere it appeared.
 */
/** 2000 / 1185, the artwork's own aspect ratio. */
export const LOGO_RATIO = 1.6878;
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
        width={Math.round(height * LOGO_RATIO)}
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
