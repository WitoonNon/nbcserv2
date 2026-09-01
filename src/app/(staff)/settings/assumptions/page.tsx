import { prisma } from '@/lib/db';
import { requirePermission, can } from '@/lib/auth/guard';
import { ConfigRow, FlagRow } from '@/components/settings/ConfigRow';
import { kindOf, recentConfigChanges } from '@/modules/platform/config.service';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

/**
 * The assumptions register, live from the database and editable.
 *
 * This screen is the visible proof of the architectural promise: every value
 * the client has not confirmed is a row here, changeable without a migration
 * or a redeploy. It said so from the day it was built and could not do it —
 * the values were rows, but nothing in the application could write one, so
 * changing the paid sick-leave allowance meant hand-written SQL.
 *
 * That gap mattered beyond tidiness. "It is configuration, so you can change
 * your mind cheaply" was the argument made when the client's leave policy was
 * agreed below the statutory figures. The argument is only honest if the
 * screen can actually do it.
 */
export default async function AssumptionsPage() {
  const user = await requirePermission('admin.config', '/settings/assumptions');
  const editable = can(user, 'admin.config');

  let rows: { key: string; value: unknown; description: string | null; isAssumption: boolean }[] = [];
  let flags: { key: string; enabled: boolean; description: string | null }[] = [];
  let changes: Awaited<ReturnType<typeof recentConfigChanges>> = [];
  let failed = false;

  try {
    rows = await prisma.appConfig.findMany({ orderBy: [{ isAssumption: 'desc' }, { key: 'asc' }] });
    flags = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    changes = await recentConfigChanges(15).catch(() => []);
  } catch {
    failed = true;
  }

  const assumptions = rows.filter((r) => r.isAssumption);
  const confirmed = rows.filter((r) => !r.isAssumption);

  const head = (
    <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)]">
      <th className="px-4 py-2 font-normal w-56">คีย์</th>
      <th className="py-2 pr-3 font-normal w-64">ค่าปัจจุบัน</th>
      <th className="py-2 pr-3 font-normal">คำอธิบาย</th>
      <th className="py-2 pr-4 font-normal w-20" />
    </tr>
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl">ค่าตั้งค่าระบบและค่าสมมติ</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">
          ค่าที่ทำเครื่องหมาย &quot;ค่าสมมติ&quot; คือค่าที่ตั้งไว้ชั่วคราวเพื่อให้ระบบทำงานได้
          ระหว่างรอคำตอบจากลูกค้า ทุกค่าเก็บเป็นข้อมูลในฐานข้อมูล
          {editable ? ' กดแก้ไขได้จากหน้านี้เลย ไม่ต้องแก้โปรแกรม' : ''}
        </p>
        {editable && (
          <p className="text-[12px] text-[var(--color-muted)] mt-2">
            แก้แล้วมีผลทันที · ระบบบันทึกไว้ว่าใครแก้อะไรเมื่อไหร่ · ค่าที่ถูกแก้จะเลิกนับเป็น
            &quot;ค่าสมมติ&quot; อัตโนมัติ
          </p>
        )}
      </div>

      {failed ? (
        <div className="card p-6">
          <p className="text-sm">
            ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ตั้งค่า DATABASE_URL แล้วรัน migrate + seed
          </p>
        </div>
      ) : (
        <>
          <section className="card overflow-hidden">
            <header className="px-4 py-3 bg-[var(--color-brand-orange-50)] border-b border-[var(--color-line)]">
              <h2 className="text-base">รอลูกค้ายืนยัน ({assumptions.length})</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                เราตั้งค่าไว้เองเพื่อให้ระบบเดินได้ ลูกค้ายังไม่ได้ยืนยัน
              </p>
            </header>
            {assumptions.length === 0 ? (
              <p className="p-4 text-sm text-[var(--color-muted)]">
                ไม่มีค่าสมมติค้างอยู่ — ลูกค้ายืนยันครบแล้ว
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead>{head}</thead>
                  <tbody>
                    {assumptions.map((r) => (
                      <ConfigRow
                        key={r.key}
                        configKey={r.key}
                        value={r.value}
                        description={r.description}
                        isAssumption
                        kind={kindOf(r.value)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <header className="px-4 py-3 border-b border-[var(--color-line)]">
              <h2 className="text-base">ยืนยันแล้ว ({confirmed.length})</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                ลูกค้ายืนยันแล้ว หรืออ้างอิงจากข้อมูลสาธารณะของบริษัทเอง — แก้ได้เช่นกัน
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>{head}</thead>
                <tbody>
                  {confirmed.map((r) => (
                    <ConfigRow
                      key={r.key}
                      configKey={r.key}
                      value={r.value}
                      description={r.description}
                      isAssumption={false}
                      kind={kindOf(r.value)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card overflow-hidden">
            <header className="px-4 py-3 border-b border-[var(--color-line)]">
              <h2 className="text-base">ขอบเขตงาน — อะไรมีในระบบแล้ว ({flags.length})</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                รายการบอกสถานะ ไม่ใช่สวิตช์ — เปลี่ยนได้ด้วยการพัฒนาเท่านั้น
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <tbody>
                  {flags.map((f) => (
                    <FlagRow
                      key={f.key}
                      flagKey={f.key}
                      enabled={f.enabled}
                      description={f.description}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {changes.length > 0 && (
            <section className="card overflow-hidden">
              <header className="px-4 py-3 border-b border-[var(--color-line)]">
                <h2 className="text-base">ประวัติการแก้ไขล่าสุด</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  ค่าพวกนี้ตัดสินเรื่องเงินและสิทธิ์ — ค่าที่ดูแปลกต้องสาวกลับไปหาคนแก้ได้
                </p>
              </header>
              <table className="w-full text-sm">
                <tbody>
                  {changes.map((c, i) => (
                    <tr key={i} className="border-b border-[var(--color-line)] last:border-0">
                      <td className="px-4 py-2 font-mono text-[12px] text-[var(--color-brand-blue-600)] w-64">
                        {c.key}
                      </td>
                      <td className="py-2 pr-3 text-[13px]">
                        <span className="text-[var(--color-muted)] line-through">
                          {JSON.stringify(c.before)}
                        </span>
                        <span className="mx-2">→</span>
                        <span className="font-semibold">{JSON.stringify(c.after)}</span>
                      </td>
                      <td className="py-2 pr-3 text-[12px] text-[var(--color-muted)]">
                        {c.actorName ?? 'ไม่ทราบ'}
                      </td>
                      <td className="py-2 pr-4 text-[12px] text-[var(--color-muted)] whitespace-nowrap">
                        {formatThaiDate(new Date(c.at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
