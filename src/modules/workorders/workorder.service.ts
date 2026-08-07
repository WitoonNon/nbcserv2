import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { FormCode, Prisma, WorkOrderStatus } from '@/generated/prisma';
import { buildValidator, flattenFields, type FormSchema } from '@/lib/forms/types';
import { nextDocumentNo } from './sequence.service';

/**
 * Work-order lifecycle (Phase 2).
 *
 * DRAFT -> SUBMITTED -> APPROVED
 *                    -> RETURNED -> SUBMITTED
 *
 * Two rules hold this together:
 *
 * 1. The template version is frozen onto the work order at creation. A document
 *    issued in 2569 keeps rendering against the schema it was filled in with,
 *    even after the client sends their real paper form and v2 is published.
 *
 * 2. Validation runs against THAT frozen version, not the current one. A form
 *    that was valid when submitted must not become un-editable because a later
 *    version added a required field.
 */

export class WorkOrderError extends Error {}

export interface WorkOrderView {
  id: string;
  jobId: string;
  jobNo: string;
  docNo: string;
  templateCode: FormCode;
  templateVersion: number;
  schema: FormSchema;
  payload: Record<string, unknown>;
  status: WorkOrderStatus;
  returnReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  submittedByName: string | null;
  approvedByName: string | null;
  customerName: string;
  siteAddress: string;
  updatedAt: string;
}

