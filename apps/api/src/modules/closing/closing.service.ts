import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { formatMoneyUnits, multiplyMoney, parseMoney } from "../accounting/money";
import { AccountingPostingService } from "../accounting/posting.service";
import { assertBranchAllowed } from "../organization/branch-scope";
import { ReportsService } from "../reports/reports.service";
import { ReopenPeriodDto, SaveDailyClosingDto, TaskNoteDto } from "./closing.dto";

const TASKS = [
  "bank_reconciliation",
  "customer_reconciliation",
  "supplier_reconciliation",
  "inventory_valuation",
  "depreciation",
  "accruals",
  "prepayments",
  "tax_review",
  "journal_review",
  "trial_balance",
  "financial_statements",
  "approval",
] as const;

interface DailyReport {
  sales: string;
  cashReceipts: string;
  bankCollections: string;
  posCollections: string;
  creditSales: string;
  expenses: string;
  refunds: string;
  inventoryExceptions: number;
  pendingApprovals: number;
  bookCash: string;
  countedCash: string;
  cashDifference: string;
}

@Injectable()
export class ClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly posting: AccountingPostingService,
    private readonly audit: AuditService,
  ) {}

  async periods(access: AccessContext) {
    this.require(access, "closing.view");
    const companyId = await this.companyId(access);
    const rows = await this.prisma.fiscalPeriod.findMany({
      where: { companyId },
      include: { closingTasks: { orderBy: { taskCode: "asc" } }, snapshot: true },
      orderBy: { startDate: "asc" },
    });
    return rows.map((period) => ({
      id: period.id,
      startDate: iso(period.startDate),
      endDate: iso(period.endDate),
      status: period.status,
      tasks: period.closingTasks.map((task) => ({
        taskCode: task.taskCode,
        result: task.result,
        note: task.note,
        completedAt: task.completedAt?.toISOString() ?? null,
      })),
      snapshotCapturedAt: period.snapshot?.capturedAt.toISOString() ?? null,
    }));
  }

  async previewDaily(access: AccessContext, branchId: string | undefined, date: string, countedCash = "0.0000") {
    this.require(access, "closing.view");
    const companyId = await this.companyId(access);
    const branch = await this.resolveBranch(access, companyId, branchId);
    const stored = await this.prisma.dailyClosing.findUnique({
      where: { branchId_businessDate: { branchId: branch.id, businessDate: day(date) } },
    });
    if (stored) {
      return {
        id: stored.id,
        branchId: stored.branchId,
        branchName: branch.name,
        businessDate: date,
        status: stored.status,
        preparedByUserId: stored.preparedByUserId,
        reviewedByUserId: stored.reviewedByUserId,
        exceptionNotes: stored.exceptionNotes,
        report: stored.report,
      };
    }
    return {
      id: null,
      branchId: branch.id,
      branchName: branch.name,
      businessDate: date,
      status: "preview",
      report: await this.dailyReport(companyId, branch.id, date, countedCash),
    };
  }

  async saveDaily(access: AccessContext, input: SaveDailyClosingDto) {
    this.require(access, "closing.view");
    this.require(access, "closing.daily.prepare");
    const companyId = await this.companyId(access);
    assertBranchAllowed(access.scope, input.branchId);
    const existing = await this.prisma.dailyClosing.findUnique({
      where: { branchId_businessDate: { branchId: input.branchId, businessDate: day(input.businessDate) } },
    });
    if (existing?.status === "reviewed") throw new ConflictException("This day has already been reviewed");
    const report = await this.dailyReport(companyId, input.branchId, input.businessDate, input.countedCash);
    const saved = existing
      ? await this.prisma.dailyClosing.update({
          where: { id: existing.id },
          data: { countedCash: input.countedCash, exceptionNotes: input.exceptionNotes, report: report as unknown as Prisma.InputJsonValue, preparedByUserId: access.userId },
        })
      : await this.prisma.dailyClosing.create({
          data: {
            companyId,
            branchId: input.branchId,
            businessDate: day(input.businessDate),
            preparedByUserId: access.userId,
            countedCash: input.countedCash,
            exceptionNotes: input.exceptionNotes,
            report: report as unknown as Prisma.InputJsonValue,
          },
        });
    await this.audit.record({ actorUserId: access.userId, action: "closing.daily_prepared", entityType: "daily_closing", entityId: saved.id, newValues: { businessDate: input.businessDate } });
    return { id: saved.id, status: saved.status, report };
  }

  async reviewDaily(access: AccessContext, id: string) {
    this.require(access, "closing.view");
    this.require(access, "closing.daily.review");
    const companyId = await this.companyId(access);
    const closing = await this.prisma.dailyClosing.findFirst({ where: { id, companyId } });
    if (!closing) throw new NotFoundException("Daily closing was not found");
    assertBranchAllowed(access.scope, closing.branchId);
    if (closing.status === "reviewed") throw new ConflictException("This day has already been reviewed");
    if (closing.preparedByUserId === access.userId) throw new ForbiddenException("The reviewer must be a different person");
    const saved = await this.prisma.dailyClosing.update({
      where: { id: closing.id },
      data: { status: "reviewed", reviewedByUserId: access.userId, reviewedAt: new Date() },
    });
    await this.audit.record({ actorUserId: access.userId, action: "closing.daily_reviewed", entityType: "daily_closing", entityId: saved.id });
    return { id: saved.id, status: saved.status, report: saved.report };
  }

  async startPeriod(access: AccessContext, periodId: string) {
    this.requireCompany(access, "accounting.period.close");
    const companyId = await this.companyId(access);
    const period = await this.period(companyId, periodId);
    if (period.status !== "open" && period.status !== "reopened") throw new ConflictException("This period is not open for closing");
    await this.prisma.periodClosingTask.deleteMany({ where: { fiscalPeriodId: period.id } });
    const results = await this.taskResults(access, companyId, period.startDate, period.endDate);
    await this.prisma.fiscalPeriod.update({
      where: { id: period.id },
      data: { status: "closing", closingStartedByUserId: access.userId, closedAt: null, closedByUserId: null },
    });
    await this.prisma.periodClosingTask.createMany({
      data: TASKS.map((taskCode) => ({
        companyId,
        fiscalPeriodId: period.id,
        taskCode,
        result: results[taskCode],
      })),
    });
    await this.audit.record({ actorUserId: access.userId, action: "closing.period_started", entityType: "fiscal_period", entityId: period.id });
    return this.periods(access).then((rows) => rows.find((row) => row.id === period.id));
  }

  async completeTask(access: AccessContext, periodId: string, taskCode: string, input: TaskNoteDto) {
    this.requireCompany(access, "accounting.period.close");
    const companyId = await this.companyId(access);
    const period = await this.period(companyId, periodId);
    if (period.status !== "closing") throw new ConflictException("Start the period close before completing tasks");
    if (taskCode === "approval") throw new BadRequestException("The approval task is completed by locking the period");
    const task = await this.prisma.periodClosingTask.findUnique({ where: { fiscalPeriodId_taskCode: { fiscalPeriodId: period.id, taskCode } } });
    if (!task) throw new NotFoundException("Closing task was not found");
    if (task.result.startsWith("exception") && !input.note?.trim()) throw new BadRequestException("An exception needs a note");
    await this.prisma.periodClosingTask.update({
      where: { id: task.id },
      data: { note: input.note, completedByUserId: access.userId, completedAt: new Date() },
    });
    await this.audit.record({ actorUserId: access.userId, action: "closing.task_completed", entityType: "period_closing_task", entityId: task.id, newValues: { taskCode, result: task.result } });
    return { taskCode, result: task.result, completedAt: new Date().toISOString() };
  }

  async lockPeriod(access: AccessContext, periodId: string) {
    this.requireCompany(access, "accounting.period.close");
    const companyId = await this.companyId(access);
    const period = await this.prisma.fiscalPeriod.findFirst({ where: { id: periodId, companyId }, include: { year: true, closingTasks: true } });
    if (!period) throw new NotFoundException("Fiscal period was not found");
    if (period.status !== "closing") throw new ConflictException("The period is not being closed");
    if (period.closingStartedByUserId === access.userId) throw new ForbiddenException("The approver must be a different person");
    const unfinished = period.closingTasks.filter((task) => task.taskCode !== "approval" && !task.completedAt);
    if (unfinished.length > 0) throw new BadRequestException("Complete every closing task before locking the period");
    const pending = await this.pendingJournals(companyId, period.startDate, period.endDate);
    if (pending > 0) throw new BadRequestException("Draft and pending journals must be cleared before the period locks");
    const end = iso(period.endDate);
    const start = iso(period.startDate);
    const trial = await this.reports.trialBalance(access, end);
    if (!trial.balanced) throw new BadRequestException("The trial balance must balance before the period locks");
    const profit = await this.reports.profitAndLoss(access, start, end);
    const sheet = await this.reports.balanceSheet(access, end);
    const yearEnd = period.endDate.getTime() === period.year.endDate.getTime();
    if (yearEnd) await this.transferEarnings(access, companyId, iso(period.year.startDate), end, period.id);
    await this.prisma.periodStatementSnapshot.upsert({
      where: { fiscalPeriodId: period.id },
      update: { trialBalance: trial as unknown as Prisma.InputJsonValue, profitAndLoss: profit as unknown as Prisma.InputJsonValue, balanceSheet: sheet as unknown as Prisma.InputJsonValue, capturedAt: new Date() },
      create: { companyId, fiscalPeriodId: period.id, trialBalance: trial as unknown as Prisma.InputJsonValue, profitAndLoss: profit as unknown as Prisma.InputJsonValue, balanceSheet: sheet as unknown as Prisma.InputJsonValue },
    });
    await this.prisma.periodClosingTask.update({
      where: { fiscalPeriodId_taskCode: { fiscalPeriodId: period.id, taskCode: "approval" } },
      data: { completedByUserId: access.userId, completedAt: new Date(), result: "locked" },
    });
    await this.prisma.periodCloseApproval.create({ data: { companyId, fiscalPeriodId: period.id, action: "lock", actorUserId: access.userId, reason: "Period lock" } });
    const closed = await this.prisma.fiscalPeriod.update({
      where: { id: period.id },
      data: { status: "closed", closedAt: new Date(), closedByUserId: access.userId },
    });
    if (yearEnd) await this.ensureNextYear(companyId, period.year.endDate);
    await this.audit.record({ actorUserId: access.userId, action: "closing.period_locked", entityType: "fiscal_period", entityId: period.id, newValues: { yearEnd } });
    return { id: closed.id, status: closed.status, netProfit: profit.netProfit };
  }

  async reopenPeriod(access: AccessContext, periodId: string, input: ReopenPeriodDto) {
    this.requireCompany(access, "accounting.period.reopen");
    if (!input.reason.trim()) throw new BadRequestException("Reopening requires a reason");
    const companyId = await this.companyId(access);
    const period = await this.period(companyId, periodId);
    if (period.status !== "closed") throw new ConflictException("Only a closed period can be reopened");
    await this.prisma.periodCloseApproval.create({ data: { companyId, fiscalPeriodId: period.id, action: "reopen", actorUserId: access.userId, reason: input.reason.trim() } });
    const saved = await this.prisma.fiscalPeriod.update({
      where: { id: period.id },
      data: { status: "reopened", closedAt: null, closedByUserId: null, closingStartedByUserId: null },
    });
    await this.audit.record({ actorUserId: access.userId, action: "closing.period_reopened", entityType: "fiscal_period", entityId: period.id, reason: input.reason.trim() });
    return { id: saved.id, status: saved.status };
  }

  private async dailyReport(companyId: string, branchId: string, date: string, countedCash: string): Promise<DailyReport> {
    const lines = await this.prisma.journalLine.findMany({
      where: { branchId, journal: { companyId, status: "posted", accountingDate: day(date) } },
      include: { account: true, journal: true },
    });
    const receipts = await this.prisma.customerReceipt.findMany({
      where: { companyId, branchId, receiptDate: day(date) },
      include: { methods: true },
    });
    const methodTotal = (method: string) => receipts.reduce((sum, receipt) => sum + receipt.methods.filter((item) => item.method === method).reduce((inner, item) => inner + units(item.amount.toFixed(4)), 0n), 0n);
    const journalDebit = (subtype: string) => lines.filter((line) => line.account.accountSubtype === subtype && line.journal.sourceDocumentType !== "customer_receipt" && line.journal.sourceDocumentType !== "cash_transfer").reduce((sum, line) => sum + units(line.debit.toFixed(4)), 0n);
    const sales = lines.filter((line) => line.account.accountSubtype === "sales" || line.account.accountSubtype === "service").reduce((sum, line) => sum + units(line.credit.toFixed(4)) - units(line.debit.toFixed(4)), 0n);
    const creditSales = lines.filter((line) => line.account.accountSubtype === "receivable").reduce((sum, line) => sum + units(line.debit.toFixed(4)), 0n);
    const expenses = lines.filter((line) => line.account.accountType === "expense").reduce((sum, line) => sum + units(line.debit.toFixed(4)) - units(line.credit.toFixed(4)), 0n);
    const refunds = lines.filter((line) => line.journal.sourceDocumentType === "sales_credit_note").reduce((sum, line) => sum + units(line.debit.toFixed(4)), 0n);
    const inventoryExceptions = await this.prisma.stockMovement.count({
      where: { companyId, branchId, movementType: { in: ["adjustment_in", "adjustment_out"] }, occurredAt: { gte: day(date), lte: new Date(`${date}T23:59:59.999Z`) } },
    });
    const pendingJournals = await this.prisma.journalEntry.count({
      where: { companyId, accountingDate: day(date), status: { in: ["draft", "pending_approval"] }, lines: { some: { branchId } } },
    });
    const pendingExpenses = await this.prisma.expense.count({
      where: { companyId, branchId, expenseDate: day(date), status: { in: ["draft", "pending_approval"] } },
    });
    const bookLines = await this.prisma.journalLine.findMany({
      where: { branchId, account: { accountSubtype: "cash" }, journal: { companyId, status: "posted", accountingDate: { lte: day(date) } } },
    });
    const book = bookLines.reduce((sum, line) => sum + units(line.debit.toFixed(4)) - units(line.credit.toFixed(4)), 0n);
    const counted = units(countedCash);
    return {
      sales: formatMoneyUnits(sales),
      cashReceipts: formatMoneyUnits(methodTotal("cash") + journalDebit("cash")),
      bankCollections: formatMoneyUnits(methodTotal("bank_transfer") + journalDebit("bank")),
      posCollections: formatMoneyUnits(methodTotal("pos")),
      creditSales: formatMoneyUnits(creditSales),
      expenses: formatMoneyUnits(expenses),
      refunds: formatMoneyUnits(refunds),
      inventoryExceptions,
      pendingApprovals: pendingJournals + pendingExpenses,
      bookCash: formatMoneyUnits(book),
      countedCash: formatMoneyUnits(counted),
      cashDifference: formatMoneyUnits(counted - book),
    };
  }

  private async taskResults(access: AccessContext, companyId: string, start: Date, end: Date): Promise<Record<(typeof TASKS)[number], string>> {
    const startText = iso(start);
    const endText = iso(end);
    const statements = await this.prisma.bankStatement.findMany({
      where: { companyId, periodStart: { lte: end }, periodEnd: { gte: start } },
    });
    const unlocked = statements.filter((statement) => statement.status !== "locked").length;
    const bank = statements.length === 0 ? "nothing_to_reconcile" : unlocked === 0 ? "matched" : `exception:${unlocked}`;
    const receivable = await this.accountNet(companyId, "1200", end);
    const payable = await this.accountNet(companyId, "2000", end);
    const inventoryLedger = await this.accountNet(companyId, "1300", end);
    const positions = await this.prisma.stockPosition.findMany({ where: { companyId } });
    const stock = positions.reduce((sum, position) => sum + multiplyMoney(units(position.physicalQuantity.toFixed(4)), units(position.averageUnitCost.toFixed(4))), 0n);
    const assets = await this.prisma.fixedAsset.findMany({ where: { companyId, status: "active" } });
    let depreciable = 0;
    for (const asset of assets) {
      const accumulated = await this.depreciationOf(asset.assetNumber);
      if (units(asset.cost.toFixed(4)) - accumulated > 0n) depreciable += 1;
    }
    const accrual = await this.accountMovement(companyId, "2200", start, end);
    const prepayment = await this.accountMovement(companyId, "1500", start, end);
    const tax = await this.reports.taxReport(access, startText, endText);
    const pending = await this.pendingJournals(companyId, start, end);
    const trial = await this.reports.trialBalance(access, endText);
    return {
      bank_reconciliation: bank,
      customer_reconciliation: `matched:${formatMoneyUnits(receivable)}`,
      supplier_reconciliation: `matched:${formatMoneyUnits(payable)}`,
      inventory_valuation: stock === inventoryLedger ? `matched:${formatMoneyUnits(stock)}` : `exception:${formatMoneyUnits(stock - inventoryLedger)}`,
      depreciation: depreciable === 0 ? "matched" : `exception:${depreciable}`,
      accruals: `reviewed:${formatMoneyUnits(accrual)}`,
      prepayments: `reviewed:${formatMoneyUnits(prepayment)}`,
      tax_review: `reviewed:${tax.outputTax}`,
      journal_review: pending === 0 ? "matched" : `exception:${pending}`,
      trial_balance: trial.balanced ? "matched" : "exception:unbalanced",
      financial_statements: "ready",
      approval: "pending",
    };
  }

  private async transferEarnings(access: AccessContext, companyId: string, start: string, end: string, periodId: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: { journal: { companyId, status: "posted", accountingDate: { gte: day(start), lte: day(end) } }, account: { accountType: { in: ["revenue", "expense"] }, deletedAt: null } },
      include: { account: true },
    });
    const nets = new Map<string, bigint>();
    for (const line of lines) nets.set(line.accountId, (nets.get(line.accountId) ?? 0n) + units(line.debit.toFixed(4)) - units(line.credit.toFixed(4)));
    const journal = [];
    let plug = 0n;
    for (const [accountId, net] of nets) {
      if (net === 0n) continue;
      if (net > 0n) {
        journal.push({ accountId, debit: "0", credit: formatMoneyUnits(net) });
        plug += net;
      } else {
        journal.push({ accountId, debit: formatMoneyUnits(-net), credit: "0" });
        plug += net;
      }
    }
    if (journal.length === 0) return;
    const retained = await this.prisma.account.findFirstOrThrow({ where: { companyId, accountCode: "3100", deletedAt: null } });
    if (plug > 0n) journal.push({ accountId: retained.id, debit: formatMoneyUnits(plug), credit: "0" });
    if (plug < 0n) journal.push({ accountId: retained.id, debit: "0", credit: formatMoneyUnits(-plug) });
    const head = await this.prisma.branch.findFirstOrThrow({ where: { companyId, isHeadOffice: true, deletedAt: null } });
    await this.posting.postSystemDocument(access, {
      sourceModule: "closing",
      sourceDocumentType: "year_end_close",
      sourceDocumentId: randomUUID(),
      accountingDate: end,
      description: `Year-end close ${periodId}`,
      lines: journal.map((line) => ({ ...line, branchId: head.id, description: "Close income and expense" })),
    });
  }

  private async ensureNextYear(companyId: string, yearEnd: Date) {
    const nextStart = new Date(yearEnd);
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);
    const existing = await this.prisma.fiscalYear.findUnique({ where: { companyId_startDate: { companyId, startDate: nextStart } } });
    if (existing) return;
    const nextEnd = new Date(Date.UTC(nextStart.getUTCFullYear() + 1, nextStart.getUTCMonth(), 0));
    const year = await this.prisma.fiscalYear.create({ data: { companyId, startDate: nextStart, endDate: nextEnd } });
    for (let index = 0; index < 12; index += 1) {
      await this.prisma.fiscalPeriod.create({
        data: {
          companyId,
          fiscalYearId: year.id,
          startDate: new Date(Date.UTC(nextStart.getUTCFullYear(), nextStart.getUTCMonth() + index, 1)),
          endDate: new Date(Date.UTC(nextStart.getUTCFullYear(), nextStart.getUTCMonth() + index + 1, 0)),
          status: "open",
        },
      });
    }
  }

  private async depreciationOf(assetNumber: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: { account: { accountCode: "1650" }, journal: { status: "posted", sourceDocumentType: "fixed_asset_depreciation", description: `Depreciate ${assetNumber}` } },
    });
    return lines.reduce((sum, line) => sum + units(line.credit.toFixed(4)) - units(line.debit.toFixed(4)), 0n);
  }

  private async accountNet(companyId: string, accountCode: string, end: Date) {
    const lines = await this.prisma.journalLine.findMany({
      where: { account: { companyId, accountCode }, journal: { companyId, status: "posted", accountingDate: { lte: end } } },
    });
    return lines.reduce((sum, line) => sum + units(line.debit.toFixed(4)) - units(line.credit.toFixed(4)), 0n);
  }

  private async accountMovement(companyId: string, accountCode: string, start: Date, end: Date) {
    const lines = await this.prisma.journalLine.findMany({
      where: { account: { companyId, accountCode }, journal: { companyId, status: "posted", accountingDate: { gte: start, lte: end } } },
    });
    return lines.reduce((sum, line) => sum + units(line.credit.toFixed(4)) - units(line.debit.toFixed(4)), 0n);
  }

  private pendingJournals(companyId: string, start: Date, end: Date) {
    return this.prisma.journalEntry.count({
      where: { companyId, accountingDate: { gte: start, lte: end }, status: { in: ["draft", "pending_approval"] } },
    });
  }

  private async resolveBranch(access: AccessContext, companyId: string, branchId?: string) {
    if (branchId) {
      assertBranchAllowed(access.scope, branchId);
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId, deletedAt: null } });
      if (!branch) throw new NotFoundException("Branch was not found");
      return branch;
    }
    if (access.scope.type === "branches") {
      const branch = await this.prisma.branch.findFirst({ where: { id: access.scope.branchIds[0], companyId, deletedAt: null } });
      if (!branch) throw new NotFoundException("Branch was not found");
      return branch;
    }
    return this.prisma.branch.findFirstOrThrow({ where: { companyId, isHeadOffice: true, deletedAt: null } });
  }

  private async period(companyId: string, periodId: string) {
    const period = await this.prisma.fiscalPeriod.findFirst({ where: { id: periodId, companyId } });
    if (!period) throw new NotFoundException("Fiscal period was not found");
    return period;
  }

  private requireCompany(access: AccessContext, permission: string) {
    this.require(access, "closing.view");
    this.require(access, permission);
    if (access.scope.type !== "company") throw new ForbiddenException("Period closing is company-wide");
  }

  private require(access: AccessContext, permission: string) {
    if (!access.permissions.includes(permission)) throw new ForbiddenException("This closing action is not available for this sign-in");
  }

  private async companyId(access: AccessContext) {
    const user = await this.prisma.user.findUnique({ where: { id: access.userId }, select: { companyId: true } });
    if (!user) throw new NotFoundException("User was not found");
    return user.companyId;
  }
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function iso(value: Date) {
  return value.toISOString().slice(0, 10);
}

function units(value: string) {
  return value.startsWith("-") ? -parseMoney(value.slice(1)) : parseMoney(value);
}
