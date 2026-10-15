export const MOCK_IMPORT_TYPES = [
  "customers",
  "suppliers",
  "products",
  "opening_trial_balance",
  "bank_opening_balances",
  "warehouse_opening_stock",
] as const;

export type MockImportType = (typeof MOCK_IMPORT_TYPES)[number];

export function isMockImportType(value: string): value is MockImportType {
  return (MOCK_IMPORT_TYPES as readonly string[]).includes(value);
}

export function mockFileMeta(type: MockImportType) {
  const labels: Record<MockImportType, string> = {
    customers: "Customers",
    suppliers: "Suppliers",
    products: "Products",
    opening_trial_balance: "Opening trial balance",
    bank_opening_balances: "Bank opening balances",
    warehouse_opening_stock: "Warehouse opening stock",
  };
  return {
    importType: type,
    label: labels[type],
    fileName: `mock-${type.replace(/_/g, "-")}.csv`,
  };
}

function csv(headers: string[], rows: string[][]) {
  const escape = (value: string) => {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n") + "\n";
}

export function buildMockCsv(type: MockImportType, branchId: string): string {
  switch (type) {
    case "customers":
      return csv(
        ["customerCode", "name", "branchId", "phone", "email"],
        [
          ["CUST-001", "Ada Okonkwo", branchId, "08011110001", "ada@example.com"],
          ["CUST-002", "Chidi Motors Ltd", branchId, "08011110002", "accounts@chidmotors.example"],
          ["CUST-003", "Fatima Solar Homes", branchId, "08011110003", "fatima@example.com"],
        ],
      );
    case "suppliers":
      return csv(
        ["supplierCode", "name", "branchId", "phone", "email"],
        [
          ["SUP-001", "Lagos Panel Distributors", branchId, "08022220001", "sales@lpd.example"],
          ["SUP-002", "Inverter Hub Nigeria", branchId, "08022220002", "orders@inverterhub.example"],
          ["SUP-003", "Battery World Ltd", branchId, "08022220003", "billing@batteryworld.example"],
        ],
      );
    case "products":
      return csv(
        ["sku", "name", "defaultCost", "defaultSellingPrice"],
        [
          ["PNL-450W", "450W Solar Panel", "85000.0000", "120000.0000"],
          ["INV-5K", "5kW Hybrid Inverter", "450000.0000", "620000.0000"],
          ["BAT-100", "100Ah Lithium Battery", "280000.0000", "380000.0000"],
        ],
      );
    case "opening_trial_balance":
      return csv(
        ["accountCode", "debit", "credit"],
        [
          ["1000", "500000.0000", "0.0000"],
          ["1300", "200000.0000", "0.0000"],
          ["1200", "100000.0000", "0.0000"],
          ["2000", "0.0000", "150000.0000"],
          ["3000", "0.0000", "650000.0000"],
        ],
      );
    case "bank_opening_balances":
      return csv(
        ["accountCode", "debit", "credit"],
        [
          ["1000", "250000.0000", "0.0000"],
          ["3000", "0.0000", "250000.0000"],
        ],
      );
    case "warehouse_opening_stock":
      return csv(
        ["accountCode", "quantity", "unitCost", "amount"],
        [
          ["1300", "10.0000", "20000.0000", "200000.0000"],
          ["1300", "5.0000", "40000.0000", "200000.0000"],
        ],
      );
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
