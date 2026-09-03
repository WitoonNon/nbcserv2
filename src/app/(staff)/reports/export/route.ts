import { requirePermission } from '@/lib/auth/guard';
import { loadReports } from '@/modules/reports/reports.service';

export const dynamic = 'force-dynamic';

/**
 * The reports as a spreadsheet — ใบเสนอราคาข้อ 6, "Export Excel".
 *
 * CSV rather than a real .xlsx, and the trade-off is deliberate: Excel opens
 * CSV natively, it needs no library in the bundle, and the thing the office
 * does with this file is paste it into their own workbook. A generated .xlsx
 * would add a dependency to produce a file that gets its formatting thrown
 * away anyway.
 *
 * ## The BOM is not optional
 *
 * Excel on Windows reads a CSV as the system ANSI codepage unless the file
 * opens with a UTF-8 byte-order mark. Without it every Thai column in this
 * export arrives as mojibake — the same class of bug that has already eaten
 * two files in this repository through PowerShell.
 */

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // A customer name with a comma in it would otherwise silently shift every
  // column after it by one.
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function section(title: string, headers: string[], rows: unknown[][]): string {
  const lines = [title, headers.join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  lines.push('');
  return lines.join('\r\n');
}

function parseDate(value: string | null, fallback: Date): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export async function GET(req: Request) {
  await requirePermission('report.read', '/reports');

  const url = new URL(req.url);
  const today = new Date();
  const to = parseDate(url.searchParams.get('to'), today);
  const from = parseDate(
    url.searchParams.get('from'),
    new Date(to.getTime() - 89 * 86_400_000),
  );

  const b = await loadReports({ from, to });
  const stamp = (d: Date) => d.toISOString().slice(0, 10);

  const body =
    section(`รายงาน ${stamp(from)} ถึง ${stamp(to)}`, [], []) +
    section('รายได้แยกตามประเภทงาน', ['ประเภท', 'จำนวนงาน', 'ยอดรวม'],
      b.revenueByCategory.map((r) => [r.labelTh, r.jobs, r.amount])) +
    section('รายได้แยกตามเขต', ['เขต', 'จำนวนงาน', 'ยอดรวม'],
      b.revenueByZone.map((r) => [r.labelTh, r.jobs, r.amount])) +
    section('อัตราการใช้โควตา',
      ['เขต', 'ประเภท', 'จำนวนวัน', 'วันที่เต็ม', 'ความจุ(งาน)', 'ใช้ไป(งาน)', 'ใช้ไป(%)'],
      b.quota.map((r) => [
        r.zoneName, r.categoryLabelTh, r.days, r.fullDays,
        r.capacityJobs, r.usedJobs,
        // Blank, not 0 — no capacity configured is unknown, not empty.
        r.utilisation ?? '',
      ])) +
    section('ผลงานทีมช่าง', ['ทีม', 'งานทั้งหมด', 'ปิดงาน', 'เวลาเฉลี่ย(นาที)', 'เปิดซ้ำ'],
      b.crews.map((r) => [r.crewName, r.jobs, r.closed, r.avgMinutes ?? '', r.reopened])) +
    section('อะไหล่ที่ใช้บ่อย', ['อะไหล่', 'จำนวน', 'มูลค่า', 'จำนวนงาน'],
      b.parts.map((r) => [r.name, r.qty, r.amount, r.jobs])) +
    section('ลูกค้าที่เรียกซ้ำ (งานซ่อม)', ['ลูกค้า', 'หน้างาน', 'จำนวนครั้ง', 'ครั้งล่าสุด'],
      b.repeats.map((r) => [
        r.customerName, r.siteName ?? '', r.jobs, stamp(r.lastJobOn),
      ]));

  return new Response(`﻿${body}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nbc-reports-${stamp(from)}_${stamp(to)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
