# NBC Group Service Management — Skeleton Build Plan
## Phase 0: Architecture, Schema & Vertical Slice

**Status:** awaiting go-ahead
**Principle:** every unanswered client question becomes a **database row or a config record — never a hardcoded constant.**

---

## 1. The flexibility strategy

The client's answers are outstanding, so the skeleton is designed so that each open question has a
pre-built socket waiting for it. Nothing on the list below requires a schema migration or a code
change to resolve later — only a data update or a seed edit.

| Open question (from Blueprint §5) | Socket built now | How it plugs in later |
|---|---|---|
| Inspection fee amount & credit rule | `InspectionFeePolicy` table + `FeePolicyResolver` service | Update a row; policies are date-versioned |
| The 3 form layouts | `FormTemplate.schema` (JSONB) + dynamic renderer | Publish template v2 from the real paper form |
| Document number format | `DocumentSequence.format` (pattern string) | Change the pattern string |
| Buddhist vs Christian era | `AppConfig.date_era` | Flip a config value |
| Quota scoped per zone? | `zone_id` present on all quota tables, seeded with one default zone | Insert more zones |
| Quota unit (jobs / units / minutes) | All three limits nullable — `NULL` = unlimited | Set the limits actually wanted |
| Multi-unit jobs | `JobAsset` join table from day one | Already correct either way |
| Customer auth method | Auth.js provider array + `CustomerIdentity` table | Add the LINE provider, keep OTP |
| Pricing & tiers | `ServiceCatalogItem` with validity windows + 2 price columns | Insert a new price version |
| Approval thresholds | `ApprovalPolicy` table | Update a row |
| Storage / hosting target | `StorageAdapter` port (local ⇄ R2 ⇄ S3) | Swap an env var |
| Notification channels | `NotificationChannel` port (console ⇄ LINE ⇄ email) | Register the real adapter |
| Language coverage | `next-intl` with `th` + `en` catalogs from the start | Fill in strings |

**Rule adopted for the codebase:** any value assumed rather than confirmed is tagged
`// @client-confirm: <blueprint question #>` in seed files, so a single grep produces the
complete list of things to revisit when answers arrive.

---

## 2. Repository & module structure

A **modular monolith** — clear domain boundaries, single deployable. Modules can later be
extracted to services without rework, but we do not pay distributed-systems cost on day one.

```
D:\Work\Fix\
├─ docs/                         Blueprint, this plan, client checklist, decisions log
├─ prisma/
│  ├─ schema/                    Multi-file schema, one file per module
│  │  ├─ _base.prisma            datasource, generator, shared enums
│  │  ├─ identity.prisma
│  │  ├─ customers.prisma
│  │  ├─ contracts.prisma
│  │  ├─ catalog.prisma
│  │  ├─ scheduling.prisma
│  │  ├─ jobs.prisma
│  │  ├─ dispatch.prisma
│  │  ├─ workorders.prisma
│  │  ├─ billing.prisma
│  │  ├─ media.prisma
│  │  ├─ notifications.prisma
│  │  └─ platform.prisma
│  ├─ migrations/
│  └─ seed/                      Real NBC price list, durations, 3 draft form templates
├─ src/
│  ├─ app/
│  │  ├─ (staff)/                Admin · dispatcher · supervisor console (desktop-first)
│  │  ├─ (tech)/                 Technician PWA (mobile-first, offline)
│  │  ├─ (portal)/               Customer portal (mobile-first)
│  │  └─ api/                    Route handlers + webhooks
│  ├─ modules/                   ← the real domain logic, mirrors prisma/schema
│  │  └─ <module>/{ service, repository, schema (zod), types, __tests__ }
│  ├─ lib/
│  │  ├─ db/          Prisma client, transaction helper
│  │  ├─ auth/        Auth.js config, RBAC guard
│  │  ├─ storage/     StorageAdapter port + local/S3 adapters
│  │  ├─ pdf/         Playwright renderer + HTML templates
│  │  ├─ notify/      NotificationChannel port + adapters
│  │  ├─ forms/       Dynamic form engine (schema → renderer → validator)
│  │  ├─ queue/       BullMQ setup + job definitions
│  │  └─ i18n/        next-intl, th/en catalogs, BE/CE date formatting
│  ├─ components/     shadcn/ui + NBC-branded primitives
│  └─ styles/         Design tokens from the NBC palette
├─ tests/             Vitest unit + Playwright e2e
├─ docker-compose.yml Postgres 16 + Redis + MinIO (local dev, mirrors prod ports)
└─ .env.example
```

Enforced by ESLint boundary rules: modules talk to each other through **services**, never by
reaching into another module's repository or Prisma models directly.

