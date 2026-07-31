import { ComingSoon } from '@/components/ui/ComingSoon';

export default function Page() {
  return (
    <ComingSoon
      title="รายงานและสถิติ"
      phase="Phase 4"
      bullets={[
    'อัตราการใช้โควตารายวัน เพื่อปรับเพดานงาน',
    'อัตราการไปถึงหน้างานภายใน 1 วันทำการ ตามที่บริษัทประกาศไว้',
    'อัตราการแปลงจากงานตรวจเช็คเป็นงานซ่อม',
    'ผลิตภาพช่าง อะไหล่ที่ใช้บ่อย และรายได้แยกตามกลุ่มลูกค้า',
      ]}
    />
  );
}
