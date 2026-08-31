-- CreateEnum
CREATE TYPE "TimeClockKind" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "GeofenceVerdict" AS ENUM ('INSIDE', 'OUTSIDE', 'NO_FIX', 'UNRELIABLE');

-- CreateTable
CREATE TABLE "time_clock_entries" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "TimeClockKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanPointId" TEXT NOT NULL,
    "tokenKind" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyMetres" DOUBLE PRECISION,
    "geofence" "GeofenceVerdict" NOT NULL,
    "distanceMetres" INTEGER,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_clock_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_clock_entries_employeeId_occurredAt_idx" ON "time_clock_entries"("employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "time_clock_entries_needsReview_occurredAt_idx" ON "time_clock_entries"("needsReview", "occurredAt");

-- AddForeignKey
ALTER TABLE "time_clock_entries" ADD CONSTRAINT "time_clock_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_clock_entries" ADD CONSTRAINT "time_clock_entries_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
