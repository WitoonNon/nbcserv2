'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import type { CreditMode } from '@/generated/prisma';

export interface FeeState {
  error?: string;
  ok?: string;
}

/**
 * Updating the fee policy creates a NEW effective-dated row and closes the old
 * one, rather than editing in place. Charges already written keep pointing at
 * the policy that actually applied to them, so historical jobs stay explicable.
 */
export async function saveFeePolicyAction(_prev: FeeState, formData: FormData): Promise<FeeState> {
  const id = String(formData.get('id') ?? '');
  const amount = Number(formData.get('amount'));
  const creditMode = String(formData.get('creditMode') ?? 'FULL') as CreditMode;
  const creditValueRaw = String(formData.get('creditValue') ?? '').trim();
  const minJobRaw = String(formData.get('minJobValueForCredit') ?? '').trim();
  const waive = formData.get('waiveForContractCustomer') === 'on';
  const creditOnProceed = formData.get('creditOnProceed') === 'on';

  if (!Number.isFinite(amount) || amount < 0) {
    return { error: 'จำนวนเงินไม่ถูกต้อง' };
  }
  if ((creditMode === 'PARTIAL' || creditMode === 'CAPPED') && !creditValueRaw) {
    return { error: creditMode === 'PARTIAL' ? 'กรุณาระบุเปอร์เซ็นต์ที่หักคืน' : 'กรุณาระบุเพดานเงินที่หักคืน' };
  }

  try {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const current = id ? await tx.inspectionFeePolicy.findUnique({ where: { id } }) : null;

      if (current) {
        await tx.inspectionFeePolicy.update({
          where: { id: current.id },
          data: { effectiveTo: now, isActive: false },
        });
      }

      await tx.inspectionFeePolicy.create({
        data: {
          name: current?.name ?? 'นโยบายค่าเข้าตรวจเช็คมาตรฐาน',
          category: current?.category ?? null,
          zoneId: current?.zoneId ?? null,
          amount,
          waiveForContractCustomer: waive,
          creditOnProceed,
          creditMode,
          creditValue: creditValueRaw ? Number(creditValueRaw) : null,
          minJobValueForCredit: minJobRaw ? Number(minJobRaw) : null,
          effectiveFrom: now,
          isActive: true,
        },
      });

      // Keep the dashboard's assumption register in step, and mark the value as
      // confirmed now that a human has entered it deliberately.
      await tx.appConfig.updateMany({
        where: { key: 'inspection.fee.default' },
        data: { value: amount, isAssumption: false },
      });
      await tx.appConfig.updateMany({
        where: { key: 'inspection.fee.creditMode' },
        data: { value: creditMode, isAssumption: false },
      });
    });

    revalidatePath('/settings/fees');
    revalidatePath('/settings/assumptions');
    return { ok: 'บันทึกแล้ว — สร้างนโยบายเวอร์ชันใหม่ ของเดิมถูกปิดไว้เป็นประวัติ' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(msg)) {
      return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
    }
    return { error: msg };
  }
}

export async function saveApprovalPolicyAction(_prev: FeeState, formData: FormData): Promise<FeeState> {
  const maxAmount = Number(formData.get('maxAmountForTechnician'));
  if (!Number.isFinite(maxAmount) || maxAmount < 0) return { error: 'วงเงินไม่ถูกต้อง' };

  try {
    await prisma.approvalPolicy.updateMany({
      where: { code: 'ONSITE_QUOTATION' },
      data: { maxAmountForTechnician: maxAmount },
    });
    revalidatePath('/settings/fees');
    return { ok: 'บันทึกวงเงินอนุมัติแล้ว' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(msg)) {
      return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
    }
    return { error: msg };
  }
}
