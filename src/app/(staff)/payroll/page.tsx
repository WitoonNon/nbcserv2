import { requirePermission } from '@/lib/auth/guard';
import { ComingSoon } from '@/components/ui/ComingSoon';

export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  // Deliberately behind admin.config even as a placeholder. The screen that
  // replaces it shows every employee's pay, and a route that is open while it
  // is empty tends to stay open once it is not.
  await requirePermission('admin.config', '/payroll');

  return (
    <ComingSoon
      title="สรุปเงินเดือน"
      phase="กำลังพัฒนา"
      bullets={[
        'ตั้งค่าแรงรายบุคคล เลือกได้ทั้งแบบรายวันและรายเดือน พร้อมอัตราค่าล่วงเวลา',
        'สรุปรายเดือนรายบุคคล — ค่าแรง + ค่าล่วงเวลา − วันที่ขาดหรือลาไม่รับค่าจ้าง',
        'หน้าตรวจทานก่อนปิดรอบ ปิดแล้วระบบล็อกไม่ให้แก้ เพื่อให้ตัวเลขย้อนหลังตรวจสอบได้',
        'แยกสิทธิ์การเข้าถึง — หัวหน้างานเห็นเฉพาะทีมตนเอง ฝ่ายธุรการไม่เห็นข้อมูลเงินเดือน',
      ]}
      note={
        <>
          อยู่ระหว่างพัฒนา · ยังไม่ได้สร้างโครงสร้างข้อมูลส่วนนี้ ·{' '}
          <b>รอบนี้เป็นการสรุปยอดก่อนหัก</b> ยังไม่รวมการหักประกันสังคมและภาษี ณ ที่จ่าย
        </>
      }
    />
  );
}
