# สถานะ ณ สิ้นเซสชัน — 31 ส.ค. 2569

> เขียนไว้ตอนย้ายแชท อ่านไฟล์นี้ก่อนทำอะไรต่อ
> รายละเอียดกติกาทั้งหมดอยู่ใน [`07-HANDOFF-2026-08-26.md`](07-HANDOFF-2026-08-26.md)

---

## 🔴 อ่านก่อน: มีงานค้างใน working tree ที่ยังไม่ commit

**~4,000 บรรทัด** ของโอที · ลา · เงินเดือน อยู่ในเครื่องเฉย ๆ ยังไม่ commit
(ผู้ใช้สั่งว่า *"ทำเสร็จยังไม่ต้อง Push"*)

```bash
git status --short     # ดูว่ายังอยู่ครบไหม
```

ถ้ายังอยู่ **commit ไว้ก่อนเป็นอย่างแรก** — ไม่ต้อง push ก็ได้ แต่ commit ในเครื่อง
ทำให้ของไม่หาย และย้อนได้ด้วย `git reset --soft HEAD~1` ถ้าไม่ชอบ

ไฟล์ที่ยังไม่ commit:

```
prisma/schema/hr.prisma            (+ OvertimeRequest, LeaveRequest, PayrollPeriod, PayrollLine)
prisma/schema/identity.prisma      (back-relations)
prisma/migrations/20260831100000_overtime_leave_payroll/
src/modules/hr/payroll-rules.ts    ← pure · 25 เทสต์ผ่าน
src/modules/hr/leave-rules.ts      ← pure · 19 เทสต์ผ่าน
src/modules/hr/overtime.service.ts
src/modules/hr/leave.service.ts
src/modules/hr/payroll.service.ts
src/app/(staff)/payroll/page.tsx + actions.ts
src/app/(staff)/timesheet/page.tsx + request-actions.ts
src/components/hr/PayrollControls.tsx, DecideRequest.tsx
tests/hr.payroll-rules.test.ts, hr.leave-rules.test.ts, hr.payroll.test.ts
docs/07-HANDOFF-2026-08-26.md
```

> `prisma/schema/{_base,catalog,dispatch,media}.prisma` ขึ้น M ด้วย แต่เป็นแค่
> line-ending จาก `prisma format` — เนื้อหาไม่เปลี่ยน (`git diff --stat` ไม่นับ)

---

## 🔴 ฐานข้อมูลต่อไม่ได้ — บล็อกทุกอย่าง

```
DATABASE_URL → postgres.zjcidjfmgnjjkqwiotnk@aws-0-ap-southeast-1.pooler.supabase.com
→ FATAL: (ENOTFOUND) tenant/user not found
```

**`zjcidjfmgnjjkqwiotnk.supabase.co` ไม่มีอยู่ใน DNS แล้ว** (ยืนยันกับ 8.8.8.8 ไม่ใช่ปัญหาเน็ตในเครื่อง)
แต่ **production ที่ nbcserv.vercel.app ยังทำงานปกติ** → ชี้ไปฐานข้อมูลคนละตัวแล้ว

**ต้องขอ `DATABASE_URL` ตัวใหม่** จากคนที่ย้าย · และเช็คว่า `FIELD_ENCRYPTION_KEY`
ยังคู่กับฐานข้อมูลใหม่ไหม (ถ้าไม่ ข้อมูลพนักงานที่เข้ารหัสไว้จะอ่านไม่ออก)

**ผลกระทบ:** เทสต์ที่ยิง DB รันไม่ได้เลย · migrate ไม่ได้ · seed ไม่ได้

---

## เทสต์ที่รันได้ตอนนี้ — 134/134 ผ่าน

```bash
npx vitest run tests/hr.payroll-rules.test.ts tests/hr.leave-rules.test.ts \
  tests/hr.geofence.test.ts tests/hr.timeclock-token.test.ts \
  tests/scheduling.pm-planner.test.ts tests/offline.outbox.test.ts \
  tests/offline.contracts.test.ts tests/media.exif.test.ts
```

`npx tsc --noEmit` ผ่าน · `npm run build` ผ่าน

### 🔴 เทสต์ที่เขียนแล้วแต่ยังไม่เคยรัน — ต้องรันทันทีที่ได้ DB

