ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_parent_account_id_fkey";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_company_id_fkey";
ALTER TABLE "role_permissions" DROP CONSTRAINT IF EXISTS "role_permissions_permission_id_fkey";
ALTER TABLE "role_permissions" DROP CONSTRAINT IF EXISTS "role_permissions_role_id_fkey";
ALTER TABLE "document_sequences" DROP CONSTRAINT IF EXISTS "document_sequences_branch_id_fkey";
ALTER TABLE "document_sequences" DROP CONSTRAINT IF EXISTS "document_sequences_company_id_fkey";
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_department_id_fkey";
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_branch_id_fkey";
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_company_id_fkey";
ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_branch_id_fkey";
ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_company_id_fkey";
ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "branches_manager_id_fkey";
ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "branches_company_id_fkey";

DROP TABLE IF EXISTS "accounts";
DROP TABLE IF EXISTS "role_permissions";
DROP TABLE IF EXISTS "permissions";
DROP TABLE IF EXISTS "roles";
DROP TABLE IF EXISTS "document_sequences";
DROP TABLE IF EXISTS "employees";
DROP TABLE IF EXISTS "departments";
DROP TABLE IF EXISTS "branches";
DROP TABLE IF EXISTS "companies";

DROP TYPE IF EXISTS "normal_balance";
DROP TYPE IF EXISTS "account_type";
DROP TYPE IF EXISTS "employment_status";
DROP TYPE IF EXISTS "record_status";
