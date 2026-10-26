import { apiBaseUrl, apiRequest } from "@/services/api-client";
import type { PageResult } from "@/features/organization/api";

export interface CustomerRecord {
  id: string;
  customerCode: string;
  customerType: "individual" | "corporate";
  name: string;
  phone: string | null;
  email: string | null;
  billingAddress: string | null;
  deliveryAddress: string | null;
  taxIdentifier: string | null;
  creditLimit: string;
  paymentTermsDays: number;
  status: "active" | "inactive";
  branchIds: string[];
}

export interface ProductRecord {
  id: string;
  sku: string;
  name: string;
  category: string;
  productType: "product" | "service";
  unitOfMeasure: string;
  sellingPrice: string;
  taxRate: string;
  availableQuantity: string | null;
}

export interface InvoicePreview {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  lines: {
    productId: string;
    description: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    taxRate: string;
    lineNet: string;
    taxAmount: string;
    lineTotal: string;
    availableQuantity: string | null;
  }[];
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  branchId: string;
  invoiceDate: string;
  dueDate: string;
  settlement: "credit" | "cash";
  status: string;
  grandTotal: string;
  openBalance: string;
  lines: { id: string; productId: string; description: string; quantity: string; lineTotal: string }[];
}

export interface QuotationRecord {
  id: string;
  quotationNumber: string;
  customerName: string;
  validityDate: string;
  status: string;
  grandTotal: string;
}

export interface CustomerStatement {
  outstandingBalance: string;
  overdueBalance: string;
  accountsReceivable: string;
  aging: { current: string; days1To30: string; days31To60: string; days61To90: string; over90: string };
  invoices: { id: string; invoiceNumber: string; invoiceDate: string; dueDate: string; grandTotal: string; openBalance: string }[];
  receipts: { id: string; receiptNumber: string; receiptDate: string; total: string }[];
  creditNotes: { id: string; creditNoteNumber: string; grandTotal: string; settlement: string }[];
}

export function fetchCustomers(search = "") {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  if (search) params.set("search", search);
  return apiRequest<PageResult<CustomerRecord>>(`/customers?${params.toString()}`);
}

export function createCustomer(body: Record<string, unknown>) {
  return apiRequest<CustomerRecord>("/customers", { method: "POST", body: JSON.stringify(body) });
}

export function fetchProducts(branchId: string) {
  return apiRequest<ProductRecord[]>(`/products?branchId=${branchId}`);
}

export function previewInvoice(body: Record<string, unknown>) {
  return apiRequest<InvoicePreview>("/sales/invoices/preview", { method: "POST", body: JSON.stringify(body) });
}

export function createInvoice(body: Record<string, unknown>) {
  return apiRequest<InvoiceRecord>("/sales/invoices", { method: "POST", body: JSON.stringify(body) });
}

export function finalizeInvoice(id: string) {
  return apiRequest<InvoiceRecord>(`/sales/invoices/${id}/finalize`, { method: "POST" });
}

export function fetchInvoices() {
  return apiRequest<PageResult<InvoiceRecord>>("/sales/invoices?page=1&pageSize=50");
}

export function fetchQuotations() {
  return apiRequest<PageResult<QuotationRecord>>("/sales/quotations?page=1&pageSize=50");
}

export function updateCustomer(id: string, body: Record<string, unknown>) {
  return apiRequest<CustomerRecord>(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  customerName: string;
  receiptDate: string;
  total: string;
  advanceAmount: string;
}

export interface ReturnRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  settlement: string;
  reason: string;
  lines: { invoiceLineId: string; productName: string; quantity: string; acceptedQuantity: string }[];
}

export function fetchReceipts() {
  return apiRequest<PageResult<ReceiptRecord>>("/sales/receipts?page=1&pageSize=50");
}

export function createReceipt(body: Record<string, unknown>) {
  return apiRequest<ReceiptRecord>("/sales/receipts", { method: "POST", body: JSON.stringify(body) });
}

export function fetchReturns() {
  return apiRequest<PageResult<ReturnRecord>>("/sales/returns?page=1&pageSize=50");
}

export function createReturn(body: Record<string, unknown>) {
  return apiRequest<ReturnRecord>("/sales/returns", { method: "POST", body: JSON.stringify(body) });
}

export async function downloadSalesPdf(path: string, filename: string) {
  const response = await fetch(`${apiBaseUrl()}${path}`, { credentials: "omit" });
  if (!response.ok) {
    throw new Error("The PDF could not be downloaded");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function createQuotation(body: Record<string, unknown>) {
  return apiRequest<QuotationRecord>("/sales/quotations", { method: "POST", body: JSON.stringify(body) });
}

export function fetchStatement(customerId: string) {
  return apiRequest<CustomerStatement>(`/customers/${customerId}/statement`);
}

export function invoicePdfPath(id: string) {
  return `/sales/invoices/${id}/pdf`;
}
