import { requirePermission } from '@/lib/auth/guard';
import { getCapturePolicy } from '@/modules/platform/capture-policy';
import { CaptureForm } from '@/components/settings/CaptureForm';

export const dynamic = 'force-dynamic';

export default async function CaptureSettingsPage() {
  await requirePermission('admin.config', '/settings/capture');
  const policy = await getCapturePolicy();

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl">ข้อมูลที่เก็บจากรูปถ่ายหน้างาน</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          เลือกได้ว่าจะให้ระบบบันทึกเวลาและพิกัดของรูปที่ช่างถ่ายหรือไม่
        </p>
      </div>

      <div className="card p-4 text-[13px] space-y-2 bg-[var(--color-surface-alt)]">
        <p>
          <strong>การตั้งค่านี้มีผลกับรูปที่ถ่ายใหม่เท่านั้น</strong> —
          รูปที่บันทึกไปแล้วจะไม่ถูกเปลี่ยนหรือลบ
        </p>
        <p className="text-[var(--color-muted)]">
          ตัวรูปภาพจะถูกย่อขนาดก่อนอัปโหลดเสมอ ซึ่งลบข้อมูล EXIF ที่ติดมากับไฟล์อยู่แล้ว
          สิ่งที่สวิตช์นี้ควบคุมคือ ระบบจะบันทึกเวลาและพิกัดแยกไว้ในฐานข้อมูลหรือไม่
        </p>
      </div>

      <CaptureForm policy={policy} />
    </div>
  );
}
