#!/usr/bin/env node
/**
 * A filled-in work order, for checking what the printed document looks like.
 *
 *   npx tsx scripts/demo-work-order.ts
 *
 * Everything the print layout has to cope with is present on purpose: Thai
 * text long enough to wrap, a parts table with fewer rows filled than drawn,
 * an unanswered section, photographs, and two signatures — one that still
 * matches the payload and one that does not, so both states appear on the same
 * sheet.
 *
 * The images are generated rather than copied in. A photograph of the right
 * shape is what exercises `object-fit: cover` and the 32mm frame; a signature
 * on a transparent background is what proves the ruled line underneath it
 * still shows through.
 *
 * The payload hash is imported from the real module rather than reimplemented.
 * A second implementation would drift, and the day it drifted every signature
 * in the system would read as tampered.
 */
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';
import { payloadHash } from '../src/lib/forms/payload-hash.ts';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  /* env may come from the shell */
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// --------------------------------------------------------------------------
// A minimal PNG encoder. No dependency for four test images.
// --------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

type Pixel = (x: number, y: number) => [number, number, number, number];

function png(width: number, height: number, pixel: Pixel): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 4));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Ink on nothing — what a signature pad actually produces. */
function signaturePng(seed: number): Buffer {
  const w = 600;
  const h = 200;
  return png(w, h, (x, y) => {
    const t = (x / w) * Math.PI * 4 + seed;
    const baseline = h / 2 + Math.sin(t) * 42 + Math.sin(t * 2.7 + seed) * 18;
    const stroke = Math.abs(y - baseline);
    // A soft edge, so the printed result is not a jagged one-pixel line.
    if (stroke < 3) return [17, 24, 39, 255];
    if (stroke < 5) return [17, 24, 39, 120];
    return [0, 0, 0, 0];
  });
}

/** Stands in for a site photograph: landscape, busy enough to see cropping. */
function photoPng(hue: number): Buffer {
  const w = 480;
  const h = 360;
  return png(w, h, (x, y) => {
    const band = Math.floor((x + y) / 40) % 2;
    const v = 90 + band * 40 + Math.floor((y / h) * 60);
    const r = hue === 0 ? v + 60 : hue === 1 ? v : v - 20;
    const g = hue === 0 ? v : hue === 1 ? v + 40 : v;
    const b = hue === 0 ? v - 30 : hue === 1 ? v + 10 : v + 70;
    return [Math.min(255, r), Math.min(255, g), Math.min(255, b), 255];
  });
}

// --------------------------------------------------------------------------

const STORAGE_ROOT = path.resolve(process.env.STORAGE_LOCAL_DIR ?? './.storage');

function store(key: string, bytes: Buffer) {
  const target = path.join(STORAGE_ROOT, key);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return { key, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength };
}

