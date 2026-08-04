import { prisma, utcDate } from './client.js';
import { hashPassword } from './02-rbac.js';
import type { AcType } from '../../src/generated/prisma/index.js';

/**
 * Demo operational data so every screen has something realistic to render.
 *
 * Shaped after NBC's actual customer mix (factories, hotels, offices,
 * residential) rather than generic "Acme Corp" filler.
 *
 * @client-confirm E1 — replaced wholesale once the client's real customer data
 * arrives. Nothing here is referenced by application code.
 */

const TECHNICIANS = [
  { code: 'TECH-001', name: 'ช่างสมศักดิ์ ใจดี', nickname: 'ศักดิ์', level: 3, skills: ['CHILLER', 'VRF', 'ELECTRICAL'] },
  { code: 'TECH-002', name: 'ช่างวิรัตน์ มั่นคง', nickname: 'รัตน์', level: 2, skills: ['VRF', 'ELECTRICAL'] },
  { code: 'TECH-003', name: 'ช่างประยุทธ์ ตั้งใจ', nickname: 'ยุทธ', level: 2, skills: ['AHU', 'HIGH_WORK'] },
  { code: 'TECH-004', name: 'ช่างนพดล ขยัน', nickname: 'ดล', level: 1, skills: [] },
  { code: 'TECH-005', name: 'ช่างอนุชา พากเพียร', nickname: 'ชา', level: 1, skills: [] },
  { code: 'TECH-006', name: 'ช่างธีระ รอบคอบ', nickname: 'ระ', level: 1, skills: ['HIGH_WORK'] },
];

const SKILLS = [
  { code: 'CHILLER', nameTh: 'งานระบบ Chiller', nameEn: 'Chiller systems' },
  { code: 'VRF', nameTh: 'งานระบบ VRV/VRF', nameEn: 'VRV/VRF systems' },
  { code: 'AHU', nameTh: 'งานระบบ AHU', nameEn: 'AHU systems' },
  { code: 'ELECTRICAL', nameTh: 'งานไฟฟ้าควบคุม', nameEn: 'Electrical & controls' },
  { code: 'HIGH_WORK', nameTh: 'งานที่สูง', nameEn: 'Work at height' },
];

