DROP TRIGGER IF EXISTS journal_lines_posted_immutable ON journal_lines;
DROP TRIGGER IF EXISTS journal_entries_posted_immutable ON journal_entries;
DROP FUNCTION IF EXISTS reject_posted_journal_line_mutation();
DROP FUNCTION IF EXISTS reject_posted_journal_mutation();

DROP TABLE IF EXISTS opening_balance_lines;
DROP TABLE IF EXISTS opening_balance_batches;
DROP TABLE IF EXISTS posting_attempts;
DROP TABLE IF EXISTS account_mappings;
DROP TABLE IF EXISTS journal_lines;
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS fiscal_periods;
DROP TABLE IF EXISTS fiscal_years;

DROP TYPE IF EXISTS posting_attempt_status;
DROP TYPE IF EXISTS opening_detail_kind;
DROP TYPE IF EXISTS journal_status;
DROP TYPE IF EXISTS fiscal_period_status;
