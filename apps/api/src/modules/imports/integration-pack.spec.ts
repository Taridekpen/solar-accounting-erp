import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";
import { DocumentNumberService } from "../organization/document-number.service";
import { AccountingPostingService } from "../accounting/posting.service";
import { parseMoney } from "../accounting/money";

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

describe("Section 16 integration pack", () => {
  let prisma: PrismaClient;
  let access: AccessContext;
  let branchId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" },
    });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    branchId = branch.id;
    await openYear(prisma, admin.companyId, 2028);
    access = {
      userId: admin.id,
      email: admin.email,
      sessionId: randomUUID(),
      csrfTokenHash: "test",
      permissions: [
        "sales.view",
        "sales.create",
        "purchases.view",
        "inventory.view",
        "expenses.view",
        "banking.reconcile",
        "banking.transfer",
        "projects.view",
        "accounting.view",
        "closing.view",
        "closing.daily.prepare",
        "reports.view",
        "reports.company.view",
      ],
      roleCodes: ["super_administrator"],
      companyWide: true,
      mfaPending: false,
      mfaEnabled: true,
      scope: { type: "company" },
    };
  }, 120000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("orchestrates sale, purchase accrual, expense, transfer, project cost, bank move, and period visibility", async () => {
    const documents = new DocumentNumberService(prisma as never);
    const posting = new AccountingPostingService(prisma as never, documents);
    const tag = randomUUID().slice(0, 8);
    const cash = await account("1000");
    const bank = await account("1100");
    const ar = await account("1200");
    const inventory = await account("1300");
    const ap = await account("2000");
    const revenue = await account("4000");
    const expense = await account("6900");
    const projectCost = await account("5100").catch(() => account("5000"));
    const customer = await prisma.customer.create({
      data: {
        companyId: cash.companyId,
        customerCode: `INT16-${tag}`,
        customerType: "corporate",
        name: "Integration pack customer",
      },
    });
    const supplier = await prisma.supplier.create({
      data: {
        companyId: cash.companyId,
        supplierCode: `INTS-${tag}`,
        businessName: "Integration pack supplier",
      },
    });
    const labels = {
      sale: `INT16 sale ${tag}`,
      bill: `INT16 bill ${tag}`,
      receipt: `INT16 receipt ${tag}`,
      expense: `INT16 expense ${tag}`,
      transfer: `INT16 transfer ${tag}`,
      project: `INT16 project ${tag}`,
    };

    await posting.postSystemDocument(access, {
      sourceModule: "sales",
      sourceDocumentType: "integration_sale",
      sourceDocumentId: randomUUID(),
      accountingDate: "2028-04-02",
      description: labels.sale,
      lines: [
        { accountId: ar.id, branchId, customerId: customer.id, debit: "5000.0000", credit: "0", description: "Sale" },
        { accountId: revenue.id, branchId, customerId: customer.id, debit: "0", credit: "5000.0000", description: "Sale" },
      ],
    });

    await posting.postSystemDocument(access, {
      sourceModule: "procurement",
      sourceDocumentType: "integration_bill",
      sourceDocumentId: randomUUID(),
      accountingDate: "2028-04-03",
      description: labels.bill,
      lines: [
        { accountId: inventory.id, branchId, supplierId: supplier.id, debit: "2000.0000", credit: "0", description: "Bill" },
        { accountId: ap.id, branchId, supplierId: supplier.id, debit: "0", credit: "2000.0000", description: "Bill" },
      ],
    });

    await posting.postSystemDocument(access, {
      sourceModule: "sales",
      sourceDocumentType: "integration_receipt",
      sourceDocumentId: randomUUID(),
      accountingDate: "2028-04-04",
      description: labels.receipt,
      lines: [
        { accountId: cash.id, branchId, customerId: customer.id, debit: "5000.0000", credit: "0", description: "Receipt" },
        { accountId: ar.id, branchId, customerId: customer.id, debit: "0", credit: "5000.0000", description: "Receipt" },
      ],
    });

    await posting.postSystemDocument(access, {
      sourceModule: "expenses",
      sourceDocumentType: "integration_expense",
      sourceDocumentId: randomUUID(),
      accountingDate: "2028-04-05",
      description: labels.expense,
      lines: [
        { accountId: expense.id, branchId, debit: "300.0000", credit: "0", description: "Expense" },
        { accountId: cash.id, branchId, debit: "0", credit: "300.0000", description: "Expense" },
      ],
    });

    await posting.postSystemDocument(access, {
      sourceModule: "banking",
      sourceDocumentType: "integration_transfer",
      sourceDocumentId: randomUUID(),
      accountingDate: "2028-04-06",
      description: labels.transfer,
      lines: [
        { accountId: bank.id, branchId, debit: "1000.0000", credit: "0", description: "Transfer" },
        { accountId: cash.id, branchId, debit: "0", credit: "1000.0000", description: "Transfer" },
      ],
    });

    await posting.postSystemDocument(access, {
      sourceModule: "projects",
      sourceDocumentType: "integration_project_issue",
      sourceDocumentId: randomUUID(),
      accountingDate: "2028-04-07",
      description: labels.project,
      lines: [
        { accountId: (await projectCost).id, branchId, debit: "400.0000", credit: "0", description: "Project" },
        { accountId: inventory.id, branchId, debit: "0", credit: "400.0000", description: "Project" },
      ],
    });

    const { ReportsService } = await import("../reports/reports.service");
    const { ClosingService } = await import("../closing/closing.service");
    const { AuditService } = await import("../auth/audit.service");
    const reports = new ReportsService(prisma as never, posting, documents, new AuditService(prisma as never));
    const closing = new ClosingService(prisma as never, reports, posting, new AuditService(prisma as never));
    const trial = await reports.trialBalance(access, "2028-04-30");
    expect(trial.balanced).toBe(true);
    const periods = await closing.periods(access);
    expect(periods.length).toBeGreaterThan(0);
    const packJournals = await prisma.journalEntry.count({
      where: {
        companyId: cash.companyId,
        status: "posted",
        description: { in: Object.values(labels) },
      },
    });
    expect(packJournals).toBe(6);
    const cashLines = await prisma.journalLine.findMany({
      where: {
        accountId: cash.id,
        journal: { description: { in: [labels.receipt, labels.expense, labels.transfer] } },
      },
    });
    const cashNet = cashLines.reduce(
      (sum, line) => sum + parseMoney(line.debit.toFixed(4)) - parseMoney(line.credit.toFixed(4)),
      0n,
    );
    expect(cashNet).toBe(parseMoney("3700.0000"));
  }, 90000);

  async function account(code: string) {
    return prisma.account.findFirstOrThrow({ where: { accountCode: code, deletedAt: null } });
  }

  async function openYear(client: PrismaClient, companyId: string, year: number) {
    const startDate = new Date(Date.UTC(year, 0, 1));
    const fiscalYear = await client.fiscalYear.upsert({
      where: { companyId_startDate: { companyId, startDate } },
      update: {},
      create: { companyId, startDate, endDate: new Date(Date.UTC(year, 11, 31)) },
    });
    for (let month = 0; month < 12; month += 1) {
      const periodStart = new Date(Date.UTC(year, month, 1));
      const found = await client.fiscalPeriod.findFirst({ where: { companyId, startDate: periodStart } });
      if (!found) {
        await client.fiscalPeriod.create({
          data: {
            companyId,
            fiscalYearId: fiscalYear.id,
            startDate: periodStart,
            endDate: new Date(Date.UTC(year, month + 1, 0)),
            status: "open",
          },
        });
      }
    }
  }
});