| ไฟล์ | จำนวน | ของฟีเจอร์ |
|---|---|---|
| `tests/scheduling.pm.test.ts` | 13 | นัด PM อัตโนมัติ (3.4) |
| `tests/hr.timeclock.test.ts` | 17 | ลงเวลา QR+GPS |
| `tests/hr.payroll.test.ts` | 24 | โอที · ลา · เงินเดือน |

```bash
npx prisma migrate deploy && npx vitest run
```

---

## เซสชันนี้ทำอะไรไป

| commit | เรื่อง | push แล้ว |
|---|---|---|
| `4ddc26c` | 3.4 นัด PM อัตโนมัติ | ✅ |
| `714add4` | ลงเวลา QR+GPS — แกน | ✅ |
| `916e51c` | ลงเวลา — หน้าจอ + แก้พิกัดที่ผิด 4.8 กม. | ✅ |
| *(ยังไม่ commit)* | โอที · ลา · เงินเดือน | ❌ |

push ไปทั้ง `origin` (nbcserv) และ `nbcserv2` แล้วทั้ง 3 commit

---

## ⚠️ 4 เรื่องที่ต้องถาม/ทำ ไม่ใช่เรื่องโค้ด

1. 🔴 **สิทธิ์ Google Search Console — มีเดดไลน์** สัญญาผู้ดูแลเดิมสิ้นสุดสิ้นเดือน
   ถ้าเลยกำหนดเสียข้อมูลย้อนหลัง 16 เดือนถาวร (จากเอกสาร 07 ข้อ 9)
2. 🔴 **พิกัดจุดลงเวลา** — ค่าใน DB จริงยังผิดอยู่ 4.8 กม. seed แก้แล้วแต่ seed ไม่เขียนทับค่าเดิม
   **ต้องไปแก้เองที่ `/settings/assumptions`** เป็น `13.9391592 / 100.4379344`
   และยังไม่รู้ว่าจุดสแกนคือ 74/1 หมู่ 3 หรือ 105/26 หมู่ 2 (ห่างกัน 1.4 กม.)
3. 🟡 **ม.62 โอทีวันหยุด** — โค้ดใช้ 2 เท่าเท่ากันหมด กฎหมายกำหนด 1 เท่าสำหรับรายเดือน
   **ไม่ผิดกฎหมาย แต่จ่ายรายเดือนเกินที่บังคับ** ควรเป็นการตัดสินใจ
4. 🟡 **ประกันสังคม + ภาษี** ยังไม่ได้อัตรา — ยอดสุทธิที่แสดงยังไม่หัก

---

## บทเรียนที่เสียเวลาไปแล้วในเซสชันนี้

- **อย่าใช้ PowerShell แก้ไฟล์ที่มีภาษาไทย** — `Get-Content -Raw` + `Set-Content` บน PS 5.1
  อ่าน UTF-8 เป็น ANSI แล้วเขียนกลับ **พังทั้งไฟล์** เกิดขึ้น 2 ครั้ง (docs และ .tsx)
  ใช้ Edit/Write เท่านั้น · ตรวจด้วย `Select-String -Pattern 'à¸'`
- **generate migration ได้โดยไม่ต้องมี DB** — ดึง schema เดิมจาก git ด้วย **bash**
  (ไม่ใช่ PowerShell ไม่งั้น encoding พัง) แล้ว
  `npx prisma migrate diff --from-schema <tmp> --to-schema prisma/schema --script`
- **`npm install` หลัง pull ทุกครั้ง** — typecheck พังเพราะ `@ant-design/plots` ยังไม่ได้ลง
  แล้วเสียเวลาไล่หาว่าโค้ดใครผิด

---

## ทำอะไรต่อ

**ถ้าได้ `DATABASE_URL` แล้ว:** `npx prisma migrate deploy` → `npx vitest run` → แก้ที่พัง

**ถ้ายังไม่ได้:** งานที่เหลือเขียนได้แต่ตรวจไม่ได้ ตัวเลือกที่เหลือ

- หน้าให้พนักงานยื่นขอโอที/ลาเอง (service พร้อมแล้ว)
- สลิปเงินเดือน PDF (เครื่องมือพร้อมจาก 2.4 · ออกได้เฉพาะงวดที่ปิดแล้ว)
- 3.2 รายงาน · 3.3 เชื่อมเว็บเดิม · 3.6 แอดมินแก้รูป (3.3/3.6 ผู้ใช้ยกให้อีกคนทำ)
