import { ComingSoon } from '@/components/ui/ComingSoon';

export default function Page() {
  return (
    <ComingSoon
      title="ทะเบียนเครื่องปรับอากาศ"
      phase="เฟส 3"
      bullets={[
    'ทะเบียนเครื่องรายตัว ยี่ห้อ รุ่น Serial No. ตำแหน่งติดตั้ง',
    'ประวัติการล้าง ซ่อม และอะไหล่ที่เปลี่ยนของเครื่องนั้น',
    'รอบ PM 2/3/4 ครั้งต่อปี พร้อมแจ้งเตือนเมื่อถึงกำหนด',
    'ช่างเห็นประวัติทันทีเมื่อถึงหน้างาน',
      ]}
    />
  );
}
