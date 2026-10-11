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

describe("Section 16 April 2028 accounting scenario", () => {
  let prisma: PrismaClient;
  let access: AccessContext;
  let branchId = "";
  let companyId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" },
    });
    companyId = admin.companyId;
    await openYear(prisma, companyId, 2028);
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    branchId = branch.id;
    access = {
      userId: admin.id,
      email: admin.email,
      sessionId: randomUUID(),
      csrfTokenHash: "test",
      permissions: ["reports.view", "reports.company.view", "accounting.view", "inventory.view"],
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

  it("runs April 2028 steps 1–16 and asserts financial statements", async () => {
    const documents = new DocumentNumberService(prisma as never);
    const posting = new AccountingPostingService(prisma as never, documents);
    const { ReportsService } = await import("../reports/reports.service");
    const { AuditService } = await import("../auth/audit.service");
    const reports = new ReportsService(prisma as never, posting, documents, new AuditService(prisma as never));
    const cash = await acct("1000");
    const bank = await acct("1100");
    const ar = await acct("1200");
    const inventory = await acct("1300");
    const fixed = await acct("1600");
    const ap = await acct("2000");
    const equity = await acct("3000");
    const revenue = await acct("4000");
    const cogs = await acct("5000");
    const expense = await acct("6900");
    const customer = await prisma.customer.create({
      data: {
        companyId,
        customerCode: `APR28-${randomUUID().slice(0, 6)}`,
        customerType: "corporate",
        name: "April 2028 customer",
      },
    });
    const supplier = await prisma.supplier.create({
      data: {
        companyId,
        supplierCode: `APR28S-${randomUUID().slice(0, 6)}`,
        businessName: "April 2028 supplier",
      },
    });

    // 1 opening cash/bank/equity
    await posting.importOpeningBalances(access, {
      accountingDate: "2028-04-01",
      description: "April 2028 opening",
      lines: [
        { accountId: cash.id, branchId, debit: "20000.0000", credit: "0", description: "Opening cash" },
        { accountId: bank.id, branchId, debit: "30000.0000", credit: "0", description: "Opening bank" },
        { accountId: inventory.id, branchId, debit: "10000.0000", credit: "0", description: "Opening stock" },
        { accountId: equity.id, branchId, debit: "0", credit: "60000.0000", description: "Opening equity" },
      ],
      details: [
        { kind: "cash", accountCode: "1000", amount: "20000.0000", branchId },
        { kind: "bank", accountCode: "1100", amount: "30000.0000", branchId },
        {
          kind: "inventory",
          accountCode: "1300",
          reference: "OPEN-APR",
          quantity: "10.0000",
          unitCost: "1000.0000",
          amount: "10000.0000",
          branchId,
        },
        { kind: "equity", accountCode: "3000", amount: "60000.0000", branchId },
      ],
    });

    // 2 credit sale
    await post(posting, "2028-04-02", "Credit sale", [
      [ar.id, "12000.0000", "0", customer.id],
      [revenue.id, "0", "12000.0000", customer.id],
    ]);
    // 3 COGS
    await post(posting, "2028-04-02", "COGS", [
      [cogs.id, "4000.0000", "0"],
      [inventory.id, "0", "4000.0000"],
    ]);
    // 4 customer receipt to bank
    await post(posting, "2028-04-03", "Customer receipt", [
      [bank.id, "8000.0000", "0", customer.id],
      [ar.id, "0", "8000.0000", customer.id],
    ]);
    // 5 supplier bill
    await post(posting, "2028-04-04", "Supplier bill", [
      [inventory.id, "6000.0000", "0", undefined, supplier.id],
      [ap.id, "0", "6000.0000", undefined, supplier.id],
    ]);
    // 6 supplier payment
    await post(posting, "2028-04-05", "Supplier payment", [
      [ap.id, "2500.0000", "0", undefined, supplier.id],
      [bank.id, "0", "2500.0000", undefined, supplier.id],
    ]);
    // 7 cash sale
    await post(posting, "2028-04-06", "Cash sale", [
      [cash.id, "3500.0000", "0", customer.id],
      [revenue.id, "0", "3500.0000", customer.id],
    ]);
    // 8 operating expense
    await post(posting, "2028-04-07", "Operating expense", [
      [expense.id, "900.0000", "0"],
      [cash.id, "0", "900.0000"],
    ]);
    // 9 bank transfer from cash
    await post(posting, "2028-04-08", "Bank deposit", [
      [bank.id, "1500.0000", "0"],
      [cash.id, "0", "1500.0000"],
    ]);
    // 10 fixed asset purchase
    await post(posting, "2028-04-09", "Fixed asset", [
      [fixed.id, "7000.0000", "0"],
      [bank.id, "0", "7000.0000"],
    ]);
    // 11 additional inventory receipt
    await post(posting, "2028-04-10", "Stock receipt", [
      [inventory.id, "2000.0000", "0", undefined, supplier.id],
      [ap.id, "0", "2000.0000", undefined, supplier.id],
    ]);
    // 12 another receipt on AR
    await post(posting, "2028-04-11", "AR collection", [
      [cash.id, "2000.0000", "0", customer.id],
      [ar.id, "0", "2000.0000", customer.id],
    ]);
    // 13 petty cash expense
    await post(posting, "2028-04-12", "Petty cash", [
      [expense.id, "250.0000", "0"],
      [cash.id, "0", "250.0000"],
    ]);
    // 14 AP payment from cash
    await post(posting, "2028-04-13", "AP cash payment", [
      [ap.id, "1500.0000", "0", undefined, supplier.id],
      [cash.id, "0", "1500.0000", undefined, supplier.id],
    ]);
    // 15 service revenue
    await post(posting, "2028-04-14", "Service revenue", [
      [bank.id, "1800.0000", "0", customer.id],
      [revenue.id, "0", "1800.0000", customer.id],
    ]);
    // 16 inventory adjustment expense
    await post(posting, "2028-04-15", "Inventory write-off", [
      [expense.id, "500.0000", "0"],
      [inventory.id, "0", "500.0000"],
    ]);

    const trial = await reports.trialBalance(access, "2028-04-30");
    expect(trial.balanced).toBe(true);
    expect(trial.totalDebit).toBe(trial.totalCredit);

    const inventoryReport = await reports.inventory(access, "2028-04-01", "2028-04-30");
    expect(inventoryReport).toBeTruthy();

    const arReport = await reports.receivables(access, "2028-04-30");
    const apReport = await reports.payables(access, "2028-04-30");
    const arControl = trial.rows.find((row) => row.accountCode === "1200");
    const apControl = trial.rows.find((row) => row.accountCode === "2000");
    expect(arControl).toBeTruthy();
    expect(apControl).toBeTruthy();
    expect(arReport).toBeTruthy();
    expect(apReport).toBeTruthy();

    const bankRow = trial.rows.find((row) => row.accountCode === "1100");
    expect(bankRow).toBeTruthy();

    const profit = await reports.profitAndLoss(access, "2028-04-01", "2028-04-30");
    expect(parseMoney(profit.netProfit)).toBeGreaterThan(0n);

    const sheet = await reports.balanceSheet(access, "2028-04-30");
    expect(sheet.balanced).toBe(true);
    expect(sheet.assets).toBe(sheet.liabilitiesAndEquity);

    const flow = await reports.cashFlow(access, "2028-04-01", "2028-04-30");
    expect(flow.netChange).toBe(flow.cashChange);
  }, 120000);

  async function acct(code: string) {
    return prisma.account.findFirstOrThrow({ where: { companyId, accountCode: code, deletedAt: null } });
  }

  async function openYear(client: PrismaClient, id: string, year: number) {
    const startDate = new Date(Date.UTC(year, 0, 1));
    const fiscalYear = await client.fiscalYear.upsert({
      where: { companyId_startDate: { companyId: id, startDate } },
      update: {},
      create: { companyId: id, startDate, endDate: new Date(Date.UTC(year, 11, 31)) },
    });
    for (let month = 0; month < 12; month += 1) {
      const periodStart = new Date(Date.UTC(year, month, 1));
      const found = await client.fiscalPeriod.findFirst({ where: { companyId: id, startDate: periodStart } });
      if (!found) {
        await client.fiscalPeriod.create({
          data: {
            companyId: id,
            fiscalYearId: fiscalYear.id,
            startDate: periodStart,
            endDate: new Date(Date.UTC(year, month + 1, 0)),
            status: "open",
          },
        });
      }
    }
  }

  async function post(
    posting: AccountingPostingService,
    date: string,
    description: string,
    lines: Array<[string, string, string, string?, string?]>,
  ) {
    await posting.postSystemDocument(access, {
      sourceModule: "scenario",
      sourceDocumentType: "april_2028_scenario",
      sourceDocumentId: randomUUID(),
      accountingDate: date,
      description,
      lines: lines.map(([accountId, debit, credit, customerId, supplierId]) => ({
        accountId,
        branchId,
        debit,
        credit,
        description,
        customerId,
        supplierId,
      })),
    });
  }
});
