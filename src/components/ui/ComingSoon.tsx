import Link from 'next/link';

/**
 * Phase-0 placeholder. Routed and branded so the client can click through the
 * whole navigation, with the scope of each screen stated rather than implied.
 */
export function ComingSoon({
  title,
  phase,
  bullets,
  note,
}: {
  title: string;
  phase: string;
  bullets: string[];
  /**
   * What is actually true about this screen's progress.
   *
   * The default claims the database is already built, which was accurate for
   * the screens this component was written for and is a lie for one where no
   * table exists yet. A client reads this line and plans around it, so it has
   * to be per-screen rather than a constant.
   */
  note?: React.ReactNode;
}) {
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl">{title}</h1>
        <span className="assumption-badge">ยังไม่พัฒนา · {phase}</span>
      </div>

      <div className="card p-5">
        <p className="text-sm text-[var(--color-muted)] mb-3">หน้านี้จะประกอบด้วย</p>
        <ul className="space-y-2">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2.5 text-sm">
              <span className="text-[var(--color-brand-orange)] shrink-0">▸</span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        {note ?? (
          <>
            โครงสร้างฐานข้อมูลของหน้านี้สร้างเสร็จแล้ว เหลือเฉพาะส่วนหน้าจอ ·{' '}
            <Link href="/work-orders" className="text-[var(--color-brand-blue-600)]">
              ดูฟอร์มใบงานที่ทำเสร็จแล้ว
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
