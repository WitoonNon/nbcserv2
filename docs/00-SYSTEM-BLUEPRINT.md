# NBC Group — Repair & Service Management Web Application
## System Blueprint v0.1 (Pre-Implementation)

**Client:** บริษัท เอ็นบีซี กรุ๊ป จำกัด / NBC Group Co., Ltd.
**Tax ID:** 0125561013342
**Registered address:** 105/26 Moo 2, Laharn, Bang Bua Thong, Nonthaburi 11110
**Existing web presence:** https://nbcgroup.co.th (WordPress 6.x + Elementor + GTranslate)
**Document status:** Draft for client review — no code written yet.

---

## 1. Executive Summary & Understanding

### 1.1 Business context (derived from site review)

NBC Group is a **20+ year HVAC engineering contractor**, not a consumer handyman shop. The
public site positions three revenue lines:

| Line | Thai | Notes from site |
|---|---|---|
| Cleaning / PM | ล้างแอร์ | Headline offer, from ฿500/unit |
| Repair | ซ่อมแอร์ | 24h emergency response advertised |
| Installation | ติดตั้งแอร์ | From ฿3,000 (wall type, 4m line set), 1-year warranty |

**Systems serviced:** VRV / VRF, AHU, Chiller, and conventional split systems.
**Segments served:** industrial factories, hospitals, hotels, office buildings, shopping malls,
and residential/condo.

The business is therefore **B2B-dominant with a B2C tail**. A single "customer" is frequently an
organisation with *many sites*, each site holding *many AC units*. Any data model that treats
"customer = one address = one job" will fail on their core accounts.

### 1.2 Five facts on the public site that directly shape this system

These are not incidental — they are effectively an unwritten spec:

1. **Two-tier pricing already exists.** The published price list quotes every line item twice:
   *contract customer* vs *non-contract customer* (e.g. Wall type ฿500 vs ฿650). Pricing must be
   resolved against the customer's contract status, not stored flat on the job.

2. **Standard service durations are already published** — 30 min (wall), 40 min (ceiling/standing),
   60 min (cassette 4-way), 90 min (concealed). This is the correct unit for capacity planning.
   A day capped at "10 jobs" is meaningless when one job is 30 min and another is 90 min.
   **Quotas must be expressible in technician-minutes, not only job counts.**

3. **PM frequency tiers are already defined** by usage profile: 2×/year (home, office, government,
   ~9 h/day), 3×/year (factory production zone, mall, restaurant, ~12 h/day), 4×/year (24-hour
   operations, ~14 h/day). This is a ready-made **preventive-maintenance scheduling engine**.

4. **The work-process page already lists the technician's data-capture fields.** Step 4 requires
   recording *evaporator inlet temperature, voltage, amperage, and refrigerant pressure*, then
   producing a completion report. The digital field report should mirror this exactly so
   technicians recognise the form.

5. **Two SLA promises are made publicly:** technician on site *within 1 business day* of
   notification, and *free diagnostic checks for contract customers*. The second one is decisive
   for the inspection-fee module — **the fee must be automatically waived (not merely discounted)
   for contract customers**, or the app will contradict the company's own marketing.

Additionally: bookings are described as scheduled **3–7 days in advance**, which sets the natural
default booking window for the quota calendar.

### 1.3 Corporate identity & design tokens (for reuse, per requirement #5)

**Logo:** `Nbc.Group_.co_.ltd_.-จริง.png` — "NBC" wordmark carrying a left-to-right gradient from
cool blue into orange/red, with "GROUP.CO.,LTD." set in blue italic beneath. The gradient is a
deliberate cold→hot metaphor for air conditioning; it should be preserved, not flattened.

**Colour palette (sampled from the live site):**

| Token | Hex | Live usage |
|---|---|---|
| `brand-orange` | `#E4750E` | All primary CTAs ("Hot Line", "ใบเสนอราคา"), 3px radius |
| `brand-blue` | `#2891BD` | H1 headings |
| `brand-teal-900` | `#09455E` | H2 headings |
| `brand-navy` | `#132945` | Dark section backgrounds |
| `brand-navy-900` | `#00214D` | Deepest background |
| `brand-sky` | `#6EC1E4` | Light accent panels |
| `brand-cyan` | `#0C76A2` | Secondary links |
| `text-base` | `#333333` | Body copy |
| `text-muted` | `#7A7A7A` | Secondary copy |

