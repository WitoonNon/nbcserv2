import { prisma } from './client.js';

/**
 * Inspection fee policy and approval thresholds.
 *
 * @client-confirm B1 — ฿500 is a placeholder matching their entry price point.
 * @client-confirm B3 — assumed credited in FULL when the customer proceeds.
 * @client-confirm B4 — no minimum job value assumed (0 = no gate).
 * @client-confirm B5 — waived entirely for contract customers, matching the
 *                      "free diagnostic checks for contract customers" promise
 *                      published on nbcgroup.co.th.
 */
export async function seedBilling() {
  const existing = await prisma.inspectionFeePolicy.findFirst({
    where: { name: 'นโยบายค่าเข้าตรวจเช็คมาตรฐาน' },
  });

  const data = {
    name: 'นโยบายค่าเข้าตรวจเช็คมาตรฐาน',
    category: null,
    zoneId: null,
    amount: 500,
    currency: 'THB',
    waiveForContractCustomer: true,
    creditOnProceed: true,
    creditMode: 'FULL' as const,
    creditValue: null,
    minJobValueForCredit: null,
    effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
    isActive: true,
  };

  if (existing) {
    await prisma.inspectionFeePolicy.update({ where: { id: existing.id }, data });
  } else {
    await prisma.inspectionFeePolicy.create({ data });
  }

  // @client-confirm F7 — who approves an on-site quotation and up to what value.
  await prisma.approvalPolicy.upsert({
    where: { code: 'ONSITE_QUOTATION' },
    create: {
      code: 'ONSITE_QUOTATION',
      description: 'อนุมัติใบเสนอราคาหน้างานเมื่อช่างพบงานเพิ่ม',
      maxAmountForTechnician: 2000,
      requiresRoleCode: 'SUPERVISOR',
    },
    update: {},
  });

  console.log('  billing: 1 inspection fee policy (฿500, credited in full, waived for contract), 1 approval policy');
}
