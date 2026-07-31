'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { assignAction, unassignAction, type DispatchState } from '@/app/(staff)/dispatch/actions';
import type { BoardCrew, BoardJob } from '@/modules/dispatch/dispatch.service';
import { CATEGORY_LABEL } from '@/lib/labels';
import { formatMinutes } from '@/lib/utils';
import type { ServiceCategory } from '@/generated/prisma';

function JobCard({ job, children }: { job: BoardJob; children?: React.ReactNode }) {
  return (
    <li className="border border-[var(--color-line)] rounded-[3px] bg-white p-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/jobs/${job.id}`} className="font-mono text-[11px] text-[var(--color-brand-blue-600)]">
          {job.jobNo}
        </Link>
        <span className="text-[11px] text-[var(--color-muted)] shrink-0">
          {job.unitCount} เครื่อง · {formatMinutes(job.estimatedMinutes)}
        </span>
      </div>
      <p className="truncate">{job.customerName}</p>
      <p className="text-[11px] text-[var(--color-muted)] truncate">
        {job.siteName} · {CATEGORY_LABEL[job.category as ServiceCategory] ?? job.category}
      </p>
      {job.requiredSkills.length > 0 && (
        <p className="mt-1">
          {job.requiredSkills.map((s) => (
            <span key={s} className="assumption-badge mr-1">ต้องรับรอง {s}</span>
          ))}
        </p>
      )}
      {children}
    </li>
  );
}

function CapacityMeter({ booked, available }: { booked: number; available: number }) {
  const pct = available > 0 ? Math.min(100, Math.round((booked / available) * 100)) : 0;
  const over = available > 0 && booked > available;
  return (
    <div className="mt-1">
      <div className="flex justify-between text-[11px] text-[var(--color-muted)]">
        <span>{formatMinutes(booked)} / {available > 0 ? formatMinutes(available) : 'ไม่มีกะงาน'}</span>
        <span className={over ? 'text-[var(--color-status-cancelled)] font-semibold' : ''}>
          {available > 0 ? `${pct}%` : ''}
        </span>
      </div>
      <div className="h-1.5 bg-[var(--color-line)] rounded-full overflow-hidden mt-0.5">
        <div
          className={`h-full ${over ? 'bg-[var(--color-status-cancelled)]' : pct > 85 ? 'bg-[var(--color-status-onsite)]' : 'bg-[var(--color-status-done)]'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function DispatchBoard({ unassigned, crews }: { unassigned: BoardJob[]; crews: BoardCrew[] }) {
  const [assignState, doAssign, assigning] = useActionState<DispatchState, FormData>(assignAction, {});
  const [unassignState, doUnassign] = useActionState<DispatchState, FormData>(unassignAction, {});

  const error = assignState.error ?? unassignState.error;
  const confirm = assignState.confirmSkillOverride;

  return (
    <div className="space-y-3">
      {error && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          {error}
        </div>
      )}

      {confirm && (
        <form action={doAssign} className="card p-3 border-[var(--color-status-cancelled)] bg-red-50 text-sm">
          <input type="hidden" name="jobId" value={confirm.jobId} />
          <input type="hidden" name="crewId" value={confirm.crewId} />
          <input type="hidden" name="force" value="1" />
          <p className="mb-2">
            ทีมนี้ยังไม่มีช่างที่ผ่านการรับรอง <strong>{confirm.missing.join(', ')}</strong> —
            ยืนยันจ่ายงานให้ทีมนี้หรือไม่ ระบบจะบันทึกการข้ามเงื่อนไขไว้
          </p>
          <button className="bg-[var(--color-status-cancelled)] text-white rounded-[3px] px-4 py-1.5 text-sm font-semibold">
            ยืนยันจ่ายงาน
          </button>
        </form>
      )}

      <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
        {/* Unassigned queue */}
        <section className="card p-3">
          <h2 className="text-base mb-2">
            รอจ่ายงาน{' '}
            <span className="text-sm text-[var(--color-muted)]">({unassigned.length})</span>
          </h2>
          {unassigned.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)] py-4 text-center">จ่ายงานครบแล้ว</p>
          ) : (
            <ul className="space-y-2">
              {unassigned.map((job) => (
                <JobCard key={job.id} job={job}>
                  <form action={doAssign} className="flex gap-1.5 mt-2">
                    <input type="hidden" name="jobId" value={job.id} />
                    <select name="crewId" required
                      className="flex-1 border border-[var(--color-line)] rounded-[3px] px-1.5 py-1 text-xs bg-white">
                      <option value="">เลือกทีม…</option>
                      {crews.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button disabled={assigning}
                      className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-2.5 py-1 text-xs font-semibold disabled:opacity-60">
                      จ่าย
                    </button>
                  </form>
                </JobCard>
              ))}
            </ul>
          )}
        </section>

        {/* Crew lanes */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 content-start">
          {crews.map((c) => (
            <div key={c.id} className="card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-[family-name:var(--font-heading)] text-[var(--color-brand-teal)]">
                    {c.name}
                  </h3>
                  <p className="text-[11px] text-[var(--color-muted)] truncate">
                    {c.leadName ? `หัวหน้า ${c.leadName}` : 'ยังไม่มีหัวหน้าทีม'} · {c.memberCount} คน
                  </p>
                </div>
                <span className="text-[11px] text-[var(--color-muted)] shrink-0">{c.jobs.length} งาน</span>
              </div>

              <CapacityMeter booked={c.bookedMinutes} available={c.availableMinutes} />

              {c.skills.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {c.skills.map((s) => (
                    <span key={s} className="text-[10px] bg-[var(--color-brand-sky-50)] text-[var(--color-brand-blue-600)] rounded-full px-1.5 py-0.5">
                      {s}
                    </span>
                  ))}
                </p>
              )}

              <ul className="space-y-2 mt-2.5">
                {c.jobs.length === 0 ? (
                  <li className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-line)] rounded">
                    ยังไม่มีงาน
                  </li>
                ) : (
                  c.jobs.map((job) => (
                    <JobCard key={job.id} job={job}>
                      <form action={doUnassign} className="mt-1.5">
                        <input type="hidden" name="jobId" value={job.id} />
                        <button className="text-[11px] text-[var(--color-status-cancelled)]">ถอนงาน</button>
                      </form>
                    </JobCard>
                  ))
                )}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
