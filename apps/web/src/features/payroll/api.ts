import { apiRequest } from "@/services/api-client";

export interface SalarySummaryRow {
  id: string;
  summaryNumber: string;
  branchName: string | null;
  periodStart: string;
  periodEnd: string;
  grossAmount: string;
  netAmount: string;
  outstanding: string;
  status: string;
  approvalReference: string;
}

export interface OutstandingPayroll {
  rows: { id: string; summaryNumber: string; branchName: string; periodEnd: string; netAmount: string; outstanding: string }[];
  totalOutstanding: string;
  control: string;
}

export function fetchSalarySummaries() {
  return apiRequest<SalarySummaryRow[]>("/payroll/summaries");
}

export function fetchPayrollOutstanding() {
  return apiRequest<OutstandingPayroll>("/payroll/outstanding");
}
