import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/pages/DashboardPage";
import { UiProvider } from "@/stores/ui-context";

const summary = {
  currency: "NGN",
  preset: "this_month",
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-10-31T23:59:59.999Z",
  timeZone: "Africa/Lagos",
  kpis: {
    totalSales: "99.0000",
    totalPurchases: "40.0000",
    grossProfit: "10.0000",
    totalExpenses: "3.0000",
    salesToday: "0.0000",
    salesThisMonth: "99.0000",
    netProfit: "7.0000",
    cashAndBank: "0.0000",
    accountsReceivable: "0.0000",
    accountsPayable: "0.0000",
    inventoryValuation: "0.0000",
    cashCollections: "0.0000",
    creditSales: "0.0000",
    operatingExpenses: "3.0000",
    dailySales: "0.0000",
  },
  salesVsPurchases: [],
  monthlyRevenue: [],
  monthlyExpenses: [],
  branchPerformance: [],
  cashFlow: [],
  revenueByProductCategory: [],
  customerDebtAging: [],
  supplierLiabilityAging: [],
  inventoryByCategory: [],
  projectProfitability: [],
  topSellingProducts: [],
  recentTransactions: [],
  operations: {
    pendingApprovals: 0,
    activeProjects: 0,
    lowStockAlerts: 0,
    overdueInvoices: 0,
    stockAvailability: 0,
    pendingTransfers: 0,
    activeInstallations: 0,
    dailyClosingStatus: "none",
  },
};

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UiProvider>
          <DashboardPage />
        </UiProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardPage", () => {
  it("shows ledger totals from the API without recalculating profit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => summary,
      }),
    );

    renderDashboard();

    expect(await screen.findByTestId("kpi-grossProfit")).toHaveTextContent("₦10.00");
    expect(screen.getByTestId("kpi-totalSales")).toHaveTextContent("₦99.00");
    expect(screen.getByText("No posted activity")).toBeInTheDocument();
  });
});
