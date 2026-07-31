import { prisma } from '@/lib/db';
import { AssumptionBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

/**
 * The assumptions register, live from the database.
 *
 * This screen is the visible proof of the architectural promise: every value
 * the client has not confirmed is a row here, editable without a migration or
 * a redeploy. It is also the working checklist when their answers arrive.
 */
export default async function AssumptionsPage() {
  let rows: { key: string; value: unknown; description: string | null; isAssumption: boolean }[] = [];
  let flags: { key: string; enabled: boolean; description: string | null }[] = [];
  let failed = false;

  try {
    rows = await prisma.appConfig.findMany({ orderBy: [{ isAssumption: 'desc' }, { key: 'asc' }] });
    flags = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  } catch {
    failed = true;
  }

  const assumptions = rows.filter((r) => r.isAssumption);
  const confirmed = rows.filter((r) => !r.isAssumption);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">ค่าตั้งค่าระบบและค่าสมมติ</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">
          ค่าที่ทำเครื่องหมาย &quot;ค่าสมมติ&quot; คือค่าที่ตั้งไว้ชั่วคราวเพื่อให้ระบบทำงานได้
          ระหว่างรอคำตอบจากลูกค้า ทุกค่าเป็นข้อมูลในฐานข้อมูล แก้ไขได้โดยไม่ต้องแก้โค้ด
        </p>
      </div>

      {failed ? (
        <div className="card p-6">
          <p className="text-sm">ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ตั้งค่า DATABASE_URL แล้วรัน migrate + seed</p>
        </div>
      ) : (
        <>
          <section className="card overflow-hidden">
            <header className="px-4 py-3 bg-[var(--color-brand-orange-50)] border-b border-[var(--color-line)]">
              <h2 className="text-base">รอลูกค้ายืนยัน ({assumptions.length})</h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)]">
                    <th className="px-4 py-2 font-normal">คีย์</th>
                    <th className="px-4 py-2 font-normal w-32">ค่าปัจจุบัน</th>
                    <th className="px-4 py-2 font-normal">คำอธิบาย / ข้อที่ต้องถาม</th>
                    <th className="px-4 py-2 font-normal w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {assumptions.map((r) => (
                    <tr key={r.key} className="border-b border-[var(--color-line)] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-brand-blue-600)]">
                        {r.key}
                      </td>
                      <td className="px-4 py-2.5 font-semibold">{JSON.stringify(r.value)}</td>
                      <td className="px-4 py-2.5 text-[var(--color-ink)]">{r.description}</td>
                      <td className="px-4 py-2.5">
                        <AssumptionBadge />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card overflow-hidden">
            <header className="px-4 py-3 border-b border-[var(--color-line)]">
              <h2 className="text-base">ยืนยันแล้ว ({confirmed.length})</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                ค่าที่อ้างอิงจากข้อมูลสาธารณะของบริษัทเอง หรือมาตรฐานที่ไม่ต้องถาม
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <tbody>
                  {confirmed.map((r) => (
                    <tr key={r.key} className="border-b border-[var(--color-line)] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-brand-blue-600)] w-64">
                        {r.key}
                      </td>
                      <td className="px-4 py-2.5 font-semibold w-32">{JSON.stringify(r.value)}</td>
                      <td className="px-4 py-2.5">{r.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card overflow-hidden">
            <header className="px-4 py-3 border-b border-[var(--color-line)]">
              <h2 className="text-base">ฟีเจอร์ที่เปิด/ปิดได้ ({flags.length})</h2>
            </header>
            <ul className="divide-y divide-[var(--color-line)]">
              {flags.map((f) => (
                <li key={f.key} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span
                    className={`inline-block size-2 rounded-full ${
                      f.enabled ? 'bg-[var(--color-status-done)]' : 'bg-slate-300'
                    }`}
                  />
                  <span className="font-mono text-xs text-[var(--color-brand-blue-600)] w-56">{f.key}</span>
                  <span className="flex-1">{f.description}</span>
                  <span className="text-xs text-[var(--color-muted)]">{f.enabled ? 'เปิด' : 'ปิด'}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
