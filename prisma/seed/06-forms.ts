import { prisma } from './client.js';
import { FORM_TEMPLATES_V1, FORM_TEMPLATES_CURRENT } from '../../src/lib/forms/templates.js';
import type { FormSchema } from '../../src/lib/forms/types.js';
import type { FormCode } from '../../src/generated/prisma/index.js';

/**
 * The three work-order form templates (requirement #4).
 *
 * v1 is drafted from what NBC already publishes — their work-process page
 * specifies the measurements technicians record, and their troubleshooting
 * page lists the standard first checks. REPAIR v2 is built field-for-field
 * from the client's real SERVICE WORK ORDER.
 *
 * EVERY version is published, not just the newest: a work order stores the
 * version it was filled in against, so the row it points at has to keep
 * existing. Seeding only the current version would leave documents issued
 * against v1 unable to render at all.
 *
 * @client-confirm A1/A2 — the remaining two paper forms are still outstanding;
 * publishing them is inserting a row, not a migration.
 */
export async function seedForms() {
  const published = new Map<string, [FormCode, FormSchema]>();
  for (const set of [FORM_TEMPLATES_V1, FORM_TEMPLATES_CURRENT]) {
    for (const [code, schema] of Object.entries(set) as [FormCode, FormSchema][]) {
      published.set(`${code}:${schema.version}`, [code, schema]);
    }
  }

  for (const [code, schema] of published.values()) {
    await prisma.formTemplate.upsert({
      where: { code_version: { code, version: schema.version } },
      create: {
        code,
        version: schema.version,
        titleTh: schema.titleTh,
        titleEn: schema.titleEn ?? null,
        schema: schema as never,
        pdfTemplateKey: `pdf/${code.toLowerCase()}-v${schema.version}.html`,
        isActive: true,
      },
      update: {
        titleTh: schema.titleTh,
        schema: schema as never,
      },
    });
  }

  // Notification templates — bodies use {{placeholders}} resolved at send time.
  const notifications = [
    {
      code: 'JOB_CONFIRMED',
      bodyTh: 'NBC Group ยืนยันการรับงาน {{jobNo}} วันที่ {{scheduledDate}} ติดตามสถานะได้ที่ {{trackUrl}}',
    },
    {
      code: 'TECH_EN_ROUTE',
      bodyTh: 'ช่างกำลังเดินทางไปหน้างาน {{jobNo}} คาดว่าถึงเวลา {{eta}}',
    },
    {
      code: 'TECH_ON_SITE',
      bodyTh: 'ช่างถึงหน้างานแล้ว งาน {{jobNo}}',
    },
    {
      code: 'QUOTATION_SENT',
      bodyTh: 'NBC Group ส่งใบเสนอราคา {{quotationNo}} ยอด {{grandTotal}} บาท กดดูและอนุมัติได้ที่ {{quoteUrl}}',
    },
    {
      code: 'WORK_ORDER_READY',
      bodyTh: 'งาน {{jobNo}} เสร็จเรียบร้อย ดาวน์โหลดเอกสาร {{docNo}} ได้ที่ {{pdfUrl}}',
    },
  ];

  for (const n of notifications) {
    await prisma.notificationTemplate.upsert({
      where: { code: n.code },
      create: { code: n.code, channel: 'LINE', bodyTh: n.bodyTh },
      update: { bodyTh: n.bodyTh },
    });
  }

  const versions = [...published.values()].map(([c, s]) => `${c} v${s.version}`).join(', ');
  console.log(
    `  forms: ${published.size} form templates (${versions}), ${notifications.length} notification templates`,
  );
}
