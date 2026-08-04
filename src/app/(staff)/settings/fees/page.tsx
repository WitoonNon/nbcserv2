import Link from 'next/link';
import { prisma } from '@/lib/db';
import { FeePolicyForm, type FeePolicyView } from '@/components/settings/FeePolicyForm';
import { formatTHB } from '@/lib/utils';
import { formatThaiDate } from '@/lib/date/buddhist';
import { requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

async function load() {
  try {
    const [policy, approval, history] = await Promise.all([
      prisma.inspectionFeePolicy.findFirst({
        where: { isActive: true },
        orderBy: { effectiveFrom: 'desc' },
      }),
      prisma.approvalPolicy.findUnique({ where: { code: 'ONSITE_QUOTATION' } }),
      prisma.inspectionFeePolicy.findMany({
        where: { isActive: false },
        orderBy: { effectiveFrom: 'desc' },
        take: 10,
      }),
    ]);
    return { policy, approval, history };
  } catch {
    return null;
  }
}

export default async function FeesPage() {
  await requirePermission('admin.config', '/settings/fees');
  const data = await load();

  const view: FeePolicyView | null = data?.policy
    ? {
        id: data.policy.id,
        amount: Number(data.policy.amount),
        waiveForContractCustomer: data.policy.waiveForContractCustomer,
        creditOnProceed: data.policy.creditOnProceed,
        creditMode: data.policy.creditMode,
        creditValue: data.policy.creditValue ? Number(data.policy.creditValue) : null,
        minJobValueForCredit: data.policy.minJobValueForCredit
          ? Number(data.policy.minJobValueForCredit)
          : null,
      }
    : null;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <Link href="/settings" className="text-sm text-[var(--color-brand-blue-600)]">← ตั้งค่าระบบ</Link>
        <h1 className="text-2xl">ค่าเข้าตรวจเช็คและส่วนลด</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          ค่าทั้งหมดในหน้านี้เป็นค่าสมมติที่รอลูกค้ายืนยัน (ข้อ B1–B5 และ F7)
          เมื่อได้คำตอบจริงแก้ที่นี่ได้เลย ไม่ต้องแก้โค้ดหรือโครงสร้างฐานข้อมูล
        </p>
      </div>

      {!data ? (
        <div className="card p-5 bg-[var(--color-brand-orange-50)] text-sm">
          ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ฟอร์มจะบันทึกได้เมื่อตั้งค่า DATABASE_URL แล้วรัน migrate + seed
        </div>
      ) : (
        <>
          <FeePolicyForm
            policy={view}
            technicianMaxAmount={data.approval ? Number(data.approval.maxAmountForTechnician) : null}
          />

          {data.history.length > 0 && (
            <div className="card overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[var(--color-line)]">
                <h2 className="text-base">ประวัตินโยบายเดิม</h2>
              </header>
              <ul className="divide-y divide-[var(--color-line)] text-sm">
                {data.history.map((h) => (
                  <li key={h.id} className="px-4 py-2 flex justify-between gap-3 flex-wrap">
                    <span>{formatTHB(Number(h.amount))} · {h.creditMode}</span>
                    <span className="text-xs text-[var(--color-muted)]">
                      {formatThaiDate(h.effectiveFrom)}
                      {h.effectiveTo && ` – ${formatThaiDate(h.effectiveTo)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
