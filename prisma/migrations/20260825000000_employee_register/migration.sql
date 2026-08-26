-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('DAILY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('PROBATION', 'ACTIVE', 'ON_LEAVE', 'RESIGNED');

-- AlterTable
ALTER TABLE "technicians" ADD COLUMN     "employeeId" TEXT;

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "employeeCode" TEXT NOT NULL,
    "titleTh" TEXT,
    "firstNameTh" TEXT NOT NULL,
    "lastNameTh" TEXT NOT NULL,
    "nickname" TEXT,
    "nationalIdEnc" TEXT,
    "nationalIdLast4" TEXT,
    "birthDate" DATE,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRel" TEXT,
    "position" TEXT NOT NULL,
    "department" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'DAILY',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'PROBATION',
    "wageRate" DECIMAL(12,2),
    "hiredAt" DATE,
    "probationEndAt" DATE,
    "resignedAt" DATE,
    "bankName" TEXT,
    "bankAccountEnc" TEXT,
    "bankAccountLast4" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_access_logs" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeCode_key" ON "employees"("employeeCode");

-- CreateIndex
CREATE INDEX "employees_status_isActive_idx" ON "employees"("status", "isActive");

-- CreateIndex
CREATE INDEX "employees_lastNameTh_firstNameTh_idx" ON "employees"("lastNameTh", "firstNameTh");

-- CreateIndex
CREATE INDEX "employee_access_logs_employeeId_at_idx" ON "employee_access_logs"("employeeId", "at");

-- CreateIndex
CREATE INDEX "employee_access_logs_actorId_at_idx" ON "employee_access_logs"("actorId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_employeeId_key" ON "technicians"("employeeId");

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_access_logs" ADD CONSTRAINT "employee_access_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
