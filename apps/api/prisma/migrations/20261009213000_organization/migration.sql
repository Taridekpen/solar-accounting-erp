-- Organization structure. system_metadata already exists from the first migration.

CREATE TYPE "record_status" AS ENUM ('active', 'inactive');
CREATE TYPE "employment_status" AS ENUM ('active', 'inactive', 'terminated');
CREATE TYPE "account_type" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE "normal_balance" AS ENUM ('debit', 'credit');

CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "singleton_key" TEXT NOT NULL DEFAULT 'default',
    "legal_name" TEXT NOT NULL,
    "trading_name" TEXT,
    "registration_number" TEXT,
    "tax_identification_number" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Nigeria',
    "base_currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "fiscal_year_start_month" INTEGER NOT NULL DEFAULT 1,
    "logo_url" TEXT,
    "status" "record_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "manager_id" UUID,
    "is_head_office" BOOLEAN NOT NULL DEFAULT false,
    "status" "record_status" NOT NULL DEFAULT 'active',
    "opening_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "record_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "branch_id" UUID NOT NULL,
    "department_id" UUID,
    "job_title" TEXT,
    "employment_status" "employment_status" NOT NULL DEFAULT 'active',
    "hire_date" DATE,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 4,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "account_code" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_type" "account_type" NOT NULL,
    "account_subtype" TEXT,
    "parent_account_id" UUID,
    "normal_balance" "normal_balance" NOT NULL,
    "is_postable" BOOLEAN NOT NULL DEFAULT true,
    "is_control_account" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_singleton_key_key" ON "companies"("singleton_key");
CREATE INDEX "branches_company_id_status_idx" ON "branches"("company_id", "status");
CREATE UNIQUE INDEX "branches_company_id_branch_code_key" ON "branches"("company_id", "branch_code");
CREATE UNIQUE INDEX "branches_one_head_office_per_company" ON "branches"("company_id") WHERE "is_head_office" = true AND "deleted_at" IS NULL;
CREATE INDEX "departments_company_id_branch_id_idx" ON "departments"("company_id", "branch_id");
CREATE UNIQUE INDEX "departments_company_code_key" ON "departments"("company_id", "code") WHERE "branch_id" IS NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "departments_branch_code_key" ON "departments"("company_id", "branch_id", "code") WHERE "branch_id" IS NOT NULL AND "deleted_at" IS NULL;
CREATE INDEX "employees_company_id_branch_id_idx" ON "employees"("company_id", "branch_id");
CREATE INDEX "employees_branch_id_hire_date_idx" ON "employees"("branch_id", "hire_date");
CREATE UNIQUE INDEX "employees_company_id_employee_number_key" ON "employees"("company_id", "employee_number");
CREATE INDEX "document_sequences_branch_id_document_type_idx" ON "document_sequences"("branch_id", "document_type");
CREATE UNIQUE INDEX "document_sequences_company_id_branch_id_document_type_key" ON "document_sequences"("company_id", "branch_id", "document_type");
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "accounts_company_id_account_type_idx" ON "accounts"("company_id", "account_type");
CREATE UNIQUE INDEX "accounts_company_id_account_code_key" ON "accounts"("company_id", "account_code");

ALTER TABLE "companies" ADD CONSTRAINT "companies_fiscal_month_check" CHECK ("fiscal_year_start_month" BETWEEN 1 AND 12);
ALTER TABLE "companies" ADD CONSTRAINT "companies_currency_check" CHECK ("base_currency" ~ '^[A-Z]{3}$');
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_next_number_check" CHECK ("next_number" >= 1);
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_padding_check" CHECK ("padding" BETWEEN 1 AND 12);

ALTER TABLE "branches" ADD CONSTRAINT "branches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