async function main() {
  const job = await prisma.job.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, jobNo: true, customer: { select: { displayName: true } } },
  });
  if (!job) throw new Error('ไม่มีงานในระบบ — รัน scripts/demo-day.mjs ก่อน');

  const template = await prisma.formTemplate.findFirstOrThrow({
    where: { code: 'REPAIR', isActive: true },
    orderBy: { version: 'desc' },
  });

  const tech = await prisma.user.findFirstOrThrow({ where: { email: 'tech-001@nbcgroup.co.th' } });
  const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@nbcgroup.co.th' } });

  const docNo = `NBC-REP-2569-${String(Date.now()).slice(-5)}`;
  const workOrderId = `demo-print-${Date.now().toString(36)}`;
  const stamp = new Date();

  // --- media ---------------------------------------------------------------
  const photoKeys: string[] = [];
  const attachments: { key: string; sha: string; bytes: number; kind: 'BEFORE' | 'AFTER' | 'SIGNATURE' }[] = [];

  for (const [i, kind] of (['BEFORE', 'BEFORE', 'AFTER', 'AFTER'] as const).entries()) {
    const key = `202608/WorkOrder/${workOrderId}/${kind}/photo-${i + 1}.png`;
    const put = store(key, photoPng(i % 3));
    attachments.push({ key, sha: put.sha256, bytes: put.bytes, kind });
    photoKeys.push(key);
  }

  const custSigKey = `202608/WorkOrder/${workOrderId}/SIGNATURE/customer.png`;
  const techSigKey = `202608/WorkOrder/${workOrderId}/SIGNATURE/technician.png`;
  const custSig = store(custSigKey, signaturePng(0.4));
  const techSig = store(techSigKey, signaturePng(2.1));

  // A signature image needs an Attachment row of its own, not just bytes in
  // the bucket. /api/media refuses to serve any key it has no record of — the
  // rule that stops a guessable key being enough to read someone's photograph
  // — so writing the file alone produces a document with two empty signature
  // boxes. The real flow gets this for free by uploading through
  // /api/media/upload with kind=SIGNATURE; seeding directly has to do it.
  attachments.push({ key: custSigKey, sha: custSig.sha256, bytes: custSig.bytes, kind: 'SIGNATURE' });
  attachments.push({ key: techSigKey, sha: techSig.sha256, bytes: techSig.bytes, kind: 'SIGNATURE' });

  // --- payload -------------------------------------------------------------
  const payload = {
    customer: {
      customerName: job.customer.displayName,
      tel: '02-000-7332',
      address: '105/26 หมู่ 2 ตำบลละหาร อำเภอบางบัวทอง จังหวัดนนทบุรี 11110 (อาคารสำนักงานชั้น 3 ห้องเซิร์ฟเวอร์)',
      email: 'nbcservice@nbcgroup.co.th',
      contactTel: '096-648-8886',
    },
    acUnit: {
      brand: 'Daikin',
      model: 'FTKC24TV2S',
      btu: '24,000',
      serialNo: 'E014235A',
      location: 'ห้องประชุมใหญ่ ชั้น 3',
      acType: 'CASSETTE',
    },
    symptoms: {
      symptomList: ['NOT_COLD', 'NOISE', 'WATER_LEAK'],
      symptomOther: 'มีน้ำหยดบริเวณมุมซ้ายของหน้ากากเมื่อเปิดต่อเนื่องเกิน 2 ชั่วโมง',
    },
    parts: [
      { no: 1, description: 'ล้างคอยล์เย็นและถาดน้ำทิ้ง', qty: '1', unit: 'ชุด' },
      { no: 2, description: 'เปลี่ยนคาปาซิเตอร์คอมเพรสเซอร์ 35µF', qty: '1', unit: 'ตัว' },
      { no: 3, description: 'เติมน้ำยา R-32', qty: '2', unit: 'ปอนด์' },
    ],
    note: {
      noteText:
        'แนะนำให้ล้างเครื่องทุก 6 เดือน เนื่องจากติดตั้งใกล้ช่องลมกลับที่มีฝุ่นสะสมมาก\nนัดตรวจซ้ำอีกครั้งภายใน 30 วัน',
    },
    warranty: { warrantyRepairDays: 90, warrantyPartsDays: 180 },
    photosBefore: photoKeys.slice(0, 2),
    photosAfter: photoKeys.slice(2),
    inspectorSign: {
      inspectorName: 'คุณณัฐพงศ์ ชูตระกูลวงศ์',
      inspectorPosition: 'ผู้จัดการอาคาร',
      inspectorDate: '2026-08-19',
      inspectorSignature: custSigKey,
    },
    technicianSign: {
      technicianName: 'สมชาย ใจกล้า',
      technicianPosition: 'ช่างเทคนิคอาวุโส',
      technicianDate: '2026-08-19',
      technicianSignature: techSigKey,
    },
  };

  await prisma.workOrder.create({
    data: {
      id: workOrderId,
      jobId: job.id,
      templateId: template.id,
      templateCode: 'REPAIR',
      templateVersion: template.version,
      docNo,
      payload,
      status: 'SUBMITTED',
      submittedById: tech.id,
      submittedAt: stamp,
    },
  });

  await prisma.attachment.createMany({
    data: attachments.map((a, i) => ({
      entityType: 'WorkOrder',
      entityId: workOrderId,
      kind: a.kind,
      storageKey: a.key,
      mime: 'image/png',
      bytes: a.bytes,
      sha256: a.sha,
      sortOrder: i,
      uploadedById: tech.id,
    })),
  });

  // One signature covers the payload; the other was taken before an edit. Both
  // states have to be visible on the same printed page, because the warning
  // for the second is the thing that is easy to lose on the way to paper.
  const currentHash = await payloadHash(payload);
  await prisma.signature.createMany({
    data: [
      {
        workOrderId,
        signerRole: 'CUSTOMER',
        signerName: 'คุณณัฐพงศ์ ชูตระกูลวงศ์',
        signerPosition: 'ผู้จัดการอาคาร',
        storageKey: custSigKey,
        payloadHash: currentHash,
        signedAt: stamp,
      },
      {
        workOrderId,
        signerRole: 'TECHNICIAN',
        signerName: 'สมชาย ใจกล้า',
        signerPosition: 'ช่างเทคนิคอาวุโส',
        storageKey: techSigKey,
        payloadHash: 'deadbeef'.repeat(8),
        signedAt: stamp,
      },
    ],
  });

  // A photograph the office added after the fact — printed outside the form.
  const lateKey = `202608/WorkOrder/${workOrderId}/OTHER/late.png`;
  const late = store(lateKey, photoPng(2));
  await prisma.attachment.create({
    data: {
      entityType: 'WorkOrder',
      entityId: workOrderId,
      kind: 'OTHER',
      storageKey: lateKey,
      mime: 'image/png',
      bytes: late.bytes,
      sha256: late.sha256,
      uploadedById: admin.id,
      addedAfterSubmit: true,
      addedReason: 'ช่างลืมถ่ายรูปมิเตอร์ไฟก่อนเริ่มงาน ส่งตามมาภายหลัง',
    },
  });

  console.log(`สร้างแล้ว  ${docNo}  (${job.jobNo})`);
  console.log(`บนจอ      /work-orders/d/${workOrderId}`);
  console.log(`พิมพ์      /print/work-order/${workOrderId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
