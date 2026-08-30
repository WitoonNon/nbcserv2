-- CreateTable
CREATE TABLE "employee_wage_changes" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "wageRate" DECIMAL(12,2) NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "previousRate" DECIMAL(12,2),
    "reason" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_wage_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_wage_changes_employeeId_effectiveFrom_idx" ON "employee_wage_changes"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "employee_wage_changes_employeeId_effectiveFrom_key" ON "employee_wage_changes"("employeeId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "employee_wage_changes" ADD CONSTRAINT "employee_wage_changes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
