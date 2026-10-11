CREATE TYPE "expense_status" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'paid');

CREATE TABLE "expense_categories" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "account_id" UUID NOT NULL,
  "status" "record_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_approval_policies" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "min_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "max_amount" DECIMAL(19,4),
  "branch_id" UUID,
  "department_id" UUID,
  "category_id" UUID,
  "role_code" TEXT,
  "company_wide" BOOLEAN NOT NULL DEFAULT false,
  "level" INTEGER NOT NULL DEFAULT 1,
  "requires_budget" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_approval_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_budgets" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "budget_month" DATE NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expenses" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "department_id" UUID,
  "category_id" UUID NOT NULL,
  "expense_number" TEXT NOT NULL,
  "expense_date" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "tax_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "supplier_id" UUID,
  "employee_id" UUID,
  "project_id" UUID,
  "status" "expense_status" NOT NULL DEFAULT 'draft',
  "approval_level" INTEGER NOT NULL DEFAULT 0,
  "receipt_name" TEXT NOT NULL,
  "receipt_data" BYTEA NOT NULL,
  "accrual_journal_id" UUID,
  "payment_journal_id" UUID,
  "payment_account_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_approvals" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "expense_id" UUID NOT NULL,
  "level" INTEGER NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "decision" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_categories_company_id_name_key" ON "expense_categories"("company_id", "name");
CREATE INDEX "expense_approval_policies_company_id_level_idx" ON "expense_approval_policies"("company_id", "level");
CREATE UNIQUE INDEX "expense_budgets_branch_id_category_id_budget_month_key" ON "expense_budgets"("branch_id", "category_id", "budget_month");
CREATE UNIQUE INDEX "expenses_company_id_expense_number_key" ON "expenses"("company_id", "expense_number");
CREATE UNIQUE INDEX "expenses_accrual_journal_id_key" ON "expenses"("accrual_journal_id");
CREATE UNIQUE INDEX "expenses_payment_journal_id_key" ON "expenses"("payment_journal_id");
CREATE INDEX "expenses_branch_id_status_idx" ON "expenses"("branch_id", "status");
CREATE INDEX "expense_approvals_expense_id_level_idx" ON "expense_approvals"("expense_id", "level");

ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_approval_policies" ADD CONSTRAINT "expense_approval_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_approval_policies" ADD CONSTRAINT "expense_approval_policies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_approval_policies" ADD CONSTRAINT "expense_approval_policies_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_approval_policies" ADD CONSTRAINT "expense_approval_policies_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
