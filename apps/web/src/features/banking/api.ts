import { apiRequest } from "@/services/api-client";

export interface BankAccountRecord {
  id: string;
  bankName: string;
  accountName: string;
  maskedAccountNumber: string;
  branchName: string;
  accountCode: string;
  bookBalance: string;
}

export interface CashDrawerRecord {
  id: string;
  name: string;
  kind: string;
  branchName: string;
  accountCode: string;
  bookBalance: string;
}

export interface CashBook {
  opening: string;
  receipts: string;
  payments: string;
  closing: string;
  lines: {
    id: string;
    journalId: string;
    journalNumber: string;
    date: string;
    accountCode: string;
    branchName: string;
    description: string | null;
    debit: string;
    credit: string;
    sourceType: string;
  }[];
}

export interface CashBookJournalDetail {
  id: string;
  journalNumber: string;
  accountingDate: string;
  description: string;
  status: string;
  sourceDocumentType: string;
  postedAt: string | null;
  lines: Array<{
    id: string;
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
    description: string | null;
  }>;
}

export interface BankStatementRecord {
  id: string;
  accountName: string;
  periodStart: string;
  periodEnd: string;
  statementEnding: string;
  status: string;
}

export function fetchBankAccounts() {
  return apiRequest<BankAccountRecord[]>("/banking/accounts");
}

export function fetchCashDrawers() {
  return apiRequest<CashDrawerRecord[]>("/banking/drawers");
}

export function fetchCashBook() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return apiRequest<CashBook>(`/banking/cash-book?from=${from}&to=${to}`);
}

export function fetchCashBookJournal(id: string) {
  return apiRequest<CashBookJournalDetail>(`/banking/cash-book/journals/${id}`);
}

export function fetchBankStatements() {
  return apiRequest<BankStatementRecord[]>("/banking/statements");
}
