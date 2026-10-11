DROP TRIGGER IF EXISTS audit_events_no_mutation ON audit_events;
DROP FUNCTION IF EXISTS reject_audit_event_mutation();

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_actor_user_id_fkey";
ALTER TABLE "approval_delegations" DROP CONSTRAINT IF EXISTS "approval_delegations_delegate_user_id_fkey";
ALTER TABLE "approval_delegations" DROP CONSTRAINT IF EXISTS "approval_delegations_delegator_user_id_fkey";
ALTER TABLE "user_branch_assignments" DROP CONSTRAINT IF EXISTS "user_branch_assignments_branch_id_fkey";
ALTER TABLE "user_branch_assignments" DROP CONSTRAINT IF EXISTS "user_branch_assignments_user_id_fkey";
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_role_id_fkey";
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_user_id_fkey";
ALTER TABLE "auth_tokens" DROP CONSTRAINT IF EXISTS "auth_tokens_user_id_fkey";
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_user_id_fkey";
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_user_id_fkey";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_employee_id_fkey";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_company_id_fkey";

DROP TABLE IF EXISTS "audit_events";
DROP TABLE IF EXISTS "separation_rules";
DROP TABLE IF EXISTS "approval_delegations";
DROP TABLE IF EXISTS "user_branch_assignments";
DROP TABLE IF EXISTS "user_roles";
DROP TABLE IF EXISTS "auth_tokens";
DROP TABLE IF EXISTS "sessions";
DROP TABLE IF EXISTS "users";

DROP TYPE IF EXISTS "auth_token_purpose";
DROP TYPE IF EXISTS "user_status";
