import { getBookingCalendar, previewInspectionFee } from '@/modules/scheduling/booking.service';
import { BookingWizard } from '@/components/booking/BookingWizard';

export const dynamic = 'force-dynamic';

/**
 * Customer booking.
 *
 * The governing rule: a customer never sees a date whose quota is exhausted.
 * The calendar IS the quota, rendered — closed days are visibly closed rather
 * than failing at submit time.
 *
 * The default selection is resolved here on the server so the first paint is
 * already a usable calendar; the client only refetches once the customer
 * changes what they are booking.
 */
async function loadInitial() {
  try {
    const calendar = await getBookingCalendar({
      category: 'CLEANING_PM',
      acType: 'WALL',
      unitCount: 1,
    });
    if (!calendar) return { calendar: null, fee: null };

    const fee = await previewInspectionFee({
      category: 'CLEANING_PM',
      zoneId: calendar.zoneId,
    });
    return { calendar, fee };
  } catch {
    return { calendar: null, fee: null };
  }
}

export default async function BookingPage() {
  const { calendar, fee } = await loadInitial();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">จองคิวช่าง</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          เลือกประเภทงานและวันที่ต้องการ ระบบจะแสดงเฉพาะวันที่ยังรับงานได้จริง
        </p>
      </div>

      {calendar === null ? (
        <div className="card p-6 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40">
          <p className="text-sm">
            ขณะนี้ระบบจองออนไลน์ยังไม่พร้อมให้บริการ กรุณาโทร 02-000-7332 ต่อ 1-3
          </p>
        </div>
      ) : (
        <BookingWizard initial={calendar} initialFee={fee} />
      )}
    </div>
  );
}
