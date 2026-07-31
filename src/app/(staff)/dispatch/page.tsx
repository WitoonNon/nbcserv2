import Link from 'next/link';
import { getBoard } from '@/modules/dispatch/dispatch.service';
import { DispatchBoard } from '@/components/dispatch/DispatchBoard';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

function shiftDay(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const iso = sp.date ?? new Date().toISOString().slice(0, 10);
  const date = new Date(`${iso}T00:00:00Z`);

  let board = null;
  try {
    board = await getBoard(date);
  } catch {
    board = null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">จ่ายงาน</h1>
          <p className="text-sm text-[var(--color-muted)]">{formatThaiDate(date, 'long')}</p>
        </div>
        <form method="get" className="flex items-center gap-1.5">
          <Link href={`/dispatch?date=${shiftDay(iso, -1)}`}
            className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white">
            ←
          </Link>
          <input type="date" name="date" defaultValue={iso}
            className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white" />
          <button className="bg-[var(--color-brand-blue-600)] text-white rounded-[3px] px-3 py-1.5 text-sm">
            ไป
          </button>
          <Link href={`/dispatch?date=${shiftDay(iso, 1)}`}
            className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white">
            →
          </Link>
        </form>
      </div>

      {board === null ? (
        <div className="card p-5 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40">
          <p className="text-sm">
            ยังเชื่อมต่อฐานข้อมูลไม่ได้ — กระดานจ่ายงานจะแสดงคิวงานและทีมช่างทันทีเมื่อตั้งค่า
            DATABASE_URL แล้วรัน migrate + seed
          </p>
        </div>
      ) : (
        <DispatchBoard unassigned={board.unassigned} crews={board.crews} />
      )}
    </div>
  );
}
