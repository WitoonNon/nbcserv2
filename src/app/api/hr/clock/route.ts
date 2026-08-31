import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';
import { punchClock, TimeClockError } from '@/modules/hr/timeclock.service';

export const dynamic = 'force-dynamic';

/**
 * Record a punch from the scan page.
 *
 * A route rather than a server action because the same shape will be needed by
 * the offline queue later — the technician app already queues writes this way,
 * and a punch made in a car park with no signal is exactly the case that queue
 * exists for.
 *
 * Everything about what is allowed lives in the service. This reads the
 * request, finds which employee is asking, and turns a refusal into a status
 * code.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'ยังไม่ได้เข้าสู่ระบบ' }, { status: 401 });
  if (user.mustChangePassword) {
    return NextResponse.json({ error: 'กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน' }, { status: 403 });
  }

  // Clocking in needs no permission beyond being a member of staff with an
  // employee record — a labourer who never opens another screen still has to
  // be able to start their day.
  const employee = await prisma.employee.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json(
      { error: 'บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน — แจ้งฝ่ายบุคคล' },
      { status: 403 },
    );
  }

  let body: { token?: string; lat?: number; lng?: number; accuracyMetres?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'อ่านข้อมูลไม่ได้' }, { status: 400 });
  }

  const token = String(body.token ?? '');
  if (!token) return NextResponse.json({ error: 'ไม่พบรหัส QR' }, { status: 400 });

  const hasFix = Number.isFinite(body.lat) && Number.isFinite(body.lng);

  try {
    const result = await punchClock({
      employeeId: employee.id,
      token,
      at: hasFix ? { lat: body.lat!, lng: body.lng! } : null,
      accuracyMetres: Number.isFinite(body.accuracyMetres) ? body.accuracyMetres : null,
      deviceInfo: req.headers.get('user-agent'),
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof TimeClockError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
