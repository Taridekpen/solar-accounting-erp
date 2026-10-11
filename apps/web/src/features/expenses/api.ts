import { apiRequest } from "@/services/api-client";
import type { PageResult } from "@/features/organization/api";

export interface ExpenseRecord {
  id: string;
  expenseNumber: string;
  branchId: string;
  branchName: string;
  categoryId: string;
  categoryName: string;
  departmentName: string | null;
  expenseDate: string;
  description: string;
  amount: string;
  taxAmount: string;
  total: string;
  status: string;
  receiptName: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface ExpenseReports {
  byBranch: { name: string; amount: string }[];
  byCategory: { name: string; amount: string }[];
  byDepartment: { name: string; amount: string }[];
  monthly: { name: string; amount: string }[];
  projects: { name: string; amount: string }[];
  pending: ExpenseRecord[];
  unpaid: ExpenseRecord[];
  budgetVersusActual: { branchName: string; categoryName: string; budget: string; actual: string }[];
}

export function fetchExpenses() {
  return apiRequest<PageResult<ExpenseRecord>>("/expenses?page=1&pageSize=50");
}

export function fetchExpenseCategories() {
  return apiRequest<ExpenseCategory[]>("/expenses/categories");
}

export function fetchExpenseReports() {
  return apiRequest<ExpenseReports>("/expenses/reports");
}

export function createExpense(body: Record<string, unknown>) {
  return apiRequest<ExpenseRecord>("/expenses", { method: "POST", body: JSON.stringify(body) });
}