---

## 3. Work plan — seven steps

### Step 1 · Foundation & NBC brand system
- Next.js 15 (App Router) + TypeScript strict + Tailwind + shadcn/ui
- Design tokens from the live site: `#E4750E` orange, `#2891BD` blue, `#09455E` teal,
  `#132945` navy, `#6EC1E4` sky
- Self-hosted **Mitr** (headings) + **Sarabun** (body/tables/PDF) — no Google Fonts CDN
  dependency, and Sarabun is the Thai document standard
- Logo asset integrated; light/dark handled for the staff console
- `next-intl` wired with `th` as default locale, `en` secondary
- Three route-group shells with role-appropriate navigation
- `docker-compose` for Postgres + Redis + MinIO so the team has one-command local setup

### Step 2 · Prisma schema — the primary deliverable (~40 models)

| Module | Models |
|---|---|
| identity | `User` `Role` `Permission` `RolePermission` `UserRole` `Session` `AuditLog` |
| customers | `Customer` `CustomerSite` `CustomerContact` `CustomerIdentity` `Asset` |
| contracts | `Contract` `ContractSite` `ContractIncludedService` |
| catalog | `ServiceCatalogItem` `Part` `PartCategory` |
| scheduling | `Zone` `QuotaRule` `QuotaDay` `QuotaHold` `QuotaOverrideLog` `Holiday` |
| jobs | `Job` `JobAsset` `JobStatusEvent` `JobNote` |
| dispatch | `Technician` `Skill` `TechnicianSkill` `Crew` `CrewMember` `TechnicianShift` `JobAssignment` |
| workorders | `FormTemplate` `WorkOrder` `JobReport` `JobPart` `Signature` `DocumentRender` `DocumentSequence` |
| billing | `InspectionFeePolicy` `JobCharge` `Quotation` `QuotationLine` `ApprovalPolicy` |
| media | `Attachment` |
| notifications | `NotificationTemplate` `NotificationLog` |
| platform | `AppConfig` `FeatureFlag` |

Plus: DB-level guards (`CHECK (used_jobs <= capacity_jobs)`), partial unique indexes, and
composite indexes on the query paths that matter (`Job(scheduled_date, status, zone_id)`,
`JobStatusEvent(job_id, occurred_at)`).

**Seed data is real, not lorem ipsum** — the published NBC price list (contract vs non-contract,
all AC types and BTU bands), the published service durations (30/40/60/90 min), and the published
PM frequency tiers (2×/3×/4× per year). The skeleton is demoable to the client on day one, and
every assumed value carries a `@client-confirm` tag.

### Step 3 · Core domain services (behaviour, not just tables)
1. **Quota engine** — nightly materialiser (rules → `QuotaDay`), `checkAvailability()`,
   `holdSlot()` with TTL, `bookSlot()` in a `SELECT … FOR UPDATE` transaction,
   `releaseSlot()` on cancel/reschedule
2. **Pricing resolver** — tier-aware (contract vs standard) and validity-window aware
3. **Fee policy resolver + charge ledger** — waive / charge / credit as append-only rows
4. **Job status machine** — guarded transitions, emits `JobStatusEvent` on every move
5. **Document sequence generator** — pattern-driven, gap-free, concurrency-safe
6. **RBAC guard** — permission checks at the service boundary, not just the UI

### Step 4 · Pluggable adapters (ports & adapters)
`StorageAdapter` · `NotificationChannel` · `PdfRenderer` · auth providers — each an interface with
a dev implementation (local disk, console logger) and a production implementation stubbed behind
config. No hosting or LINE decision blocks development.

### Step 5 · Dynamic form engine + the three templates
- JSON schema → React renderer → Zod validator, all driven from `FormTemplate.schema`
- Field types needed: text, number+unit, select, multi-select, checkbox grid, measurement group,
  photo group (with min/max), parts table, signature, section, repeater
- **v1 drafts of all three forms** built from the work-process page already published on
  nbcgroup.co.th (Step 4 explicitly lists voltage, amperage, refrigerant pressure and evaporator
  inlet temperature — those become the measurement group)
- Signature capture component (canvas → PNG → storage, with `payload_hash` binding)
- Per-form HTML→PDF template with correct Thai typesetting

### Step 6 · Vertical slice — proves the architecture end to end
One complete path through every layer:

> Customer books a Cleaning/PM job → quota checked and decremented → dispatcher assigns a crew →
> technician opens the PWA offline, completes Form 2, attaches before/after photos, captures both
> signatures → sync on reconnect → PDF rendered → appears in customer history

