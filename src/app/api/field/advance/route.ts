import { NextResponse } from 'next/server';
import type { JobStatus } from '@/generated/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { advanceFieldJob, FieldWorkError } from '@/modules/jobs/field-work.service';

export const dynamic = 'force-dynamic';

/**
 * Move a job to its next field status.
 *
 * A route rather than a server action because this is replayed from the
 * offline queue: a queued write has to be sendable by a plain fetch, hours
 * later, without depending on the build that produced the page.
 *
 * Replays are expected, so this is idempotent — advanceFieldJob treats a
 * transition to the status the job is already in as a no-op rather than an
 * error, which is what stops a retried queue item from writing a second event
 * and skewing the SLA figures.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'ยังไม่ได้เข้าสู่ระบบ' }, { status: 401 });
  if (user.mustChangePassword || !user.permissions.has('job.read')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'อ่านข้อมูลไม่ได้' }, { status: 400 });
  }

  const jobId = String(form.get('jobId') ?? '');
  const to = String(form.get('to') ?? '') as JobStatus;
  if (!jobId || !to) return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 });

  const asNumber = (name: string): number | null => {
    const raw = form.get(name);
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  try {
    const result = await advanceFieldJob({
      jobId,
      technicianId: user.technicianId,
      to,
      actorId: user.id,
      lat: asNumber('lat'),
      lng: asNumber('lng'),
      // The moment of the tap. Offline this is the only record of when the
      // technician actually arrived — the request time could be hours later.
      occurredAt: form.get('occurredAt') ? new Date(String(form.get('occurredAt'))) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof FieldWorkError) {
      // A deliberate refusal: the office moved the job, or it was never this
      // technician's. Retrying will never change the answer, and 4xx is how
      // the outbox is told to stop trying.
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : String(e);
    // Anything else may be transient — 5xx keeps the item queued.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
