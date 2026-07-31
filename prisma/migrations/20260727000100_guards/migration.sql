-- ---------------------------------------------------------------------------
-- Database-level guards.
--
-- These are the second line of defence. The application already serialises
-- booking with SELECT ... FOR UPDATE, but a quota bug must never be able to
-- silently oversell a day: Postgres refuses the write instead.
--
-- Prisma cannot express CHECK constraints or partial unique indexes in the
-- schema language, so they live here and are preserved across `migrate dev`.
--
-- Naming note: tables are snake_case (via @@map) while columns keep Prisma's
-- camelCase default, so column identifiers must stay double-quoted.
-- ---------------------------------------------------------------------------

-- === Quota: consumption can never exceed configured capacity ===============
ALTER TABLE "quota_days"
  ADD CONSTRAINT "quota_days_jobs_within_capacity"
  CHECK ("capacityJobs" IS NULL OR "usedJobs" <= "capacityJobs");

ALTER TABLE "quota_days"
  ADD CONSTRAINT "quota_days_units_within_capacity"
  CHECK ("capacityUnits" IS NULL OR "usedUnits" <= "capacityUnits");

ALTER TABLE "quota_days"
  ADD CONSTRAINT "quota_days_minutes_within_capacity"
  CHECK ("capacityMinutes" IS NULL OR "usedMinutes" <= "capacityMinutes");

-- Releasing a slot must never drive a counter negative.
ALTER TABLE "quota_days"
  ADD CONSTRAINT "quota_days_used_non_negative"
  CHECK ("usedJobs" >= 0 AND "usedUnits" >= 0 AND "usedMinutes" >= 0);

ALTER TABLE "quota_days"
  ADD CONSTRAINT "quota_days_capacity_non_negative"
  CHECK (
    ("capacityJobs"    IS NULL OR "capacityJobs"    >= 0) AND
    ("capacityUnits"   IS NULL OR "capacityUnits"   >= 0) AND
    ("capacityMinutes" IS NULL OR "capacityMinutes" >= 0)
  );

ALTER TABLE "quota_holds"
  ADD CONSTRAINT "quota_holds_positive"
  CHECK ("units" >= 0 AND "minutes" >= 0);

-- === Billing: the charge ledger must keep its sign convention ==============
-- Credits and discounts are stored negative; fees and labour positive. This is
-- what makes SUM("amountSigned") a trustworthy net payable.
ALTER TABLE "job_charges"
  ADD CONSTRAINT "job_charges_sign_convention"
  CHECK (
    CASE "type"
      WHEN 'INSPECTION_FEE_CREDIT' THEN "amountSigned" <= 0
      WHEN 'DISCOUNT'              THEN "amountSigned" <= 0
      ELSE "amountSigned" >= 0
    END
  );

-- At most one inspection-fee credit per job — the credit must never be applied
-- twice for the same inspection.
CREATE UNIQUE INDEX "job_charges_one_inspection_credit"
  ON "job_charges" ("jobId")
  WHERE "type" = 'INSPECTION_FEE_CREDIT';

-- === Documents: exactly one current render per work order ==================
CREATE UNIQUE INDEX "document_renders_one_current"
  ON "document_renders" ("workOrderId")
  WHERE "isCurrent" = true;

-- === Signatures: payload hash must be a full SHA-256 ======================
ALTER TABLE "signatures"
  ADD CONSTRAINT "signatures_payload_hash_sha256"
  CHECK (char_length("payloadHash") = 64);

-- === Contracts / catalogue: validity windows must be coherent =============
ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_period_valid"
  CHECK ("endsOn" >= "startsOn");

ALTER TABLE "service_catalog_items"
  ADD CONSTRAINT "service_catalog_period_valid"
  CHECK ("activeTo" IS NULL OR "activeTo" >= "activeFrom");

ALTER TABLE "service_catalog_items"
  ADD CONSTRAINT "service_catalog_duration_positive"
  CHECK ("standardDurationMin" > 0);

ALTER TABLE "service_catalog_items"
  ADD CONSTRAINT "service_catalog_btu_band_valid"
  CHECK ("btuMin" IS NULL OR "btuMax" IS NULL OR "btuMax" >= "btuMin");

-- === Assets: PM frequency stays within a sane band ========================
-- NBC publishes 2 / 3 / 4 visits per year by usage profile.
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_pm_frequency_valid"
  CHECK ("pmFrequencyPerYear" BETWEEN 1 AND 12);