**Typography:** **Mitr** (Google Fonts, Thai + Latin) for all headings — H1 600/40px, H2 500/32px,
H3 600/28px. Body falls back to Noto Sans Thai; Roboto and Poppins appear as Elementor defaults.
Recommendation for the app: **Mitr for headings, Noto Sans Thai (or Sarabun) for body and all
tabular data** — Mitr is a display face and is poor at 13–14px in dense tables and on PDF forms.
Sarabun is additionally the Thai government document standard, which suits printed work orders.

**Contact channels to surface in-app:** Hotline 097-094-4419 · Call Center 02-000-7332 ·
LINE `@nbcservice` · nbcservice@nbcgroup.co.th

### 1.4 What we are building

An **operational system of record** that sits beside (not inside) the marketing website:
intake → quota-controlled booking → dispatch → on-site digital work order with photos and
signatures → PDF → history → analytics. The WordPress site remains the marketing front door and
is untouched apart from links/CTAs into the new app.

---

## 2. Core User Roles & Workflows

### 2.1 Role matrix

| Role | Primary surface | Core responsibility |
|---|---|---|
| **Super Admin** | Desktop | Tenancy, users, pricing, quota rules, form templates, audit |
| **Admin / Call Centre** | Desktop | Intake, customer & contract records, quotations, invoicing |
| **Dispatcher / Scheduler** | Desktop (board) | Daily queue, crew assignment, reschedule, quota overrides |
| **Supervisor / Engineer** | Desktop + tablet | Approves quotations & field reports, QA on photos, root-cause sign-off |
| **Technician (Lead / Crew)** | Mobile PWA | Field execution, work-order forms, photos, signatures, parts used |
| **Customer — B2C** | Mobile web / LINE | Book, track, approve quote, sign, download PDF |
| **Customer — B2B site contact** | Desktop + mobile | Multi-site request, asset history, approvals, report archive |
| **Accounting** *(optional phase 2)* | Desktop | Fee reconciliation, invoice export |

Note that crews, not individuals, are dispatched — cleaning work is typically a 2-person job. The
model assigns a **crew** with a designated **lead technician** who owns form submission.

### 2.2 Customer workflow

```
Entry (website CTA / LINE / phone-in by admin)
  └─> Select service category  (Inspection-Repair | Cleaning-PM | Repair)
      └─> Select site + AC units (B2B: pick from asset registry; B2C: free entry)
          └─> Calendar shows only dates with remaining quota for that category+size
              └─> Slot held (soft lock, TTL) while details are completed
                  └─> Inspection fee disclosed up-front — or shown as WAIVED (contract customer)
                      └─> Submit -> job number issued -> LINE/email confirmation
                          └─> Live tracking: Scheduled -> Assigned -> En route -> On site -> In progress
                              └─> Receives quotation (if repair needed) -> Approve / Reject in-app
                                  └─> Signs on technician's device at completion
                                      └─> PDF work order + report available in history, forever
```

Key rule: a customer **never** sees a date whose quota is exhausted. The calendar is the quota,
rendered.

### 2.3 Technician workflow (mobile PWA, offline-first)

```
Login -> Today's queue (ordered by dispatcher priority + route)
  └─> Open job -> read customer, site, asset history, previous root causes
      └─> Tap "En route"      (timestamp + optional GPS)
          └─> Tap "Arrived"   (timestamp + optional GPS; drives SLA metrics)
              └─> Open the assigned work-order form (1 of 3 templates)
                  ├─ Photos: BEFORE (required, min N)
                  ├─ Findings / Root cause / Action taken
                  ├─ Measurements: volts, amps, refrigerant pressure, evap inlet temp
                  ├─ Spare parts consumed (catalogue + qty + serial + warranty)
                  ├─ Photos: AFTER (required, min N)
                  └─ Additional work needed? -> raise on-site quotation -> supervisor approval
                      └─> Signature: Customer + Technician (canvas, on-device)
                          └─> Submit -> queued locally if offline -> syncs when signal returns
                              └─> Server renders PDF -> immutable archive -> customer notified
```

