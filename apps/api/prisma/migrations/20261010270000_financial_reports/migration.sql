CREATE TYPE "tax_code_kind" AS ENUM ('output', 'input', 'withholding');
CREATE TYPE "fixed_asset_status" AS ENUM ('active', 'disposed');
CREATE TYPE "depreciation_method" AS ENUM ('straight_line');

ALTER TABLE "stock_movements" ADD COLUMN "warehouse_id" UUID;

CREATE TABLE "tax_codes" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "tax_code_kind" NOT NULL,
  "rate" DECIMAL(19,4) NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "account_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "statement_budgets" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "budget_month" DATE NOT NULL,
  "line_code" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "statement_budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fixed_assets" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "asset_number" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "acquisition_date" DATE NOT NULL,
  "cost" DECIMAL(19,4) NOT NULL,
  "useful_life_months" INTEGER NOT NULL,
  "depreciation_method" "depreciation_method" NOT NULL DEFAULT 'straight_line',
  "status" "fixed_asset_status" NOT NULL DEFAULT 'active',
  "disposal_date" DATE,
  "disposal_proceeds" DECIMAL(19,4),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tax_codes_company_id_code_key" ON "tax_codes"("company_id", "code");
CREATE INDEX "tax_codes_company_id_kind_idx" ON "tax_codes"("company_id", "kind");
CREATE UNIQUE INDEX "statement_budgets_branch_id_budget_month_line_code_key" ON "statement_budgets"("branch_id", "budget_month", "line_code");
CREATE UNIQUE INDEX "fixed_assets_company_id_asset_number_key" ON "fixed_assets"("company_id", "asset_number");
CREATE INDEX "fixed_assets_company_id_branch_id_status_idx" ON "fixed_assets"("company_id", "branch_id", "status");
CREATE INDEX "stock_movements_warehouse_id_idx" ON "stock_movements"("warehouse_id");

ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "statement_budgets" ADD CONSTRAINT "statement_budgets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "statement_budgets" ADD CONSTRAINT "statement_budgets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "accounts" (
  "id", "company_id", "account_code", "account_name", "account_type", "account_subtype",
  "normal_balance", "is_postable", "is_control_account", "is_active", "created_at", "updated_at"
)
SELECT gen_random_uuid(), company."id", '6800', 'Tax Expense', 'expense', 'tax_expense',
  'debit', true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "companies" company
WHERE NOT EXISTS (
  SELECT 1 FROM "accounts" existing
  WHERE existing."company_id" = company."id" AND existing."account_code" = '6800'
);

INSERT INTO "accounts" (
  "id", "company_id", "account_code", "account_name", "account_type", "account_subtype",
  "normal_balance", "is_postable", "is_control_account", "is_active", "created_at", "updated_at"
)
SELECT gen_random_uuid(), company."id", '2420', 'Withholding Tax Payable', 'liability', 'tax',
  'credit', true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "companies" company
WHERE NOT EXISTS (
  SELECT 1 FROM "accounts" existing
  WHERE existing."company_id" = company."id" AND existing."account_code" = '2420'
);

INSERT INTO "tax_codes" (
  "id", "company_id", "code", "name", "kind", "rate", "effective_from", "account_id", "created_at", "updated_at"
)
SELECT gen_random_uuid(), account."company_id", 'VAT-OUTPUT', 'Output VAT', 'output', 7.5000, DATE '2026-01-01', account."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "accounts" account
WHERE account."account_code" = '2400' AND account."deleted_at" IS NULL
AND NOT EXISTS (
  SELECT 1 FROM "tax_codes" existing
  WHERE existing."company_id" = account."company_id" AND existing."code" = 'VAT-OUTPUT'
);

INSERT INTO "document_sequences" (
  "id", "company_id", "branch_id", "document_type", "prefix", "next_number", "padding", "created_at", "updated_at"
)
SELECT gen_random_uuid(), branch."company_id", branch."id", 'fixed_asset', 'AST', 1, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "branches" branch
WHERE branch."deleted_at" IS NULL
AND NOT EXISTS (
  SELECT 1 FROM "document_sequences" existing
  WHERE existing."branch_id" = branch."id" AND existing."document_type" = 'fixed_asset'
);
