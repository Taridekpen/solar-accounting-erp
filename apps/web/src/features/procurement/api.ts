import { apiBaseUrl, apiRequest } from "@/services/api-client";
import type { PageResult } from "@/features/organization/api";

export interface SupplierRecord {
  id: string;
  supplierCode: string;
  businessName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTermsDays: number;
  status: "active" | "inactive";
  branchIds: string[];
  bankAccountMask: string | null;
}

export interface SupplierStatement {
  outstandingBalance: string;
  overdueBalance: string;
  accountsPayable: string;
  bankAccountMask: string | null;
  aging: { current: string; days1To30: string; days31To60: string; days61To90: string; over90: string };
  bills: { id: string; billNumber: string; supplierInvoiceNumber: string; invoiceDate: string; dueDate: string; grandTotal: string; openBalance: string }[];
  payments: { id: string; paymentNumber: string; paymentDate: string; total: string; depositAmount: string }[];
}

export interface PurchaseOrderRecord {
  id: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  warehouseId: string;
  procurementMode: "central" | "branch";
  status: string;
  expectedDeliveryDate: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  lines: { id: string; productId: string; description: string; quantity: string; receivedQuantity: string; unitCost: string; lineTotal: string }[];
}

export interface OrderTotals {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
}

export interface BillPreview {
  flags: { quantityDifference: boolean; priceDifference: boolean; missingReceipt: boolean; unapprovedOrder: boolean };
  subtotal: string;
  taxTotal: string;
  varianceTotal: string;
  grandTotal: string;
}

export interface WarehouseRecord {
  id: string;
  branchId: string;
  warehouseCode: string;
  name: string;
  warehouseType?: string;
}

export interface RequisitionRecord {
  id: string;
  requisitionNumber: string;
  purpose: string;
  status: string;
  estimatedCost: string;
  requiredDate: string;
}

export function fetchSuppliers(search = "") {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  if (search) params.set("search", search);
  return apiRequest<PageResult<SupplierRecord>>(`/suppliers?${params.toString()}`);
}

export function createSupplier(body: Record<string, unknown>) {
  return apiRequest<SupplierRecord>("/suppliers", { method: "POST", body: JSON.stringify(body) });
}

export function updateSupplier(id: string, body: Record<string, unknown>) {
  return apiRequest<SupplierRecord>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function fetchSupplierStatement(id: string) {
  return apiRequest<SupplierStatement>(`/suppliers/${id}/statement`);
}

export function fetchWarehouses(branchId: string) {
  return apiRequest<WarehouseRecord[]>(`/warehouses?branchId=${branchId}`);
}

export function fetchRequisitions() {
  return apiRequest<PageResult<RequisitionRecord>>("/purchases/requisitions?page=1&pageSize=50");
}

export function createRequisition(body: Record<string, unknown>) {
  return apiRequest<RequisitionRecord>("/purchases/requisitions", { method: "POST", body: JSON.stringify(body) });
}

export function submitRequisition(id: string) {
  return apiRequest<{ id: string; status: string }>(`/purchases/requisitions/${id}/submit`, { method: "POST" });
}

export function approveRequisition(id: string) {
  return apiRequest<{ id: string; status: string }>(`/purchases/requisitions/${id}/approve`, { method: "POST" });
}

export function fetchOrders() {
  return apiRequest<PageResult<PurchaseOrderRecord>>("/purchases/orders?page=1&pageSize=50");
}

export function previewOrder(body: Record<string, unknown>) {
  return apiRequest<OrderTotals>("/purchases/orders/preview", { method: "POST", body: JSON.stringify(body) });
}

export function createOrder(body: Record<string, unknown>) {
  return apiRequest<PurchaseOrderRecord>("/purchases/orders", { method: "POST", body: JSON.stringify(body) });
}

export function submitOrder(id: string) {
  return apiRequest<{ id: string; status: string }>(`/purchases/orders/${id}/submit`, { method: "POST" });
}

export function approveOrder(id: string) {
  return apiRequest<{ id: string; status: string }>(`/purchases/orders/${id}/approve`, { method: "POST" });
}

export function createReceipt(body: Record<string, unknown>) {
  return apiRequest<{ id: string; goodsReceiptNumber: string }>("/purchases/receipts", { method: "POST", body: JSON.stringify(body) });
}

export function previewBill(body: Record<string, unknown>) {
  return apiRequest<BillPreview>("/purchases/bills/preview", { method: "POST", body: JSON.stringify(body) });
}

export function createBill(body: Record<string, unknown>) {
  return apiRequest<{ id: string; billNumber: string; grandTotal: string }>("/purchases/bills", { method: "POST", body: JSON.stringify(body) });
}

export function createPayment(body: Record<string, unknown>) {
  return apiRequest<{ id: string; paymentNumber: string; status: string; depositAmount: string }>("/purchases/payments", { method: "POST", body: JSON.stringify(body) });
}

export function postPayment(id: string) {
  return apiRequest<{ id: string; status: string }>(`/purchases/payments/${id}/post`, { method: "POST" });
}

export async function downloadPurchasePdf(path: string, filename: string) {
  const response = await fetch(`${apiBaseUrl()}${path}`, { credentials: "include" });
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
