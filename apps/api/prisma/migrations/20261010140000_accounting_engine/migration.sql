-- Accounting engine: fiscal periods, journals, mappings, and opening balances.

CREATE TYPE "fiscal_period_status" AS ENUM ('open', 'closed');
CREATE TYPE "journal_status" AS ENUM ('draft', 'pending_approval', 'posted', 'rejected');
CREATE TYPE "opening_detail_kind" AS ENUM (
  'cash',
  'bank',
  'inventory',
  'customer_invoice',
  'supplier_bill',
  'fixed_asset',
  'depreciation',
  'loan',
  'equity'
);
CREATE TYPE "posting_attempt_status" AS ENUM ('failed', 'suspicious');

CREATE TABLE "fiscal_years" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_periods" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "fiscal_year_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "status" "fiscal_period_status" NOT NULL DEFAULT 'open',
  "closed_at" TIMESTAMPTZ(6),
  "closed_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_entries" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "journal_number" TEXT NOT NULL,
  "accounting_date" DATE NOT NULL,
  "fiscal_period_id" UUID NOT NULL,
  "source_module" TEXT NOT NULL,
  "source_document_type" TEXT NOT NULL,
  "source_document_id" UUID,
  "description" TEXT NOT NULL,
  "status" "journal_status" NOT NULL DEFAULT 'draft',
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "posted_by_user_id" UUID,
  "posted_at" TIMESTAMPTZ(6),
  "reversal_of_id" UUID,
  "reason" TEXT,
  "closed_period_adjustment" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_lines" (
  "id" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "department_id" UUID,
  "customer_id" UUID,
  "supplier_id" UUID,
  "project_id" UUID,
  "debit" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "credit" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journal_lines_one_side" CHECK (
    ("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)
  )
);

CREATE TABLE "account_mappings" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "event_code" TEXT NOT NULL,
  "debit_account_id" UUID NOT NULL,
  "credit_account_id" UUID NOT NULL,
  "tax_account_id" UUID,
  "tax_side" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "posting_attempts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "event_code" TEXT,
  "source_module" TEXT,
  "source_document_type" TEXT,
  "source_document_id" TEXT,
  "status" "posting_attempt_status" NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "posting_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opening_balance_batches" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "opening_balance_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opening_balance_lines" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "kind" "opening_detail_kind" NOT NULL,
  "account_code" TEXT NOT NULL,
  "reference" TEXT,
  "description" TEXT,
  "quantity" DECIMAL(19,4),
  "unit_cost" DECIMAL(19,4),
  "amount" DECIMAL(19,4) NOT NULL,
  "branch_id" UUID NOT NULL,
  CONSTRAINT "opening_balance_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_years_company_id_start_date_key" ON "fiscal_years"("company_id", "start_date");
CREATE UNIQUE INDEX "fiscal_periods_company_id_start_date_key" ON "fiscal_periods"("company_id", "start_date");
CREATE INDEX "fiscal_periods_company_id_status_idx" ON "fiscal_periods"("company_id", "status");
CREATE UNIQUE INDEX "journal_entries_company_id_journal_number_key" ON "journal_entries"("company_id", "journal_number");
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key" ON "journal_entries"("reversal_of_id");
CREATE INDEX "journal_entries_company_id_status_accounting_date_idx" ON "journal_entries"("company_id", "status", "accounting_date");
CREATE UNIQUE INDEX "journal_entries_posted_source_key" ON "journal_entries"("company_id", "source_module", "source_document_type", "source_document_id") WHERE "source_document_id" IS NOT NULL AND "status" = 'posted';
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");
CREATE INDEX "journal_lines_branch_id_idx" ON "journal_lines"("branch_id");
CREATE UNIQUE INDEX "account_mappings_company_id_event_code_key" ON "account_mappings"("company_id", "event_code");
CREATE INDEX "posting_attempts_company_id_status_created_at_idx" ON "posting_attempts"("company_id", "status", "created_at");
CREATE UNIQUE INDEX "opening_balance_batches_journal_entry_id_key" ON "opening_balance_batches"("journal_entry_id");
CREATE INDEX "opening_balance_lines_batch_id_kind_idx" ON "opening_balance_lines"("batch_id", "kind");

ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_user_id_fkey" FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_tax_account_id_fkey" FOREIGN KEY ("tax_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "posting_attempts" ADD CONSTRAINT "posting_attempts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opening_balance_batches" ADD CONSTRAINT "opening_balance_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opening_balance_batches" ADD CONSTRAINT "opening_balance_batches_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "opening_balance_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_posted_journal_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Posted journals cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Posted journals cannot be edited';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_posted_immutable
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION reject_posted_journal_mutation();

CREATE OR REPLACE FUNCTION reject_posted_journal_line_mutation() RETURNS trigger AS $$
DECLARE
  journal_status "journal_status";
BEGIN
  SELECT status INTO journal_status
  FROM journal_entries
  WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  IF journal_status = 'posted' THEN
    RAISE EXCEPTION 'Posted journal lines cannot be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_lines_posted_immutable
  BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION reject_posted_journal_line_mutation();
