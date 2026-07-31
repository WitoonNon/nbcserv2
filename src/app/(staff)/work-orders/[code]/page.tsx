import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormRenderer } from '@/components/forms/FormRenderer';
import { FORM_TEMPLATES_CURRENT } from '@/lib/forms/templates';
import { formatThaiDate } from '@/lib/date/buddhist';

type Code = keyof typeof FORM_TEMPLATES_CURRENT;

const DOC_PREFIX: Record<Code, string> = {
  INSPECTION_REQUEST: 'NBC-CHK',
  CLEANING_PM: 'NBC-PM',
  REPAIR: 'NBC-REP',
};

export default async function WorkOrderFormPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const schema = FORM_TEMPLATES_CURRENT[code as Code];
  if (!schema) notFound();

  return (
    <div className="space-y-4 max-w-5xl">
      <Link href="/work-orders" className="text-sm text-[var(--color-brand-blue-600)]">
        ← กลับไปรายการฟอร์ม
      </Link>

      {/* Document header, matching the letterhead on the client's paper form. */}
      <div className="card overflow-hidden">
        <div className="p-4 flex items-start justify-between gap-4 flex-wrap border-b-2 border-[var(--color-brand-navy)]">
          <div>
            <p className="font-[family-name:var(--font-heading)] text-lg text-[var(--color-brand-navy)]">
              บริษัท เอ็นบีซี กรุ๊ป จำกัด (สำนักงานใหญ่)
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              105/26 หมู่ 2 ตำบลละหาร อำเภอบางบัวทอง จังหวัดนนทบุรี 11110
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              เลขประจำตัวผู้เสียภาษี 0125561013342
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block bg-[var(--color-brand-navy)] text-white px-4 py-1.5 font-[family-name:var(--font-heading)] tracking-wide">
              {schema.titleEn?.toUpperCase() ?? schema.titleTh}
            </span>
            <dl className="text-xs mt-2 space-y-0.5">
              <div className="flex gap-2 justify-end">
                <dt className="text-[var(--color-muted)]">เลขที่ใบงาน</dt>
                <dd className="font-mono text-[var(--color-brand-blue-600)]">
                  {DOC_PREFIX[code as Code]}-2569-00001
                </dd>
              </div>
              <div className="flex gap-2 justify-end">
                <dt className="text-[var(--color-muted)]">วันที่</dt>
                <dd>{formatThaiDate(new Date())}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="px-4 py-2 text-[11px] text-[var(--color-muted)] flex flex-wrap gap-x-4 gap-y-1">
          <span>02-000-7332 ต่อ 1-3</span>
          <span>096-648-8886</span>
          <span>097-094-4419</span>
          <span>Line: @nbcservice</span>
          <span>nbcservice@nbcgroup.co.th</span>
        </div>
      </div>

      <FormRenderer schema={schema} />

      <div className="flex items-center justify-between gap-3 flex-wrap card p-4">
        <p className="text-xs text-[var(--color-muted)]">
          ฟอร์มนี้แสดงผลจาก FormTemplate เวอร์ชัน {schema.version} — ยังไม่ได้ต่อฐานข้อมูล
          จึงยังบันทึกไม่ได้
        </p>
        <div className="flex gap-2">
          <button type="button" className="border border-[var(--color-line)] rounded-[3px] px-4 py-2 text-sm" disabled>
            บันทึกร่าง
          </button>
          <button type="button" className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-4 py-2 text-sm font-semibold" disabled>
            ส่งใบงาน + ออก PDF
          </button>
        </div>
      </div>

      <p className="text-center text-sm text-[var(--color-brand-navy)] pb-4">
        ขอบคุณที่ไว้วางใจในบริการของเรา ❄
      </p>
    </div>
  );
}