/** The payload hash a signature binds itself to. */
export function payloadHash(payload: unknown): string {
  // Key order must not change the hash, or re-serialising an unchanged payload
  // would look like tampering.
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Open a draft work order against a job.
 *
 * Returns the existing draft when the job already has one of this form type —
 * a technician tapping "เปิดใบงาน" twice on a flaky connection must not burn a
 * document number or leave two half-filled forms behind.
 */
export async function createWorkOrder(params: {
  jobId: string;
  code: FormCode;
  actorId?: string | null;
}): Promise<{ workOrderId: string; docNo: string; reused: boolean }> {
  // The default 5s interactive-transaction budget is a local-network
  // assumption. This transaction takes a FOR UPDATE lock on the document
  // sequence and does four round trips to a database in another region; over a
  // pooled connection that alone can exceed 5s, and the failure looks like a
  // bug rather than latency.
  return prisma.$transaction(async (tx) => {
    const existing = await tx.workOrder.findFirst({
      where: { jobId: params.jobId, templateCode: params.code, status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return { workOrderId: existing.id, docNo: existing.docNo, reused: true };
    }

    const template = await tx.formTemplate.findFirst({
      where: { code: params.code, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!template) {
      throw new WorkOrderError(`ยังไม่ได้เผยแพร่แบบฟอร์ม ${params.code} — รัน npm run db:seed ก่อน`);
    }

    const job = await tx.job.findUnique({ where: { id: params.jobId }, select: { id: true } });
    if (!job) throw new WorkOrderError('ไม่พบงานที่ระบุ');

    const docNo = await nextDocumentNo(params.code, tx);

    const wo = await tx.workOrder.create({
      data: {
        jobId: params.jobId,
        templateId: template.id,
        templateCode: template.code,
        templateVersion: template.version,
        docNo,
        payload: {},
        status: 'DRAFT',
        submittedById: params.actorId ?? null,
      },
    });

    return { workOrderId: wo.id, docNo, reused: false };
  }, { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getWorkOrder(id: string): Promise<WorkOrderView | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      template: true,
      submittedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      job: {
        select: {
          jobNo: true,
          customer: { select: { displayName: true } },
          site: { select: { address: true } },
        },
      },
    },
  });
  if (!wo) return null;

  return {
    id: wo.id,
    jobId: wo.jobId,
    jobNo: wo.job.jobNo,
    docNo: wo.docNo,
    templateCode: wo.templateCode,
    templateVersion: wo.templateVersion,
    schema: wo.template.schema as unknown as FormSchema,
    payload: (wo.payload ?? {}) as Record<string, unknown>,
    status: wo.status,
    returnReason: wo.returnReason,
    submittedAt: wo.submittedAt?.toISOString() ?? null,
    approvedAt: wo.approvedAt?.toISOString() ?? null,
    submittedByName: wo.submittedBy?.name ?? null,
    approvedByName: wo.approvedBy?.name ?? null,
    customerName: wo.job.customer.displayName,
    siteAddress: wo.job.site?.address ?? '-',
    updatedAt: wo.updatedAt.toISOString(),
  };
}

export async function listWorkOrdersForJob(jobId: string) {
  return prisma.workOrder.findMany({
    where: { jobId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      docNo: true,
      templateCode: true,
      templateVersion: true,
      status: true,
      updatedAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** An approved document is evidence; editing it would rewrite what was signed. */
function assertEditable(status: WorkOrderStatus): void {
  if (status === 'APPROVED') {
    throw new WorkOrderError('ใบงานนี้อนุมัติแล้ว แก้ไขไม่ได้ — ต้องออกใบงานใหม่');
  }
  if (status === 'SUBMITTED') {
    throw new WorkOrderError('ใบงานนี้ส่งแล้ว รอหัวหน้างานตรวจ — หากต้องแก้ ให้หัวหน้างานตีกลับก่อน');
  }
}

/**
 * Save without validating.
 *
 * A technician on site fills the form across a whole visit; refusing to keep
 * half of it because a later field is still blank would lose real work. The
 * validation gate belongs at submit, not at save.
 */
export async function saveWorkOrderDraft(params: {
  workOrderId: string;
  payload: Record<string, unknown>;
  actorId?: string | null;
}): Promise<{ updatedAt: string }> {
  const wo = await prisma.workOrder.findUnique({
    where: { id: params.workOrderId },
    select: { status: true },
  });
  if (!wo) throw new WorkOrderError('ไม่พบใบงาน');
  assertEditable(wo.status);

  const saved = await prisma.workOrder.update({
    where: { id: params.workOrderId },
    data: {
      payload: params.payload as Prisma.InputJsonValue,
      ...(params.actorId ? { submittedById: params.actorId } : {}),
    },
    select: { updatedAt: true },
  });

  return { updatedAt: saved.updatedAt.toISOString() };
}

export interface SubmitResult {
  ok: boolean;
  /** Field key -> message, so the renderer can mark the offending inputs. */
  fieldErrors?: Record<string, string>;
}

/**
 * Validate against the frozen template version and move to SUBMITTED.
 *
 * The payload is saved even when validation fails — the technician's typing is
 * never the thing we throw away to report an error.
 */
export async function submitWorkOrder(params: {
  workOrderId: string;
  payload: Record<string, unknown>;
  actorId?: string | null;
}): Promise<SubmitResult> {
  const wo = await prisma.workOrder.findUnique({
    where: { id: params.workOrderId },
    include: { template: true },
  });
  if (!wo) throw new WorkOrderError('ไม่พบใบงาน');
  assertEditable(wo.status);

  const schema = wo.template.schema as unknown as FormSchema;
  const result = buildValidator(schema).safeParse(params.payload);

  if (!result.success) {
    await saveWorkOrderDraft(params);

    const labels = new Map(flattenFields(schema).map((f) => [f.key, f.labelTh]));
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (!key || fieldErrors[key]) continue;
      fieldErrors[key] = `${labels.get(key) ?? key}: ${issue.message}`;
    }
    return { ok: false, fieldErrors };
  }

  await prisma.workOrder.update({
    where: { id: params.workOrderId },
    data: {
      payload: params.payload as Prisma.InputJsonValue,
      status: 'SUBMITTED',
      submittedById: params.actorId ?? null,
      submittedAt: new Date(),
      // Clear the previous rejection so a resubmitted form does not keep
      // showing the reason it was returned last time.
      returnReason: null,
    },
  });

  return { ok: true };
}

export async function approveWorkOrder(params: {
  workOrderId: string;
  actorId: string;
}): Promise<void> {
  const wo = await prisma.workOrder.findUnique({
    where: { id: params.workOrderId },
    select: { status: true },
  });
  if (!wo) throw new WorkOrderError('ไม่พบใบงาน');
  if (wo.status !== 'SUBMITTED') {
    throw new WorkOrderError('อนุมัติได้เฉพาะใบงานที่ส่งมาแล้วเท่านั้น');
  }

  await prisma.workOrder.update({
    where: { id: params.workOrderId },
    data: { status: 'APPROVED', approvedById: params.actorId, approvedAt: new Date() },
  });
}

export async function returnWorkOrder(params: {
  workOrderId: string;
  reason: string;
  actorId: string;
}): Promise<void> {
  if (!params.reason.trim()) {
    throw new WorkOrderError('กรุณาระบุเหตุผลที่ตีกลับ — ช่างต้องรู้ว่าต้องแก้อะไร');
  }

  const wo = await prisma.workOrder.findUnique({
    where: { id: params.workOrderId },
    select: { status: true },
  });
  if (!wo) throw new WorkOrderError('ไม่พบใบงาน');
  if (wo.status !== 'SUBMITTED') {
    throw new WorkOrderError('ตีกลับได้เฉพาะใบงานที่ส่งมาแล้วเท่านั้น');
  }

  await prisma.workOrder.update({
    where: { id: params.workOrderId },
    data: {
      status: 'RETURNED',
      returnReason: params.reason.trim(),
      approvedById: params.actorId,
      approvedAt: null,
    },
  });
}
