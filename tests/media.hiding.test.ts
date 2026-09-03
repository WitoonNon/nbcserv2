import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  hideAttachment,
  listHiddenAttachments,
  listLateAttachments,
  MediaError,
  unhideAttachment,
} from '../src/modules/media/attachment.service';

/**
 * Hiding a photograph, and the two things that must never happen — Phase 3.6.
 *
 * The client asked to be able to remove a photo. This implements it as hiding
 * because the photographs are the company's evidence in a dispute: a row that
 * could vanish outright lets the other side argue the set was edited after
 * signing, and nothing left in the system could contradict them.
 *
 * So the tests below defend two floors. The file and row survive, and a work
 * order that passed inspection cannot be made to fail it retroactively by
 * hiding its last before/after photo.
 */

const ENTITY = 'WorkOrder';
let entityId: string;
let actor: { id: string; name: string };

async function makeAttachment(kind: 'BEFORE' | 'AFTER' | 'OTHER', over: Record<string, unknown> = {}) {
  return prisma.attachment.create({
    data: {
      entityType: ENTITY,
      entityId,
      kind,
      storageKey: `test/hide/${Math.random().toString(36).slice(2)}.jpg`,
      mime: 'image/jpeg',
      bytes: 1024,
      sha256: Math.random().toString(36).slice(2).padEnd(64, '0'),
      ...over,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  const user = await prisma.user.findFirstOrThrow({ select: { id: true, name: true } });
  actor = { id: user.id, name: user.name };
});

beforeEach(async () => {
  entityId = `wo-hide-${Math.random().toString(36).slice(2)}`;
});

afterAll(async () => {
  // Guarded: an unset filter matches every row in Prisma.
  await prisma.attachment.deleteMany({ where: { storageKey: { startsWith: 'test/hide/' } } });
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: 'attachment.' } } });
  await prisma.$disconnect();
});

describe('hiding', () => {
  it('keeps the row and the file, and records who and why', async () => {
    const a = await makeAttachment('OTHER');
    await hideAttachment({ attachmentId: a.id, actor, reason: 'ถ่ายผิดเครื่อง' });

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: a.id } });
    // Still here. Deleting would let somebody argue the set was edited after
    // signing, and nothing left could prove otherwise.
    expect(row.hiddenAt).not.toBeNull();
    expect(row.hiddenReason).toBe('ถ่ายผิดเครื่อง');
    expect(row.hiddenById).toBe(actor.id);
    expect(row.storageKey).toBeTruthy();
  });

  it('writes an audit entry', async () => {
    const a = await makeAttachment('OTHER');
    await hideAttachment({ attachmentId: a.id, actor, reason: 'ซ้ำกับรูปอื่น' });

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'Attachment', entityId: a.id, action: 'attachment.hide' },
    });
    expect(logs).toHaveLength(1);
  });

  it('refuses without a reason', async () => {
    const a = await makeAttachment('OTHER');
    // "Why is this photo gone" has to have an answer, and the day it gets
    // asked is the day nobody remembers.
    await expect(
      hideAttachment({ attachmentId: a.id, actor, reason: '   ' }),
    ).rejects.toBeInstanceOf(MediaError);
  });

  it('refuses to hide the same photo twice', async () => {
    const a = await makeAttachment('OTHER');
    await hideAttachment({ attachmentId: a.id, actor, reason: 'ครั้งแรก' });
    await expect(
      hideAttachment({ attachmentId: a.id, actor, reason: 'ครั้งที่สอง' }),
    ).rejects.toBeInstanceOf(MediaError);
  });
});

describe('the inspection floor', () => {
  it('refuses to hide the last BEFORE photo', async () => {
    const only = await makeAttachment('BEFORE');
    // A work order that passed inspection must not become one that
    // retroactively did not.
    await expect(
      hideAttachment({ attachmentId: only.id, actor, reason: 'เบลอ' }),
    ).rejects.toBeInstanceOf(MediaError);

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: only.id } });
    expect(row.hiddenAt).toBeNull();
  });

  it('allows it once a second one exists', async () => {
    const first = await makeAttachment('BEFORE');
    await makeAttachment('BEFORE');

    await hideAttachment({ attachmentId: first.id, actor, reason: 'เบลอ' });
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: first.id } });
    expect(row.hiddenAt).not.toBeNull();
  });

  it('counts each kind separately', async () => {
    await makeAttachment('BEFORE');
    const after = await makeAttachment('AFTER');

    // A spare BEFORE does not license hiding the only AFTER.
    await expect(
      hideAttachment({ attachmentId: after.id, actor, reason: 'ถ่ายซ้ำ' }),
    ).rejects.toBeInstanceOf(MediaError);
  });

  it('does not apply a floor to kinds the form does not require', async () => {
    const only = await makeAttachment('OTHER');
    await hideAttachment({ attachmentId: only.id, actor, reason: 'ไม่เกี่ยวกับงาน' });
    expect(
      (await prisma.attachment.findUniqueOrThrow({ where: { id: only.id } })).hiddenAt,
    ).not.toBeNull();
  });
});

describe('what the screens see', () => {
  it('drops a hidden photo out of the late-attachment list', async () => {
    const a = await makeAttachment('OTHER', {
      addedAfterSubmit: true,
      addedReason: 'ช่างลืมถ่าย',
    });
    expect(await listLateAttachments(entityId)).toHaveLength(1);

    await hideAttachment({ attachmentId: a.id, actor, reason: 'ผิดใบงาน' });
    // Hidden must not reappear on a document just because it was also late.
    expect(await listLateAttachments(entityId)).toHaveLength(0);
  });

  it('still lists it in the audit view with who and why', async () => {
    const a = await makeAttachment('OTHER');
    await hideAttachment({ attachmentId: a.id, actor, reason: 'ถ่ายผิดเครื่อง' });

    const [row] = await listHiddenAttachments(ENTITY, entityId);
    // Somebody holding a printed document with this photo on it has to be
    // able to be told what happened to it.
    expect(row!.id).toBe(a.id);
    expect(row!.hiddenReason).toBe('ถ่ายผิดเครื่อง');
    expect(row!.hiddenByName).toBe(actor.name);
  });
});

describe('restoring', () => {
  it('puts it back and audits that too', async () => {
    const a = await makeAttachment('OTHER');
    await hideAttachment({ attachmentId: a.id, actor, reason: 'พลาด' });
    await unhideAttachment({ attachmentId: a.id, actor });

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.hiddenAt).toBeNull();
    expect(row.hiddenReason).toBeNull();

    const logs = await prisma.auditLog.findMany({
      where: { entityId: a.id, action: 'attachment.unhide' },
    });
    expect(logs).toHaveLength(1);
  });

  it('refuses to restore one that is not hidden', async () => {
    const a = await makeAttachment('OTHER');
    await expect(unhideAttachment({ attachmentId: a.id, actor })).rejects.toBeInstanceOf(
      MediaError,
    );
  });
});