**Offline is mandatory, not a nice-to-have.** Their work happens in factory plant rooms, hotel
basements, mall service corridors and rooftops — places with no usable mobile signal. Forms,
photos and signatures must queue locally (IndexedDB) and sync opportunistically.

### 2.4 Admin / Dispatcher workflow

```
Quota configuration (weekly/seasonal rules per category x size x zone)
  └─> Intake board: new requests, phone-in entry, duplicate detection
      └─> Dispatch board (day/week, drag-and-drop): unassigned queue -> crew lanes
          ├─ Capacity meter per crew per day (minutes booked / minutes available)
          ├─ Skill gate (Chiller / VRF / AHU jobs only to certified crews)
          └─ Override with reason + audit entry when exceeding quota
              └─> Monitor live status board
                  └─> Review submitted field reports -> approve / return for correction
                      └─> Inspection fee reconciliation -> quotation -> invoice
                          └─> Analytics dashboard
```

---

## 3. High-Level Technical Architecture

### 3.1 Integration posture — the key architectural decision

**Recommendation: build a separate application at `app.nbcgroup.co.th`, not a WordPress plugin.**

Rationale:
- Quota enforcement needs real database transactions and row-level locking. Doing this correctly
  inside WordPress/WooCommerce is fighting the platform.
- The technician client must work offline; WordPress cannot deliver that.
- Long-lived PDF/signature archives with legal-evidence value should not live in `wp_postmeta`.
- Keeping the marketing site independent means WordPress plugin/theme updates can never take the
  operational system down — an important consideration for a company advertising 24h response.

Integration is achieved by **shared identity, not shared runtime**: same logo, same palette, same
Mitr typography, same header/footer treatment, plus CTA buttons on the WP site
("จองคิว/แจ้งซ่อม", "ติดตามงาน") deep-linking into the app. Optionally a small embeddable booking
widget (iframe or script tag) can be dropped into an Elementor block.

### 3.2 Proposed stack

| Layer | Recommendation | Why |
|---|---|---|
| **Frontend (all roles)** | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui | One codebase, responsive, SSR for fast mobile, easy brand-token theming |
| **Technician client** | Same Next.js app installed as a **PWA** (Workbox + IndexedDB queue) | Offline capture without an app-store release cycle |
| **Backend** | Next.js Route Handlers / Server Actions + a dedicated worker process | Single deployable for phase 1; extract to NestJS if a native app is added later |
| **Database** | **PostgreSQL 16** | Transactional quota locking, JSONB for versioned form payloads, strong analytics |
| **ORM** | Prisma (or Drizzle) | Type-safe schema, migrations under version control |
| **Object storage** | S3-compatible — **Cloudflare R2** (no egress fees) or AWS S3 `ap-southeast-1` | Photos and PDFs never touch the app server; direct presigned uploads |
| **PDF generation** | Headless Chromium (Playwright) rendering HTML templates | Only reliable way to typeset Thai script correctly, incl. complex glyph stacking |
| **Auth** | Auth.js — credentials + TOTP for staff, **LINE Login** for customers | LINE is the default identity channel in Thailand; they already run `@nbcservice` |
| **Notifications** | **LINE Messaging API** primary, email (Resend/SES) fallback, SMS optional | Matches how their customers actually communicate |
| **Jobs / queue** | BullMQ + Redis | PDF rendering, notification fan-out, nightly quota materialisation |
| **Real-time** | Server-Sent Events (or Soketi if bidirectional needed) | Status board and customer tracking without polling |
| **Observability** | Sentry + structured logs; Umami/Plausible for product analytics | |

### 3.3 Media pipeline (requirement #6)

