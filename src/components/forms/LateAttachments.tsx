'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LateAttachmentView } from '@/modules/media/attachment.service';

/**
 * Photographs added to a work order after it was handed in.
 *
 * The client asked for this because technicians forget: they finish the job,
 * submit the form, and only then notice a photograph is missing or unusable.
 * Before this the only remedy was to reject the whole document and make them
 * fill it in again, which nobody was ever going to do for one picture.
 *
 * It is deliberately NOT part of the form above it. These files never entered
 * the payload the customer's signature hashes, so presenting them among the
 * technician's own photographs would say the customer saw them when they
 * signed — which is exactly the claim a dispute turns on. They live here,
 * labelled, with who added them and why.
 *
 * The reason is required rather than encouraged. A late photograph with no
 * explanation is indistinguishable from one added to change what the record
 * says, and the person who will need that explanation is whoever defends the
 * document a year from now.
 */
export function LateAttachments({
  workOrderId,
  attachments,
  canAttach,
}: {
  workOrderId: string;
  attachments: LateAttachmentView[];
  /** Same permission that governs reopening a submitted document. */
  canAttach: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canAttach && attachments.length === 0) return null;

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('เลือกไฟล์รูปก่อนครับ');
    if (!reason.trim()) return setError('กรุณาระบุเหตุผลที่แนบเพิ่มภายหลัง');

    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('workOrderId', workOrderId);
      body.append('kind', 'OTHER');
      body.append('lateReason', reason.trim());

      const res = await fetch('/api/media/upload', { method: 'POST', body });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        // The server's message is the useful one — it knows whether this was
        // a permission, a status, or a file that was too large.
        throw new Error(detail.error ?? `อัปโหลดไม่สำเร็จ (${res.status})`);
      }

      setReason('');
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--color-line)] flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-base">รูปถ่ายที่แนบเพิ่มภายหลัง</h2>
        <span className="text-[11px] text-[var(--color-muted)]">
          แยกจากรูปในใบงาน เพราะไม่ได้อยู่ในเนื้อหาที่ลูกค้าเซ็นรับรอง
        </span>
      </div>

      <div className="p-4 space-y-4">
        {attachments.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {attachments.map((a) => (
              <figure key={a.id} className="text-[11px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={a.reason}
                  className="w-full h-28 object-cover border border-[var(--color-line)] rounded-[3px]"
                />
                <figcaption className="mt-1 text-[var(--color-muted)] leading-snug">
                  <span className="block text-[var(--color-ink)]">{a.reason}</span>
                  {a.addedByName ?? 'ไม่ระบุผู้แนบ'} ·{' '}
                  {new Date(a.addedAt).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {canAttach ? (
          <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
            <label className="block">
              <span className="block text-[13px] mb-1">รูปที่ต้องการแนบ</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                disabled={busy}
                className="text-sm max-w-[220px]"
              />
            </label>
            <label className="block">
              <span className="block text-[13px] mb-1">
                เหตุผล <span className="text-[var(--color-status-cancelled)]">*</span>
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
                placeholder="เช่น ช่างลืมถ่ายรูปมิเตอร์ไฟก่อนเริ่มงาน"
                className="w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-[var(--color-brand-blue)]"
              />
            </label>
            <button
              type="button"
              onClick={upload}
              disabled={busy}
              className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-4 py-1.5 text-sm font-semibold disabled:opacity-60 h-[34px]"
            >
              {busy ? 'กำลังแนบ…' : 'แนบรูป'}
            </button>
          </div>
        ) : (
          attachments.length > 0 && (
            <p className="text-[11px] text-[var(--color-muted)]">
              การแนบรูปเพิ่มภายหลังทำได้เฉพาะผู้มีสิทธิ์ตรวจรับใบงาน
            </p>
          )
        )}

        {error && (
          <p className="text-[12px] text-[var(--color-status-cancelled)]">{error}</p>
        )}

        {canAttach && (
          <p className="text-[11px] text-[var(--color-muted)]">
            รูปที่แนบตรงนี้จะถูกบันทึกว่าเพิ่มภายหลัง พร้อมชื่อผู้แนบและเหตุผล
            และจะแสดงแยกไว้ต่างหากเมื่อสั่งพิมพ์เอกสาร
          </p>
        )}
      </div>
    </section>
  );
}
