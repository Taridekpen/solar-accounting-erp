CREATE TYPE "cash_drawer_kind" AS ENUM ('drawer', 'petty');
CREATE TYPE "cash_transfer_kind" AS ENUM ('branch_to_branch', 'branch_to_head_office', 'head_office_to_branch', 'account_to_account', 'deposit', 'drawer');
CREATE TYPE "cash_transfer_status" AS ENUM ('in_transit', 'received');
CREATE TYPE "cash_count_status" AS ENUM ('draft', 'posted');
CREATE TYPE "bank_statement_status" AS ENUM ('draft', 'approved', 'locked');
CREATE TYPE "bank_statement_line_source" AS ENUM ('csv', 'manual', 'adjustment');

INSERT INTO "accounts" (
  "id", "company_id", "account_code", "account_name", "account_type", "account_subtype",
  "parent_account_id", "normal_balance", "is_postable", "is_control_account", "is_active", "created_at", "updated_at"
)
SELECT gen_random_uuid(), parent."company_id", '1110', 'Bank Transfers in Transit', 'asset', 'bank',
  parent."id", 'debit', true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "accounts" parent
WHERE parent."account_code" = '1100' AND parent."deleted_at" IS NULL
AND NOT EXISTS (
  SELECT 1 FROM "accounts" existing
  WHERE existing."company_id" = parent."company_id" AND existing."account_code" = '1110'
);

CREATE TABLE "bank_accounts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID,
  "bank_name" TEXT NOT NULL,
  "account_name" TEXT NOT NULL,
  "masked_account_number" TEXT NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
  "ledger_account_id" UUID NOT NULL,
  "status" "record_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_drawers" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "cash_drawer_kind" NOT NULL,
  "ledger_account_id" UUID NOT NULL,
  "status" "record_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_drawers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_transfers" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "transfer_number" TEXT NOT NULL,
  "kind" "cash_transfer_kind" NOT NULL,
  "source_branch_id" UUID NOT NULL,
  "destination_branch_id" UUID NOT NULL,
  "source_account_id" UUID NOT NULL,
  "destination_account_id" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "sent_date" DATE NOT NULL,
  "received_date" DATE,
  "status" "cash_transfer_status" NOT NULL DEFAULT 'received',
  "send_journal_id" UUID,
  "receive_journal_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_counts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "drawer_id" UUID NOT NULL,
  "count_number" TEXT NOT NULL,
  "count_date" DATE NOT NULL,
  "counted_amount" DECIMAL(19,4) NOT NULL,
  "book_amount" DECIMAL(19,4) NOT NULL,
  "variance_amount" DECIMAL(19,4) NOT NULL,
  "status" "cash_count_status" NOT NULL DEFAULT 'draft',
  "journal_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "posted_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_counts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_statements" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "bank_account_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "statement_ending" DECIMAL(19,4) NOT NULL,
  "status" "bank_statement_status" NOT NULL DEFAULT 'draft',
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_statement_lines" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "statement_id" UUID NOT NULL,
  "line_date" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "reference" TEXT,
  "source" "bank_statement_line_source" NOT NULL,
  "matched_journal_line_id" UUID,
  "adjustment_journal_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_accounts_ledger_account_id_key" ON "bank_accounts"("ledger_account_id");
CREATE UNIQUE INDEX "bank_accounts_company_id_account_name_key" ON "bank_accounts"("company_id", "account_name");
CREATE UNIQUE INDEX "cash_drawers_ledger_account_id_key" ON "cash_drawers"("ledger_account_id");
CREATE UNIQUE INDEX "cash_drawers_branch_id_name_key" ON "cash_drawers"("branch_id", "name");
CREATE UNIQUE INDEX "cash_transfers_company_id_transfer_number_key" ON "cash_transfers"("company_id", "transfer_number");
CREATE UNIQUE INDEX "cash_transfers_send_journal_id_key" ON "cash_transfers"("send_journal_id");
CREATE UNIQUE INDEX "cash_transfers_receive_journal_id_key" ON "cash_transfers"("receive_journal_id");
CREATE INDEX "cash_transfers_company_id_status_idx" ON "cash_transfers"("company_id", "status");
CREATE UNIQUE INDEX "cash_counts_company_id_count_number_key" ON "cash_counts"("company_id", "count_number");
CREATE UNIQUE INDEX "cash_counts_journal_id_key" ON "cash_counts"("journal_id");
CREATE INDEX "bank_statements_bank_account_id_status_idx" ON "bank_statements"("bank_account_id", "status");
CREATE UNIQUE INDEX "bank_statement_lines_matched_journal_line_id_key" ON "bank_statement_lines"("matched_journal_line_id");
CREATE UNIQUE INDEX "bank_statement_lines_adjustment_journal_id_key" ON "bank_statement_lines"("adjustment_journal_id");
CREATE INDEX "bank_statement_lines_statement_id_idx" ON "bank_statement_lines"("statement_id");

ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_source_branch_id_fkey" FOREIGN KEY ("source_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_destination_branch_id_fkey" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_destination_account_id_fkey" FOREIGN KEY ("destination_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_drawer_id_fkey" FOREIGN KEY ("drawer_id") REFERENCES "cash_drawers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matched_journal_line_id_fkey" FOREIGN KEY ("matched_journal_line_id") REFERENCES "journal_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "document_sequences" ("id", "company_id", "branch_id", "document_type", "prefix", "next_number", "padding", "updated_at")
SELECT gen_random_uuid(), b."company_id", b."id", t."document_type", t."prefix", 1, 4, CURRENT_TIMESTAMP
FROM "branches" b
CROSS JOIN (VALUES ('bank_transfer', 'BTR'), ('cash_count', 'CSH')) AS t("document_type", "prefix")
WHERE b."deleted_at" IS NULL
ON CONFLICT ("company_id", "branch_id", "document_type") DO NOTHING;
