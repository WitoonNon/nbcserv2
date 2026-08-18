-- A photograph added after the work order was handed in is real evidence, but
-- it is not part of what the customer signed: it never entered the payload the
-- signature hashes. Recording that distinction is what lets the office fix a
-- forgotten photo without quietly enlarging a signed document.
ALTER TABLE "attachments" ADD COLUMN "addedAfterSubmit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "attachments" ADD COLUMN "addedReason" TEXT;