Field photos are the heaviest traffic in the system. A modern phone photo is 3–6 MB; a 20-unit PM
job with before/after shots is 200 MB+ raw.

1. **Client-side downscale + re-encode** before upload — target ≤1600px long edge, WebP/JPEG q78,
   typically 150–350 KB. Non-negotiable for technicians on mobile data.
2. **Direct-to-storage presigned PUT** — bytes never proxy through the app server.
3. **EXIF:** strip on delivery, but first extract `DateTimeOriginal` and GPS into dedicated
   columns. Capture time and location are genuinely useful for disputes ("was the tech there?").
4. **Thumbnail derivative** generated by the worker for gallery/PDF use.
5. **Content hash (SHA-256)** stored per file for tamper evidence and dedupe.
6. PDFs written **write-once**; regeneration produces a new version, never an overwrite.

### 3.4 Hosting & data residency

Two viable options, to be decided with the client:

- **Option A — Vercel + Neon/Supabase + R2.** Fastest to ship, excellent DX. Data sits outside
  Thailand; acceptable under PDPA with a cross-border transfer clause but needs a decision.
- **Option B — AWS `ap-southeast-1` (Singapore) or a Thai provider.** Lower latency to Bangkok,
  simpler PDPA story, more ops work.

**PDPA (Thailand) applies here** — the system stores names, addresses, phone numbers, site photos
and handwritten signatures. Consent text, a retention policy, and a data-subject-request path
should be in scope from day one, not retrofitted.

---

## 4. Proposed Database Schema Highlights

### 4.1 Customer, site, asset (B2B-shaped core)

```
customer            id, code, type(INDIVIDUAL|CORPORATE), legal_name, tax_id,
                    billing_address, segment(FACTORY|HOSPITAL|HOTEL|OFFICE|MALL|RESIDENTIAL),
                    default_pricing_tier
customer_site       id, customer_id, name, address, lat, lng, zone_id, access_notes,
                    site_contact_name, site_contact_phone
customer_contact    id, customer_id, site_id?, name, phone, email, line_user_id, role
asset               id, site_id, asset_tag, ac_type(WALL|CEILING|CASSETTE_4WAY|
                    CONCEALED_SMALL|CONCEALED_LARGE|STANDING|VRV_VRF|AHU|CHILLER),
                    brand, model, serial_no, btu, refrigerant, installed_at,
                    location_in_building, pm_frequency_per_year(2|3|4), last_pm_at, next_pm_due
```

The `asset` table is what turns this from a booking form into an operational asset-management
system — it is what lets a technician see "this same FCU failed twice in 8 months" and what makes
the PM engine possible.

### 4.2 Contracts & pricing (the published two-tier list)

```
contract            id, customer_id, contract_no, type(ANNUAL|MONTHLY|PER_VISIT),
                    starts_on, ends_on, status, pricing_tier(CONTRACT|STANDARD),
                    inspection_fee_waived boolean default true,
                    included_pm_visits_per_year, sla_response_hours
service_catalog     id, category(INSPECTION_REPAIR|CLEANING_PM|REPAIR|INSTALLATION),
                    job_size(S|M|L|XL), ac_type, btu_min, btu_max,
                    standard_duration_min,          -- 30 / 40 / 60 / 90 from their price list
                    price_contract, price_standard, active_from, active_to
```

Prices are **versioned by validity window**, never edited in place — a work order printed last
year must still reproduce last year's price.

### 4.3 Daily dynamic quotas (requirement #1)

Two tables: **rules** (what the admin configures) and **daily buckets** (what booking checks).

```
quota_rule          id, name, scope_type(DATE|WEEKDAY|DATE_RANGE), effective_from, effective_to,
                    weekday_mask, zone_id?, category, job_size?,
                    max_jobs int?, max_units int?, max_technician_minutes int?,
                    priority int, is_active
quota_day           id, quota_date, zone_id, category, job_size,
                    capacity_jobs, capacity_units, capacity_minutes,
                    used_jobs, used_units, used_minutes,
                    status(OPEN|FULL|MANUALLY_CLOSED|HOLIDAY),
                    UNIQUE (quota_date, zone_id, category, job_size)
quota_hold          id, quota_day_id, session_id, units, minutes, expires_at   -- soft lock, TTL ~10 min
quota_override_log  id, quota_day_id, actor_id, reason, delta, created_at      -- audit
```

