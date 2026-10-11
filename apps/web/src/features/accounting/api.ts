import { apiRequest } from "@/services/api-client";

export interface AccountRow {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountSubtype: string | null;
  parentAccountId: string | null;
  normalBalance: "debit" | "credit";
  isPostable: boolean;
  isControlAccount: boolean;
  isActive: boolean;
  balance: string;
}

export interface JournalLineRow {
  id: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  branchId: string;
  debit: string;
  credit: string;
  description: string | null;
}

export interface JournalRow {
  id: string;
  journalNumber: string;
  accountingDate: string;
  description: string;
  status: string;
  sourceDocumentType: string;
  reversalOfId: string | null;
  closedPeriodAdjustment: boolean;
  lines: JournalLineRow[];
}

export interface ReviewQueues {
  posted: JournalRow[];
  manualRequests: JournalRow[];
  reversalRequests: JournalRow[];
  closedPeriodAdjustments: JournalRow[];
  failedAttempts: Array<{ id: string; reason: string; eventCode: string | null }>;
  suspicious: Array<{ id: string; reason: string; eventCode: string | null }>;
}

export function fetchAccounts() {
  return apiRequest<AccountRow[]>("/accounts");
}

export function fetchReview() {
  return apiRequest<ReviewQueues>("/accounting/review");
}

export function fetchTrialBalance() {
  return apiRequest<{ totalDebit: string; totalCredit: string; balanced: boolean }>("/accounting/trial-balance");
}

export function createManualJournal(body: {
  accountingDate: string;
  description: string;
  closedPeriodAdjustment?: boolean;
  lines: Array<{ accountId: string; branchId: string; debit: string; credit: string; description?: string }>;
}) {
  return apiRequest<JournalRow>("/journals", { method: "POST", body: JSON.stringify(body) });
}

export function approveJournal(id: string) {
  return apiRequest<JournalRow>(`/journals/${id}/approve`, { method: "POST" });
}

export function reverseJournal(id: string, reason: string) {
  return apiRequest<JournalRow>(`/journals/${id}/reverse`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function importOpeningBalances(body: {
  accountingDate: string;
  description: string;
  lines: Array<{ accountId: string; branchId: string; debit: string; credit: string }>;
  details: Array<{ kind: string; accountCode: string; amount: string; branchId: string; quantity?: string; unitCost?: string }>;
}) {
  return apiRequest<JournalRow>("/opening-balances", { method: "POST", body: JSON.stringify(body) });
}
