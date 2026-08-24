'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { setJobAssetsAction, type JobAssetState } from '@/app/(staff)/jobs/[id]/asset-actions';
import { AC_TYPE_LABEL } from '@/lib/labels';
import type { SelectableAsset } from '@/modules/assets/asset.service';

/**
 * Which machines this job is about.
 *
 * The register can already show every repair a unit has had; until this
 * existed, nothing ever wrote that link. Jobs recorded a customer and a site
 * and stopped, so the history a technician needs before quoting a fourth
 * repair was empty on every real record.
 *
 * A plain list of checkboxes rather than a search: a site has a handful of
 * units, the dispatcher is looking at a work order that names them, and
 * anything cleverer is a step between them and the answer.
 */
export function JobAssetPicker({
  jobId,
  assets,
  canEdit,
}: {
  jobId: string;
  assets: SelectableAsset[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<JobAssetState, FormData>(
    setJobAssetsAction,
    {},
  );

  const chosen = assets.filter((a) => a.selected);

  if (assets.length === 0) {
    return (
      <div className="card p-4">
        <h2 className="text-base mb-1">เครื่องที่อยู่ในงานนี้</h2>
        <p className="text-sm text-[var(--color-muted)]">
          หน้างานนี้ยังไม่มีเครื่องในทะเบียน — เพิ่มเครื่องก่อนจึงจะผูกกับงานได้
        </p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="card p-4">
        <h2 className="text-base mb-2">เครื่องที่อยู่ในงานนี้</h2>
        {chosen.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">ยังไม่ได้ระบุ</p>
        ) : (
          <ul className="text-sm space-y-1">
            {chosen.map((a) => (
              <li key={a.id}>
                <Link href={`/assets/${a.id}`} className="text-[var(--color-brand-blue-600)] font-mono text-[13px]">
                  {a.assetTag}
                </Link>
                <span className="text-[var(--color-muted)] ml-2 text-[12px]">
                  {AC_TYPE_LABEL[a.acType]}
                  {a.locationInBuilding ? ` · ${a.locationInBuilding}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="card p-4">
      <input type="hidden" name="jobId" value={jobId} />

      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-base">เครื่องที่อยู่ในงานนี้</h2>
        <button
          disabled={pending}
          className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>

      <p className="text-[12px] text-[var(--color-muted)] mb-2">
        ระบุไว้เพื่อให้ประวัติซ่อม-ล้างผูกกับตัวเครื่อง
        ทะเบียนจึงบอกได้ว่าเครื่องไหนซ่อมบ่อยจนควรพิจารณาเปลี่ยน
      </p>

      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {assets.map((a) => (
          <label key={a.id} className="flex items-start gap-2 text-sm cursor-pointer py-0.5">
            <input
              type="checkbox"
              name="assetId"
              value={a.id}
              defaultChecked={a.selected}
              disabled={pending}
              className="size-4 mt-0.5 accent-[var(--color-brand-orange)]"
            />
            <span>
              <span className="font-mono text-[13px]">{a.assetTag}</span>
              <span className="block text-[11px] text-[var(--color-muted)]">
                {AC_TYPE_LABEL[a.acType]}
                {a.brand ? ` · ${a.brand}` : ''}
                {a.locationInBuilding ? ` · ${a.locationInBuilding}` : ''}
              </span>
            </span>
          </label>
        ))}
      </div>

      {state.error && (
        <p className="text-[12px] text-[var(--color-status-cancelled)] mt-2">{state.error}</p>
      )}
      {state.saved && !state.error && (
        <p className="text-[12px] text-[var(--color-status-done)] mt-2">บันทึกแล้ว</p>
      )}
    </form>
  );
}
