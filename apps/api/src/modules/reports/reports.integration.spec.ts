import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BadRequestException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";
import { parseMoney } from "../accounting/money";
import { renderCsv, renderPdf } from "./reports-export";

function useDisposableDatabase(): void {
  const envPath = resolve(__dirname, "../../../.env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(index + 1).trim();
  }
  const current = process.env.DATABASE_URL ?? "";
  if (!current.includes("/solar_accounting_test")) {
    process.env.DATABASE_URL = current.replace("/solar_accounting", "/solar_accounting_test");
  }
}

useDisposableDatabase();

describe("accounting books and financial reports", () => {
  let prisma: PrismaClient;
  let maker: AccessContext;
  let outsider: AccessContext;
  let branchId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    branchId = branch.id;
    const permissions = ["reports.view", "reports.company.view", "reports.branch.view"];
    maker = context(admin.id, admin.email, true, { type: "company" }, permissions);
    outsider = context(admin.id, admin.email, false, { type: "branches", branchIds: [randomUUID()] }, ["reports.view", "reports.branch.view"]);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("balances December statements and keeps transfers out of profit", async () => {
    const { ReportsService } = await import("./reports.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AuditService } = await import("../auth/audit.service");
    const posting = new AccountingPostingService(prisma as never, new DocumentNumberService(prisma as never));
    const reports = new ReportsService(prisma as never, posting, new DocumentNumberService(prisma as never), new AuditService(prisma as never));
    const companyId = (await prisma.user.findUniqueOrThrow({ where: { id: maker.userId } })).companyId;
    const account = (code: string) => prisma.account.findFirstOrThrow({ where: { companyId, accountCode: code, deletedAt: null } });
    const cash = await account("1000");
    const petty = await account("1010");
    const revenue = await account("4000");
    const receivable = await account("1200");
    const installation = await account("4400");
    const output = await account("2400");
    const customer = await prisma.customer.create({
      data: { companyId, customerCode: `RPT-${randomUUID().slice(0, 8)}`, customerType: "corporate", name: `December report ${randomUUID().slice(0, 6)}` },
    });
    const beforeProfit = await reports.profitAndLoss(maker, "2026-12-01", "2026-12-31");
    const beforeCash = await reports.cashFlow(maker, "2026-12-01", "2026-12-31");
    await posting.postSystemDocument(maker, {
      sourceModule: "reports",
      sourceDocumentType: "report_sale",
      sourceDocumentId: randomUUID(),
      accountingDate: "2026-12-08",
      description: "December report sale",
      lines: [
        { accountId: cash.id, branchId, customerId: customer.id, debit: "2500.0000", credit: "0", description: "December report sale" },
        { accountId: revenue.id, branchId, customerId: customer.id, debit: "0", credit: "2500.0000", description: "December report sale" },
      ],
    });
    const afterProfit = await reports.profitAndLoss(maker, "2026-12-01", "2026-12-31");
    expect(signed(afterProfit.netProfit) - signed(beforeProfit.netProfit)).toBe(parseMoney("2500.0000"));
    const trial = await reports.trialBalance(maker, "2026-12-31");
    expect(trial.balanced).toBe(true);
    expect(trial.totalDebit).toBe(trial.totalCredit);
    const sheet = await reports.balanceSheet(maker, "2026-12-31");
    expect(sheet.balanced).toBe(true);
    expect(sheet.assets).toBe(sheet.liabilitiesAndEquity);
    expect(sheet.clearing).toBe("0.0000");
    const cashRow = trial.rows.find((row) => row.accountCode === "1000");
    const ledger = await reports.ledger(maker, cash.id, "2026-01-01", "2026-12-31");
    expect(signed(ledger.closing)).toBe(parseMoney(cashRow?.debit ?? "0") - parseMoney(cashRow?.credit ?? "0"));
    expect(ledger.rows.every((row) => row.journalId.length > 0)).toBe(true);
    await posting.postSystemDocument(maker, {
      sourceModule: "reports",
      sourceDocumentType: "report_transfer",
      sourceDocumentId: randomUUID(),
      accountingDate: "2026-12-09",
      description: "December cash transfer",
      lines: [
        { accountId: petty.id, branchId, debit: "800.0000", credit: "0", description: "Move cash" },
        { accountId: cash.id, branchId, debit: "0", credit: "800.0000", description: "Move cash" },
      ],
    });
    const transferred = await reports.profitAndLoss(maker, "2026-12-01", "2026-12-31");
    expect(transferred.netProfit).toBe(afterProfit.netProfit);
    const flow = await reports.cashFlow(maker, "2026-12-01", "2026-12-31");
    expect(flow.netChange).toBe(flow.cashChange);
    expect(signed(flow.cashChange) - signed(beforeCash.cashChange)).toBe(parseMoney("2500.0000"));
    await posting.postSystemDocument(maker, {
      sourceModule: "reports",
      sourceDocumentType: "report_invoice",
      sourceDocumentId: randomUUID(),
      accountingDate: "2026-12-10",
      description: "December receivable",
      lines: [
        { accountId: receivable.id, branchId, customerId: customer.id, debit: "3000.0000", credit: "0", description: "December receivable" },
        { accountId: installation.id, branchId, customerId: customer.id, debit: "0", credit: "3000.0000", description: "December receivable" },
      ],
    });
    const receivables = await reports.receivables(maker, "2026-12-31");
    const customerRow = receivables.rows.find((row) => row.name === customer.name);
    expect(customerRow?.outstanding).toBe("3000.0000");
    expect(receivables.totalOutstanding).toBe(receivables.control);
    const asset = await reports.acquireAsset(maker, {
      branchId,
      name: "December inverter",
      category: "Equipment",
      acquisitionDate: "2026-12-18",
      cost: "12000.0000",
      usefulLifeMonths: 12,
      paymentAccountId: cash.id,
    });
    const depreciated = await reports.depreciate(maker, asset.id, { accountingDate: "2026-12-19" });
    expect(depreciated.bookValue).toBe("11000.0000");
    const seasonal = await reports.createTaxCode(maker, {
      code: `WHT-${randomUUID().slice(0, 6)}`,
      name: "December withholding",
      kind: "withholding",
      rate: "5.0000",
      effectiveFrom: "2026-12-01",
      effectiveTo: "2026-12-31",
      accountId: output.id,
    });
    await expect(reports.payTax(maker, { taxCodeId: seasonal.id, amount: "100.0000", accountingDate: "2026-11-01", paymentAccountId: cash.id })).rejects.toBeInstanceOf(BadRequestException);
    const csv = renderCsv(trial.table);
    expect(csv).toContain(trial.totalDebit);
    expect(csv).toContain(trial.totalCredit);
    const pdf = await renderPdf(trial.table);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const visible = await reports.journal(maker, "2026-12-01", "2026-12-31");
    const hidden = await reports.journal(outsider, "2026-12-01", "2026-12-31");
    expect(visible.rows.length).toBeGreaterThan(0);
    expect(hidden.rows.some((row) => visible.rows.some((item) => item.journalNumber === row.journalNumber))).toBe(false);
  }, 60_000);
});

function signed(value: string) {
  return value.startsWith("-") ? -parseMoney(value.slice(1)) : parseMoney(value);
}

function context(userId: string, email: string, companyWide: boolean, scope: AccessContext["scope"], permissions: string[]): AccessContext {
  return {
    userId,
    email,
    sessionId: "00000000-0000-4000-8000-000000000012",
    csrfTokenHash: "test",
    permissions,
    roleCodes: companyWide ? ["super_administrator"] : ["branch_accountant"],
    companyWide,
    mfaPending: false,
    mfaEnabled: true,
    scope,
  };
}
