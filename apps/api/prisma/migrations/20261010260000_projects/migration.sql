ALTER TYPE "stock_movement_type" ADD VALUE 'project_issue';
ALTER TYPE "stock_movement_type" ADD VALUE 'project_return';

CREATE TYPE "project_type" AS ENUM ('residential', 'commercial', 'industrial', 'maintenance', 'repairs', 'system_upgrade');
CREATE TYPE "project_status" AS ENUM ('draft', 'active', 'completed', 'cancelled');
CREATE TYPE "project_quotation_category" AS ENUM ('panels', 'inverters', 'batteries', 'mounting', 'cables', 'accessories', 'labor', 'transportation', 'subcontractors', 'other');
CREATE TYPE "project_budget_category" AS ENUM ('equipment', 'materials', 'labor', 'transportation', 'subcontractors', 'miscellaneous');
CREATE TYPE "project_material_status" AS ENUM ('requested', 'reserved', 'approved', 'issued', 'returned');
CREATE TYPE "project_milestone_status" AS ENUM ('pending', 'invoiced');

CREATE TABLE "projects" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "project_number" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "project_type" "project_type" NOT NULL,
  "location" TEXT NOT NULL,
  "contract_value" DECIMAL(19,4) NOT NULL,
  "estimated_cost" DECIMAL(19,4) NOT NULL,
  "start_date" DATE NOT NULL,
  "expected_completion_date" DATE NOT NULL,
  "actual_completion_date" DATE,
  "manager_id" UUID,
  "status" "project_status" NOT NULL DEFAULT 'draft',
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_quotations" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_quotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_quotation_lines" (
  "id" UUID NOT NULL,
  "quotation_id" UUID NOT NULL,
  "category" "project_quotation_category" NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit_amount" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "project_quotation_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_budgets" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "category" "project_budget_category" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_material_requests" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "reserved_quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(19,4),
  "status" "project_material_status" NOT NULL DEFAULT 'requested',
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_material_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_milestones" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "invoice_id" UUID,
  "status" "project_milestone_status" NOT NULL DEFAULT 'pending',
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sales_invoices" ADD COLUMN "project_id" UUID;

CREATE UNIQUE INDEX "projects_company_id_project_number_key" ON "projects"("company_id", "project_number");
CREATE INDEX "projects_company_id_branch_id_status_idx" ON "projects"("company_id", "branch_id", "status");
CREATE INDEX "projects_customer_id_idx" ON "projects"("customer_id");
CREATE INDEX "project_quotations_project_id_idx" ON "project_quotations"("project_id");
CREATE INDEX "project_quotation_lines_quotation_id_idx" ON "project_quotation_lines"("quotation_id");
CREATE UNIQUE INDEX "project_budgets_project_id_category_key" ON "project_budgets"("project_id", "category");
CREATE INDEX "project_material_requests_project_id_status_idx" ON "project_material_requests"("project_id", "status");
CREATE UNIQUE INDEX "project_milestones_invoice_id_key" ON "project_milestones"("invoice_id");
CREATE UNIQUE INDEX "project_milestones_project_id_sequence_key" ON "project_milestones"("project_id", "sequence");
CREATE INDEX "project_milestones_project_id_status_idx" ON "project_milestones"("project_id", "status");
CREATE INDEX "sales_invoices_project_id_idx" ON "sales_invoices"("project_id");
CREATE INDEX "journal_lines_project_id_idx" ON "journal_lines"("project_id");

ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quotations" ADD CONSTRAINT "project_quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_quotation_lines" ADD CONSTRAINT "project_quotation_lines_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "project_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_material_requests" ADD CONSTRAINT "project_material_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_material_requests" ADD CONSTRAINT "project_material_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_material_requests" ADD CONSTRAINT "project_material_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
