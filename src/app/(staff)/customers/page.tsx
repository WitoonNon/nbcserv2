import Link from 'next/link';
import { listCustomers, type CustomerListRow } from '@/modules/customers/customer.service';

export const dynamic = 'force-dynamic';

const SEGMENT_LABEL: Record<string, string> = {
  FACTORY: 'โรงงาน',
  HOSPITAL: 'โรงพยาบาล',
  HOTEL: 'โรงแรม',
  OFFICE: 'สำนักงาน',
  MALL: 'ห้างสรรพสินค้า',
  RESIDENTIAL: 'บ้าน/คอนโด',
  GOVERNMENT: 'ราชการ',
  OTHER: 'อื่นๆ',
};

const inputCls = 'border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white';

interface Search {
  q?: string;
  segment?: string;
  type?: string;
  contract?: string;
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;

  let rows: CustomerListRow[] | null = null;
  try {
    rows = await listCustomers({
      q: sp.q,
      segment: sp.segment,
      type: sp.type,
      contractOnly: sp.contract === '1',
    });
  } catch {
    rows = null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl">ลูกค้า</h1>
        {rows && (
          <span className="text-sm text-[var(--color-muted)]">
            {rows.length} ราย · ในสัญญา {rows.filter((r) => r.hasActiveContract).length} ราย
          </span>
        )}
      </div>

      <form method="get" className="card p-3 flex flex-wrap gap-2 items-end">
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">ค้นหา</span>
          <input name="q" defaultValue={sp.q} placeholder="ชื่อ / รหัส / เบอร์โทร / เลขผู้เสียภาษี"
            className={`${inputCls} w-72`} />
        </label>
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">ประเภทธุรกิจ</span>
          <select name="segment" defaultValue={sp.segment ?? ''} className={inputCls}>
            <option value="">ทั้งหมด</option>
            {Object.entries(SEGMENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">ประเภทลูกค้า</span>
          <select name="type" defaultValue={sp.type ?? ''} className={inputCls}>
            <option value="">ทั้งหมด</option>
            <option value="CORPORATE">นิติบุคคล</option>
            <option value="INDIVIDUAL">บุคคลธรรมดา</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm pb-1.5">
          <input type="checkbox" name="contract" value="1" defaultChecked={sp.contract === '1'}
            className="size-4 accent-[var(--color-brand-orange)]" />
          เฉพาะลูกค้าในสัญญา
        </label>
        <button className="bg-[var(--color-brand-blue-600)] text-white rounded-[3px] px-4 py-1.5 text-sm">
          กรอง
        </button>
      </form>

      {rows === null ? (
        <div className="card p-5 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40">
          <p className="text-sm">
            ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ทะเบียนลูกค้าจะแสดงทันทีเมื่อตั้งค่า DATABASE_URL
            แล้วรัน migrate + seed
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
          ไม่พบลูกค้าที่ตรงเงื่อนไข
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)] bg-[var(--color-surface-alt)]">
                <th className="px-3 py-2 font-normal">รหัส</th>
                <th className="px-3 py-2 font-normal">ชื่อลูกค้า</th>
                <th className="px-3 py-2 font-normal">ประเภทธุรกิจ</th>
                <th className="px-3 py-2 font-normal">เบอร์โทร</th>
                <th className="px-3 py-2 font-normal text-center">หน้างาน</th>
                <th className="px-3 py-2 font-normal text-center">เครื่อง</th>
                <th className="px-3 py-2 font-normal text-center">งานสะสม</th>
                <th className="px-3 py-2 font-normal">ระดับราคา</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-brand-sky-50)]">
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-brand-blue-600)]">
                    <Link href={`/customers/${c.id}`}>{c.code}</Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/customers/${c.id}`} className="hover:underline">{c.displayName}</Link>
                    <span className="block text-[11px] text-[var(--color-muted)]">
                      {c.type === 'CORPORATE' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{SEGMENT_LABEL[c.segment] ?? c.segment}</td>
                  <td className="px-3 py-2.5 text-xs">{c.phone ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center">{c.siteCount}</td>
                  <td className="px-3 py-2.5 text-center">{c.assetCount}</td>
                  <td className="px-3 py-2.5 text-center">{c.jobCount}</td>
                  <td className="px-3 py-2.5">
                    {c.hasActiveContract ? (
                      <span className="text-[11px] bg-green-100 text-green-800 border border-green-300 rounded-full px-2 py-0.5">
                        ในสัญญา
                      </span>
                    ) : (
                      <span className="text-[11px] text-[var(--color-muted)]">ทั่วไป</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
