import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCustomer } from '@/modules/customers/customer.service';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CATEGORY_LABEL } from '@/lib/labels';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

const AC_TYPE_LABEL: Record<string, string> = {
  WALL: 'ติดผนัง',
  CEILING: 'แขวน',
  STANDING: 'ตู้ตั้ง',
  CASSETTE_4WAY: 'ฝังฝ้า 4 ทิศทาง',
  CONCEALED_SMALL: 'ซ่อนในฝ้า (เล็ก)',
  CONCEALED_LARGE: 'ซ่อนในฝ้า (ใหญ่)',
  VRV_VRF: 'VRV/VRF',
  AHU: 'AHU',
  CHILLER: 'Chiller',
  OTHER: 'อื่นๆ',
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let customer;
  try {
    customer = await getCustomer(id);
  } catch {
    return (
      <div className="card p-5 bg-[var(--color-brand-orange-50)] max-w-2xl">
        <p className="text-sm">ยังเชื่อมต่อฐานข้อมูลไม่ได้</p>
      </div>
    );
  }
  if (!customer) notFound();

  const activeContract = customer.contracts.find((c) => c.status === 'ACTIVE');
  const totalAssets = customer.sites.reduce((s, site) => s + site.assets.length, 0);

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <Link href="/customers" className="text-sm text-[var(--color-brand-blue-600)]">← ลูกค้าทั้งหมด</Link>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl">{customer.displayName}</h1>
          <span className="font-mono text-sm text-[var(--color-muted)]">{customer.code}</span>
          {activeContract && (
            <span className="text-[11px] bg-green-100 text-green-800 border border-green-300 rounded-full px-2 py-0.5">
              ลูกค้าในสัญญา · ตรวจเช็คฟรี
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="text-base mb-2">ข้อมูลทั่วไป</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-[var(--color-muted)]">ชื่อตามทะเบียน</dt>
            <dd>{customer.legalName}</dd>
            <dt className="text-[var(--color-muted)]">เลขประจำตัวผู้เสียภาษี</dt>
            <dd className="font-mono text-xs">{customer.taxId ?? '—'}</dd>
            <dt className="text-[var(--color-muted)]">เบอร์โทร / อีเมล</dt>
            <dd>{customer.phone ?? '—'} · {customer.email ?? '—'}</dd>
            <dt className="text-[var(--color-muted)]">ที่อยู่วางบิล</dt>
            <dd>{customer.billingAddress ?? '—'}</dd>
            <dt className="text-[var(--color-muted)]">หน้างาน / เครื่องทั้งหมด</dt>
            <dd>{customer.sites.length} หน้างาน · {totalAssets} เครื่อง</dd>
          </dl>
        </div>

        <div className="card p-4">
          <h2 className="text-base mb-2">ผู้ติดต่อ</h2>
          {customer.contacts.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">ยังไม่มีผู้ติดต่อ</p>
          ) : (
            <ul className="text-sm space-y-1.5">
              {customer.contacts.map((c) => (
                <li key={c.id}>
                  {c.name}
                  {c.isPrimary && <span className="text-[10px] text-[var(--color-brand-orange)] ml-1">หลัก</span>}
                  <span className="block text-xs text-[var(--color-muted)]">
                    {c.position ?? ''} {c.phone ?? ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Contracts */}
      <div className="card p-4">
        <h2 className="text-base mb-2">สัญญาบริการ</h2>
        {customer.contracts.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">ลูกค้าทั่วไป — ยังไม่มีสัญญา</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)]">
                  <th className="py-1.5 font-normal">เลขที่สัญญา</th>
                  <th className="py-1.5 font-normal">ประเภท</th>
                  <th className="py-1.5 font-normal">ระยะเวลา</th>
                  <th className="py-1.5 font-normal text-center">PM/ปี</th>
                  <th className="py-1.5 font-normal text-center">ค่าตรวจเช็ค</th>
                  <th className="py-1.5 font-normal">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {customer.contracts.map((ct) => (
                  <tr key={ct.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="py-1.5 font-mono text-xs">{ct.contractNo}</td>
                    <td className="py-1.5 text-xs">{ct.type === 'ANNUAL' ? 'รายปี' : ct.type === 'MONTHLY' ? 'รายเดือน' : 'รายครั้ง'}</td>
                    <td className="py-1.5 text-xs">
                      {formatThaiDate(ct.startsOn)} – {formatThaiDate(ct.endsOn)}
                    </td>
                    <td className="py-1.5 text-center">{ct.includedPmVisitsPerYear ?? '—'}</td>
                    <td className="py-1.5 text-center text-xs">
                      {ct.inspectionFeeWaived
                        ? <span className="text-green-700">ยกเว้น</span>
                        : 'คิดปกติ'}
                    </td>
                    <td className="py-1.5 text-xs">{ct.status === 'ACTIVE' ? 'ใช้งานอยู่' : ct.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sites + assets */}
      <div className="space-y-3">
        <h2 className="text-base">หน้างานและทะเบียนเครื่อง</h2>
        {customer.sites.map((site) => (
          <div key={site.id} className="card overflow-hidden">
            <header className="px-4 py-2.5 bg-[var(--color-surface-alt)] border-b border-[var(--color-line)] flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-[family-name:var(--font-heading)] text-[15px] text-[var(--color-brand-teal)]">
                  {site.name}
                </h3>
                <p className="text-xs text-[var(--color-muted)]">
                  {site.address}
                  {site.zone && ` · เขต ${site.zone.nameTh}`}
                </p>
              </div>
              <span className="text-xs text-[var(--color-muted)]">{site.assets.length} เครื่อง</span>
            </header>

            {site.assets.length === 0 ? (
              <p className="px-4 py-3 text-sm text-[var(--color-muted)]">
                ยังไม่ได้ลงทะเบียนเครื่อง — ช่างจะบันทึกให้อัตโนมัติเมื่อเข้าให้บริการครั้งแรก
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)]">
                      <th className="px-4 py-1.5 font-normal">รหัสเครื่อง</th>
                      <th className="px-4 py-1.5 font-normal">ประเภท</th>
                      <th className="px-4 py-1.5 font-normal">ยี่ห้อ / รุ่น</th>
                      <th className="px-4 py-1.5 font-normal text-right">BTU</th>
                      <th className="px-4 py-1.5 font-normal">ตำแหน่ง</th>
                      <th className="px-4 py-1.5 font-normal text-center">PM/ปี</th>
                    </tr>
                  </thead>
                  <tbody>
                    {site.assets.map((a) => (
                      <tr key={a.id} className="border-b border-[var(--color-line)] last:border-0">
                        <td className="px-4 py-1.5 font-mono text-xs">{a.assetTag}</td>
                        <td className="px-4 py-1.5 text-xs">{AC_TYPE_LABEL[a.acType] ?? a.acType}</td>
                        <td className="px-4 py-1.5 text-xs">{a.brand ?? '—'} {a.model ?? ''}</td>
                        <td className="px-4 py-1.5 text-right text-xs">{a.btu?.toLocaleString() ?? '—'}</td>
                        <td className="px-4 py-1.5 text-xs">{a.locationInBuilding ?? '—'}</td>
                        <td className="px-4 py-1.5 text-center text-xs">{a.pmFrequencyPerYear}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Job history */}
      <div className="card overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[var(--color-line)]">
          <h2 className="text-base">ประวัติงานล่าสุด</h2>
        </header>
        {customer.jobs.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[var(--color-muted)]">ยังไม่มีประวัติงาน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <tbody>
                {customer.jobs.map((j) => (
                  <tr key={j.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/jobs/${j.id}`} className="font-mono text-xs text-[var(--color-brand-blue-600)]">
                        {j.jobNo}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs">{CATEGORY_LABEL[j.category]}</td>
                    <td className="px-4 py-2 text-xs">{j.site.name}</td>
                    <td className="px-4 py-2 text-xs">
                      {j.scheduledDate ? formatThaiDate(j.scheduledDate) : '—'}
                    </td>
                    <td className="px-4 py-2"><StatusBadge status={j.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
