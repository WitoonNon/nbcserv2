import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guard';
import { canViewWorkOrder } from '@/modules/workorders/access';
import { getWorkOrder } from '@/modules/workorders/workorder.service';
import { listLateAttachments } from '@/modules/media/attachment.service';
import { FormPrint, type PrintSignature } from '@/components/forms/FormPrint';
import { PrintButton } from '@/components/print/PrintButton';
import { formatThaiDate } from '@/lib/date/buddhist';
import '@/styles/print.css';

export const dynamic = 'force-dynamic';

/**
 * The printable work order.
 *
 * Deliberately outside the `(staff)` route group: that layout wraps every page
 * in the application shell, and a sidebar has no business on a document that
 * is about to become a customer's copy.
 *
 * There is no PDF renderer on the server. Thai is the reason. Laying text out
 * with pdf-lib maps codepoints straight to glyphs with no OpenType shaping, so
 * vowel and tone marks take their own advance width instead of stacking over
 * the consonant — every document would ship with broken Thai. Headless
 * Chromium does shape correctly, but the bundled build carries no fonts at all
 * and its cold start sits on top of the plan's limits. The browser already on
 * the reviewer's desk shapes Thai properly and has Sarabun loaded, so the
 * document is built for it and saved through the print dialog.
 *
 * That choice is not a dead end: if this ever needs to run unattended — a PDF
 * attached to a LINE message — headless Chromium visits this same URL. The
 * document is the work; the renderer is swappable.
 */

const STATUS_TH: Record<string, string> = {
  DRAFT: 'ร่าง — ยังไม่ได้ส่งตรวจ',
  SUBMITTED: 'รอการตรวจรับ',
  RETURNED: 'ถูกส่งกลับให้แก้ไข',
  APPROVED: 'ตรวจรับแล้ว',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // The browser offers document.title as the filename when the operator picks
  // "Save as PDF", so the saved file lands as NBC-REP-2569-00001 rather than
  // as the route. Only the document number is read — the page below does the
  // access check before anything else is shown.
  const wo = await prisma.workOrder
    .findUnique({ where: { id }, select: { docNo: true } })
    .catch(() => null);
  return { title: wo?.docNo ?? 'ใบงาน', robots: { index: false, follow: false } };
}

export default async function PrintWorkOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const { auto } = await searchParams;

  const user = await requirePermission('workorder.read', `/print/work-order/${id}`);
  // Holding `workorder.read` says this account may look at work orders, not at
  // this one. Same rule as the on-screen document and the media route.
  if (!(await canViewWorkOrder(user, id))) notFound();

  const workOrder = await getWorkOrder(id);
  if (!workOrder) notFound();

  const late = await listLateAttachments(id).catch(() => []);

  const signatures: Record<string, PrintSignature> = Object.fromEntries(
    workOrder.signatures.map((s) => [
      s.signerRole,
      {
        signerName: s.signerName,
        signerPosition: s.signerPosition,
        storageKey: s.storageKey,
        signedAt: s.signedAt,
        matchesCurrentPayload: s.matchesCurrentPayload,
      },
    ]),
  );

  const issuedAt = workOrder.approvedAt ?? workOrder.submittedAt ?? workOrder.updatedAt;

  return (
    <>
      <div className="printbar no-print">
        <span className="printbar__hint">
          ในกล่องพิมพ์ ให้เลือกขนาดกระดาษ <b>A4</b> และปิด{' '}
          <b>หัวกระดาษและท้ายกระดาษ (Headers and footers)</b> เบราว์เซอร์จะจำค่าไว้ให้ครั้งต่อไป
        </span>
        <PrintButton auto={auto === '1'} />
      </div>

      <article className="doc">
        <header className="doc__head">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/nbc-logo.png" alt="NBC Group" className="doc__logo" />
            <p className="doc__company">บริษัท เอ็นบีซี กรุ๊ป จำกัด (สำนักงานใหญ่)</p>
            <p className="doc__addr">
              105/26 หมู่ 2 ตำบลละหาร อำเภอบางบัวทอง จังหวัดนนทบุรี 11110
              <br />
              เลขประจำตัวผู้เสียภาษี 0125561013342
            </p>
          </div>
          <div className="doc__titlebox">
            <span className="doc__title">
              {workOrder.schema.titleEn?.toUpperCase() ?? workOrder.schema.titleTh}
            </span>
            <dl className="doc__meta">
              <div>
                <dt>เลขที่ใบงาน</dt>
                <dd>{workOrder.docNo}</dd>
              </div>
              <div>
                <dt>วันที่</dt>
                <dd>{formatThaiDate(new Date(issuedAt))}</dd>
              </div>
              <div>
                <dt>เลขที่งาน</dt>
                <dd>{workOrder.jobNo}</dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="doc__contact">
          <span>02-000-7332 ต่อ 1-3</span>
          <span>096-648-8886</span>
          <span>097-094-4419</span>
          <span>Line: @nbcservice</span>
          <span>nbcservice@nbcgroup.co.th</span>
        </div>

        {workOrder.status !== 'APPROVED' && (
          <p className="doc__draft">
            เอกสารฉบับนี้ยังไม่ผ่านการตรวจรับ ({STATUS_TH[workOrder.status]}) — ไม่ใช้เป็นหลักฐาน
          </p>
        )}

        <div className="doc__party">
          <span>
            <b>ลูกค้า</b>
            {workOrder.customerName}
          </span>
          <span>
            <b>สถานะ</b>
            {STATUS_TH[workOrder.status] ?? workOrder.status}
          </span>
          <span>
            <b>สถานที่</b>
            {workOrder.siteAddress}
          </span>
          <span>
            <b>แบบฟอร์ม</b>
            {workOrder.schema.titleTh} (ฉบับที่ {workOrder.templateVersion})
          </span>
        </div>

        <FormPrint
          schema={workOrder.schema}
          payload={workOrder.payload}
          signatures={signatures}
        />

        {late.length > 0 && (
          <section className="late">
            <p className="late__head">รูปถ่ายที่แนบเพิ่มภายหลัง</p>
            {/* Outside the form body, and labelled. These were not part of the
                payload any signature was taken over, so printing them among
                the answers would imply the customer saw them when they signed. */}
            <p className="late__note">
              รูปเหล่านี้แนบเข้าระบบหลังจากส่งใบงานแล้ว จึงไม่อยู่ในเนื้อหาที่ลงลายเซ็นรับรอง
            </p>
            <div className="photos__grid">
              {late.map((a) => (
                <figure key={a.id} className="photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.reason} />
                  <figcaption>
                    {a.reason}
                    <br />
                    {a.addedByName ?? 'ไม่ระบุผู้แนบ'} · {formatThaiDate(new Date(a.addedAt))}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <p className="doc__thanks">ขอบคุณที่ไว้วางใจในบริการของเรา</p>

        <footer className="doc__footer">
          <span>บริษัท เอ็นบีซี กรุ๊ป จำกัด · nbcgroup.co.th</span>
          <span>
            {workOrder.docNo} · {workOrder.jobNo}
          </span>
        </footer>
      </article>
    </>
  );
}
