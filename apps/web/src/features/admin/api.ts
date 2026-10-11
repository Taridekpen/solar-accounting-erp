import { apiRequest } from "@/services/api-client";

export interface DocumentTemplates {
  id: string;
  invoiceFooter: string;
  quotationTerms: string;
  paymentAdvice: string;
  updatedAt: string;
}

export interface AccountMappingRow {
  id: string;
  eventCode: string;
  debitAccountId: string;
  creditAccountId: string;
  taxAccountId: string | null;
  debitAccount: { id: string; accountCode: string; accountName: string };
  creditAccount: { id: string; accountCode: string; accountName: string };
  taxAccount: { id: string; accountCode: string; accountName: string } | null;
}

export interface AuditEventRow {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  occurredAt: string;
  previousValues: unknown;
  newValues: unknown;
  reason: string | null;
}

export interface ManagedDocumentRow {
  id: string;
  branchId: string | null;
  entityType: string;
  entityId: string;
  documentKind: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentUrl: string;
  createdAt: string;
}

export interface BranchSettings {
  id: string;
  branchCode: string;
  name: string;
  status: string;
  manager: { id: string; name: string; employeeNumber: string; email: string | null } | null;
  warehouses: Array<{ id: string; warehouseCode: string; name: string; warehouseType: string; status: string }>;
  bankAccounts: Array<{
    id: string;
    bankName: string;
    accountName: string;
    maskedAccountNumber: string;
    ledgerAccountId: string;
    status: string;
  }>;
  expensePolicies: Array<{ id: string; minAmount: string; maxAmount: string; level: number; companyWide: boolean }>;
}

function qs(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function fetchDocumentTemplates() {
  return apiRequest<DocumentTemplates>("/admin/document-templates");
}

export function updateDocumentTemplates(body: Partial<DocumentTemplates>) {
  return apiRequest<DocumentTemplates>("/admin/document-templates", { method: "PATCH", body: JSON.stringify(body) });
}

export function fetchAccountMappings() {
  return apiRequest<AccountMappingRow[]>("/admin/account-mappings");
}

export function updateAccountMapping(body: {
  eventCode: string;
  debitAccountId: string;
  creditAccountId: string;
  taxAccountId?: string | null;
}) {
  return apiRequest<{ id: string }>("/admin/account-mappings", { method: "PATCH", body: JSON.stringify(body) });
}

export function fetchAdminTaxCodes() {
  return apiRequest<Array<{ id: string; code: string; name: string; kind: string; rate: string; effectiveFrom: string; effectiveTo: string | null }>>(
    "/admin/tax-codes",
  );
}

export function createAdminTaxCode(body: Record<string, unknown>) {
  return apiRequest<{ id: string }>("/admin/tax-codes", { method: "POST", body: JSON.stringify(body) });
}

export function fetchFiscalPeriods() {
  return apiRequest<Array<{ id: string; startDate: string; endDate: string; status: string }>>("/admin/fiscal-periods");
}

export function fetchExpensePolicies() {
  return apiRequest<Array<{ id: string; minAmount: string; maxAmount: string; level: number; companyWide: boolean; branchId: string | null }>>(
    "/admin/expense-policies",
  );
}

export function fetchDelegations() {
  return apiRequest<Array<{ id: string; permissionCode: string; startsAt: string; endsAt: string; delegator: { email: string }; delegate: { email: string } }>>(
    "/admin/approval-delegations",
  );
}

export function revokeDelegation(id: string) {
  return apiRequest<{ id: string }>(`/admin/approval-delegations/${id}`, { method: "DELETE" });
}

export function fetchSeparationRules() {
  return apiRequest<Array<{ id: string; action: string }>>("/admin/separation-rules");
}

export function fetchAuditEvents(params: Record<string, string | undefined>) {
  return apiRequest<AuditEventRow[]>(`/audit-events${qs(params)}`);
}

export function fetchDocuments(params: Record<string, string | undefined> = {}) {
  return apiRequest<ManagedDocumentRow[]>(`/documents${qs(params)}`);
}

export function uploadDocument(body: Record<string, unknown>) {
  return apiRequest<ManagedDocumentRow>("/documents", { method: "POST", body: JSON.stringify(body) });
}

export function fetchBranchSettings(id: string) {
  return apiRequest<BranchSettings>(`/admin/branches/${id}/settings`);
}
