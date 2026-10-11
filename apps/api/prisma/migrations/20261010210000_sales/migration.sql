-- Customers, sales documents, and the stock quantities those documents issue.

CREATE TYPE "customer_type" AS ENUM ('individual', 'corporate');
CREATE TYPE "product_type" AS ENUM ('product', 'service');
CREATE TYPE "stock_movement_type" AS ENUM ('opening_balance', 'sales_issue', 'customer_return');
CREATE TYPE "quotation_status" AS ENUM ('draft', 'pending_approval', 'accepted', 'rejected', 'converted', 'cancelled');
CREATE TYPE "invoice_status" AS ENUM ('draft', 'posted', 'cancelled');
CREATE TYPE "sale_settlement" AS ENUM ('credit', 'cash');
CREATE TYPE "receipt_method" AS ENUM ('cash', 'bank_transfer', 'pos');
CREATE TYPE "return_status" AS ENUM ('requested', 'approved', 'rejected', 'inspected', 'posted');
CREATE TYPE "return_settlement" AS ENUM ('credit', 'refund');

CREATE TABLE "customers" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "customer_code" TEXT NOT NULL,
  "customer_type" "customer_type" NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "billing_address" TEXT,
  "delivery_address" TEXT,
  "tax_identifier" TEXT,
  "credit_limit" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
  "status" "record_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_branches" (
  "customer_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_branches_pkey" PRIMARY KEY ("customer_id", "branch_id")
);

