-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('INSPECTION_REPAIR', 'CLEANING_PM', 'REPAIR', 'INSTALLATION');

-- CreateEnum
CREATE TYPE "JobSize" AS ENUM ('S', 'M', 'L', 'XL');

-- CreateEnum
CREATE TYPE "AcType" AS ENUM ('WALL', 'CEILING', 'STANDING', 'CASSETTE_4WAY', 'CONCEALED_SMALL', 'CONCEALED_LARGE', 'VRV_VRF', 'AHU', 'CHILLER', 'OTHER');

-- CreateEnum
CREATE TYPE "PricingTier" AS ENUM ('CONTRACT', 'STANDARD');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "CustomerSegment" AS ENUM ('FACTORY', 'HOSPITAL', 'HOTEL', 'OFFICE', 'MALL', 'RESIDENTIAL', 'GOVERNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('LINE', 'PHONE_OTP', 'EMAIL');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('ANNUAL', 'MONTHLY', 'PER_VISIT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SCHEDULED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'IN_PROGRESS', 'PENDING_QUOTE', 'QUOTE_APPROVED', 'QUOTE_REJECTED', 'COMPLETED', 'REPORT_APPROVED', 'CLOSED', 'CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "JobPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CreatedVia" AS ENUM ('WEB', 'LINE', 'PHONE', 'ADMIN');

-- CreateEnum
CREATE TYPE "FeeWaiveReason" AS ENUM ('CONTRACT', 'PROMOTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "QuotaScopeType" AS ENUM ('DATE', 'WEEKDAY', 'DATE_RANGE');

-- CreateEnum
CREATE TYPE "QuotaDayStatus" AS ENUM ('OPEN', 'FULL', 'MANUALLY_CLOSED', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "FormCode" AS ENUM ('INSPECTION_REQUEST', 'CLEANING_PM', 'REPAIR');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('CUSTOMER', 'TECHNICIAN', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('PDF');

-- CreateEnum
CREATE TYPE "SequenceResetPolicy" AS ENUM ('NEVER', 'YEARLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('INSPECTION_FEE', 'INSPECTION_FEE_CREDIT', 'LABOUR', 'PART', 'TRAVEL', 'SURCHARGE', 'DISCOUNT');

-- CreateEnum
CREATE TYPE "ChargeSource" AS ENUM ('AUTO_POLICY', 'MANUAL');

-- CreateEnum
CREATE TYPE "CreditMode" AS ENUM ('FULL', 'PARTIAL', 'CAPPED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('BEFORE', 'AFTER', 'DEFECT', 'NAMEPLATE', 'SERIAL', 'DOCUMENT', 'SIGNATURE', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('LINE', 'EMAIL', 'SMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "inspection_fee_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ServiceCategory",
    "zoneId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "waiveForContractCustomer" BOOLEAN NOT NULL DEFAULT true,
    "creditOnProceed" BOOLEAN NOT NULL DEFAULT true,
    "creditMode" "CreditMode" NOT NULL DEFAULT 'FULL',
    "creditValue" DECIMAL(12,2),
    "minJobValueForCredit" DECIMAL(12,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_fee_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_charges" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "ChargeType" NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amountSigned" DECIMAL(12,2) NOT NULL,
    "source" "ChargeSource" NOT NULL DEFAULT 'MANUAL',
    "policyId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "quotationNo" TEXT NOT NULL,
    "jobId" TEXT,
    "customerId" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_lines" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_policies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "maxAmountForTechnician" DECIMAL(12,2) NOT NULL DEFAULT 2000,
    "requiresRoleCode" TEXT NOT NULL DEFAULT 'SUPERVISOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_catalog_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "jobSize" "JobSize" NOT NULL DEFAULT 'S',
    "acType" "AcType",
    "btuMin" INTEGER,
    "btuMax" INTEGER,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "standardDurationMin" INTEGER NOT NULL,
    "priceContract" DECIMAL(12,2) NOT NULL,
    "priceStandard" DECIMAL(12,2) NOT NULL,
    "crewSize" INTEGER NOT NULL DEFAULT 2,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,

    CONSTRAINT "part_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "categoryId" TEXT,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'ชิ้น',
    "defaultPrice" DECIMAL(12,2) NOT NULL,
    "warrantyMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "type" "ContractType" NOT NULL DEFAULT 'ANNUAL',
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "pricingTier" "PricingTier" NOT NULL DEFAULT 'CONTRACT',
    "inspectionFeeWaived" BOOLEAN NOT NULL DEFAULT true,
    "includedPmVisitsPerYear" INTEGER DEFAULT 2,
    "slaResponseHours" INTEGER NOT NULL DEFAULT 24,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_sites" (
    "contractId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "contract_sites_pkey" PRIMARY KEY ("contractId","siteId")
);

-- CreateTable
CREATE TABLE "contract_included_services" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "serviceCatalogItemId" TEXT,
    "category" "ServiceCategory" NOT NULL,
    "quantityPerYear" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "contract_included_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'CORPORATE',
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "taxId" TEXT,
    "segment" "CustomerSegment" NOT NULL DEFAULT 'OTHER',
    "defaultPricingTier" "PricingTier" NOT NULL DEFAULT 'STANDARD',
    "billingAddress" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sites" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "subDistrict" TEXT,
    "district" TEXT,
    "province" TEXT,
    "postcode" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "zoneId" TEXT,
    "accessNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "siteId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "position" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_identities" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "acType" "AcType" NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNo" TEXT,
    "btu" INTEGER,
    "refrigerant" TEXT,
    "installedAt" TIMESTAMP(3),
    "locationInBuilding" TEXT,
    "pmFrequencyPerYear" INTEGER NOT NULL DEFAULT 2,
    "lastPmAt" TIMESTAMP(3),
    "nextPmDueAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technicians" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "nickname" TEXT,
    "phone" TEXT,
    "zoneId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "hiredAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_skills" (
    "technicianId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "certifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "technician_skills_pkey" PRIMARY KEY ("technicianId","skillId")
);

-- CreateTable
CREATE TABLE "crews" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneId" TEXT,
    "leadTechnicianId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_members" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),

    CONSTRAINT "crew_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_shifts" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "availableMinutes" INTEGER NOT NULL DEFAULT 480,
    "note" TEXT,

    CONSTRAINT "technician_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_assignments" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequenceNo" INTEGER NOT NULL DEFAULT 1,
    "etaAt" TIMESTAMP(3),
    "unassignedAt" TIMESTAMP(3),

    CONSTRAINT "job_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "totpSecret" TEXT,
    "name" TEXT NOT NULL,
    "avatarKey" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'th',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "jobNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "contractId" TEXT,
    "zoneId" TEXT,
    "category" "ServiceCategory" NOT NULL,
    "jobSize" "JobSize" NOT NULL DEFAULT 'S',
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "JobPriority" NOT NULL DEFAULT 'NORMAL',
    "requestedDate" DATE,
    "scheduledDate" DATE,
    "scheduledWindowFrom" TIMESTAMP(3),
    "scheduledWindowTo" TIMESTAMP(3),
    "quotaDayId" TEXT,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "unitCount" INTEGER NOT NULL DEFAULT 1,
    "slaDueAt" TIMESTAMP(3),
    "feeWaivedReason" "FeeWaiveReason",
    "createdVia" "CreatedVia" NOT NULL DEFAULT 'WEB',
    "problemDescription" TEXT,
    "internalNotes" TEXT,
    "createdById" TEXT,
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_assets" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assetId" TEXT,
    "serviceCatalogItemId" TEXT,
    "acTypeSnapshot" "AcType",
    "descriptionSnapshot" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "durationMin" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "job_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_status_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus" NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "job_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_notes" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'OTHER',
    "storageKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "exifTakenAt" TIMESTAMP(3),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'LINE',
    "subjectTh" TEXT,
    "bodyTh" TEXT NOT NULL,
    "subjectEn" TEXT,
    "bodyEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "templateCode" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "payload" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "jobId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "isAssumption" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "provinces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeType" "QuotaScopeType" NOT NULL DEFAULT 'WEEKDAY',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "weekdayMask" INTEGER NOT NULL DEFAULT 126,
    "zoneId" TEXT,
    "category" "ServiceCategory" NOT NULL,
    "jobSize" "JobSize",
    "maxJobs" INTEGER,
    "maxUnits" INTEGER,
    "maxTechnicianMinutes" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quota_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_days" (
    "id" TEXT NOT NULL,
    "quotaDate" DATE NOT NULL,
    "zoneId" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "jobSize" "JobSize" NOT NULL,
    "capacityJobs" INTEGER,
    "capacityUnits" INTEGER,
    "capacityMinutes" INTEGER,
    "usedJobs" INTEGER NOT NULL DEFAULT 0,
    "usedUnits" INTEGER NOT NULL DEFAULT 0,
    "usedMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "QuotaDayStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quota_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_holds" (
    "id" TEXT NOT NULL,
    "quotaDayId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_override_logs" (
    "id" TEXT NOT NULL,
    "quotaDayId" TEXT NOT NULL,
    "actorId" TEXT,
    "reason" TEXT NOT NULL,
    "deltaJobs" INTEGER NOT NULL DEFAULT 0,
    "deltaUnits" INTEGER NOT NULL DEFAULT 0,
    "deltaMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_override_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "isWorkingDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_templates" (
    "id" TEXT NOT NULL,
    "code" "FormCode" NOT NULL,
    "version" INTEGER NOT NULL,
    "titleTh" TEXT NOT NULL,
    "titleEn" TEXT,
    "schema" JSONB NOT NULL,
    "pdfTemplateKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateCode" "FormCode" NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "docNo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "returnReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_reports" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "findings" TEXT,
    "rootCause" TEXT,
    "actionTaken" TEXT,
    "recommendation" TEXT,
    "measurements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_parts" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "partId" TEXT,
    "partNameSnapshot" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "serialNo" TEXT,
    "warrantyMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "signerRole" "SignerRole" NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerPosition" TEXT,
    "storageKey" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceInfo" TEXT,
    "ip" TEXT,
    "payloadHash" TEXT NOT NULL,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_renders" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "format" "DocumentFormat" NOT NULL DEFAULT 'PDF',
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "renderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_renders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "resetPolicy" "SequenceResetPolicy" NOT NULL DEFAULT 'YEARLY',
    "lastResetKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspection_fee_policies_category_isActive_idx" ON "inspection_fee_policies"("category", "isActive");

-- CreateIndex
CREATE INDEX "inspection_fee_policies_effectiveFrom_effectiveTo_idx" ON "inspection_fee_policies"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "job_charges_jobId_type_idx" ON "job_charges"("jobId", "type");

-- CreateIndex
CREATE INDEX "job_charges_createdAt_idx" ON "job_charges"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotationNo_key" ON "quotations"("quotationNo");

-- CreateIndex
CREATE INDEX "quotations_jobId_idx" ON "quotations"("jobId");

-- CreateIndex
CREATE INDEX "quotations_customerId_status_idx" ON "quotations"("customerId", "status");

-- CreateIndex
CREATE INDEX "quotation_lines_quotationId_idx" ON "quotation_lines"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_policies_code_key" ON "approval_policies"("code");

-- CreateIndex
CREATE INDEX "service_catalog_items_category_jobSize_idx" ON "service_catalog_items"("category", "jobSize");

-- CreateIndex
CREATE INDEX "service_catalog_items_acType_idx" ON "service_catalog_items"("acType");

-- CreateIndex
CREATE INDEX "service_catalog_items_isActive_activeFrom_activeTo_idx" ON "service_catalog_items"("isActive", "activeFrom", "activeTo");

-- CreateIndex
CREATE UNIQUE INDEX "service_catalog_items_code_activeFrom_key" ON "service_catalog_items"("code", "activeFrom");

-- CreateIndex
CREATE UNIQUE INDEX "part_categories_code_key" ON "part_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "parts_sku_key" ON "parts"("sku");

-- CreateIndex
CREATE INDEX "parts_categoryId_idx" ON "parts"("categoryId");

-- CreateIndex
CREATE INDEX "parts_isActive_idx" ON "parts"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_contractNo_key" ON "contracts"("contractNo");

-- CreateIndex
CREATE INDEX "contracts_customerId_idx" ON "contracts"("customerId");

-- CreateIndex
CREATE INDEX "contracts_status_endsOn_idx" ON "contracts"("status", "endsOn");

-- CreateIndex
CREATE INDEX "contract_included_services_contractId_idx" ON "contract_included_services"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE INDEX "customers_segment_idx" ON "customers"("segment");

-- CreateIndex
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");

-- CreateIndex
CREATE INDEX "customer_sites_zoneId_idx" ON "customer_sites"("zoneId");

-- CreateIndex
CREATE INDEX "customer_sites_customerId_idx" ON "customer_sites"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sites_customerId_code_key" ON "customer_sites"("customerId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_contacts_userId_key" ON "customer_contacts"("userId");

-- CreateIndex
CREATE INDEX "customer_contacts_customerId_idx" ON "customer_contacts"("customerId");

-- CreateIndex
CREATE INDEX "customer_contacts_phone_idx" ON "customer_contacts"("phone");

-- CreateIndex
CREATE INDEX "customer_identities_contactId_idx" ON "customer_identities"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identities_provider_externalId_key" ON "customer_identities"("provider", "externalId");

-- CreateIndex
CREATE INDEX "assets_siteId_idx" ON "assets"("siteId");

-- CreateIndex
CREATE INDEX "assets_nextPmDueAt_idx" ON "assets"("nextPmDueAt");

-- CreateIndex
CREATE INDEX "assets_acType_idx" ON "assets"("acType");

-- CreateIndex
CREATE UNIQUE INDEX "assets_siteId_assetTag_key" ON "assets"("siteId", "assetTag");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_userId_key" ON "technicians"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_employeeCode_key" ON "technicians"("employeeCode");

-- CreateIndex
CREATE INDEX "technicians_zoneId_isActive_idx" ON "technicians"("zoneId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "skills_code_key" ON "skills"("code");

-- CreateIndex
CREATE UNIQUE INDEX "crews_code_key" ON "crews"("code");

-- CreateIndex
CREATE INDEX "crews_zoneId_isActive_idx" ON "crews"("zoneId", "isActive");

-- CreateIndex
CREATE INDEX "crew_members_crewId_idx" ON "crew_members"("crewId");

-- CreateIndex
CREATE INDEX "crew_members_technicianId_idx" ON "crew_members"("technicianId");

-- CreateIndex
CREATE INDEX "technician_shifts_workDate_idx" ON "technician_shifts"("workDate");

-- CreateIndex
CREATE UNIQUE INDEX "technician_shifts_technicianId_workDate_key" ON "technician_shifts"("technicianId", "workDate");

-- CreateIndex
CREATE INDEX "job_assignments_jobId_idx" ON "job_assignments"("jobId");

-- CreateIndex
CREATE INDEX "job_assignments_crewId_assignedAt_idx" ON "job_assignments"("crewId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_jobNo_key" ON "jobs"("jobNo");

-- CreateIndex
CREATE INDEX "jobs_scheduledDate_status_idx" ON "jobs"("scheduledDate", "status");

-- CreateIndex
CREATE INDEX "jobs_customerId_idx" ON "jobs"("customerId");

-- CreateIndex
CREATE INDEX "jobs_siteId_idx" ON "jobs"("siteId");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_zoneId_scheduledDate_idx" ON "jobs"("zoneId", "scheduledDate");

-- CreateIndex
CREATE INDEX "jobs_quotaDayId_idx" ON "jobs"("quotaDayId");

-- CreateIndex
CREATE INDEX "job_assets_jobId_idx" ON "job_assets"("jobId");

-- CreateIndex
CREATE INDEX "job_assets_assetId_idx" ON "job_assets"("assetId");

-- CreateIndex
CREATE INDEX "job_status_events_jobId_occurredAt_idx" ON "job_status_events"("jobId", "occurredAt");

-- CreateIndex
CREATE INDEX "job_status_events_toStatus_occurredAt_idx" ON "job_status_events"("toStatus", "occurredAt");

-- CreateIndex
CREATE INDEX "job_notes_jobId_idx" ON "job_notes"("jobId");

-- CreateIndex
CREATE INDEX "attachments_entityType_entityId_kind_idx" ON "attachments"("entityType", "entityId", "kind");

-- CreateIndex
CREATE INDEX "attachments_sha256_idx" ON "attachments"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_code_key" ON "notification_templates"("code");

-- CreateIndex
CREATE INDEX "notification_logs_status_createdAt_idx" ON "notification_logs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "notification_logs_jobId_idx" ON "notification_logs"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "app_config_key_key" ON "app_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE UNIQUE INDEX "zones_code_key" ON "zones"("code");

-- CreateIndex
CREATE INDEX "quota_rules_category_isActive_idx" ON "quota_rules"("category", "isActive");

-- CreateIndex
CREATE INDEX "quota_rules_effectiveFrom_effectiveTo_idx" ON "quota_rules"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "quota_days_quotaDate_status_idx" ON "quota_days"("quotaDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quota_days_quotaDate_zoneId_category_jobSize_key" ON "quota_days"("quotaDate", "zoneId", "category", "jobSize");

-- CreateIndex
CREATE INDEX "quota_holds_quotaDayId_idx" ON "quota_holds"("quotaDayId");

-- CreateIndex
CREATE INDEX "quota_holds_expiresAt_idx" ON "quota_holds"("expiresAt");

-- CreateIndex
CREATE INDEX "quota_holds_sessionKey_idx" ON "quota_holds"("sessionKey");

-- CreateIndex
CREATE INDEX "quota_override_logs_quotaDayId_idx" ON "quota_override_logs"("quotaDayId");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE INDEX "form_templates_code_isActive_idx" ON "form_templates"("code", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_code_version_key" ON "form_templates"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_docNo_key" ON "work_orders"("docNo");

-- CreateIndex
CREATE INDEX "work_orders_jobId_idx" ON "work_orders"("jobId");

-- CreateIndex
CREATE INDEX "work_orders_status_idx" ON "work_orders"("status");

-- CreateIndex
CREATE INDEX "work_orders_templateCode_createdAt_idx" ON "work_orders"("templateCode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_reports_workOrderId_key" ON "job_reports"("workOrderId");

-- CreateIndex
CREATE INDEX "job_parts_workOrderId_idx" ON "job_parts"("workOrderId");

-- CreateIndex
CREATE INDEX "job_parts_partId_idx" ON "job_parts"("partId");

-- CreateIndex
CREATE INDEX "signatures_workOrderId_idx" ON "signatures"("workOrderId");

-- CreateIndex
CREATE INDEX "document_renders_workOrderId_isCurrent_idx" ON "document_renders"("workOrderId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_code_key" ON "document_sequences"("code");

-- AddForeignKey
ALTER TABLE "inspection_fee_policies" ADD CONSTRAINT "inspection_fee_policies_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_charges" ADD CONSTRAINT "job_charges_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_charges" ADD CONSTRAINT "job_charges_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "inspection_fee_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_charges" ADD CONSTRAINT "job_charges_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_partId_fkey" FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "part_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_sites" ADD CONSTRAINT "contract_sites_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_sites" ADD CONSTRAINT "contract_sites_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "customer_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_included_services" ADD CONSTRAINT "contract_included_services_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_included_services" ADD CONSTRAINT "contract_included_services_serviceCatalogItemId_fkey" FOREIGN KEY ("serviceCatalogItemId") REFERENCES "service_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sites" ADD CONSTRAINT "customer_sites_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sites" ADD CONSTRAINT "customer_sites_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "customer_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_identities" ADD CONSTRAINT "customer_identities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "customer_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "customer_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crews" ADD CONSTRAINT "crews_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crews" ADD CONSTRAINT "crews_leadTechnicianId_fkey" FOREIGN KEY ("leadTechnicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_shifts" ADD CONSTRAINT "technician_shifts_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "customer_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_quotaDayId_fkey" FOREIGN KEY ("quotaDayId") REFERENCES "quota_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assets" ADD CONSTRAINT "job_assets_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assets" ADD CONSTRAINT "job_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assets" ADD CONSTRAINT "job_assets_serviceCatalogItemId_fkey" FOREIGN KEY ("serviceCatalogItemId") REFERENCES "service_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_status_events" ADD CONSTRAINT "job_status_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_status_events" ADD CONSTRAINT "job_status_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_templateCode_fkey" FOREIGN KEY ("templateCode") REFERENCES "notification_templates"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_rules" ADD CONSTRAINT "quota_rules_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_days" ADD CONSTRAINT "quota_days_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_holds" ADD CONSTRAINT "quota_holds_quotaDayId_fkey" FOREIGN KEY ("quotaDayId") REFERENCES "quota_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_override_logs" ADD CONSTRAINT "quota_override_logs_quotaDayId_fkey" FOREIGN KEY ("quotaDayId") REFERENCES "quota_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_override_logs" ADD CONSTRAINT "quota_override_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_partId_fkey" FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_renders" ADD CONSTRAINT "document_renders_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
