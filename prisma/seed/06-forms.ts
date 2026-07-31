import { prisma } from './client.js';
import { FORM_TEMPLATES_V1 } from '../../src/lib/forms/templates.js';
import type { FormCode } from '../../src/generated/prisma/index.js';

/**
 * The three work-order form templates (requirement #4).
 *
 * v1 is drafted from what NBC already publishes — their work-process page
 * specifies the measurements technicians record, and their troubleshooting
 * page lists the standard first checks.
 *
 * @client-confirm A1/A2/A3 — when the real paper forms arrive we publish
 * version 2. Every work order already issued keeps rendering against v1
 * because templateVersion is stored on the work order itself.
 */
export async function seedForms() {
  const entries = Object.entries(FORM_TEMPLATES_V1) as [FormCode, (typeof FORM_TEMPLATES_V1)[keyof typeof FORM_TEMPLATES_V1]][];

  for (const [code, schema] of entries) {
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

  console.log(`  forms: ${entries.length} form templates v1, ${notifications.length} notification templates`);
}
