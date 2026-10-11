-- Suppliers, warehouses, and procurement documents.

ALTER TABLE "companies" ADD COLUMN "purchase_approval_limit" DECIMAL(19,4) NOT NULL DEFAULT 500000.0000;
UPDATE "accounts" SET "account_subtype" = 'grni' WHERE "account_code" = '1310';
ALTER TYPE "stock_movement_type" ADD VALUE 'purchase_receipt';

CREATE TYPE "procurement_priority" AS ENUM ('low', 'normal', 'high');
CREATE TYPE "requisition_status" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'converted', 'cancelled');
CREATE TYPE "procurement_mode" AS ENUM ('central', 'branch');
CREATE TYPE "purchase_order_status" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'partially_received', 'received', 'cancelled');
CREATE TYPE "supplier_bill_status" AS ENUM ('draft', 'posted');
CREATE TYPE "supplier_payment_status" AS ENUM ('draft', 'posted');
CREATE TYPE "supplier_payment_method" AS ENUM ('cash', 'bank_transfer');

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "supplier_code" TEXT NOT NULL,
  "business_name" TEXT NOT NULL,
  "contact_person" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "tax_identifier" TEXT,
  "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
  "status" "record_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_branches" (
  "supplier_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_branches_pkey" PRIMARY KEY ("supplier_id", "branch_id")
);

