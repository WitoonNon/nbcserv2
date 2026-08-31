import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { env } from '@/lib/env';
import { requirePermission } from '@/lib/auth/guard';
import { issueStaticToken } from '@/modules/hr/timeclock-token';
import { PrintButton } from '@/components/print/PrintButton';
import '@/styles/print.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'ป้ายจุดลงเวลา — NBC Group' };

/**
 * The sign that goes on the wall.
 *
 * Outside the `(staff)` group for the same reason the work order is: this is a
 * physical object about to come out of a printer, and a sidebar has no place
 * on it.
 *
 * Deliberately sparse. It is read from two metres away by somebody holding a
 * phone, and every extra line is one more thing between them and the code.
 *
 * The token in the code never expires — which is the honest trade. A printed
 * sheet that stopped working one morning would strand everyone, so it does
 * not, and the consequence is that a photograph of it works forever too. The
 * location check is what makes that acceptable.
 */
export default async function TimeClockQrPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ point?: string; auto?: string }>;
}) {
  await requirePermission('admin.config', '/print/timeclock-qr');
  const { point, auto } = await searchParams;

  const scanPointId = /^[A-Za-z0-9_-]{1,40}$/.test(point ?? '') ? point! : 'OFFICE';
  const token = await issueStaticToken(scanPointId, env().AUTH_SECRET);
  const url = `${env().APP_URL}/clock?t=${encodeURIComponent(token)}`;

  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    // Highest correction: this one lives on a wall, in sunlight, and collects
    // fingerprints and tape. It has to still scan with a corner obscured.
    errorCorrectionLevel: 'H',
  });

  return (
    <>
      <div className="printbar no-print">
        <span>ป้ายจุดลงเวลา · A4</span>
        <PrintButton auto={auto === '1'} />
      </div>

      <div className="doc">
        <div style={{ textAlign: 'center', paddingTop: '18mm' }}>
          <p style={{ fontSize: '24pt', fontWeight: 700, margin: 0 }}>ลงเวลาเข้า-ออกงาน</p>
          <p style={{ fontSize: '12pt', margin: '2mm 0 0' }}>บริษัท เอ็นบีซี กรุ๊ป จำกัด</p>

          <div
            style={{ width: '110mm', margin: '12mm auto' }}
            // Generated here by the server's QR encoder from a token this app
            // signed; no user input reaches it.
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <p style={{ fontSize: '18pt', fontWeight: 700, margin: 0 }}>
            เปิดกล้องมือถือ ส่องรหัสนี้
          </p>
          <p style={{ fontSize: '12pt', margin: '4mm 0 0' }}>
            ระบบจะรู้เองว่าเป็นการเข้าหรือออกงาน
          </p>
          <p style={{ fontSize: '12pt', margin: '2mm 0 0' }}>
            เปิด GPS ไว้ด้วย — ถ้าหาตำแหน่งไม่ได้ ยังลงเวลาได้ แต่หัวหน้าจะต้องตรวจสอบ
          </p>

          <p style={{ fontSize: '9pt', marginTop: '16mm' }}>
            มีปัญหาลงเวลาไม่ได้ ติดต่อฝ่ายบุคคล · 02-000-7332
          </p>
        </div>
      </div>
    </>
  );
}