**The correctness-critical detail.** Two customers hitting the last slot simultaneously must not
both succeed. The booking transaction must be:

```sql
BEGIN;
  SELECT * FROM quota_day
   WHERE quota_date = $1 AND zone_id = $2 AND category = $3 AND job_size = $4
   FOR UPDATE;                                  -- serialises contenders on this bucket only

  -- application check: used + requested <= capacity (jobs AND units AND minutes)

  UPDATE quota_day
     SET used_jobs = used_jobs + 1,
         used_units = used_units + $5,
         used_minutes = used_minutes + $6,
         status = CASE WHEN <any limit reached> THEN 'FULL' ELSE status END
   WHERE id = $7;

  INSERT INTO job (...);
COMMIT;
```

Backed by a defensive constraint `CHECK (used_jobs <= capacity_jobs)` so a bug can never silently
oversell. `quota_day` rows are materialised nightly from `quota_rule` for a rolling ~90-day window
(their booking lead time is 3–7 days, so 90 days is generous), and re-materialised on rule change
without disturbing already-consumed counts.

### 4.4 Inspection fee & discount credit (requirement #2)

Modelled as an **append-only charge ledger**, never as a mutable number on the job. This keeps a
defensible audit trail of what was charged, credited, and why.

```
inspection_fee_policy  id, category, zone_id?, amount, currency,
                       waive_for_contract_customer boolean default true,
                       credit_on_proceed boolean default true,
                       credit_mode(FULL|PARTIAL|CAPPED), credit_value,
                       effective_from, effective_to

job_charge             id, job_id, type(INSPECTION_FEE | INSPECTION_FEE_CREDIT |
                                        LABOUR | PART | TRAVEL | DISCOUNT),
                       description, qty, unit_price, amount_signed,   -- credits are negative
                       source(AUTO_POLICY|MANUAL), policy_id?, created_by, created_at
```

Lifecycle:

| Event | Ledger effect |
|---|---|
| Job created, non-contract customer | `+INSPECTION_FEE` (e.g. `+500`), status `PENDING` |
| Job created, **contract** customer | Policy waives → **no row written**, job flagged `fee_waived_reason = CONTRACT` |
| Inspection done, customer **declines** repair | Fee stands → invoiced |
| Inspection done, customer **approves** repair | `+INSPECTION_FEE_CREDIT` (`-500`) written on quotation acceptance |

Net payable is always `SUM(amount_signed)` — derivable, reproducible, and never wrong because
someone edited a field. `credit_mode` exists because "always credit 100%" may not survive contact
with a ฿300 job; the client should confirm the intended rule (see §5).

### 4.5 Jobs, dispatch, and status tracking (requirements #3, #4)

```
job                 id, job_no, customer_id, site_id, contract_id?, category, job_size,
                    requested_date, scheduled_date, scheduled_window,
                    quota_day_id, priority, status, sla_due_at,
                    fee_waived_reason?, created_via(WEB|LINE|PHONE|ADMIN)
job_asset           job_id, asset_id, planned_service_id      -- many units per job
crew                id, name, zone_id, lead_technician_id, is_active
technician          id, user_id, employee_code, skills[], certifications[], zone_id
crew_member         crew_id, technician_id, valid_from, valid_to
technician_shift    id, technician_id, work_date, start_at, end_at, available_minutes
job_assignment      id, job_id, crew_id, assigned_by, assigned_at, sequence_no, eta
job_status_event    id, job_id, from_status, to_status, actor_id, actor_role,
                    occurred_at, lat, lng, note          -- APPEND ONLY
```

Status machine:

