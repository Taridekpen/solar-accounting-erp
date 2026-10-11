import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";

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

describe("expenses and approval", () => {
  let prisma: PrismaClient;
  let clerk: AccessContext;
  let approver: AccessContext;
  let payer: AccessContext;
  let companyUser: AccessContext;
  let outsider: AccessContext;
  let branchId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    const other = await prisma.branch.upsert({
      where: { companyId_branchCode: { companyId: admin.companyId, branchCode: "EXPX" } },
      update: {},
      create: { companyId: admin.companyId, branchCode: "EXPX", name: "Expense exclusion", status: "active" },
    });
    const maker = await prisma.user.upsert({
      where: { email: "expense-clerk@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "expense-clerk@solar.local", status: "active" },
    });
    const reviewer = await prisma.user.upsert({
      where: { email: "expense-approver@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "expense-approver@solar.local", status: "active" },
    });
    const cashier = await prisma.user.upsert({
      where: { email: "expense-payer@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "expense-payer@solar.local", status: "active" },
    });
    branchId = branch.id;
    clerk = context(maker.id, maker.email, false, { type: "branches", branchIds: [branch.id] }, ["expenses.create", "expenses.view"]);
    approver = context(reviewer.id, reviewer.email, false, { type: "branches", branchIds: [branch.id] }, ["expenses.view", "expenses.approve"]);
    payer = context(cashier.id, cashier.email, false, { type: "branches", branchIds: [branch.id] }, ["expenses.view", "expenses.pay"]);
    companyUser = context(admin.id, admin.email, true, { type: "company" }, ["expenses.view", "expenses.approve", "expenses.pay", "expenses.create"]);
    outsider = context(reviewer.id, reviewer.email, false, { type: "branches", branchIds: [other.id] }, ["expenses.view"]);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("approves, rejects, and pays July expenses without a duplicate payment", async () => {
    const { ExpensesService } = await import("./expenses.service");
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    const { AuditService } = await import("../auth/audit.service");
    const expenses = new ExpensesService(
      prisma as never,
      new DocumentNumberService(prisma as never),
      new AccountingPostingService(prisma as never, new DocumentNumberService(prisma as never)),
      new AuditService(prisma as never),
    );
    const suffix = randomUUID().slice(0, 8);
    const rent = await prisma.expenseCategory.findFirstOrThrow({ where: { name: "Rent" } });
    const fuel = await prisma.expenseCategory.findFirstOrThrow({ where: { name: "Fuel" } });
    const supplies = await prisma.expenseCategory.findFirstOrThrow({ where: { name: "Office Supplies" } });
    const marketing = await prisma.expenseCategory.findFirstOrThrow({ where: { name: "Marketing" } });
    const utilities = await prisma.expenseCategory.findFirstOrThrow({ where: { name: "Utilities" } });
    const cash = await prisma.account.findFirstOrThrow({ where: { accountCode: "1000" } });
    const receipt = Buffer.from(`receipt-${suffix}`).toString("base64");

    const draft = await expenses.create(clerk, expenseInput(branchId, rent.id, "100000.0000", "July rent", receipt));
    await expenses.submit(clerk, draft.id);
    await expect(expenses.approve(clerk, draft.id)).rejects.toBeInstanceOf(ForbiddenException);
    const approved = await expenses.approve(approver, draft.id);
    expect(approved.status).toBe("approved");
    const stored = await prisma.expense.findUniqueOrThrow({ where: { id: draft.id } });
    const accrual = await prisma.journalLine.findMany({ where: { journalEntryId: stored.accrualJournalId ?? "" }, include: { account: true } });
    expect(accrual.find((line) => line.account.accountCode === "6100")?.debit.toFixed(4)).toBe("100000.0000");
    expect(accrual.find((line) => line.account.accountCode === "2200")?.credit.toFixed(4)).toBe("100000.0000");
    const kept = await expenses.receipt(clerk, draft.id);
    expect(kept.receiptBase64).toBe(receipt);
    await expect(expenses.receipt(outsider, draft.id)).rejects.toBeInstanceOf(NotFoundException);

    const large = await expenses.create(clerk, expenseInput(branchId, fuel.id, "600000.0000", "July fuel", receipt));
    await expenses.submit(clerk, large.id);
    await expect(expenses.approve(approver, large.id)).rejects.toBeInstanceOf(ForbiddenException);
    const companyApproved = await expenses.approve(companyUser, large.id);
    expect(companyApproved.status).toBe("approved");

    const levelTwo = await prisma.expenseApprovalPolicy.findFirst({ where: { categoryId: supplies.id, level: 2 } });
    if (!levelTwo) {
      await expenses.createPolicy(companyUser, { minAmount: "0.0000", categoryId: supplies.id, level: 2, companyWide: false });
    }
    const staged = await expenses.create(clerk, expenseInput(branchId, supplies.id, "20000.0000", "July supplies", receipt));
    await expenses.submit(clerk, staged.id);
    const firstLevel = await expenses.approve(approver, staged.id);
    expect(firstLevel.status).toBe("pending_approval");
    const stagedRow = await prisma.expense.findUniqueOrThrow({ where: { id: staged.id } });
    expect(stagedRow.accrualJournalId).toBeNull();
    const postedLevel = await expenses.approve(companyUser, staged.id);
    expect(postedLevel.status).toBe("approved");

    const rejected = await expenses.create(clerk, expenseInput(branchId, utilities.id, "15000.0000", "July utilities", receipt));
    await expenses.submit(clerk, rejected.id);
    const rejection = await expenses.reject(approver, rejected.id);
    expect(rejection.status).toBe("rejected");
    const rejectedRow = await prisma.expense.findUniqueOrThrow({ where: { id: rejected.id } });
    expect(rejectedRow.accrualJournalId).toBeNull();

    await prisma.expenseBudget.upsert({
      where: { branchId_categoryId_budgetMonth: { branchId, categoryId: marketing.id, budgetMonth: new Date("2026-07-01") } },
      update: { amount: "1000.0000" },
      create: { companyId: rent.companyId, branchId, categoryId: marketing.id, budgetMonth: new Date("2026-07-01"), amount: "1000.0000" },
    });
    const overBudget = await expenses.create(clerk, expenseInput(branchId, marketing.id, "5000.0000", "July marketing", receipt));
    await expenses.submit(clerk, overBudget.id);
    await expect(expenses.approve(approver, overBudget.id)).rejects.toBeInstanceOf(BadRequestException);

    const paid = await expenses.pay(payer, draft.id, { paymentAccountId: cash.id, paymentDate: "2026-07-20" });
    expect(paid.status).toBe("paid");
    const payment = await prisma.journalLine.findMany({
      where: { journal: { sourceDocumentId: draft.id, sourceDocumentType: "expense_payment", status: "posted" } },
      include: { account: true },
    });
    expect(payment.find((line) => line.account.accountCode === "2200")?.debit.toFixed(4)).toBe("100000.0000");
    expect(payment.find((line) => line.account.accountCode === "1000")?.credit.toFixed(4)).toBe("100000.0000");
    await expect(expenses.pay(payer, draft.id, { paymentAccountId: cash.id, paymentDate: "2026-07-21" })).rejects.toBeInstanceOf(ConflictException);

    const report = await expenses.reports(clerk, { from: "2026-07-01", to: "2026-07-31" });
    expect(report.byCategory.some((row) => row.name === "Rent")).toBe(true);
    expect(report.projects).toEqual([]);
    expect(report.unpaid.some((row) => row.id === large.id)).toBe(true);
  }, 60_000);
});

function expenseInput(branchId: string, categoryId: string, amount: string, description: string, receiptBase64: string) {
  return {
    branchId,
    categoryId,
    expenseDate: "2026-07-16",
    description,
    amount,
    taxAmount: "0.0000",
    receiptName: "receipt.txt",
    receiptBase64,
  };
}

function context(
  userId: string,
  email: string,
  companyWide: boolean,
  scope: AccessContext["scope"],
  permissions: string[],
): AccessContext {
  return {
    userId,
    email,
    sessionId: "00000000-0000-4000-8000-000000000009",
    csrfTokenHash: "test",
    permissions,
    roleCodes: companyWide ? ["super_administrator"] : ["branch_manager"],
    companyWide,
    mfaPending: false,
    mfaEnabled: true,
    scope,
  };
}
