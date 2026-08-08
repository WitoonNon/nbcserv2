-- The two price columns were never a customer-tier split.
--
-- Client-confirmed 9 ส.ค. 2569: figures like แขวน 900–1,100 are a quotation
-- band that depends on site conditions — access difficulty, working height and
-- total quantity, where a bigger job costs LESS per unit. Named
-- priceContract/priceStandard they read as "contract customers always pay the
-- low number", which would have quietly under-billed every contract customer
-- and over-billed every other one.
--
-- Written by hand as a RENAME rather than letting Prisma drop and re-add the
-- columns, so existing rows keep their values.
ALTER TABLE "service_catalog_items" RENAME COLUMN "priceContract" TO "priceMin";
ALTER TABLE "service_catalog_items" RENAME COLUMN "priceStandard" TO "priceMax";
