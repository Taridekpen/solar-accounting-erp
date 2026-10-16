import { apiBaseUrl, apiRequest } from "@/services/api-client";

export interface TrialBalanceReport {
  title: string;
  companyName: string;
  period: string;
  scope: string;
  currency: string;
  generatedAt: string;
  preparedBy: string;
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
  rows: { accountId: string; accountCode: string; accountName: string; debit: string; credit: string }[];
}

export interface ProfitReport {
  title: string;
  companyName: string;
  period: string;
  scope: string;
  currency: string;
  generatedAt: string;
  preparedBy: string;
  columns: { key: string; label: string }[];
  lines: { code: string; label: string; amounts: Record<string, string> }[];
}

export interface LedgerReport {
  title: string;
  companyName: string;
  period: string;
  scope: string;
  currency: string;
  generatedAt: string;
  preparedBy: string;
  accountCode: string;
  accountName: string;
  opening: string;
  closing: string;
  rows: Array<{
    date: string;
    journalNumber: string;
    journalId: string;
    sourceDocumentType: string;
    sourceDocumentId: string | null;
    description: string | null;
    branchName: string;
    debit: string;
    credit: string;
    running: string;
  }>;
}

export interface BalanceSheetReport {
  title: string;
  companyName: string;
  period: string;
  scope: string;
  currency: string;
  generatedAt: string;
  preparedBy: string;
  sections: {
    title: string;
    rows: { label: string; amount: string }[];
    total: string;
  }[];
  assets: string;
  liabilitiesAndEquity: string;
  clearing: string;
  balanced: boolean;
}

export interface CashFlowReport {
  title: string;
  companyName: string;
  period: string;
  scope: string;
  currency: string;
  generatedAt: string;
  preparedBy: string;
  operating: { label: string; amount: string }[];
  investing: { label: string; amount: string }[];
  financing: { label: string; amount: string }[];
  netChange: string;
  cashChange: string;
}

export function fetchTrialBalance(asOf: string) {
  return apiRequest<TrialBalanceReport>(`/reports/trial-balance?asOf=${asOf}`);
}

export function fetchProfitAndLoss(from: string, to: string) {
  return apiRequest<ProfitReport>(`/reports/profit-and-loss?from=${from}&to=${to}`);
}

export function fetchBalanceSheet(asOf: string) {
  return apiRequest<BalanceSheetReport>(`/reports/balance-sheet?asOf=${asOf}`);
}

export function fetchCashFlow(from: string, to: string) {
  return apiRequest<CashFlowReport>(`/reports/cash-flow?from=${from}&to=${to}`);
}

export function fetchLedger(accountId: string, from: string, to: string) {
  return apiRequest<LedgerReport>(`/reports/ledger?accountId=${accountId}&from=${from}&to=${to}`);
}

export async function downloadReport(path: string, filename: string) {
  const response = await fetch(`${apiBaseUrl()}${path}`, { credentials: "include" });
  if (!response.ok) throw new Error("The report could not be downloaded");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
