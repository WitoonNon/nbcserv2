-- ---------------------------------------------------------------------------
-- Quota: one bucket per (date, zone, category) - remove the job-size split.
--
-- Why: a rule saying "max 8 cleaning jobs per day" was materialised into four
-- buckets (S/M/L/XL), each granted the full allowance, so the calendar sold
-- 32 jobs a day. The same crews serve every size, so a per-size split also let
-- a day read "available" for one size while every technician was committed.
--
-- Job magnitude is already carried by capacityUnits and capacityMinutes: a
-- 40-unit factory PM consumes 40 units and 1,200 minutes, which is the correct
-- way to express "large".
--
-- The data steps run BEFORE the column drop because collapsing four rows into
-- one would otherwise violate the new unique index.
-- ---------------------------------------------------------------------------

-- 1. Pick one surviving bucket per (date, zone, category).
--    A plain table, not a TEMP one: the migration runner executes each
--    statement separately, so a temp table would vanish after this line.
DROP TABLE IF EXISTS "_quota_survivor";

CREATE TABLE "_quota_survivor" AS
SELECT DISTINCT ON ("quotaDate", "zoneId", "category")
       "id" AS survivor_id, "quotaDate", "zoneId", "category"
  FROM "quota_days"
 ORDER BY "quotaDate", "zoneId", "category", "id";

-- 2. Sum consumed capacity across the size buckets onto the survivor, so no
--    booked work is lost if this ever runs against a live database.
UPDATE "quota_days" d
   SET "usedJobs"    = t.used_jobs,
       "usedUnits"   = t.used_units,
       "usedMinutes" = t.used_minutes
  FROM (
        SELECT "quotaDate", "zoneId", "category",
               SUM("usedJobs")    AS used_jobs,
               SUM("usedUnits")   AS used_units,
               SUM("usedMinutes") AS used_minutes
          FROM "quota_days"
         GROUP BY "quotaDate", "zoneId", "category"
       ) t
  JOIN "_quota_survivor" s
    ON s."quotaDate" = t."quotaDate"
   AND s."zoneId"    = t."zoneId"
   AND s."category"  = t."category"
 WHERE d."id" = s.survivor_id;

-- 3. Repoint anything referencing a bucket that is about to disappear.
UPDATE "quota_holds" h
   SET "quotaDayId" = s.survivor_id
  FROM "quota_days" d
  JOIN "_quota_survivor" s
    ON s."quotaDate" = d."quotaDate"
   AND s."zoneId"    = d."zoneId"
   AND s."category"  = d."category"
 WHERE h."quotaDayId" = d."id"
   AND d."id" <> s.survivor_id;

UPDATE "jobs" j
   SET "quotaDayId" = s.survivor_id
  FROM "quota_days" d
  JOIN "_quota_survivor" s
    ON s."quotaDate" = d."quotaDate"
   AND s."zoneId"    = d."zoneId"
   AND s."category"  = d."category"
 WHERE j."quotaDayId" = d."id"
   AND d."id" <> s.survivor_id;

UPDATE "quota_override_logs" o
   SET "quotaDayId" = s.survivor_id
  FROM "quota_days" d
  JOIN "_quota_survivor" s
    ON s."quotaDate" = d."quotaDate"
   AND s."zoneId"    = d."zoneId"
   AND s."category"  = d."category"
 WHERE o."quotaDayId" = d."id"
   AND d."id" <> s.survivor_id;

-- 4. Remove the now-redundant buckets.
DELETE FROM "quota_days" d
 USING "_quota_survivor" s
 WHERE s."quotaDate" = d."quotaDate"
   AND s."zoneId"    = d."zoneId"
   AND s."category"  = d."category"
   AND d."id" <> s.survivor_id;

DROP TABLE "_quota_survivor";

-- 5. Schema change.
DROP INDEX "quota_days_quotaDate_zoneId_category_jobSize_key";

ALTER TABLE "quota_days" DROP COLUMN "jobSize";

ALTER TABLE "quota_rules" DROP COLUMN "jobSize";

CREATE UNIQUE INDEX "quota_days_quotaDate_zoneId_category_key"
  ON "quota_days" ("quotaDate", "zoneId", "category");
