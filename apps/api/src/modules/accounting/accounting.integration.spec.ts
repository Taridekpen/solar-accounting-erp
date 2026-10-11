import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";

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
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl.includes("/solar_accounting_test")) {
    throw new Error("Accounting tests must use the disposable solar_accounting_test database");
  }
}

useDisposableDatabase();

describe("accounting engine", () => {
  let prisma: PrismaClient;
  let access: AccessContext;
  let branchId = "";
  let cashId = "";
  let equityId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    const cash = await prisma.account.findFirstOrThrow({ where: { accountCode: "1000", companyId: admin.companyId } });
    const equity = await prisma.account.findFirstOrThrow({ where: { accountCode: "3000", companyId: admin.companyId } });
    branchId = branch.id;
    cashId = cash.id;
    equityId = equity.id;
    access = {
      userId: admin.id,
      email: admin.email,
      sessionId: "00000000-0000-4000-8000-000000000001",
      csrfTokenHash: "test",
      permissions: ["accounting.journal.create", "accounting.journal.approve"],
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

  it("posts a balanced journal and keeps the trial balance balanced", async () => {
    const posting = await service();
    const posted = await posting.postEvent(access, {
      eventCode: "cash_sale",
      sourceDocumentType: "sales_receipt",
      sourceDocumentId: randomUUID(),
      accountingDate: "2026-03-15",
      branchId,
      amount: "1000.0000",
      description: "Cash sale",
    });
    expect(posted.status).toBe("posted");
    expect(posted.journalNumber.startsWith("JRN-")).toBe(true);
    const trial = await posting.trialBalance(access);
    expect(trial.balanced).toBe(true);
    expect(trial.totalDebit).toBe(trial.totalCredit);
  });

  it("rejects an unbalanced journal", async () => {
    const posting = await service();
    await expect(posting.createManual(access, {
      accountingDate: "2026-03-16",
      description: "Unbalanced",
      lines: [
        { accountId: cashId, branchId, debit: "10.0000", credit: "0" },
        { accountId: equityId, branchId, debit: "0", credit: "4.0000" },
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a second posting of the same source", async () => {
    const posting = await service();
    const sourceDocumentId = randomUUID();
    const input = {
      eventCode: "customer_payment",
      sourceDocumentType: "receipt",
      sourceDocumentId,
      accountingDate: "2026-03-17",
      branchId,
      amount: "25.0000",
      description: "Customer receipt",
    };
    await posting.postEvent(access, input);
    await expect(posting.postEvent(access, input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects posting in a closed period", async () => {
    const posting = await service();
    const period = await prisma.fiscalPeriod.findFirstOrThrow({
      where: { startDate: new Date("2026-04-01T00:00:00.000Z") },
    });
    if (period.status !== "closed") {
      await posting.closePeriod(access, period.id);
    }
    await expect(posting.postEvent(access, {
      eventCode: "cash_sale",
      sourceDocumentType: "sales_receipt",
      sourceDocumentId: randomUUID(),
      accountingDate: "2026-04-10",
      branchId,
      amount: "15.0000",
      description: "Closed period sale",
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("preserves a reversed journal and refuses a second reversal", async () => {
    const posting = await service();
    const posted = await posting.postEvent(access, {
      eventCode: "cash_sale",
      sourceDocumentType: "sales_receipt",
      sourceDocumentId: randomUUID(),
      accountingDate: "2026-05-10",
      branchId,
      amount: "40.0000",
      description: "Sale to reverse",
    });
    const reversal = await posting.reverse(access, posted.id, "Incorrect customer");
    expect(reversal.status).toBe("posted");
    const original = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: posted.id },
      include: { reversedBy: true },
    });
    expect(original.status).toBe("posted");
    expect(original.reversedBy?.id).toBe(reversal.id);
    await expect(posting.reverse(access, posted.id, "Again")).rejects.toBeInstanceOf(ConflictException);
  });

  it("derives account balances from journal lines", async () => {
    const { AccountsService } = await import("./accounts.service");
    const accounts = new AccountsService(prisma as never);
    const rows = await accounts.list(access);
    const cash = rows.find((row) => row.accountCode === "1000");
    expect(cash?.balance).toEqual(expect.stringMatching(/^-?\d+\.\d{4}$/));
  });

  it("rejects an opening batch that does not reconcile", async () => {
    const posting = await service();
    await expect(posting.importOpeningBalances(access, {
      accountingDate: "2026-01-01",
      description: "Opening",
      lines: [
        { accountId: cashId, branchId, debit: "100.0000", credit: "0" },
        { accountId: equityId, branchId, debit: "0", credit: "100.0000" },
      ],
      details: [{ kind: "cash", accountCode: "1000", amount: "40.0000", branchId }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("keeps dashboard totals at zero until a journal is posted", async () => {
    const { DashboardService } = await import("../dashboard/dashboard.service");
    const dashboard = new DashboardService(prisma as never);
    const empty = await dashboard.getSummary({
      preset: "custom",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
    });
    expect(empty.kpis).toEqual({
      totalSales: "0.0000",
      totalPurchases: "0.0000",
      grossProfit: "0.0000",
      totalExpenses: "0.0000",
      salesToday: "0.0000",
      salesThisMonth: "0.0000",
      netProfit: "0.0000",
      cashCollections: "0.0000",
      creditSales: "0.0000",
      operatingExpenses: "0.0000",
      dailySales: "0.0000",
      cashAndBank: expect.stringMatching(/^-?\d+\.\d{4}$/),
      accountsReceivable: expect.stringMatching(/^-?\d+\.\d{4}$/),
      accountsPayable: expect.stringMatching(/^-?\d+\.\d{4}$/),
      inventoryValuation: expect.stringMatching(/^-?\d+\.\d{4}$/),
    });
    const before = await dashboard.getSummary({
      preset: "custom",
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-31T23:59:59.999Z",
    });
    const posting = await service();
    await posting.postEvent(access, {
      eventCode: "cash_sale",
      sourceDocumentType: "sales_receipt",
      sourceDocumentId: randomUUID(),
      accountingDate: "2026-07-12",
      branchId,
      amount: "80.0000",
      description: "July sale",
    });
    const after = await dashboard.getSummary({
      preset: "custom",
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-31T23:59:59.999Z",
    });
    expect(units(after.kpis.totalSales) - units(before.kpis.totalSales)).toBe(800000n);
    expect(units(after.kpis.grossProfit) - units(before.kpis.grossProfit)).toBe(800000n);
    expect(after.recentTransactions.some((row) => row.description === "July sale")).toBe(true);
  }, 20_000);

  function units(value: string): bigint {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace("-", "").split(".");
    const parsed = BigInt(whole) * 10000n + BigInt((fraction + "0000").slice(0, 4));
    return negative ? -parsed : parsed;
  }

  async function service() {
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AccountingPostingService } = await import("./posting.service");
    return new AccountingPostingService(prisma as never, new DocumentNumberService(prisma as never));
  }
});
