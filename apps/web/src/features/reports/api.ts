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
  rows: { accountCode: string; accountName: string; debit: string; credit: string }[];
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

export function fetchTrialBalance(asOf: string) {
  return apiRequest<TrialBalanceReport>(`/reports/trial-balance?asOf=${asOf}`);
}

export function fetchProfitAndLoss(from: string, to: string) {
  return apiRequest<ProfitReport>(`/reports/profit-and-loss?from=${from}&to=${to}`);
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