```
DRAFT -> SUBMITTED -> SCHEDULED -> ASSIGNED -> EN_ROUTE -> ON_SITE -> IN_PROGRESS
                                                              |
                                    +-------------------------+
                                    v
                          PENDING_QUOTE -> QUOTE_APPROVED -> IN_PROGRESS
                                        \-> QUOTE_REJECTED -> COMPLETED (inspection only)
IN_PROGRESS -> COMPLETED -> REPORT_APPROVED -> CLOSED
any -> CANCELLED / RESCHEDULED   (releases quota back to quota_day)
```

`job_status_event` is the single source for **both** the real-time tracker and the analytics
layer. Never derive KPIs from the mutable `job.status` — derive them from the event stream.

### 4.6 Three work-order forms + signatures (requirement #4)

Hybrid design: stable columns for anything queried or reported on, **versioned JSONB** for
template-specific fields.

```
form_template       id, code(INSPECTION_REQUEST | CLEANING_PM | REPAIR),
                    version int, title_th, title_en, schema jsonb,
                    pdf_template_key, is_active, published_at
                    UNIQUE (code, version)

work_order          id, job_id, template_id, template_version, doc_no,
                    payload jsonb,                       -- answers, validated against schema
                    status(DRAFT|SUBMITTED|APPROVED|RETURNED),
                    submitted_by, submitted_at, approved_by, approved_at

job_report          work_order_id, findings, root_cause, action_taken, recommendation,
                    measurements jsonb   -- { volts, amps, refrigerant_pressure_psi,
                                         --   evap_inlet_temp_c, supply_temp_c, return_temp_c }
job_part            id, work_order_id, part_id, part_name_snapshot, qty, unit_price,
                    serial_no, warranty_months
part                id, sku, name_th, name_en, unit, default_price, category

signature           id, work_order_id, signer_role(CUSTOMER|TECHNICIAN|SUPERVISOR),
                    signer_name, signer_position, storage_key, signed_at,
                    device_info, ip, payload_hash      -- SHA-256 of payload AT signing time
                    
attachment          id, entity_type, entity_id, kind(BEFORE|AFTER|DEFECT|NAMEPLATE|
                    SERIAL|DOCUMENT|OTHER), storage_key, thumb_key, mime, bytes,
                    sha256, exif_taken_at, lat, lng, caption, sort_order, uploaded_by

document_render     id, work_order_id, format(PDF), storage_key, sha256,
                    rendered_at, template_version, is_current
```

Three points that will save pain later:

- **`template_version` is stored on the work order.** When form 2 changes in 2027, every 2026 PDF
  still renders exactly as it was issued. This is the single most common omission in systems of
  this type.
- **`payload_hash` on the signature** binds the signature to the exact content signed. If the
  payload is later amended, the mismatch is detectable — the difference between a picture of a
  signature and evidence.
- **`document_render` is append-only.** Amending a work order produces a new PDF marked current;
  the superseded one remains retrievable.

### 4.7 Analytics (requirement #5)

Read models built over `job_status_event` + `job_charge`, refreshed as materialised views:

- Bookings and completions per day, by category / size / zone / segment
- **Quota utilisation %** — the direct feedback loop for tuning quota rules
- **SLA attainment** — `ON_SITE` timestamp vs the publicly promised 1 business day
- **Inspection-fee conversion rate** — % of paid inspections converting to approved repair work.
  This is the commercial justification for the entire fee-credit mechanism and deserves a headline
  tile on the dashboard.
- First-time fix rate; repeat failures per asset within N days (asset reliability)
- Technician/crew productivity: billed minutes ÷ available shift minutes
- Spare-part consumption ranking → informs van stock
- Revenue by category, segment, and contract vs non-contract tier

---

## 5. Next Steps & Open Questions

### 5.1 Blocking — needed before schema is frozen

1. **Existing systems.** Is there any current database, spreadsheet, or accounting package
   (Express, FlowAccount, Peak, SAP) holding customers, contracts, or job history? Migration
   scope changes the schema materially. Can we see a sample export?

2. **Quota unit.** Confirm quotas should cap on **technician-minutes** as well as job count. If
   the client only wants "N jobs per day", say so now — but with 30–90 min service times the
   minute-based cap is what actually prevents over-committing a crew.

