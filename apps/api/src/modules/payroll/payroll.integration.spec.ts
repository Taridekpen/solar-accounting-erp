import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ForbiddenException } from "@nestjs/common";
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

describe("employees and basic salary accounting", () => {
  let prisma: PrismaClient;
  let maker: AccessContext;
  let approver: AccessContext;
  let outsider: AccessContext;
  let branchId = "";
  let otherBranchId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" } });
    const reviewer = await prisma.user.create({ data: { companyId: admin.companyId, email: `pay-${randomUUID().slice(0, 8)}@solar.local`, status: "active" } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    branchId = branch.id;
    const other = await prisma.branch.create({
      data: {
        companyId: admin.companyId,
        branchCode: `P${randomUUID().slice(0, 4).toUpperCase()}`,
        name: "Payroll other branch",
        isHeadOffice: false,
        status: "active",
      },
    });
    otherBranchId = other.id;
    await openYear(prisma, admin.companyId, 2028);
    maker = context(admin.id, admin.email, true, { type: "company" }, ["payroll.view", "payroll.create", "settings.view"]);
    approver = context(reviewer.id, reviewer.email, true, { type: "company" }, ["payroll.view", "payroll.approve", "payroll.pay"]);
    outsider = context(admin.id, admin.email, false, { type: "branches", branchIds: [otherBranchId] }, ["payroll.view", "payroll.create"]);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("posts a February payroll summary and reduces the payable on payment", async () => {
    const { PayrollService } = await import("./payroll.service");
    const { EmployeesService } = await import("../organization/employees.service");
    const { CompanyService } = await import("../organization/company.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AuditService } = await import("../auth/audit.service");
    const posting = new AccountingPostingService(prisma as never, new DocumentNumberService(prisma as never));
    const payroll = new PayrollService(prisma as never, new DocumentNumberService(prisma as never), posting, new AuditService(prisma as never));
    const employees = new EmployeesService(prisma as never, new CompanyService(prisma as never));
    const companyId = (await prisma.user.findUniqueOrThrow({ where: { id: maker.userId } })).companyId;
    const paye = await prisma.account.findFirstOrThrow({ where: { companyId, accountCode: "2310", deletedAt: null } });
    const pension = await prisma.account.findFirstOrThrow({ where: { companyId, accountCode: "2320", deletedAt: null } });
    const cash = await prisma.account.findFirstOrThrow({ where: { companyId, accountCode: "1000", deletedAt: null } });
    const listed = await employees.list({ type: "company" }, { page: 1, pageSize: 50 });
    expect(listed.data.every((row) => !("grossAmount" in row) && !("netAmount" in row) && !("salary" in row))).toBe(true);
    const summary = await payroll.createSummary(maker, {
      branchId,
      periodStart: "2028-02-01",
      periodEnd: "2028-02-29",
      grossAmount: "100000.0000",
      netAmount: "82000.0000",
      approvalReference: "EXT-PAY-2028-02",
      summaryFileName: "february-payroll.txt",
      summaryFileBase64: Buffer.from("February payroll summary").toString("base64"),
      deductions: [
        { accountId: paye.id, description: "PAYE", amount: "12000.0000" },
        { accountId: pension.id, description: "Pension", amount: "6000.0000" },
      ],
    });
    await expect(payroll.approveSummary(maker, summary.id)).rejects.toBeInstanceOf(ForbiddenException);
    const posted = await payroll.approveSummary(approver, summary.id);
    expect(posted.status).toBe("posted");
    expect(posted.netAmount).toBe("82000.0000");
    const payeNet = await creditNet(prisma, companyId, "2310");
    const pensionNet = await creditNet(prisma, companyId, "2320");
    expect(payeNet).toBeGreaterThanOrEqual(parseMoney("12000.0000"));
    expect(pensionNet).toBeGreaterThanOrEqual(parseMoney("6000.0000"));
    const before = await payroll.outstanding(approver);
    const beforeOpen = before.rows.find((row) => row.id === summary.id)?.outstanding ?? "0.0000";
    expect(beforeOpen).toBe("82000.0000");
    expect(before.totalOutstanding).toBe(before.control);
    await payroll.createPayment(approver, {
      branchId,
      paymentDate: "2028-02-28",
      paymentAccountId: cash.id,
      bankReference: "SAL-FEB-PARTIAL",
      allocations: [{ summaryId: summary.id, amount: "30000.0000" }],
    });
    const after = await payroll.outstanding(approver);
    const afterOpen = after.rows.find((row) => row.id === summary.id)?.outstanding ?? "0.0000";
    expect(parseMoney(beforeOpen) - parseMoney(afterOpen)).toBe(parseMoney("30000.0000"));
    expect(after.totalOutstanding).toBe(after.control);
    await expect(payroll.list(outsider)).resolves.toEqual([]);
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

async function creditNet(prisma: PrismaClient, companyId: string, accountCode: string) {
  const lines = await prisma.journalLine.findMany({
    where: { account: { companyId, accountCode }, journal: { companyId, status: "posted" } },
  });
  return lines.reduce((sum, line) => sum + parseMoney(line.credit.toFixed(4)) - parseMoney(line.debit.toFixed(4)), 0n);
}

function context(userId: string, email: string, companyWide: boolean, scope: AccessContext["scope"], permissions: string[]): AccessContext {
  return {
    userId,
    email,
    sessionId: "00000000-0000-4000-8000-000000000014",
    csrfTokenHash: "test",
    permissions,
    roleCodes: companyWide ? ["finance_manager"] : ["branch_accountant"],
    companyWide,
    mfaPending: false,
    mfaEnabled: true,
    scope,
  };
}
