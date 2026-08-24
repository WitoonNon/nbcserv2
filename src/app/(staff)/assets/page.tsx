import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guard';
import {
  listAssets,
  countRepeatRepairs,
  repairConcern,
  ASSETS_PER_PAGE,
  type AssetRow,
} from '@/modules/assets/asset.service';
import { Pagination, pageParam } from '@/components/ui/Pagination';
import { AC_TYPE_LABEL } from '@/lib/labels';
import { formatThaiDate } from '@/lib/date/buddhist';
import type { AcType } from '@/generated/prisma';

export const dynamic = 'force-dynamic';

/**
 * The air-conditioner register.
 *
 * Sorted by whichever unit is next due for maintenance, because that is the
 * only ordering anyone acts on. A register sorted by tag number is a list you
 * read; sorted by what is overdue, it is a list you work from.
 */

interface Search {
  q?: string;
  acType?: string;
  pmDue?: string;
  page?: string;
}

const inputCls =
  'border border-[var(--color-line)] rounded-[3px] px-3 py-2 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

function PmCell({ due }: { due: string | null }) {
  if (!due) return <span className="text-[var(--color-muted)]">—</span>;

  const date = new Date(due);
  const overdue = date.getTime() < Date.now();
  return (
    <span className={overdue ? 'text-[var(--color-brand-orange-600)] font-semibold' : ''}>
      {formatThaiDate(date)}
      {overdue && <span className="block text-[10px]">เลยกำหนดแล้ว</span>}
    </span>
  );
}

function RepairCell({ count }: { count: number }) {
  const level = repairConcern(count);
  if (count === 0) return <span className="text-[var(--color-muted)]">—</span>;

  return (
    <span
      className={
        'inline-block rounded-[3px] px-2 py-0.5 text-[11px] ' +
        (level === 'high'
          ? 'bg-red-50 text-[#b42318] font-semibold'
          : level === 'watch'
            ? 'bg-[var(--color-brand-orange-50)] text-[var(--color-brand-orange-600)]'
            : 'text-[var(--color-muted)]')
      }
    >
      {count} ครั้ง
    </span>
  );
}

function Row({ a }: { a: AssetRow }) {
  return (
    <tr className="border-b border-[var(--color-line)] align-top">
      <td className="py-2.5 pr-3">
        <Link
          href={`/assets/${a.id}`}
          className="font-mono text-[13px] text-[var(--color-brand-blue-600)]"
        >
          {a.assetTag}
        </Link>
        <span className="block text-[11px] text-[var(--color-muted)]">
          {AC_TYPE_LABEL[a.acType]}
          {a.btu ? ` · ${a.btu.toLocaleString()} BTU` : ''}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        {a.brand ?? '—'}
        {a.model && <span className="block text-[11px] text-[var(--color-muted)]">{a.model}</span>}
      </td>
      <td className="py-2.5 pr-3">
        {a.customerName}
        <span className="block text-[11px] text-[var(--color-muted)]">
          {a.siteName}
          {a.locationInBuilding ? ` · ${a.locationInBuilding}` : ''}
        </span>
      </td>
      <td className="py-2.5 pr-3 whitespace-nowrap text-[13px]">
        <PmCell due={a.nextPmDueAt} />
      </td>
      <td className="py-2.5 pr-4">
        <RepairCell count={a.recentRepairs} />
      </td>
    </tr>
  );
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('customer.read', '/assets');
  const sp = await searchParams;

  const filter = {
    q: sp.q,
    acType: sp.acType ? (sp.acType as AcType) : undefined,
    pmDue: sp.pmDue === '1',
  };

  let rows: AssetRow[] = [];
  let total = 0;
  let page = 1;
  let needAttention = 0;
  let dbDown = false;
  try {
    // The banner counts the whole filtered register, so it is a separate query
    // from the page of rows rather than something derived from them.
    const [result, attention] = await Promise.all([
      listAssets({ ...filter, page: pageParam(sp.page) }),
      countRepeatRepairs(filter),
    ]);
    rows = result.rows;
    total = result.total;
    page = result.page;
    needAttention = attention;
  } catch {
    dbDown = true;
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl">ทะเบียนเครื่องปรับอากาศ</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          ประวัติผูกกับตัวเครื่อง ไม่ใช่แค่กับลูกค้า
          จึงตอบได้ว่าเครื่องตัวไหนซ่อมบ่อยจนควรพิจารณาเปลี่ยน
        </p>
      </div>

      <form method="get" className="card p-3 flex flex-wrap gap-2 items-end">
        <label className="block">
          <span className="block text-[12px] text-[var(--color-muted)] mb-1">ค้นหา</span>
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="รหัสเครื่อง · ซีเรียล · ยี่ห้อ · ตำแหน่ง"
            className={inputCls + ' w-64'}
          />
        </label>
        <label className="block">
          <span className="block text-[12px] text-[var(--color-muted)] mb-1">ประเภท</span>
          <select name="acType" defaultValue={sp.acType ?? ''} className={inputCls}>
            <option value="">ทั้งหมด</option>
            {Object.entries(AC_TYPE_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm h-[38px]">
          <input
            type="checkbox"
            name="pmDue"
            value="1"
            defaultChecked={sp.pmDue === '1'}
            className="size-4 accent-[var(--color-brand-orange)]"
          />
          เฉพาะที่ถึงกำหนดล้าง
        </label>
        <button className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-6 py-2 text-sm font-semibold h-[38px]">
          ค้นหา
        </button>
      </form>

      {dbDown && (
        <div className="card p-4 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          ยังเชื่อมต่อฐานข้อมูลไม่ได้
        </div>
      )}

      {needAttention > 0 && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          มี <b>{needAttention} เครื่อง</b> ที่ซ่อมตั้งแต่ 2 ครั้งขึ้นไปในรอบ 12 เดือน —
          ควรดูประวัติก่อนเสนอราคาซ่อมครั้งถัดไป
        </div>
      )}

      <div className="card overflow-hidden">
        {rows.length === 0 && !dbDown ? (
          <div className="p-6 text-sm">
            <p>ยังไม่มีเครื่องในทะเบียน</p>
            <p className="text-[13px] text-[var(--color-muted)] mt-1">
              เครื่องจะถูกเพิ่มเข้าทะเบียนตอนบันทึกงานให้หน้างาน
              หรือเพิ่มเองได้จากหน้าลูกค้า
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left text-[12px] text-[var(--color-muted)] border-b border-[var(--color-line)]">
                  <th className="py-2 pl-4 pr-3 font-normal">รหัสเครื่อง</th>
                  <th className="py-2 pr-3 font-normal">ยี่ห้อ / รุ่น</th>
                  <th className="py-2 pr-3 font-normal">ลูกค้า / ตำแหน่ง</th>
                  <th className="py-2 pr-3 font-normal">ล้างครั้งถัดไป</th>
                  <th className="py-2 pr-4 font-normal">ซ่อมใน 12 เดือน</th>
                </tr>
              </thead>
              <tbody className="[&_td:first-child]:pl-4">
                {rows.map((a) => (
                  <Row key={a.id} a={a} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <Pagination
            page={page}
            total={total}
            perPage={ASSETS_PER_PAGE}
            basePath="/assets"
            params={{ q: sp.q, acType: sp.acType, pmDue: sp.pmDue }}
            unit="เครื่อง"
          />
        )}
      </div>
    </div>
  );
}
