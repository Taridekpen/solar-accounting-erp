CREATE TYPE "warehouse_type" AS ENUM ('main', 'showroom', 'installation', 'customer_site', 'in_transit');
CREATE TYPE "serial_status" AS ENUM ('in_stock', 'in_transit', 'sold', 'returned');
CREATE TYPE "stock_transfer_status" AS ENUM ('draft', 'pending_approval', 'approved', 'shipped', 'received', 'cancelled');
CREATE TYPE "stock_count_status" AS ENUM ('draft', 'posted');

ALTER TYPE "stock_movement_type" ADD VALUE 'transfer_out';
ALTER TYPE "stock_movement_type" ADD VALUE 'transfer_in';
ALTER TYPE "stock_movement_type" ADD VALUE 'adjustment_in';
ALTER TYPE "stock_movement_type" ADD VALUE 'adjustment_out';

ALTER TABLE "products" ADD COLUMN "track_serial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales_invoice_lines" ADD COLUMN "requested_serials" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "stock_balances" ADD COLUMN "average_unit_cost" DECIMAL(19,4) NOT NULL DEFAULT 0;
ALTER TABLE "warehouses" ADD COLUMN "warehouse_type" "warehouse_type" NOT NULL DEFAULT 'main';

ALTER TABLE "goods_receipt_serials" ADD COLUMN "warehouse_id" UUID;
ALTER TABLE "goods_receipt_serials" ADD COLUMN "status" "serial_status" NOT NULL DEFAULT 'in_stock';
ALTER TABLE "goods_receipt_serials" ADD COLUMN "warranty_start" DATE;
ALTER TABLE "goods_receipt_serials" ADD COLUMN "warranty_end" DATE;
ALTER TABLE "goods_receipt_serials" ADD COLUMN "customer_id" UUID;
ALTER TABLE "goods_receipt_serials" ADD COLUMN "invoice_line_id" UUID;

CREATE TABLE "warehouse_stocks" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
  CONSTRAINT "warehouse_stocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_transfers" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "source_branch_id" UUID NOT NULL,
  "destination_branch_id" UUID NOT NULL,
  "source_warehouse_id" UUID NOT NULL,
  "destination_warehouse_id" UUID NOT NULL,
  "transfer_number" TEXT NOT NULL,
  "status" "stock_transfer_status" NOT NULL DEFAULT 'draft',
  "transfer_date" DATE NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "ship_journal_id" UUID,
  "receive_journal_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_transfer_lines" (
  "id" UUID NOT NULL,
  "transfer_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit_cost" DECIMAL(19,4) NOT NULL DEFAULT 0,
  CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_counts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "count_number" TEXT NOT NULL,
  "count_date" DATE NOT NULL,
  "status" "stock_count_status" NOT NULL DEFAULT 'draft',
  "created_by_user_id" UUID NOT NULL,
  "posted_by_user_id" UUID,
  "journal_entry_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_count_lines" (
  "id" UUID NOT NULL,
  "count_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "book_quantity" DECIMAL(19,4) NOT NULL,
  "counted_quantity" DECIMAL(19,4) NOT NULL,
  "unit_cost" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "warehouse_stocks_warehouse_id_product_id_key" ON "warehouse_stocks"("warehouse_id", "product_id");
CREATE INDEX "warehouse_stocks_product_id_idx" ON "warehouse_stocks"("product_id");
CREATE UNIQUE INDEX "stock_transfers_company_id_transfer_number_key" ON "stock_transfers"("company_id", "transfer_number");
CREATE UNIQUE INDEX "stock_transfers_ship_journal_id_key" ON "stock_transfers"("ship_journal_id");
CREATE UNIQUE INDEX "stock_transfers_receive_journal_id_key" ON "stock_transfers"("receive_journal_id");
CREATE INDEX "stock_transfers_source_branch_id_status_idx" ON "stock_transfers"("source_branch_id", "status");
CREATE INDEX "stock_transfer_lines_transfer_id_idx" ON "stock_transfer_lines"("transfer_id");
CREATE UNIQUE INDEX "stock_counts_company_id_count_number_key" ON "stock_counts"("company_id", "count_number");
CREATE UNIQUE INDEX "stock_counts_journal_entry_id_key" ON "stock_counts"("journal_entry_id");
CREATE INDEX "stock_counts_branch_id_status_idx" ON "stock_counts"("branch_id", "status");
CREATE INDEX "stock_count_lines_count_id_idx" ON "stock_count_lines"("count_id");
CREATE INDEX "goods_receipt_serials_warehouse_id_status_idx" ON "goods_receipt_serials"("warehouse_id", "status");

ALTER TABLE "warehouse_stocks" ADD CONSTRAINT "warehouse_stocks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouse_stocks" ADD CONSTRAINT "warehouse_stocks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouse_stocks" ADD CONSTRAINT "warehouse_stocks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_branch_id_fkey" FOREIGN KEY ("source_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_branch_id_fkey" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_warehouse_id_fkey" FOREIGN KEY ("source_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_warehouse_id_fkey" FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_serials" ADD CONSTRAINT "goods_receipt_serials_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_serials" ADD CONSTRAINT "goods_receipt_serials_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_serials" ADD CONSTRAINT "goods_receipt_serials_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "sales_invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "document_sequences" ("id", "company_id", "branch_id", "document_type", "prefix", "next_number", "padding", "updated_at")
SELECT gen_random_uuid(), b."company_id", b."id", t."document_type", t."prefix", 1, 4, CURRENT_TIMESTAMP
FROM "branches" b
CROSS JOIN (VALUES ('stock_transfer', 'TRF'), ('stock_count', 'CNT')) AS t("document_type", "prefix")
WHERE b."deleted_at" IS NULL
ON CONFLICT ("company_id", "branch_id", "document_type") DO NOTHING;

INSERT INTO "warehouses" ("id", "company_id", "branch_id", "warehouse_code", "name", "warehouse_type", "status", "created_at")
SELECT gen_random_uuid(), b."company_id", b."id", b."branch_code" || '-TRANSIT', 'In transit', 'in_transit', 'active', CURRENT_TIMESTAMP
FROM "branches" b
WHERE b."deleted_at" IS NULL
ON CONFLICT ("branch_id", "warehouse_code") DO NOTHING;
