-- CreateEnum
CREATE TYPE "HrRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OvertimeKind" AS ENUM ('WORKDAY_OT', 'HOLIDAY_WORK', 'HOLIDAY_OT');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('SICK', 'PERSONAL', 'ANNUAL', 'UNPAID');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'CLOSED');

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "kind" "OvertimeKind" NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "HrRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedMultiplier" DECIMAL(4,2),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "paidInPeriodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "HrRequestStatus" NOT NULL DEFAULT 'PENDING',
    "totalDays" DECIMAL(5,2) NOT NULL,
    "paidDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "unpaidDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "countedInPeriodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "wageRate" DECIMAL(12,2) NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "daysWorked" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "paidLeaveDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "unpaidLeaveDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "baseSatang" INTEGER NOT NULL DEFAULT 0,
    "overtimeSatang" INTEGER NOT NULL DEFAULT 0,
    "additionsSatang" INTEGER NOT NULL DEFAULT 0,
    "deductionsSatang" INTEGER NOT NULL DEFAULT 0,
    "netSatang" INTEGER NOT NULL DEFAULT 0,
    "additions" JSONB,
    "deductions" JSONB,
    "raisedToLegalMinimum" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overtime_requests_employeeId_workDate_idx" ON "overtime_requests"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "overtime_requests_status_workDate_idx" ON "overtime_requests"("status", "workDate");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_fromDate_idx" ON "leave_requests"("employeeId", "fromDate");

-- CreateIndex
CREATE INDEX "leave_requests_status_fromDate_idx" ON "leave_requests"("status", "fromDate");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_code_key" ON "payroll_periods"("code");

-- CreateIndex
CREATE INDEX "payroll_periods_status_from_idx" ON "payroll_periods"("status", "from");

-- CreateIndex
CREATE INDEX "payroll_lines_periodId_idx" ON "payroll_lines"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_periodId_employeeId_key" ON "payroll_lines"("periodId", "employeeId");

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_paidInPeriodId_fkey" FOREIGN KEY ("paidInPeriodId") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_countedInPeriodId_fkey" FOREIGN KEY ("countedInPeriodId") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
