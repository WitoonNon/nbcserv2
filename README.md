# NBC Group — Repair & Service Management

Operational system of record for **บริษัท เอ็นบีซี กรุ๊ป จำกัด** (NBC Group Co., Ltd.):
intake → quota-controlled booking → dispatch → on-site digital work order with photos and
signatures → PDF → history → analytics.

Sits **beside** the existing marketing site at [nbcgroup.co.th](https://nbcgroup.co.th) (WordPress
+ Elementor), reusing its branding but not its runtime.

> **Status: Phase 0 skeleton.** The client's operational data has not arrived yet. Every
> unconfirmed value is a **database row**, never a hardcoded constant — run
> `npm run client-confirm` to list them all.

---

## Quick start

```bash
npm install
cp .env.example .env        # then set DATABASE_URL
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

### Database

PostgreSQL 16+ is required (17/18 are fine). Either:

- **Docker** — `npm run db:up` starts Postgres + Redis + MinIO from `docker-compose.yml`
- **Native install** — create a dedicated role and database:

  ```sql
  CREATE ROLE nbc WITH LOGIN PASSWORD 'nbc';
  CREATE DATABASE nbc_service OWNER nbc;
  ```

  then set `DATABASE_URL="postgresql://nbc:nbc@localhost:5432/nbc_service?schema=public"`

---

## Architecture

| Layer | Choice | Note |
|---|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript strict | one codebase, three surfaces |
| Styling | Tailwind v4, CSS-first tokens | palette sampled from the live site |
| Fonts | Mitr (headings) + Sarabun (body/tables/PDF), **self-hosted** | no CDN dependency — the technician app must work offline |
| Database | PostgreSQL + Prisma 7 (`@prisma/adapter-pg`) | transactional quota locking, JSONB form payloads |
| Storage | `StorageAdapter` port — `local` ⇄ `s3`/R2 | hosting decision is an env var |
| Notifications | `NotificationChannel` port — `console` ⇄ LINE ⇄ email | LINE credentials do not block development |
| i18n | next-intl, `th` default + `en` | real i18n from day one |

### Three surfaces

- `src/app/(staff)` — admin, dispatcher, supervisor. Desktop-first.
- `src/app/(tech)` — technician PWA. Mobile-first, offline-first, large tap targets.
- `src/app/(portal)` — customer booking and tracking. Visually continuous with the main site.

### Modules

Modular monolith. `prisma/schema/*.prisma` and `src/modules/*` mirror each other 1:1.
Modules talk through **services**, never by reaching into another module's tables.

```
identity  customers  contracts  catalog  scheduling  jobs
dispatch  workorders billing    media    notifications platform
```

---

## The three things worth reading first

### 1. Quota engine — `src/modules/scheduling/quota.service.ts`

Capacity is tracked on **three axes**: jobs, units and technician-minutes. NBC publishes
per-unit service times of 30/40/60/90 minutes, so "10 jobs per day" is meaningless — ten
90-minute concealed units is a completely different day from ten 30-minute wall units.
A `NULL` capacity means unlimited on that axis.

`bookSlot()` takes a row-level lock (`SELECT ... FOR UPDATE`) on exactly one `QuotaDay`
bucket, so two customers racing for the last slot serialise and exactly one wins.
`prisma/migrations/*_guards/migration.sql` adds `CHECK` constraints as the second line of
defence: a bug cannot silently oversell, Postgres refuses the write.

### 2. Fee ledger — `src/modules/billing/fee.service.ts`

The inspection fee is an **append-only charge ledger**, never a mutable number on the job.

| Event | Ledger effect |
|---|---|
| Job created, non-contract customer | `+INSPECTION_FEE` |
| Job created, **contract** customer | no row; `Job.feeWaivedReason = CONTRACT` |
| Customer declines the repair | fee stands, invoiced |
| Customer approves the repair | `+INSPECTION_FEE_CREDIT` (negative) |

Net payable is always `SUM(amountSigned)` — reproducible, and never wrong because someone
edited a field.

### 3. Form engine — `src/lib/forms/`

The three work-order forms are **data, not code**. A `FormTemplate` row holds a schema, the
renderer walks it, and a zod validator is derived from it. `templateVersion` is stored on
every work order, so a 2026 PDF still renders exactly as issued after the form changes in
2027 — the most commonly omitted field in systems of this type.

`Signature.payloadHash` is a SHA-256 of the payload at the moment of signing. That is the
difference between a picture of a signature and evidence.

---

## Seed data is real, not lorem ipsum

`prisma/seed/03-catalog.ts` is NBC's **own published price list** — both tiers (contract vs
non-contract), all AC types and BTU bands, and the published service durations. The PM
frequency tiers (2×/3×/4× per year by usage profile) come from their site too.

The skeleton is therefore demoable to the client on day one, and every placeholder is a
number they will recognise as their own.

---

## Open client questions

```bash
npm run client-confirm
```

Lists every `@client-confirm` marker across schema, seed, services and docs, grouped by
question number. The live version is also at `/settings/assumptions` in the app.

Full questionnaire: [`docs/02-CLIENT-DATA-CHECKLIST.md`](docs/02-CLIENT-DATA-CHECKLIST.md)
(bilingual, plus a printable PDF).

**The three that actually block progress:** the three paper forms (A1–A3), the inspection
fee rule (B1–B5), and daily capacity by job type (C1–C5).

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | create/apply a migration |
| `npm run db:seed` | idempotent seed (safe to re-run) |
| `npm run db:reset` | drop, migrate, seed |
| `npm run db:studio` | Prisma Studio |
| `npm test` | vitest (quota concurrency tests need a live database) |
| `npm run client-confirm` | list open client questions |

---

## Docs

| File | Contents |
|---|---|
| `docs/00-SYSTEM-BLUEPRINT.md` | business analysis, architecture, schema rationale |
| `docs/01-BUILD-PLAN-SKELETON.md` | build plan + assumptions register |
| `docs/02-CLIENT-DATA-CHECKLIST.md` | bilingual client questionnaire |
| `docs/NBC-REQ-001-Client-Data-Checklist-TH.pdf` | printable Thai version |
