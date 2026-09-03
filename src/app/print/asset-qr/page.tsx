import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { requirePermission } from '@/lib/auth/guard';
import { AC_TYPE_LABEL } from '@/lib/labels';
import { PrintButton } from '@/components/print/PrintButton';
import '@/styles/print.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'ป้าย QR ติดเครื่อง — NBC Group' };

/** Twelve to an A4 sheet — a label sheet, not one code per page. */
const PER_SHEET = 12;

/**
 * The stickers that go on the machines — Phase 3.1.
 *
 * A sheet of small labels rather than one code per page, because tagging is
 * something done to a whole building in an afternoon: twelve units in a hotel
 * plant room is one visit and should be one sheet.
 *
 * ## Why each label carries the tag in text as well
 *
 * A QR code on a condenser lives outdoors. It fades, it gets painted over,
 * and eventually it stops scanning. The printed asset tag beside it is what
 * lets somebody find the machine in the register by hand on that day — the
 * code is the convenience, the text is the fallback.
 *
 * The URL is deliberately short (`/a/<id>`): every character is another
 * module in the grid, and a denser code is a code that fails to scan first
 * when the label is scuffed.
 */
export default async function AssetQrPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; site?: string; auto?: string }>;
}) {
  await requirePermission('customer.read', '/print/asset-qr');
  const { ids, site, auto } = await searchParams;

  // Either an explicit list, or every active machine at one site — the two
  // ways somebody actually arrives here.
  const explicit = (ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{1,40}$/.test(s));

  const assets =
    explicit.length > 0
      ? await prisma.asset.findMany({
          where: { id: { in: explicit } },
          orderBy: { assetTag: 'asc' },
          select: { id: true, assetTag: true, acType: true, locationInBuilding: true },
        })
      : site
        ? await prisma.asset.findMany({
            where: { siteId: site, isActive: true },
            orderBy: { assetTag: 'asc' },
            select: { id: true, assetTag: true, acType: true, locationInBuilding: true },
          })
        : [];

  if (assets.length === 0) {
    return (
      <div className="doc" style={{ padding: '20mm', textAlign: 'center' }}>
        <p>ไม่ได้เลือกเครื่อง</p>
        <p style={{ fontSize: '10pt' }}>
          เปิดหน้านี้จากทะเบียนเครื่อง หรือใส่ <code>?site=&lt;siteId&gt;</code> เพื่อพิมพ์ทั้งหน้างาน
        </p>
      </div>
    );
  }

  const base = env().APP_URL;
  const labels = await Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      svg: await QRCode.toString(`${base}/a/${asset.id}`, {
        type: 'svg',
        margin: 0,
        // Highest correction, same reason as the wall sign: this one lives on
        // a machine, outdoors, and collects dust, paint and scratches. It has
        // to still scan with a corner gone.
        errorCorrectionLevel: 'H',
      }),
    })),
  );

  const sheets: (typeof labels)[] = [];
  for (let i = 0; i < labels.length; i += PER_SHEET) {
    sheets.push(labels.slice(i, i + PER_SHEET));
  }

  return (
    <>
      <div className="printbar no-print">
        <span>
          ป้าย QR ติดเครื่อง · {assets.length} ดวง · {sheets.length} แผ่น A4
        </span>
        <PrintButton auto={auto === '1'} />
      </div>

      {sheets.map((sheet, index) => (
        <div className="doc" key={index}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '6mm',
              padding: '10mm 8mm',
            }}
          >
            {sheet.map((label) => (
              <div
                key={label.id}
                style={{
                  border: '0.4mm solid #999',
                  borderRadius: '2mm',
                  padding: '4mm 3mm',
                  textAlign: 'center',
                  breakInside: 'avoid',
                }}
              >
                <div
                  style={{ width: '26mm', margin: '0 auto' }}
                  // Server-generated from an id this app owns; no user input
                  // reaches the encoder.
                  dangerouslySetInnerHTML={{ __html: label.svg }}
                />
                <p style={{ fontSize: '10pt', fontWeight: 700, margin: '2mm 0 0' }}>
                  {label.assetTag}
                </p>
                <p style={{ fontSize: '7pt', margin: '0.5mm 0 0', color: '#555' }}>
                  {AC_TYPE_LABEL[label.acType]}
                </p>
                {label.locationInBuilding && (
                  <p style={{ fontSize: '7pt', margin: '0.5mm 0 0', color: '#555' }}>
                    {label.locationInBuilding}
                  </p>
                )}
                <p style={{ fontSize: '6pt', margin: '1.5mm 0 0', color: '#777' }}>
                  สแกนดูประวัติเครื่อง · NBC Group
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
