import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";
import type { BranchScope } from "../organization/branch-scope";

function useDisposableDatabase(): void {
  const envPath = resolve(__dirname, "../../../.env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  const current = process.env.DATABASE_URL ?? "";
  if (!current.includes("/solar_accounting_test")) {
    process.env.DATABASE_URL = current.replace("/solar_accounting", "/solar_accounting_test");
  }
  if (!(process.env.DATABASE_URL ?? "").includes("/solar_accounting_test")) {
    throw new Error("Dashboard tests must use the disposable solar_accounting_test database");
  }
}

useDisposableDatabase();

const RANGE = {
  preset: "custom" as const,
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-09-30T23:59:59.999Z",
};

describe("dashboard figures", () => {
  let prisma: PrismaClient;
  let access: AccessContext;
  let branchId = "";
  let otherBranchId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    const company = await prisma.company.findFirstOrThrow({ where: { deletedAt: null } });
    const existing = await prisma.branch.findFirst({ where: { branchCode: "DASHX", companyId: company.id } });
    const other = existing ?? await prisma.branch.create({
      data: { companyId: company.id, branchCode: "DASHX", name: "Dashboard Other" },
    });
    branchId = branch.id;
    otherBranchId = other.id;
    access = {
      userId: admin.id,
      email: admin.email,
      sessionId: "00000000-0000-4000-8000-000000000002",
      csrfTokenHash: "test",
      permissions: ["accounting.journal.create"],
      roleCodes: ["super_administrator"],
      companyWide: true,
      mfaPending: false,
      mfaEnabled: true,
      scope: { type: "company" },
    };
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("reconciles posted sales to profit, cash, charts, and branch scope", async () => {
    const dashboard = await service();
    const posting = await postingService();
    const before = await dashboard.getSummary(RANGE);
    await posting.postEvent(access, {
      eventCode: "cash_sale",
      sourceDocumentType: "sales_receipt",
      sourceDocumentId: randomUUID(),
      accountingDate: "2026-09-15",
      branchId,
      amount: "50.0000",
      description: "September dashboard sale",
    });
    const after = await dashboard.getSummary(RANGE);
    expect(units(after.kpis.totalSales) - units(before.kpis.totalSales)).toBe(500000n);
    expect(units(after.kpis.grossProfit) - units(before.kpis.grossProfit)).toBe(500000n);
    expect(units(after.kpis.netProfit) - units(before.kpis.netProfit)).toBe(500000n);
    expect(units(after.kpis.cashAndBank) - units(before.kpis.cashAndBank)).toBe(500000n);
    expect(units(after.kpis.cashCollections) - units(before.kpis.cashCollections)).toBe(500000n);
    expect(units(after.kpis.creditSales) - units(before.kpis.creditSales)).toBe(0n);
    expect(units(monthAmount(after)) - units(monthAmount(before))).toBe(500000n);
    expect(units(branchSales(after, branchId)) - units(branchSales(before, branchId))).toBe(500000n);
    const details = await dashboard.getDetails({ ...RANGE, metric: "sales" });
    const beforeDetails = await dashboard.getDetails({ ...RANGE, metric: "sales" });
    expect(units(details.total) - units(before.kpis.totalSales)).toBe(500000n);
    expect(beforeDetails.rows.reduce((sum, row) => sum + units(row.amount), 0n)).toBe(units(beforeDetails.total));
    expect(after.topSellingProducts).toEqual([]);
    expect(after.revenueByProductCategory).toEqual([]);
    expect(after.customerDebtAging).toEqual([]);
    expect(after.supplierLiabilityAging).toEqual([]);
    expect(after.inventoryByCategory).toEqual([]);
    expect(after.projectProfitability).toEqual([]);
    expect(after.operations.activeProjects).toBe(0);
    expect(after.operations.lowStockAlerts).toBe(0);
    expect(after.operations.overdueInvoices).toBe(0);
    expect(after.operations.dailyClosingStatus).toBe("none");

    const otherScope: BranchScope = { type: "branches", branchIds: [otherBranchId] };
    const other = await dashboard.getSummary(RANGE, otherScope);
    expect(other.kpis.totalSales).toBe("0.0000");
    expect(other.kpis.cashAndBank).toBe("0.0000");
    expect(other.monthlyRevenue).toEqual([]);
  });

  function monthAmount(summary: { monthlyRevenue: Array<{ month: string; amount: string }> }) {
    return summary.monthlyRevenue.find((point) => point.month === "2026-09")?.amount ?? "0.0000";
  }

  function branchSales(summary: { branchPerformance: Array<{ branchId: string; sales: string }> }, id: string) {
    return summary.branchPerformance.find((point) => point.branchId === id)?.sales ?? "0.0000";
  }

  async function service() {
    const { DashboardService } = await import("./dashboard.service");
    return new DashboardService(prisma as never);
  }

  async function postingService() {
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    return new AccountingPostingService(prisma as never, new DocumentNumberService(prisma as never));
  }
});

function units(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const parsed = BigInt(whole) * 10000n + BigInt((fraction + "0000").slice(0, 4));
  return negative ? -parsed : parsed;
}
