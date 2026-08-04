import { prisma } from './client.js';

/**
 * Inspection fee policy and approval thresholds — our design, since the client
 * delegated the decision.
 *
 *  ฿500          matches the price of cleaning one wall unit, so the amount
 *                reads as fair to a customer and credits back cleanly.
 *  FULL credit   simplest thing for a technician to explain on site.
 *  ฿1,000 floor  stops a ฿500 credit landing on a ฿600 job, which would leave
 *                the trip unprofitable.
 *  Waived for contract customers — matches the "free diagnostic checks for
 *                contract customers" promise published on nbcgroup.co.th.
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
    minJobValueForCredit: 1000,
    effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
    isActive: true,
  };

  if (existing) {
    await prisma.inspectionFeePolicy.update({ where: { id: existing.id }, data });
  } else {
    await prisma.inspectionFeePolicy.create({ data });
  }

  // Lead technician may approve small extras on site (capacitor swap, gas
  // top-up); anything larger waits for a supervisor.
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

  console.log('  billing: fee ฿500, credited in full on repairs ≥ ฿1,000, waived for contract customers');
}
