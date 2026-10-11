ALTER TYPE "fiscal_period_status" ADD VALUE 'closing';
ALTER TYPE "fiscal_period_status" ADD VALUE 'reopened';

CREATE TYPE "daily_closing_status" AS ENUM ('draft', 'reviewed');
CREATE TYPE "period_close_action" AS ENUM ('lock', 'reopen');

ALTER TABLE "fiscal_periods" ADD COLUMN "closing_started_by_user_id" UUID;

CREATE TABLE "daily_closings" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "status" "daily_closing_status" NOT NULL DEFAULT 'draft',
  "prepared_by_user_id" UUID NOT NULL,
  "reviewed_by_user_id" UUID,
  "exception_notes" TEXT,
  "counted_cash" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "report" JSONB NOT NULL,
  "reviewed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_closings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "period_closing_tasks" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "fiscal_period_id" UUID NOT NULL,
  "task_code" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "note" TEXT,
  "completed_by_user_id" UUID,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "period_closing_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "period_close_approvals" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "fiscal_period_id" UUID NOT NULL,
  "action" "period_close_action" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "period_close_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "period_statement_snapshots" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "fiscal_period_id" UUID NOT NULL,
  "trial_balance" JSONB NOT NULL,
  "profit_and_loss" JSONB NOT NULL,
  "balance_sheet" JSONB NOT NULL,
  "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "period_statement_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_closings_branch_id_business_date_key" ON "daily_closings"("branch_id", "business_date");
CREATE INDEX "daily_closings_company_id_business_date_idx" ON "daily_closings"("company_id", "business_date");
CREATE UNIQUE INDEX "period_closing_tasks_fiscal_period_id_task_code_key" ON "period_closing_tasks"("fiscal_period_id", "task_code");
CREATE INDEX "period_close_approvals_fiscal_period_id_action_idx" ON "period_close_approvals"("fiscal_period_id", "action");
CREATE UNIQUE INDEX "period_statement_snapshots_fiscal_period_id_key" ON "period_statement_snapshots"("fiscal_period_id");

ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_closing_started_by_user_id_fkey" FOREIGN KEY ("closing_started_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "daily_closings" ADD CONSTRAINT "daily_closings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_closings" ADD CONSTRAINT "daily_closings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_closings" ADD CONSTRAINT "daily_closings_prepared_by_user_id_fkey" FOREIGN KEY ("prepared_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_closings" ADD CONSTRAINT "daily_closings_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "period_closing_tasks" ADD CONSTRAINT "period_closing_tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_closing_tasks" ADD CONSTRAINT "period_closing_tasks_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_closing_tasks" ADD CONSTRAINT "period_closing_tasks_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "period_close_approvals" ADD CONSTRAINT "period_close_approvals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_close_approvals" ADD CONSTRAINT "period_close_approvals_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_close_approvals" ADD CONSTRAINT "period_close_approvals_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_statement_snapshots" ADD CONSTRAINT "period_statement_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_statement_snapshots" ADD CONSTRAINT "period_statement_snapshots_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
