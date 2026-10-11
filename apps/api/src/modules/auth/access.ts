import { BranchScope } from "../organization/branch-scope";

const COMPANY_WIDE_ROLES = [
  "super_administrator",
  "managing_director",
  "finance_manager",
  "central_accountant",
  "auditor",
];

const PRIVILEGED_ROLES = [
  "super_administrator",
  "managing_director",
  "finance_manager",
  "central_accountant",
];

export interface AccessContext {
  userId: string;
  email: string;
  sessionId: string;
  csrfTokenHash: string;
  permissions: string[];
  roleCodes: string[];
  companyWide: boolean;
  mfaPending: boolean;
  mfaEnabled: boolean;
  scope: BranchScope;
}

export function isCompanyWide(roleCodes: string[]): boolean {
  return roleCodes.some((code) => COMPANY_WIDE_ROLES.includes(code));
}

export function isPrivileged(roleCodes: string[]): boolean {
  return roleCodes.some((code) => PRIVILEGED_ROLES.includes(code));
}
