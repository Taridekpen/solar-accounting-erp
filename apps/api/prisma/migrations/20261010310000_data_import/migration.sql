-- Section 16: historical data import batches and rows

CREATE TABLE "import_batches" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "import_type" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'uploaded',
  "row_count" INTEGER NOT NULL DEFAULT 0,
  "ok_count" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "duplicate_count" INTEGER NOT NULL DEFAULT 0,
  "error_summary" JSONB,
  "reconciliation_summary" JSONB,
  "import_report" JSONB,
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_batches_company_id_status_idx" ON "import_batches"("company_id", "status");

ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "import_rows" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "row_number" INTEGER NOT NULL,
  "raw" JSONB NOT NULL,
  "normalized" JSONB,
  "status" TEXT NOT NULL DEFAULT 'ok',
  "messages" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "import_rows_batch_id_row_number_key" ON "import_rows"("batch_id", "row_number");
CREATE INDEX "import_rows_batch_id_status_idx" ON "import_rows"("batch_id", "status");

ALTER TABLE "import_rows"
  ADD CONSTRAINT "import_rows_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