export async function seedDemo() {
  const zone = await prisma.zone.findUniqueOrThrow({ where: { code: 'BKK-METRO' } });

  // --- skills -------------------------------------------------------------
  for (const s of SKILLS) {
    await prisma.skill.upsert({ where: { code: s.code }, create: s, update: {} });
  }

  // --- technicians --------------------------------------------------------
  const devHash = hashPassword('nbc-dev-1234');
  const techRole = await prisma.role.findUniqueOrThrow({ where: { code: 'TECHNICIAN' } });

  for (const t of TECHNICIANS) {
    const email = `${t.code.toLowerCase()}@nbcgroup.co.th`;
    // Demo technicians share the README's published dev password, so they are
    // exempt from the first-login change the same way the office accounts are.
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: t.name, passwordHash: devHash, mustChangePassword: false },
      update: { name: t.name, mustChangePassword: false },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: techRole.id } },
      create: { userId: user.id, roleId: techRole.id },
      update: {},
    });
    const tech = await prisma.technician.upsert({
      where: { employeeCode: t.code },
      create: {
        userId: user.id,
        employeeCode: t.code,
        nickname: t.nickname,
        level: t.level,
        zoneId: zone.id,
      },
      update: { nickname: t.nickname, level: t.level },
    });
    for (const skillCode of t.skills) {
      const skill = await prisma.skill.findUniqueOrThrow({ where: { code: skillCode } });
      await prisma.technicianSkill.upsert({
        where: { technicianId_skillId: { technicianId: tech.id, skillId: skill.id } },
        create: { technicianId: tech.id, skillId: skill.id, certifiedAt: utcDate(2024, 1, 1) },
        update: {},
      });
    }
  }

  // --- crews (2 technicians each, per the assumed cleaning crew size) ------
  const allTechs = await prisma.technician.findMany({ orderBy: { employeeCode: 'asc' } });
  const crewPlan = [
    { code: 'CREW-A', name: 'ทีม A', members: ['TECH-001', 'TECH-004'] },
    { code: 'CREW-B', name: 'ทีม B', members: ['TECH-002', 'TECH-005'] },
    { code: 'CREW-C', name: 'ทีม C', members: ['TECH-003', 'TECH-006'] },
  ];

  for (const c of crewPlan) {
    const lead = allTechs.find((t) => t.employeeCode === c.members[0]);
    const crew = await prisma.crew.upsert({
      where: { code: c.code },
      create: { code: c.code, name: c.name, zoneId: zone.id, leadTechnicianId: lead?.id ?? null },
      update: { name: c.name, leadTechnicianId: lead?.id ?? null },
    });
    for (const code of c.members) {
      const tech = allTechs.find((t) => t.employeeCode === code);
      if (!tech) continue;
      const exists = await prisma.crewMember.findFirst({
        where: { crewId: crew.id, technicianId: tech.id, validTo: null },
      });
      if (!exists) {
        await prisma.crewMember.create({ data: { crewId: crew.id, technicianId: tech.id } });
      }
    }
  }

  // --- shifts for the next 21 days (Mon–Sat 08:00–17:00) ------------------
  let shiftCount = 0;
  const today = new Date();
  for (let i = 0; i < 21; i += 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
    if (d.getUTCDay() === 0) continue; // Sunday off
    for (const tech of allTechs) {
      await prisma.technicianShift.upsert({
        where: { technicianId_workDate: { technicianId: tech.id, workDate: d } },
        create: {
          technicianId: tech.id,
          workDate: d,
          startAt: new Date(d.getTime() + 8 * 3600_000),
          endAt: new Date(d.getTime() + 17 * 3600_000),
          availableMinutes: 420,
        },
        update: {},
      });
      shiftCount += 1;
    }
  }

  // --- customers ----------------------------------------------------------
  const factory = await prisma.customer.upsert({
    where: { code: 'CUS-00001' },
    create: {
      code: 'CUS-00001',
      type: 'CORPORATE',
      legalName: 'บริษัท ตัวอย่างอุตสาหกรรม จำกัด',
      displayName: 'ตัวอย่างอุตสาหกรรม',
      taxId: '0105500000001',
      segment: 'FACTORY',
      defaultPricingTier: 'CONTRACT',
      phone: '02-123-4567',
      email: 'maintenance@example-factory.co.th',
      billingAddress: '88 หมู่ 5 ต.บางกระดี อ.เมือง จ.ปทุมธานี 12000',
    },
    update: {},
  });

  const hotel = await prisma.customer.upsert({
    where: { code: 'CUS-00002' },
    create: {
      code: 'CUS-00002',
      type: 'CORPORATE',
      legalName: 'บริษัท ตัวอย่างโรงแรม จำกัด',
      displayName: 'โรงแรมตัวอย่าง สุขุมวิท',
      segment: 'HOTEL',
      defaultPricingTier: 'CONTRACT',
      phone: '02-234-5678',
    },
    update: {},
  });

  const individual = await prisma.customer.upsert({
    where: { code: 'CUS-00003' },
    create: {
      code: 'CUS-00003',
      type: 'INDIVIDUAL',
      legalName: 'คุณสมหมาย รักบ้าน',
      displayName: 'คุณสมหมาย',
      segment: 'RESIDENTIAL',
      defaultPricingTier: 'STANDARD',
      phone: '081-234-5678',
    },
    update: {},
  });

  // --- sites --------------------------------------------------------------
  const siteSpecs = [
    { customer: factory, code: 'SITE-001', name: 'โรงงานหลัก (โซนผลิต)', address: '88 หมู่ 5 ต.บางกระดี อ.เมือง จ.ปทุมธานี', province: 'ปทุมธานี', pm: 3 },
    { customer: factory, code: 'SITE-002', name: 'อาคารสำนักงาน', address: '88 หมู่ 5 ต.บางกระดี อ.เมือง จ.ปทุมธานี', province: 'ปทุมธานี', pm: 2 },
    { customer: hotel, code: 'SITE-001', name: 'อาคารโรงแรม สุขุมวิท 24', address: '24 ถ.สุขุมวิท คลองเตย กรุงเทพฯ', province: 'กรุงเทพมหานคร', pm: 4 },
    { customer: individual, code: 'SITE-001', name: 'บ้านพักอาศัย', address: '15/2 ซ.รัตนาธิเบศร์ 18 อ.เมือง จ.นนทบุรี', province: 'นนทบุรี', pm: 2 },
  ];

  const assetPlan: { acType: AcType; btu: number; count: number }[] = [
    { acType: 'CASSETTE_4WAY', btu: 48000, count: 6 },
    { acType: 'CEILING', btu: 36000, count: 4 },
    { acType: 'WALL', btu: 18000, count: 5 },
    { acType: 'CONCEALED_LARGE', btu: 60000, count: 2 },
  ];

  let assetCount = 0;
  for (const spec of siteSpecs) {
    const site = await prisma.customerSite.upsert({
      where: { customerId_code: { customerId: spec.customer.id, code: spec.code } },
      create: {
        customerId: spec.customer.id,
        code: spec.code,
        name: spec.name,
        address: spec.address,
        province: spec.province,
        zoneId: zone.id,
      },
      update: { name: spec.name },
    });

    await prisma.customerContact.upsert({
      where: { id: `${site.id}-primary` },
      create: {
        id: `${site.id}-primary`,
        customerId: spec.customer.id,
        siteId: site.id,
        name: spec.customer.type === 'INDIVIDUAL' ? spec.customer.displayName : 'ฝ่ายอาคาร',
        phone: spec.customer.phone,
        isPrimary: true,
      },
      update: {},
    });

    // Residential sites get a couple of wall units; commercial sites get the mix.
    const plan = spec.customer.type === 'INDIVIDUAL' ? [{ acType: 'WALL' as AcType, btu: 12000, count: 3 }] : assetPlan;

    for (const p of plan) {
      for (let i = 1; i <= p.count; i += 1) {
        const tag = `${p.acType}-${String(i).padStart(3, '0')}`;
        await prisma.asset.upsert({
          where: { siteId_assetTag: { siteId: site.id, assetTag: tag } },
          create: {
            siteId: site.id,
            assetTag: tag,
            acType: p.acType,
            btu: p.btu,
            brand: ['Daikin', 'Mitsubishi', 'Carrier', 'Trane'][i % 4],
            refrigerant: p.btu > 40000 ? 'R410A' : 'R32',
            locationInBuilding: `ชั้น ${Math.ceil(i / 2)}`,
            pmFrequencyPerYear: spec.pm,
            installedAt: utcDate(2022, ((i % 12) + 1), 15),
          },
          update: {},
        });
        assetCount += 1;
      }
    }
  }

  // --- contracts ----------------------------------------------------------
  for (const [i, customer] of [factory, hotel].entries()) {
    const contractNo = `NBC-CT-2569-${String(i + 1).padStart(4, '0')}`;
    const contract = await prisma.contract.upsert({
      where: { contractNo },
      create: {
        customerId: customer.id,
        contractNo,
        type: 'ANNUAL',
        status: 'ACTIVE',
        startsOn: utcDate(2026, 1, 1),
        endsOn: utcDate(2026, 12, 31),
        pricingTier: 'CONTRACT',
        inspectionFeeWaived: true,
        includedPmVisitsPerYear: customer.segment === 'HOTEL' ? 4 : 3,
        slaResponseHours: 24,
      },
      update: {},
    });
    const sites = await prisma.customerSite.findMany({ where: { customerId: customer.id } });
    for (const s of sites) {
      await prisma.contractSite.upsert({
        where: { contractId_siteId: { contractId: contract.id, siteId: s.id } },
        create: { contractId: contract.id, siteId: s.id },
        update: {},
      });
    }
  }

  // --- keep document sequences ahead of the seeded rows --------------------
  // The demo customers above use hardcoded codes (CUS-00001..3). Without this
  // the CUSTOMER counter still reads 0, so the first phone-in intake would
  // mint CUS-00001 again and fail on the unique constraint.
  const customers = await prisma.customer.findMany({ select: { code: true } });
  const highest = customers.reduce((max, c) => {
    const n = Number(c.code.replace(/\D/g, ''));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const seq = await prisma.documentSequence.findUnique({ where: { code: 'CUSTOMER' } });
  if (seq && seq.currentValue < highest) {
    await prisma.documentSequence.update({
      where: { code: 'CUSTOMER' },
      data: { currentValue: highest },
    });
  }

  console.log(
    `  demo: ${TECHNICIANS.length} technicians, ${crewPlan.length} crews, ${shiftCount} shifts, ` +
      `3 customers, ${siteSpecs.length} sites, ${assetCount} assets, 2 contracts ` +
      `(CUSTOMER sequence advanced to ${highest})`,
  );
}
