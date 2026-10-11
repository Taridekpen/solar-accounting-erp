CREATE TYPE "salary_summary_status" AS ENUM ('draft', 'posted');

CREATE TABLE "salary_summaries" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "department_id" UUID,
  "summary_number" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "gross_amount" DECIMAL(19,4) NOT NULL,
  "net_amount" DECIMAL(19,4) NOT NULL,
  "approval_reference" TEXT NOT NULL,
  "summary_file_name" TEXT NOT NULL,
  "summary_file_data" BYTEA NOT NULL,
  "status" "salary_summary_status" NOT NULL DEFAULT 'draft',
  "journal_entry_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salary_summaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "salary_summary_deductions" (
  "id" UUID NOT NULL,
  "summary_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "salary_summary_deductions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "salary_payments" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "payment_number" TEXT NOT NULL,
  "payment_date" DATE NOT NULL,
  "total" DECIMAL(19,4) NOT NULL,
  "payment_account_id" UUID NOT NULL,
  "bank_reference" TEXT NOT NULL,
  "journal_entry_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "salary_payment_allocations" (
  "id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "summary_id" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "salary_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_summaries_company_id_summary_number_key" ON "salary_summaries"("company_id", "summary_number");
CREATE UNIQUE INDEX "salary_summaries_journal_entry_id_key" ON "salary_summaries"("journal_entry_id");
CREATE INDEX "salary_summaries_company_id_branch_id_status_idx" ON "salary_summaries"("company_id", "branch_id", "status");
CREATE INDEX "salary_summary_deductions_summary_id_idx" ON "salary_summary_deductions"("summary_id");
CREATE UNIQUE INDEX "salary_payments_company_id_payment_number_key" ON "salary_payments"("company_id", "payment_number");
CREATE UNIQUE INDEX "salary_payments_journal_entry_id_key" ON "salary_payments"("journal_entry_id");
CREATE INDEX "salary_payments_company_id_branch_id_payment_date_idx" ON "salary_payments"("company_id", "branch_id", "payment_date");
CREATE INDEX "salary_payment_allocations_payment_id_idx" ON "salary_payment_allocations"("payment_id");
CREATE INDEX "salary_payment_allocations_summary_id_idx" ON "salary_payment_allocations"("summary_id");

ALTER TABLE "salary_summaries" ADD CONSTRAINT "salary_summaries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_summaries" ADD CONSTRAINT "salary_summaries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_summaries" ADD CONSTRAINT "salary_summaries_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "salary_summaries" ADD CONSTRAINT "salary_summaries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_summaries" ADD CONSTRAINT "salary_summaries_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "salary_summary_deductions" ADD CONSTRAINT "salary_summary_deductions_summary_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "salary_summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_summary_deductions" ADD CONSTRAINT "salary_summary_deductions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_payment_allocations" ADD CONSTRAINT "salary_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "salary_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_payment_allocations" ADD CONSTRAINT "salary_payment_allocations_summary_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "salary_summaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "accounts" (
  "id", "company_id", "account_code", "account_name", "account_type", "account_subtype",
  "normal_balance", "is_postable", "is_control_account", "is_active", "created_at", "updated_at"
)
SELECT gen_random_uuid(), company."id", '2310', 'PAYE Payable', 'liability', 'payroll',
  'credit', true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "companies" company
WHERE NOT EXISTS (
  SELECT 1 FROM "accounts" existing
  WHERE existing."company_id" = company."id" AND existing."account_code" = '2310'
);

INSERT INTO "accounts" (
  "id", "company_id", "account_code", "account_name", "account_type", "account_subtype",
  "normal_balance", "is_postable", "is_control_account", "is_active", "created_at", "updated_at"
)
SELECT gen_random_uuid(), company."id", '2320', 'Pension Payable', 'liability', 'payroll',
  'credit', true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "companies" company
WHERE NOT EXISTS (
  SELECT 1 FROM "accounts" existing
  WHERE existing."company_id" = company."id" AND existing."account_code" = '2320'
);

INSERT INTO "document_sequences" (
  "id", "company_id", "branch_id", "document_type", "prefix", "next_number", "padding", "created_at", "updated_at"
)
SELECT gen_random_uuid(), branch."company_id", branch."id", seq.document_type, seq.prefix, 1, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "branches" branch
CROSS JOIN (
  VALUES ('salary_summary', 'PAYR'), ('salary_payment', 'SPAY')
) AS seq(document_type, prefix)
WHERE branch."deleted_at" IS NULL
AND NOT EXISTS (
  SELECT 1 FROM "document_sequences" existing
  WHERE existing."branch_id" = branch."id" AND existing."document_type" = seq.document_type
);
