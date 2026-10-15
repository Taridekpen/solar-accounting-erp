import { apiBaseUrl, apiFetchHeaders, apiRequest } from "@/services/api-client";
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
  createdByUserId: string;
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

export function submitExpense(id: string) {
  return apiRequest<ExpenseRecord>(`/expenses/${id}/submit`, { method: "POST" });
}

export function approveExpense(id: string) {
  return apiRequest<ExpenseRecord>(`/expenses/${id}/approve`, { method: "POST" });
}

export function rejectExpense(id: string) {
  return apiRequest<ExpenseRecord>(`/expenses/${id}/reject`, { method: "POST" });
}

export function payExpense(id: string, body: { paymentAccountId: string; paymentDate: string }) {
  return apiRequest<ExpenseRecord>(`/expenses/${id}/pay`, { method: "POST", body: JSON.stringify(body) });
}

export async function fetchExpenseReceipt(id: string): Promise<{ blob: Blob; fileName: string; mimeType: string }> {
  const response = await fetch(`${apiBaseUrl()}/expenses/${id}/receipt`, {
    credentials: "include",
    headers: apiFetchHeaders(),
  });
  if (!response.ok) throw new Error("The receipt could not be loaded");
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/i.exec(disposition);
  const fileName = match?.[1] || "receipt";
  const mimeType = response.headers.get("Content-Type") || blob.type || "application/octet-stream";
  return { blob, fileName, mimeType };
}
