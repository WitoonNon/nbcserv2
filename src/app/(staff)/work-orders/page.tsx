import Link from 'next/link';
import { FORM_TEMPLATES_CURRENT } from '@/lib/forms/templates';
import { flattenFields } from '@/lib/forms/types';

const FORMS = [
  {
    code: 'INSPECTION_REQUEST',
    schema: FORM_TEMPLATES_CURRENT.INSPECTION_REQUEST,
    docPrefix: 'NBC-CHK',
    source: 'ร่างจากข้อมูลบนเว็บบริษัท — รอฟอร์มจริง',
    confirmed: false,
  },
  {
    code: 'CLEANING_PM',
    schema: FORM_TEMPLATES_CURRENT.CLEANING_PM,
    docPrefix: 'NBC-PM',
    source: 'ร่างจากขั้นตอนการทำงานบนเว็บบริษัท — รอฟอร์มจริง',
    confirmed: false,
  },
  {
    code: 'REPAIR',
    schema: FORM_TEMPLATES_CURRENT.REPAIR,
    docPrefix: 'NBC-REP',
    source: 'ตรงตามฟอร์มจริงของลูกค้า (SERVICE WORK ORDER)',
    confirmed: true,
  },
];

export default function WorkOrdersPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">แบบฟอร์มใบงาน</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">
          ฟอร์มทั้ง 3 ใบเก็บเป็นข้อมูลในฐานข้อมูล ไม่ได้เขียนตายในโค้ด
          เมื่อได้ฟอร์มจริงจากลูกค้าจึงเพิ่มเป็นเวอร์ชันใหม่ได้ทันที
          โดยใบงานที่ออกไปแล้วยังคงแสดงผลตามเวอร์ชันเดิมของตัวเอง
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {FORMS.map((f) => {
          const fields = flattenFields(f.schema);
          return (
            <div key={f.code} className="card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base">{f.schema.titleTh}</h2>
                  <p className="text-[11px] text-[var(--color-muted)]">{f.schema.titleEn}</p>
                </div>
                <span
                  className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${
                    f.confirmed
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : 'assumption-badge'
                  }`}
                >
                  {f.confirmed ? `✓ v${f.schema.version} ยืนยันแล้ว` : `⚠ v${f.schema.version} ร่าง`}
                </span>
              </div>

              <p className="text-xs text-[var(--color-ink)]">{f.source}</p>

              <dl className="text-xs text-[var(--color-muted)] grid grid-cols-2 gap-y-1 mt-1">
                <dt>จำนวนช่องกรอก</dt>
                <dd className="text-right text-[var(--color-ink)]">{fields.length}</dd>
                <dt>เลขที่เอกสาร</dt>
                <dd className="text-right font-mono text-[var(--color-brand-blue-600)]">
                  {f.docPrefix}-2569-00001
                </dd>
              </dl>

              <Link
                href={`/work-orders/${f.code}`}
                className="mt-2 bg-[var(--color-brand-orange)] text-white text-center rounded-[3px] py-2 text-sm font-semibold"
              >
                ดูฟอร์ม
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
