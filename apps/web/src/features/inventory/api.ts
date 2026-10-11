import { apiRequest } from "@/services/api-client";

export interface StockRow {
  warehouseId: string;
  warehouseName: string;
  warehouseType: string;
  branchId: string;
  branchName: string;
  productId: string;
  sku: string;
  productName: string;
  category: string;
  quantity: string;
  availableQuantity: string;
  averageUnitCost: string;
  valuation: string;
  reorderLevel: string;
}

export interface SerialRecord {
  serialNumber: string;
  status: string;
  productName: string;
  warehouseName: string | null;
  branchName: string | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  customerName: string | null;
}

export interface InventoryReports {
  onHand: StockRow[];
  valuation: string;
  lowStock: StockRow[];
  movements: { productName: string; movementType: string; quantity: string; unitCost: string; occurredAt: string }[];
  serials: { serialNumber: string; productName: string; status: string; warehouseName: string | null }[];
  openTransfers: { id: string; transferNumber: string; status: string }[];
}

export function fetchStock() {
  return apiRequest<StockRow[]>("/inventory/stock");
}

export function fetchReports() {
  return apiRequest<InventoryReports>("/inventory/reports");
}

export function lookupSerial(serial: string) {
  return apiRequest<SerialRecord>(`/inventory/serials?serial=${encodeURIComponent(serial)}`);
}

export function createTransfer(body: Record<string, unknown>) {
  return apiRequest<{ id: string; transferNumber: string; status: string }>("/inventory/transfers", { method: "POST", body: JSON.stringify(body) });
}

export function createCount(body: Record<string, unknown>) {
  return apiRequest<{ id: string; countNumber: string; status: string }>("/inventory/counts", { method: "POST", body: JSON.stringify(body) });
}
