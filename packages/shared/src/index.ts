import Decimal from "decimal.js";

export const DEFAULT_CURRENCY = "NGN" as const;
export type CurrencyCode = typeof DEFAULT_CURRENCY;

export interface DashboardKpis {
  totalSales: string;
  totalPurchases: string;
  grossProfit: string;
  totalExpenses: string;
  salesToday: string;
  salesThisMonth: string;
  netProfit: string;
  cashAndBank: string;
  accountsReceivable: string;
  accountsPayable: string;
  inventoryValuation: string;
  cashCollections: string;
  creditSales: string;
  operatingExpenses: string;
  dailySales: string;
}

export interface SalesPurchasePoint {
  month: string;
  sales: string;
  purchases: string;
}

export interface TopSellingProduct {
  name: string;
  quantity: string;
  revenue: string;
}

export interface RecentTransaction {
  id: string;
  description: string;
  type: string;
  amount: string;
  occurredAt: string;
}

export interface MonthAmount {
  month: string;
  amount: string;
}

export interface BranchPerformance {
  branchId: string;
  branchName: string;
  sales: string;
  profit: string;
}

export interface NamedAmount {
  name: string;
  amount: string;
}

export interface DashboardOperations {
  pendingApprovals: number;
  activeProjects: number;
  lowStockAlerts: number;
  overdueInvoices: number;
  stockAvailability: number;
  pendingTransfers: number;
  activeInstallations: number;
  dailyClosingStatus: "none";
}

export interface DashboardDetailRow {
  id: string;
  label: string;
  amount: string;
  occurredAt: string;
}

export interface DashboardDetail {
  metric: string;
  kind: "money" | "count" | "empty";
  total: string;
  rows: DashboardDetailRow[];
}

export type DashboardPreset = "this_month" | "this_year" | "custom";

export interface ProjectProfitabilityRow {
  name: string;
  contractValue: string;
  recognizedRevenue: string;
  recognizedCost: string;
  grossProfit: string;
}

export interface DashboardSummary {
  currency: CurrencyCode;
  preset: DashboardPreset;
  timeZone: string;
  from: string;
  to: string;
  kpis: DashboardKpis;
  salesVsPurchases: SalesPurchasePoint[];
  monthlyRevenue: MonthAmount[];
  monthlyExpenses: MonthAmount[];
  branchPerformance: BranchPerformance[];
  cashFlow: MonthAmount[];
  revenueByProductCategory: NamedAmount[];
  customerDebtAging: NamedAmount[];
  supplierLiabilityAging: NamedAmount[];
  inventoryByCategory: NamedAmount[];
  projectProfitability: ProjectProfitabilityRow[];
  topSellingProducts: TopSellingProduct[];
  recentTransactions: RecentTransaction[];
  operations: DashboardOperations;
}

const MONEY_PATTERN = /^-?\d+(\.\d+)?$/;

export function assertDecimalString(amount: string): void {
  if (!MONEY_PATTERN.test(amount)) {
    throw new Error("Money amounts must be decimal strings");
  }
}

export function moneyToChartValue(amount: string): number {
  assertDecimalString(amount);
  return new Decimal(amount).toNumber();
}

export function formatMoney(amount: string, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  assertDecimalString(amount);
  const value = new Decimal(amount);
  const negative = value.isNegative();
  const [whole, fraction] = value.abs().toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = `${grouped}.${fraction}`;
  if (currency === "NGN") {
    return negative ? `-₦${formatted}` : `₦${formatted}`;
  }
  return negative ? `-${formatted}` : formatted;
}
