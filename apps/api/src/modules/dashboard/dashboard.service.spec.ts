import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  function service(timezone = "Africa/Lagos") {
    return new DashboardService({
      company: { findFirst: jest.fn().mockResolvedValue({ id: "company", timezone }) },
      $queryRaw: jest.fn().mockImplementation((query: { strings?: string[] }) => {
        const text = query.strings?.join(" ") ?? "";
        if (text.includes("YYYY-MM")) {
          return Promise.resolve([]);
        }
        return Promise.resolve([{ sales: "0", purchases: "0", cogs: "0", expenses: "0" }]);
      }),
      journalEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      salesInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      supplierBill: { findMany: jest.fn().mockResolvedValue([]) },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      stockPosition: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      stockTransfer: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      journalLine: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);
  }

  it("returns zero ledger totals as decimal strings", async () => {
    const summary = await service().getSummary({});

    expect(summary.currency).toBe("NGN");
    expect(summary.timeZone).toBe("Africa/Lagos");
    expect(summary.kpis).toEqual({
      totalSales: "0.0000",
      totalPurchases: "0.0000",
      grossProfit: "0.0000",
      totalExpenses: "0.0000",
      salesToday: "0.0000",
      salesThisMonth: "0.0000",
      netProfit: "0.0000",
      cashAndBank: "0.0000",
      accountsReceivable: "0.0000",
      accountsPayable: "0.0000",
      inventoryValuation: "0.0000",
      cashCollections: "0.0000",
      creditSales: "0.0000",
      operatingExpenses: "0.0000",
      dailySales: "0.0000",
    });
    expect(summary.salesVsPurchases).toEqual([]);
    expect(summary.monthlyRevenue).toEqual([]);
    expect(summary.branchPerformance).toEqual([]);
    expect(summary.revenueByProductCategory).toEqual([]);
    expect(summary.customerDebtAging).toEqual([]);
    expect(summary.operations.pendingApprovals).toBe(0);
    expect(summary.operations.activeProjects).toBe(0);
    expect(summary.topSellingProducts).toEqual([]);
    expect(summary.recentTransactions).toEqual([]);
    expect(Object.values(summary.kpis).every((amount) => typeof amount === "string")).toBe(true);
  });

  it("uses the requested custom range", async () => {
    const summary = await service().getSummary({
      preset: "custom",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-31T23:59:59.999Z",
    });

    expect(summary.from).toBe("2026-10-01T00:00:00.000Z");
    expect(summary.to).toBe("2026-10-31T23:59:59.999Z");
  });
});
