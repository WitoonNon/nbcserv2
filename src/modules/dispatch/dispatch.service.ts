import { prisma } from '@/lib/db';
import { dateOnly } from '@/modules/scheduling/quota.service';
import { transitionJob } from '@/modules/jobs/status-machine';

/**
 * Dispatch board (Phase 1).
 *
 * Crews are the unit of dispatch, not individuals — cleaning is a 2-person job
 * and the lead technician owns work-order submission.
 *
 * Capacity is measured in technician-minutes, the same unit the quota engine
 * uses, so the board and the booking calendar can never disagree about what a
 * day can absorb.
 */

/** AC types that may only be worked by a certified crew. @client-confirm F3 */
const SKILL_BY_AC_TYPE: Record<string, string> = {
  CHILLER: 'CHILLER',
  AHU: 'AHU',
  VRV_VRF: 'VRF',
};

export interface BoardJob {
  id: string;
  jobNo: string;
  customerName: string;
  siteName: string;
  category: string;
  status: string;
  unitCount: number;
  estimatedMinutes: number;
  requiredSkills: string[];
  sequenceNo?: number;
}

export interface BoardCrew {
  id: string;
  code: string;
  name: string;
  leadName: string | null;
  memberCount: number;
  skills: string[];
  availableMinutes: number;
  bookedMinutes: number;
  jobs: BoardJob[];
}

export interface DispatchBoard {
  date: Date;
  unassigned: BoardJob[];
  crews: BoardCrew[];
}

function requiredSkillsOf(assets: { acTypeSnapshot: string | null }[]): string[] {
  const out = new Set<string>();
  for (const a of assets) {
    const skill = a.acTypeSnapshot ? SKILL_BY_AC_TYPE[a.acTypeSnapshot] : undefined;
    if (skill) out.add(skill);
  }
  return [...out];
}

export async function getBoard(date: Date): Promise<DispatchBoard> {
  const day = dateOnly(date);

  const jobs = await prisma.job.findMany({
    where: {
      OR: [{ scheduledDate: day }, { scheduledDate: null, requestedDate: day }],
      status: { notIn: ['CANCELLED', 'CLOSED'] },
    },
    include: {
      customer: true,
      site: true,
      assets: true,
      assignments: { where: { unassignedAt: null }, include: { crew: true } },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });

  const crews = await prisma.crew.findMany({
    where: { isActive: true },
    include: {
      lead: { include: { user: true } },
      members: {
        where: { validTo: null },
        include: { technician: { include: { skills: { include: { skill: true } }, shifts: true } } },
      },
    },
    orderBy: { code: 'asc' },
  });

  const toBoardJob = (j: (typeof jobs)[number], sequenceNo?: number): BoardJob => ({
    id: j.id,
    jobNo: j.jobNo,
    customerName: j.customer.displayName,
    siteName: j.site.name,
    category: j.category,
    status: j.status,
    unitCount: j.unitCount,
    estimatedMinutes: j.estimatedMinutes,
    requiredSkills: requiredSkillsOf(j.assets),
    sequenceNo,
  });

  const shifts = await prisma.technicianShift.findMany({ where: { workDate: day } });
  const minutesByTech = new Map(shifts.map((s) => [s.technicianId, s.availableMinutes]));

  const boardCrews: BoardCrew[] = crews.map((c) => {
    const crewJobs = jobs
      .filter((j) => j.assignments.some((a) => a.crewId === c.id))
      .map((j) => toBoardJob(j, j.assignments.find((a) => a.crewId === c.id)?.sequenceNo));

    const skills = new Set<string>();
    let availableMinutes = 0;
    for (const m of c.members) {
      for (const s of m.technician.skills) skills.add(s.skill.code);
      availableMinutes += minutesByTech.get(m.technicianId) ?? 0;
    }

    return {
      id: c.id,
      code: c.code,
      name: c.name,
      leadName: c.lead?.user.name ?? null,
      memberCount: c.members.length,
      skills: [...skills],
      availableMinutes,
      bookedMinutes: crewJobs.reduce((s, j) => s + j.estimatedMinutes, 0),
      jobs: crewJobs,
    };
  });

  return {
    date: day,
    unassigned: jobs.filter((j) => j.assignments.length === 0).map((j) => toBoardJob(j)),
    crews: boardCrews,
  };
}

export class SkillGateError extends Error {
  constructor(readonly missing: string[]) {
    super(`ทีมนี้ยังไม่มีช่างที่ผ่านการรับรอง: ${missing.join(', ')}`);
    this.name = 'SkillGateError';
  }
}

/**
 * Assign a job to a crew. Gated on certification — a Chiller job must never
 * land on a crew without a certified technician.
 *
 * `force` records an explicit override rather than silently allowing it.
 */
export async function assignJob(params: {
  jobId: string;
  crewId: string;
  actorId?: string | null;
  force?: boolean;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const job = await tx.job.findUniqueOrThrow({
      where: { id: params.jobId },
      include: { assets: true },
    });
    const crew = await tx.crew.findUniqueOrThrow({
      where: { id: params.crewId },
      include: {
        members: {
          where: { validTo: null },
          include: { technician: { include: { skills: { include: { skill: true } } } } },
        },
      },
    });

    const required = requiredSkillsOf(job.assets);
    if (required.length > 0 && !params.force) {
      const have = new Set(
        crew.members.flatMap((m) => m.technician.skills.map((s) => s.skill.code)),
      );
      const missing = required.filter((r) => !have.has(r));
      if (missing.length > 0) throw new SkillGateError(missing);
    }

    // Close any existing assignment before creating the new one.
    await tx.jobAssignment.updateMany({
      where: { jobId: params.jobId, unassignedAt: null },
      data: { unassignedAt: new Date() },
    });

    const count = await tx.jobAssignment.count({
      where: { crewId: params.crewId, unassignedAt: null },
    });

    await tx.jobAssignment.create({
      data: {
        jobId: params.jobId,
        crewId: params.crewId,
        assignedById: params.actorId ?? null,
        sequenceNo: count + 1,
      },
    });

    if (job.status === 'SUBMITTED' || job.status === 'SCHEDULED') {
      // SUBMITTED jobs have not been scheduled yet; move them through both steps.
      if (job.status === 'SUBMITTED') {
        await transitionJob({ jobId: job.id, to: 'SCHEDULED', actorId: params.actorId, actorRole: 'DISPATCHER' }, tx);
      }
      await transitionJob({ jobId: job.id, to: 'ASSIGNED', actorId: params.actorId, actorRole: 'DISPATCHER' }, tx);
    }
  });
}

export async function unassignJob(jobId: string, actorId?: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.jobAssignment.updateMany({
      where: { jobId, unassignedAt: null },
      data: { unassignedAt: new Date() },
    });
    const job = await tx.job.findUniqueOrThrow({ where: { id: jobId } });
    if (job.status === 'ASSIGNED') {
      await transitionJob({ jobId, to: 'SCHEDULED', actorId, actorRole: 'DISPATCHER' }, tx);
    }
  });
}
