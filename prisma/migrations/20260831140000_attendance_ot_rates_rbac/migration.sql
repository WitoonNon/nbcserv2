-- AlterTable
ALTER TABLE "employee_wage_changes" ADD COLUMN     "otHolidayOtMultiplier" DECIMAL(4,2),
ADD COLUMN     "otHolidayWorkMultiplier" DECIMAL(4,2),
ADD COLUMN     "otWorkdayMultiplier" DECIMAL(4,2);

-- AlterTable
ALTER TABLE "payroll_lines" ADD COLUMN     "absentDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "attendanceSource" TEXT NOT NULL DEFAULT 'CALENDAR',
ADD COLUMN     "daysPresent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "minutesWorked" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openSessions" INTEGER NOT NULL DEFAULT 0;