CREATE TABLE "supplier_bank_details" (
  "id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "bank_name" TEXT NOT NULL,
  "account_name" TEXT NOT NULL,
  "account_number" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_bank_details_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouses" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "warehouse_code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "record_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_requisitions" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "requisition_number" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "required_date" DATE NOT NULL,
  "priority" "procurement_priority" NOT NULL DEFAULT 'normal',
  "status" "requisition_status" NOT NULL DEFAULT 'draft',
  "estimated_cost" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_requisition_lines" (
  "id" UUID NOT NULL,
  "requisition_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "estimated_unit_cost" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "purchase_requisition_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_orders" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "requisition_id" UUID,
  "purchase_order_number" TEXT NOT NULL,
  "procurement_mode" "procurement_mode" NOT NULL,
  "expected_delivery_date" DATE NOT NULL,
  "status" "purchase_order_status" NOT NULL DEFAULT 'draft',
  "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "discount_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "tax_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "grand_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_order_lines" (
  "id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "received_quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(19,4) NOT NULL,
  "discount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "tax_rate" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "line_net" DECIMAL(19,4) NOT NULL,
  "tax_amount" DECIMAL(19,4) NOT NULL,
  "line_total" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "goods_receipts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "goods_receipt_number" TEXT NOT NULL,
  "receipt_date" DATE NOT NULL,
  "delivery_document" TEXT,
  "receiving_user_id" UUID NOT NULL,
  "journal_entry_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "goods_receipt_lines" (
  "id" UUID NOT NULL,
  "goods_receipt_id" UUID NOT NULL,
  "purchase_order_line_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "ordered_quantity" DECIMAL(19,4) NOT NULL,
  "accepted_quantity" DECIMAL(19,4) NOT NULL,
  "rejected_quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "goods_receipt_serials" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "goods_receipt_line_id" UUID NOT NULL,
  "serial_number" TEXT NOT NULL,
  CONSTRAINT "goods_receipt_serials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_bills" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "bill_number" TEXT NOT NULL,
  "supplier_invoice_number" TEXT NOT NULL,
  "invoice_date" DATE NOT NULL,
  "due_date" DATE NOT NULL,
  "attachment_name" TEXT NOT NULL,
  "status" "supplier_bill_status" NOT NULL DEFAULT 'posted',
  "quantity_difference" BOOLEAN NOT NULL DEFAULT false,
  "price_difference" BOOLEAN NOT NULL DEFAULT false,
  "missing_receipt" BOOLEAN NOT NULL DEFAULT false,
  "unapproved_order" BOOLEAN NOT NULL DEFAULT false,
  "subtotal" DECIMAL(19,4) NOT NULL,
  "tax_total" DECIMAL(19,4) NOT NULL,
  "variance_total" DECIMAL(19,4) NOT NULL,
  "grand_total" DECIMAL(19,4) NOT NULL,
  "journal_entry_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_bill_lines" (
  "id" UUID NOT NULL,
  "supplier_bill_id" UUID NOT NULL,
  "purchase_order_line_id" UUID NOT NULL,
  "goods_receipt_line_id" UUID,
  "product_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit_cost" DECIMAL(19,4) NOT NULL,
  "receipt_unit_cost" DECIMAL(19,4) NOT NULL,
  "tax_rate" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "line_net" DECIMAL(19,4) NOT NULL,
  "tax_amount" DECIMAL(19,4) NOT NULL,
  "variance_amount" DECIMAL(19,4) NOT NULL,
  "line_total" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "supplier_bill_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_payments" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "payment_number" TEXT NOT NULL,
  "payment_date" DATE NOT NULL,
  "method" "supplier_payment_method" NOT NULL,
  "total" DECIMAL(19,4) NOT NULL,
  "deposit_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "status" "supplier_payment_status" NOT NULL DEFAULT 'draft',
  "journal_entry_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_payment_allocations" (
  "id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "bill_id" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procurement_approvals" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "document_type" TEXT NOT NULL,
  "document_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "decision" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurement_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppliers_company_id_supplier_code_key" ON "suppliers"("company_id", "supplier_code");
CREATE UNIQUE INDEX "suppliers_company_phone_key" ON "suppliers"("company_id", "phone") WHERE "phone" IS NOT NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "suppliers_company_email_key" ON "suppliers"("company_id", "email") WHERE "email" IS NOT NULL AND "deleted_at" IS NULL;
CREATE INDEX "suppliers_company_id_status_idx" ON "suppliers"("company_id", "status");
CREATE UNIQUE INDEX "supplier_bank_details_supplier_id_key" ON "supplier_bank_details"("supplier_id");
CREATE INDEX "supplier_branches_branch_id_idx" ON "supplier_branches"("branch_id");
CREATE UNIQUE INDEX "warehouses_branch_id_warehouse_code_key" ON "warehouses"("branch_id", "warehouse_code");
CREATE UNIQUE INDEX "purchase_requisitions_company_id_requisition_number_key" ON "purchase_requisitions"("company_id", "requisition_number");
CREATE INDEX "purchase_requisitions_branch_id_status_idx" ON "purchase_requisitions"("branch_id", "status");
CREATE INDEX "purchase_requisition_lines_requisition_id_idx" ON "purchase_requisition_lines"("requisition_id");
CREATE UNIQUE INDEX "purchase_orders_company_id_purchase_order_number_key" ON "purchase_orders"("company_id", "purchase_order_number");
CREATE INDEX "purchase_orders_branch_id_status_idx" ON "purchase_orders"("branch_id", "status");
CREATE INDEX "purchase_order_lines_purchase_order_id_idx" ON "purchase_order_lines"("purchase_order_id");
CREATE UNIQUE INDEX "goods_receipts_company_id_goods_receipt_number_key" ON "goods_receipts"("company_id", "goods_receipt_number");
CREATE UNIQUE INDEX "goods_receipts_journal_entry_id_key" ON "goods_receipts"("journal_entry_id");
CREATE INDEX "goods_receipts_purchase_order_id_idx" ON "goods_receipts"("purchase_order_id");
CREATE INDEX "goods_receipt_lines_goods_receipt_id_idx" ON "goods_receipt_lines"("goods_receipt_id");
CREATE UNIQUE INDEX "goods_receipt_serials_company_id_serial_number_key" ON "goods_receipt_serials"("company_id", "serial_number");
CREATE INDEX "goods_receipt_serials_goods_receipt_line_id_idx" ON "goods_receipt_serials"("goods_receipt_line_id");
CREATE UNIQUE INDEX "supplier_bills_company_id_bill_number_key" ON "supplier_bills"("company_id", "bill_number");
CREATE UNIQUE INDEX "supplier_bills_supplier_id_supplier_invoice_number_key" ON "supplier_bills"("supplier_id", "supplier_invoice_number");
CREATE UNIQUE INDEX "supplier_bills_journal_entry_id_key" ON "supplier_bills"("journal_entry_id");
CREATE INDEX "supplier_bills_supplier_id_invoice_date_idx" ON "supplier_bills"("supplier_id", "invoice_date");
CREATE INDEX "supplier_bill_lines_supplier_bill_id_idx" ON "supplier_bill_lines"("supplier_bill_id");
CREATE UNIQUE INDEX "supplier_payments_company_id_payment_number_key" ON "supplier_payments"("company_id", "payment_number");
CREATE UNIQUE INDEX "supplier_payments_journal_entry_id_key" ON "supplier_payments"("journal_entry_id");
CREATE INDEX "supplier_payments_supplier_id_payment_date_idx" ON "supplier_payments"("supplier_id", "payment_date");
CREATE INDEX "supplier_payment_allocations_payment_id_idx" ON "supplier_payment_allocations"("payment_id");
CREATE INDEX "supplier_payment_allocations_bill_id_idx" ON "supplier_payment_allocations"("bill_id");
CREATE INDEX "procurement_approvals_company_id_document_type_created_at_idx" ON "procurement_approvals"("company_id", "document_type", "created_at");

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_branches" ADD CONSTRAINT "supplier_branches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_branches" ADD CONSTRAINT "supplier_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_bank_details" ADD CONSTRAINT "supplier_bank_details_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "purchase_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "purchase_requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_serials" ADD CONSTRAINT "goods_receipt_serials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_serials" ADD CONSTRAINT "goods_receipt_serials_goods_receipt_line_id_fkey" FOREIGN KEY ("goods_receipt_line_id") REFERENCES "goods_receipt_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_supplier_bill_id_fkey" FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_goods_receipt_line_id_fkey" FOREIGN KEY ("goods_receipt_line_id") REFERENCES "goods_receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "procurement_approvals" ADD CONSTRAINT "procurement_approvals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_payment_terms_check" CHECK ("payment_terms_days" >= 0);
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_quantity_check" CHECK ("quantity" > 0 AND "received_quantity" >= 0);
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_quantity_check" CHECK ("accepted_quantity" >= 0 AND "rejected_quantity" >= 0);
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_amount_check" CHECK ("amount" > 0);
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_total_check" CHECK ("total" > 0 AND "deposit_amount" >= 0);

INSERT INTO "document_sequences" ("id", "company_id", "branch_id", "document_type", "prefix", "next_number", "padding", "created_at", "updated_at")
SELECT gen_random_uuid(), b."company_id", b."id", t."document_type", t."prefix", 1, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "branches" b
CROSS JOIN (VALUES ('supplier', 'SUP'), ('requisition', 'REQ'), ('supplier_bill', 'PIN')) AS t("document_type", "prefix")
WHERE b."deleted_at" IS NULL
ON CONFLICT ("company_id", "branch_id", "document_type") DO NOTHING;

INSERT INTO "warehouses" ("id", "company_id", "branch_id", "warehouse_code", "name", "status", "created_at")
SELECT gen_random_uuid(), b."company_id", b."id", b."branch_code" || '-MAIN', 'Main', 'active', CURRENT_TIMESTAMP
FROM "branches" b
WHERE b."deleted_at" IS NULL
ON CONFLICT ("branch_id", "warehouse_code") DO NOTHING;
