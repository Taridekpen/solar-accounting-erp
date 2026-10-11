import { apiRequest } from "@/services/api-client";

export type ImportType =
  | "chart_of_accounts"
  | "customers"
  | "suppliers"
  | "products"
  | "warehouse_opening_stock"
  | "bank_opening_balances"
  | "outstanding_invoices"
  | "outstanding_bills"
  | "fixed_assets"
  | "opening_trial_balance";

export interface ImportBatchRow {
  id: string;
  importType: string;
  fileName: string;
  status: string;
  rowCount: number;
  okCount: number;
  errorCount: number;
  duplicateCount: number;
  createdByUserId: string;
  approvedByUserId: string | null;
  reconciliation?: unknown;
  report?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ImportPreview {
  id: string;
  importType: string;
  status: string;
  rowCount: number;
  okCount: number;
  errorCount: number;
  duplicateCount: number;
  reconciliation: unknown;
  sample: Array<{
    rowNumber: number;
    status: string;
    normalized: unknown;
    messages: unknown;
  }>;
}

export const IMPORT_TYPE_OPTIONS: Array<{ value: ImportType; label: string }> = [
  { value: "customers", label: "Customers" },
  { value: "suppliers", label: "Suppliers" },
  { value: "products", label: "Products" },
  { value: "chart_of_accounts", label: "Chart of accounts" },
  { value: "opening_trial_balance", label: "Opening trial balance" },
  { value: "bank_opening_balances", label: "Bank opening balances" },
  { value: "warehouse_opening_stock", label: "Warehouse opening stock" },
  { value: "outstanding_invoices", label: "Outstanding invoices" },
  { value: "outstanding_bills", label: "Outstanding bills" },
  { value: "fixed_assets", label: "Fixed assets" },
];

export function listImportBatches() {
  return apiRequest<ImportBatchRow[]>("/imports");
}

export function uploadImport(body: { importType: ImportType; fileName: string; contentBase64: string }) {
  return apiRequest<ImportBatchRow>("/imports", { method: "POST", body: JSON.stringify(body) });
}

export function parseImport(id: string) {
  return apiRequest<ImportBatchRow>(`/imports/${id}/parse`, { method: "POST", body: "{}" });
}

export function validateImport(id: string) {
  return apiRequest<ImportBatchRow>(`/imports/${id}/validate`, { method: "POST", body: "{}" });
}

export function previewImport(id: string) {
  return apiRequest<ImportPreview>(`/imports/${id}/preview`);
}

export function approveImport(id: string) {
  return apiRequest<ImportBatchRow>(`/imports/${id}/approve`, { method: "POST", body: "{}" });
}

export function commitImport(id: string) {
  return apiRequest<ImportBatchRow & { report: unknown }>(`/imports/${id}/commit`, { method: "POST", body: "{}" });
}

export function importReport(id: string) {
  return apiRequest<{ id: string; importType: string; report: unknown }>(`/imports/${id}/report`);
}
