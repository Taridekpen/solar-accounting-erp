import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";
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

describe("daily closing and financial periods", () => {
  let prisma: PrismaClient;
  let preparer: AccessContext;
  let approver: AccessContext;
  let outsider: AccessContext;
  let branchId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" } });
    const companyId = admin.companyId;
    const reviewer = await prisma.user.create({ data: { companyId, email: `close-${randomUUID().slice(0, 8)}@solar.local`, status: "active" } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    branchId = branch.id;
    await openYear(prisma, companyId, 2027);
    const closePermissions = ["closing.view", "closing.daily.prepare", "accounting.period.close", "reports.view", "reports.company.view"];
    preparer = context(admin.id, admin.email, closePermissions);
    approver = context(reviewer.id, reviewer.email, ["closing.view", "closing.daily.review", "accounting.period.close", "accounting.period.reopen", "reports.view", "reports.company.view"]);
    outsider = context(admin.id, admin.email, ["closing.view", "reports.view", "reports.company.view"]);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("locks a period, keeps the snapshot, and carries the year forward", async () => {
    const { ClosingService } = await import("./closing.service");
    const { ReportsService } = await import("../reports/reports.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AuditService } = await import("../auth/audit.service");
    const posting = new AccountingPostingService(prisma as never, new DocumentNumberService(prisma as never));
    const reports = new ReportsService(prisma as never, posting, new DocumentNumberService(prisma as never), new AuditService(prisma as never));
    const closing = new ClosingService(prisma as never, reports, posting, new AuditService(prisma as never));
    const companyId = (await prisma.user.findUniqueOrThrow({ where: { id: preparer.userId } })).companyId;
    const cash = await prisma.account.findFirstOrThrow({ where: { companyId, accountCode: "1000", deletedAt: null } });
    const revenue = await prisma.account.findFirstOrThrow({ where: { companyId, accountCode: "4000", deletedAt: null } });
    const january = await prisma.fiscalPeriod.findFirstOrThrow({ where: { companyId, startDate: new Date("2027-01-01T00:00:00.000Z") } });
    await finishClose(prisma, closing, preparer, approver, january.id);
    await expect(posting.postSystemDocument(preparer, {
      sourceModule: "closing",
      sourceDocumentType: "closed_period_attempt",
      sourceDocumentId: randomUUID(),
      accountingDate: "2027-01-20",
      description: "Rejected January posting",
      lines: [
        { accountId: cash.id, branchId, debit: "10.0000", credit: "0", description: "Rejected" },
        { accountId: revenue.id, branchId, debit: "0", credit: "10.0000", description: "Rejected" },
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(closing.reopenPeriod(outsider, january.id, { reason: "Need another look" })).rejects.toBeInstanceOf(ForbiddenException);
    const december = await prisma.fiscalPeriod.findFirstOrThrow({ where: { companyId, startDate: new Date("2027-12-01T00:00:00.000Z") } });
    if (december.status !== "closed") {
      await posting.postSystemDocument(preparer, {
        sourceModule: "closing",
        sourceDocumentType: "closing_sale",
        sourceDocumentId: randomUUID(),
        accountingDate: "2027-12-10",
        description: "December close sale",
        lines: [
          { accountId: cash.id, branchId, debit: "2500.0000", credit: "0", description: "December close sale" },
          { accountId: revenue.id, branchId, debit: "0", credit: "2500.0000", description: "December close sale" },
        ],
      });
      const draft = await closing.saveDaily(preparer, { branchId, businessDate: "2027-12-10", countedCash: "0.0000", exceptionNotes: "Cash short" });
      expect((draft.report as { sales: string }).sales).toBe("2500.0000");
      await expect(closing.reviewDaily(preparer, draft.id)).rejects.toBeInstanceOf(ForbiddenException);
      const reviewed = await closing.reviewDaily(approver, draft.id);
      expect((reviewed.report as { sales: string }).sales).toBe("2500.0000");
      const before = await reports.profitAndLoss(preparer, "2027-12-01", "2027-12-31");
      const locked = await finishClose(prisma, closing, preparer, approver, december.id);
      expect(locked?.netProfit).toBe(before.netProfit);
    }
    const snapshot = await prisma.periodStatementSnapshot.findUniqueOrThrow({ where: { fiscalPeriodId: december.id } });
    const stored = snapshot.profitAndLoss as { netProfit: string };
    const after = await reports.trialBalance(preparer, "2027-12-31");
    const storedTrial = snapshot.trialBalance as { rows: { accountCode: string; debit: string; credit: string }[] };
    expect(creditNet(after.rows, "3100") - creditNet(storedTrial.rows, "3100")).toBe(signed(stored.netProfit));
    const nextDay = await reports.trialBalance(preparer, "2028-01-01");
    expect(nextDay.totalDebit).toBe(after.totalDebit);
    expect(nextDay.totalCredit).toBe(after.totalCredit);
    const nextJanuary = await prisma.fiscalPeriod.findFirst({ where: { companyId, startDate: new Date("2028-01-01T00:00:00.000Z") } });
    expect(nextJanuary?.status).toBe("open");
  }, 60_000);
});

async function openYear(prisma: PrismaClient, companyId: string, year: number) {
  const startDate = new Date(Date.UTC(year, 0, 1));
  const existing = await prisma.fiscalYear.findUnique({ where: { companyId_startDate: { companyId, startDate } } });
  if (existing) return;
  const fiscalYear = await prisma.fiscalYear.create({ data: { companyId, startDate, endDate: new Date(Date.UTC(year, 11, 31)) } });
  for (let month = 0; month < 12; month += 1) {
    await prisma.fiscalPeriod.create({
      data: {
        companyId,
        fiscalYearId: fiscalYear.id,
        startDate: new Date(Date.UTC(year, month, 1)),
        endDate: new Date(Date.UTC(year, month + 1, 0)),
        status: "open",
      },
    });
  }
}

async function finishClose(prisma: PrismaClient, closing: {
  startPeriod(access: AccessContext, periodId: string): Promise<unknown>;
  periods(access: AccessContext): Promise<{ id: string; tasks: { taskCode: string; completedAt: string | null }[] }[]>;
  completeTask(access: AccessContext, periodId: string, taskCode: string, input: { note?: string }): Promise<unknown>;
  lockPeriod(access: AccessContext, periodId: string): Promise<{ netProfit: string }>;
}, preparer: AccessContext, approver: AccessContext, periodId: string) {
  const current = await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } });
  if (current.status === "closed") return null;
  if (current.status === "open" || current.status === "reopened") await closing.startPeriod(preparer, periodId);
  const rows = await closing.periods(preparer);
  for (const task of rows.find((period) => period.id === periodId)?.tasks ?? []) {
    if (task.taskCode === "approval" || task.completedAt) continue;
    await closing.completeTask(preparer, periodId, task.taskCode, { note: "Reviewed" });
  }
  return closing.lockPeriod(approver, periodId);
}

function creditNet(rows: { accountCode: string; debit: string; credit: string }[], code: string) {
  const row = rows.find((item) => item.accountCode === code);
  return signed(row?.credit ?? "0.0000") - signed(row?.debit ?? "0.0000");
}

function signed(value: string) {
  return value.startsWith("-") ? -parseMoney(value.slice(1)) : parseMoney(value);
}

function context(userId: string, email: string, permissions: string[]): AccessContext {
  return {
    userId,
    email,
    sessionId: "00000000-0000-4000-8000-000000000013",
    csrfTokenHash: "test",
    permissions,
    roleCodes: ["finance_manager"],
    companyWide: true,
    mfaPending: false,
    mfaEnabled: true,
    scope: { type: "company" },
  };
}