This deliberately front-loads the three risks flagged in the Blueprint: offline sync, Thai PDF
typography, and quota race conditions.

### Step 7 · Skeleton screens for the remainder
Routed, navigable, branded stubs with empty states for: CRM/customer 360, asset registry, dispatch
board, analytics dashboard, admin configuration (quota rules, pricing, fee policy, form builder).
The shape is visible and clickable for the client demo; the depth comes in later phases.

---

## 4. Test strategy

| Layer | Tool | Focus |
|---|---|---|
| Domain | Vitest | Quota maths, pricing resolution, fee credit ledger, status machine guards |
| **Concurrency** | Vitest + real Postgres | **N parallel bookings against 1 remaining slot → exactly 1 succeeds** |
| Contract | Zod | Form payload validates against its `FormTemplate.schema` |
| E2E | Playwright | The Step 6 vertical slice, incl. an offline→online sync run |
| Visual | Playwright screenshot | PDF output — Thai glyph stacking, tone marks, signature placement |

---

## 5. Assumptions register

All are **placeholders chosen to be defensible**, sourced from the client's own public site where
possible. Each is a data row, changeable without a migration.

| # | Assumption | Source / basis | Question it answers |
|---|---|---|---|
| A1 | Inspection fee **฿500**, credited **100%** if the customer proceeds | Placeholder; matches their entry price point | Q4 |
| A2 | Inspection fee **waived** for contract customers | Their public "free diagnostic for contract customers" promise | Q4 |
| A3 | One zone: `BKK-METRO` (Bangkok & vicinity) | Their Nonthaburi base | Q3 |
| A4 | Quota caps on **minutes + jobs + units**, all three active | Blueprint §1.2 point 2 | Q2 |
| A5 | Working day 08:00–17:00, Mon–Sat; 480 productive min/tech/day; 30 min travel buffer | Their published 08:00–17:00 usage profile | Q2 |
| A6 | Booking lead time 3 days min, 90-day horizon | Their "3–7 days in advance" | — |
| A7 | Service durations 30/40/60/90 min by AC type | **Published price list** | — |
| A8 | Two-tier pricing seeded from the published list | **Published price list** | — |
| A9 | PM frequency 2× / 3× / 4× per year by usage profile | **Published on their site** | — |
| A10 | SLA: on-site within **1 business day** for repair | **Their public promise** | — |
| A11 | Doc numbers `NBC-{FORM}-{BE}-{SEQ:05}` → `NBC-PM-2569-00001` | Thai convention; BE = CE + 543 | Q5, Q6 |
| A12 | Buddhist Era on all customer-facing documents | Thai business norm | Q6 |
| A13 | THB, VAT 7%, prices stored **VAT-exclusive** | Thai standard | — |
| A14 | `Asia/Bangkok` display, **UTC** storage | Standard practice | — |
| A15 | Min 1 "before" + 1 "after" photo per work order | Sensible default, configurable | Q5 |
| A16 | Staff auth: email + password + TOTP. Customer: phone OTP, LINE adapter ready but dormant | Q7 pending | Q7 |
| A17 | One job may cover many assets (`JobAsset`) | Correct for their factory/hotel work | Q8 |
| A18 | Roles: SuperAdmin, Admin, Dispatcher, Supervisor, Technician, Customer | Blueprint §2.1 | — |
| A19 | Quotation approval: Supervisor. Lead tech may approve ≤ ฿2,000 | Placeholder threshold | Q9 |
| A20 | Dev storage = MinIO; prod adapter = S3-compatible, undecided | Q11 pending | Q11 |

---

## 6. Explicitly out of scope for the skeleton

Not started until the client answers land, to avoid rework:

- Live LINE Messaging API integration *(needs channel ID + secret)*
- Final form layouts and pixel-faithful PDFs *(needs the paper originals)*
- Invoicing / e-Tax / accounting export *(needs Q13)*
- Parts inventory and van stock *(needs Q13)*
- Data migration from any existing system *(needs Q1)*
- Route optimisation / mapping *(phase 4+)*

---

## 7. Definition of done for Phase 0

- [ ] `docker compose up` + `pnpm db:reset` yields a fully seeded working database
- [ ] Prisma schema covers all 7 core requirements with no known structural gaps
- [ ] Quota concurrency test passes: 20 parallel bookings, 1 slot, exactly 1 winner
- [ ] The Step 6 vertical slice runs green in Playwright, including an offline sync cycle
- [ ] A Thai-language PDF renders correctly with signatures and photos
- [ ] Every screen is on-brand and responsive at 375 px and 1440 px
- [ ] `grep -r "@client-confirm"` returns a complete, reviewable list of every assumption
