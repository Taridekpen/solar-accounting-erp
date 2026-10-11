import { apiRequest } from "@/services/api-client";

export interface ClosingPeriod {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  tasks: { taskCode: string; result: string; completedAt: string | null }[];
}

export interface DailyReport {
  sales: string;
  cashReceipts: string;
  bankCollections: string;
  posCollections: string;
  creditSales: string;
  expenses: string;
  refunds: string;
  inventoryExceptions: number;
  pendingApprovals: number;
  bookCash: string;
  countedCash: string;
  cashDifference: string;
}

export interface DailyClosingView {
  branchName: string;
  businessDate: string;
  status: string;
  report: DailyReport;
}

export function fetchClosingPeriods() {
  return apiRequest<ClosingPeriod[]>("/closing/periods");
}

export function fetchDailyClosing(date: string) {
  return apiRequest<DailyClosingView>(`/closing/daily?date=${date}`);
}