CREATE TABLE "product_categories" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "brand" TEXT,
  "model" TEXT,
  "unit_of_measure" TEXT NOT NULL DEFAULT 'ea',
  "product_type" "product_type" NOT NULL,
  "tracking_method" TEXT NOT NULL DEFAULT 'none',
  "default_cost" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "default_selling_price" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "reorder_level" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "tax_rate" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "warranty_period" TEXT,
  "revenue_account_id" UUID,
  "status" "record_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "movement_type" "stock_movement_type" NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit_cost" DECIMAL(19,4) NOT NULL,
  "total_value" DECIMAL(19,4) NOT NULL,
  "source_document_type" TEXT NOT NULL,
  "source_document_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_balances" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "physical_quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "reserved_quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_quotations" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "quotation_number" TEXT NOT NULL,
  "validity_date" DATE NOT NULL,
  "terms" TEXT,
  "status" "quotation_status" NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "discount_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "tax_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "grand_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sales_quotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_quotation_lines" (
  "id" UUID NOT NULL,
  "quotation_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit_price" DECIMAL(19,4) NOT NULL,
  "discount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "tax_rate" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "line_net" DECIMAL(19,4) NOT NULL,
  "tax_amount" DECIMAL(19,4) NOT NULL,
  "line_total" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "sales_quotation_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_invoices" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "quotation_id" UUID,
  "invoice_number" TEXT NOT NULL,
  "invoice_date" DATE NOT NULL,
  "due_date" DATE NOT NULL,
  "payment_terms_days" INTEGER NOT NULL,
  "settlement" "sale_settlement" NOT NULL,
  "cash_method" "receipt_method",
  "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "discount_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "tax_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "grand_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
  "status" "invoice_status" NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "journal_entry_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "posted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_invoice_lines" (
  "id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit_price" DECIMAL(19,4) NOT NULL,
  "unit_cost" DECIMAL(19,4) NOT NULL,
  "discount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "tax_rate" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "line_net" DECIMAL(19,4) NOT NULL,
  "tax_amount" DECIMAL(19,4) NOT NULL,
  "line_total" DECIMAL(19,4) NOT NULL,
  "revenue_account_id" UUID NOT NULL,
  CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_invoice_taxes" (
  "id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "tax_rate" DECIMAL(19,4) NOT NULL,
  "taxable_amount" DECIMAL(19,4) NOT NULL,
  "tax_amount" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "sales_invoice_taxes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_invoice_allocations" (
  "id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_invoice_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_receipts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "receipt_number" TEXT NOT NULL,
  "receipt_date" DATE NOT NULL,
  "total" DECIMAL(19,4) NOT NULL,
  "advance_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "journal_entry_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_receipt_methods" (
  "id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "method" "receipt_method" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "customer_receipt_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_receipt_allocations" (
  "id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "customer_receipt_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_credit_notes" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "return_request_id" UUID,
  "credit_note_number" TEXT NOT NULL,
  "settlement" "return_settlement" NOT NULL,
  "refund_method" "receipt_method",
  "subtotal" DECIMAL(19,4) NOT NULL,
  "tax_total" DECIMAL(19,4) NOT NULL,
  "grand_total" DECIMAL(19,4) NOT NULL,
  "journal_entry_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_credit_note_lines" (
  "id" UUID NOT NULL,
  "credit_note_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit_price" DECIMAL(19,4) NOT NULL,
  "unit_cost" DECIMAL(19,4) NOT NULL,
  "tax_rate" DECIMAL(19,4) NOT NULL,
  "line_net" DECIMAL(19,4) NOT NULL,
  "tax_amount" DECIMAL(19,4) NOT NULL,
  "line_total" DECIMAL(19,4) NOT NULL,
  "revenue_account_id" UUID NOT NULL,
  CONSTRAINT "sales_credit_note_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_return_requests" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "status" "return_status" NOT NULL DEFAULT 'requested',
  "settlement" "return_settlement" NOT NULL,
  "refund_method" "receipt_method",
  "reason" TEXT NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "inspected_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sales_return_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_return_lines" (
  "id" UUID NOT NULL,
  "return_request_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "invoice_line_id" UUID NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "accepted_quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
  CONSTRAINT "sales_return_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_company_id_customer_code_key" ON "customers"("company_id", "customer_code");
CREATE INDEX "customers_company_id_status_idx" ON "customers"("company_id", "status");
CREATE UNIQUE INDEX "customers_company_phone_key" ON "customers"("company_id", "phone") WHERE "phone" IS NOT NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "customers_company_email_key" ON "customers"("company_id", "email") WHERE "email" IS NOT NULL AND "deleted_at" IS NULL;
CREATE INDEX "customer_branches_branch_id_idx" ON "customer_branches"("branch_id");
CREATE UNIQUE INDEX "product_categories_company_id_name_key" ON "product_categories"("company_id", "name");
CREATE UNIQUE INDEX "products_company_id_sku_key" ON "products"("company_id", "sku");
CREATE INDEX "products_company_id_product_type_status_idx" ON "products"("company_id", "product_type", "status");
CREATE INDEX "stock_movements_product_id_branch_id_occurred_at_idx" ON "stock_movements"("product_id", "branch_id", "occurred_at");
CREATE UNIQUE INDEX "stock_balances_company_id_product_id_branch_id_key" ON "stock_balances"("company_id", "product_id", "branch_id");
CREATE UNIQUE INDEX "sales_quotations_company_id_quotation_number_key" ON "sales_quotations"("company_id", "quotation_number");
CREATE INDEX "sales_quotations_company_id_branch_id_status_idx" ON "sales_quotations"("company_id", "branch_id", "status");
CREATE INDEX "sales_quotation_lines_quotation_id_idx" ON "sales_quotation_lines"("quotation_id");
CREATE UNIQUE INDEX "sales_invoices_company_id_invoice_number_key" ON "sales_invoices"("company_id", "invoice_number");
CREATE UNIQUE INDEX "sales_invoices_quotation_id_key" ON "sales_invoices"("quotation_id");
CREATE UNIQUE INDEX "sales_invoices_journal_entry_id_key" ON "sales_invoices"("journal_entry_id");
CREATE INDEX "sales_invoices_company_id_branch_id_status_idx" ON "sales_invoices"("company_id", "branch_id", "status");
CREATE INDEX "sales_invoices_customer_id_status_idx" ON "sales_invoices"("customer_id", "status");
CREATE INDEX "sales_invoice_lines_invoice_id_idx" ON "sales_invoice_lines"("invoice_id");
CREATE INDEX "sales_invoice_taxes_invoice_id_idx" ON "sales_invoice_taxes"("invoice_id");
CREATE INDEX "sales_invoice_allocations_invoice_id_idx" ON "sales_invoice_allocations"("invoice_id");
CREATE INDEX "sales_invoice_allocations_source_id_idx" ON "sales_invoice_allocations"("source_id");
CREATE UNIQUE INDEX "customer_receipts_company_id_receipt_number_key" ON "customer_receipts"("company_id", "receipt_number");
CREATE UNIQUE INDEX "customer_receipts_journal_entry_id_key" ON "customer_receipts"("journal_entry_id");
CREATE INDEX "customer_receipts_customer_id_receipt_date_idx" ON "customer_receipts"("customer_id", "receipt_date");
CREATE INDEX "customer_receipt_methods_receipt_id_idx" ON "customer_receipt_methods"("receipt_id");
CREATE INDEX "customer_receipt_allocations_receipt_id_idx" ON "customer_receipt_allocations"("receipt_id");
CREATE INDEX "customer_receipt_allocations_invoice_id_idx" ON "customer_receipt_allocations"("invoice_id");
CREATE UNIQUE INDEX "sales_credit_notes_company_id_credit_note_number_key" ON "sales_credit_notes"("company_id", "credit_note_number");
CREATE UNIQUE INDEX "sales_credit_notes_return_request_id_key" ON "sales_credit_notes"("return_request_id");
CREATE UNIQUE INDEX "sales_credit_notes_journal_entry_id_key" ON "sales_credit_notes"("journal_entry_id");
CREATE INDEX "sales_credit_notes_invoice_id_idx" ON "sales_credit_notes"("invoice_id");
CREATE INDEX "sales_credit_note_lines_credit_note_id_idx" ON "sales_credit_note_lines"("credit_note_id");
CREATE INDEX "sales_return_requests_invoice_id_status_idx" ON "sales_return_requests"("invoice_id", "status");
CREATE INDEX "sales_return_lines_return_request_id_idx" ON "sales_return_lines"("return_request_id");

ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_branches" ADD CONSTRAINT "customer_branches_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_branches" ADD CONSTRAINT "customer_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_revenue_account_id_fkey" FOREIGN KEY ("revenue_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_lines" ADD CONSTRAINT "sales_quotation_lines_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "sales_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_lines" ADD CONSTRAINT "sales_quotation_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "sales_quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoice_taxes" ADD CONSTRAINT "sales_invoice_taxes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_invoice_allocations" ADD CONSTRAINT "sales_invoice_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_receipt_methods" ADD CONSTRAINT "customer_receipt_methods_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "customer_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_receipt_allocations" ADD CONSTRAINT "customer_receipt_allocations_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "customer_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_receipt_allocations" ADD CONSTRAINT "customer_receipt_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_credit_notes" ADD CONSTRAINT "sales_credit_notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_credit_notes" ADD CONSTRAINT "sales_credit_notes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_credit_notes" ADD CONSTRAINT "sales_credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_credit_notes" ADD CONSTRAINT "sales_credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_credit_notes" ADD CONSTRAINT "sales_credit_notes_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "sales_return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_credit_note_lines" ADD CONSTRAINT "sales_credit_note_lines_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "sales_credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_credit_note_lines" ADD CONSTRAINT "sales_credit_note_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_requests" ADD CONSTRAINT "sales_return_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_requests" ADD CONSTRAINT "sales_return_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_requests" ADD CONSTRAINT "sales_return_requests_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "sales_return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customers" ADD CONSTRAINT "customers_credit_limit_check" CHECK ("credit_limit" >= 0);
ALTER TABLE "customers" ADD CONSTRAINT "customers_payment_terms_check" CHECK ("payment_terms_days" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_reserved_check" CHECK ("reserved_quantity" >= 0);
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_terms_check" CHECK ("payment_terms_days" >= 0);
ALTER TABLE "sales_invoice_allocations" ADD CONSTRAINT "sales_invoice_allocations_amount_check" CHECK ("amount" > 0);
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_total_check" CHECK ("total" > 0 AND "advance_amount" >= 0);
ALTER TABLE "customer_receipt_allocations" ADD CONSTRAINT "customer_receipt_allocations_amount_check" CHECK ("amount" > 0);

INSERT INTO "document_sequences" ("id", "company_id", "branch_id", "document_type", "prefix", "next_number", "padding", "created_at", "updated_at")
SELECT gen_random_uuid(), b."company_id", b."id", t."document_type", t."prefix", 1, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "branches" b
CROSS JOIN (VALUES ('customer', 'CUS'), ('credit_note', 'CN')) AS t("document_type", "prefix")
WHERE b."deleted_at" IS NULL
ON CONFLICT ("company_id", "branch_id", "document_type") DO NOTHING;