3. **Quota dimensions.** Beyond `category × job_size`, should quotas also be scoped **per zone /
   service area** and **per crew**? Bangkok–Nonthaburi travel time makes a zone dimension likely
   necessary.

4. **Inspection fee amount and credit rule.** What is the standard on-site inspection fee? Is the
   credit always 100%, or capped (e.g. credited only when the repair exceeds a threshold)? And
   confirm the waiver-for-contract-customers rule matches the public promise.

5. **The three forms.** Please provide the **current paper/Excel versions** of ใบตรวจเช็ค/แจ้งซ่อม,
   ใบล้าง/PM, and ใบซ่อม. Field-for-field fidelity to the existing documents is the fastest route
   to technician adoption, and the PDF output should be visually near-identical to what they hand
   customers today. Also: is there a required document-number format (e.g. `NBC-PM-2568-0001`)?

6. **Thai fiscal year / Buddhist calendar.** Should document numbers and reports use the Buddhist
   Era (พ.ศ.)? This affects numbering, PDF headers, and date pickers.

### 5.2 Important — needed before build starts

7. **Customer authentication.** LINE Login (recommended, matches `@nbcservice`), phone OTP, or
   email/password? For B2B, do site contacts need individual logins with per-site scoping?

8. **Multi-unit jobs.** For a factory PM covering 40 units, is that **one job with 40 assets**
   (recommended) or 40 jobs? This affects quota counting most of all — hence `max_units` alongside
   `max_jobs` in the design above.

9. **Do they want an asset registry at all in phase 1?** It is the highest-value long-term feature
   but adds onboarding effort (someone must tag and enter existing units). It can be introduced
   progressively — created implicitly the first time a technician services a unit.

10. **Approval authority.** Who may approve an on-site quotation — supervisor only, or can a lead
    technician approve below a baht threshold? What is that threshold?

11. **Language.** The site uses GTranslate (machine translation). The app needs real i18n. Is
    Thai-only acceptable for staff screens, with Thai+English for customer-facing screens and PDFs
    (needed for multinational factory and hotel clients)?

12. **Hosting & PDPA.** Option A (Vercel/Neon, fastest) or Option B (Singapore/Thailand
    residency)? Is there an existing hosting relationship or IT policy we must respect? Who
    controls DNS for `nbcgroup.co.th` so we can add the `app.` subdomain?

13. **Notification budget.** LINE Messaging API is free up to a monthly message cap, then paid.
    Expected job volume per month so we can size this?

### 5.3 Nice to know

14. Approximate current volumes — jobs/day, active technicians, crews, active contract customers?
    This sizes the dispatch board UI and the analytics approach.
15. Does the customer need to see **pricing** in the portal, or only after a quotation is issued?
16. Is invoicing/e-Tax in scope, or does the system stop at "approved work order → hand off to
    accounting"?
17. Any parts inventory / van-stock tracking expected, or is `job_part` (consumption logging only)
    sufficient for phase 1?

### 5.4 Recommended delivery sequence

| Phase | Contents | Rationale |
|---|---|---|
| **0** | Schema, design tokens, brand kit, form field-mapping from paper originals | Everything downstream depends on the forms being right |
| **1** | Auth, customers/sites, job intake, quota engine, dispatch board, status tracking | The operational spine — usable by the office on day one |
| **2** | Technician PWA, three work-order forms, photos, signatures, PDF, offline sync | The field half; highest technical risk, so it gets a full phase |
| **3** | Inspection-fee ledger, quotations, customer portal, LINE notifications | Revenue mechanics, once the workflow is proven |
| **4** | Analytics dashboard, asset registry + PM auto-scheduling, exports | Compounding value on accumulated data |

**Highest technical risks, flagged early:** (a) offline sync conflict handling on the technician
PWA, (b) Thai typography in generated PDFs, (c) quota race conditions under concurrent booking.
All three are solved problems, but each needs deliberate design rather than discovery mid-sprint.

---

*Prepared for NBC Group Co., Ltd. — pending client confirmation of §5.1 before implementation.*
