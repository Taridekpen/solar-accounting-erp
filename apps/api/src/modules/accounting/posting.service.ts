import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, forwardRef } from "@nestjs/common";
import { Account, Prisma } from "@prisma/client";
import { postingEvent } from "@solar/accounting-rules";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { NotificationsService } from "../admin/notifications.service";
import { AccessContext } from "../auth/access";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, BranchScope, branchIdFilter } from "../organization/branch-scope";
import { accountingDate, formatMoneyUnits, multiplyMoney, parseMoney } from "./money";

interface DraftLine {
  accountId: string;
  branchId: string;
  departmentId?: string;
  customerId?: string;
  supplierId?: string;
  projectId?: string;
  debit: string;
  credit: string;
  description?: string;
}

interface SaveJournalInput {
  companyId: string;
  actorUserId: string;
  accountingDate: string;
  description: string;
  sourceModule: string;
  sourceDocumentType: string;
  sourceDocumentId?: string;
  reversalOfId?: string;
  reason?: string;
  closedPeriodAdjustment: boolean;
  lines: DraftLine[];
  mode: "system" | "manual" | "opening";
  postNow: boolean;
  scope: BranchScope;
  opening?: {
    batchId: string;
    details: Array<{
      kind: string;
      accountCode: string;
      reference?: string;
      description?: string;
      quantity?: string;
      unitCost?: string;
      amount: string;
      branchId: string;
    }>;
  };
  stockMoves?: StockMoveInput[];
  allowNegativeStock?: boolean;
}

export interface StockMoveInput {
  productId: string;
  branchId: string;
  quantity: string;
  unitCost: string;
  warehouseId?: string;
  transitWarehouseId?: string;
  movementType: "opening_balance" | "sales_issue" | "customer_return" | "purchase_receipt" | "transfer_out" | "transfer_in" | "adjustment_in" | "adjustment_out" | "project_issue" | "project_return";
}

class PostingRejected extends Error {
  constructor(
    message: string,
    readonly attemptStatus: "failed" | "suspicious" = "failed",
  ) {
    super(message);
  }
}

const OPENING_ACCOUNTS: Record<string, { code?: string; side: "debit" | "credit" }> = {
  cash: { code: "1000", side: "debit" },
  bank: { code: "1100", side: "debit" },
  inventory: { code: "1300", side: "debit" },
  customer_invoice: { code: "1200", side: "debit" },
  supplier_bill: { code: "2000", side: "credit" },
  fixed_asset: { code: "1600", side: "debit" },
  depreciation: { code: "1650", side: "credit" },
  loan: { code: "2600", side: "credit" },
  equity: { side: "credit" },
};

@Injectable()
export class AccountingPostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
    @Optional() @Inject(forwardRef(() => NotificationsService)) private readonly notifications?: NotificationsService,
  ) {}

  async postEvent(
    access: AccessContext,
    input: {
      eventCode: string;
      sourceDocumentType: string;
      sourceDocumentId: string;
      accountingDate: string;
      branchId: string;
      amount: string;
      taxAmount?: string;
      description: string;
      debitAccountCode?: string;
      creditAccountCode?: string;
      closedPeriodAdjustment?: boolean;
    },
    correlationId?: string,
  ) {
    const event = postingEvent(input.eventCode);
    if (!event) {
      throw new BadRequestException("Accounting event is not recognized");
    }
    const companyId = await this.companyId(access.userId);
    try {
      const net = parseMoney(input.amount);
      const tax = parseMoney(input.taxAmount ?? "0");
      if (net <= 0n) {
        throw new PostingRejected("Amount must be greater than zero");
      }
      const mapping = await this.prisma.accountMapping.findUnique({
        where: { companyId_eventCode: { companyId, eventCode: input.eventCode } },
        include: { debitAccount: true, creditAccount: true, taxAccount: true },
      });
      if (!mapping) {
        throw new PostingRejected("Account mapping has not been configured");
      }
      const debitAccount = input.debitAccountCode
        ? await this.accountByCode(companyId, input.debitAccountCode)
        : mapping.debitAccount;
      const creditAccount = input.creditAccountCode
        ? await this.accountByCode(companyId, input.creditAccountCode)
        : mapping.creditAccount;
      const taxAccount = mapping.taxAccount;
      if (tax > 0n && !taxAccount) {
        throw new PostingRejected("This event has no tax account mapping");
      }
      const gross = net + tax;
      const lines: DraftLine[] = [];
      if (tax === 0n || mapping.taxSide === "credit") {
        lines.push(this.line(debitAccount.id, input.branchId, gross, 0n, input.description));
        lines.push(this.line(creditAccount.id, input.branchId, 0n, net, input.description));
        if (tax > 0n && taxAccount) {
          lines.push(this.line(taxAccount.id, input.branchId, 0n, tax, "Tax"));
        }
      } else {
        lines.push(this.line(debitAccount.id, input.branchId, net, 0n, input.description));
        if (taxAccount) {
          lines.push(this.line(taxAccount.id, input.branchId, tax, 0n, "Tax"));
        }
        lines.push(this.line(creditAccount.id, input.branchId, 0n, gross, input.description));
      }
      const periodClosed = await this.isPeriodClosed(companyId, input.accountingDate);
      return await this.saveJournal({
        companyId,
        actorUserId: access.userId,
        accountingDate: input.accountingDate,
        description: input.description,
        sourceModule: "accounting",
        sourceDocumentType: input.sourceDocumentType,
        sourceDocumentId: input.sourceDocumentId,
        closedPeriodAdjustment: Boolean(input.closedPeriodAdjustment) && periodClosed,
        lines,
        mode: "system",
        postNow: !periodClosed,
        scope: access.scope,
      }, correlationId);
    } catch (error) {
      return this.fail(companyId, access.userId, input, error);
    }
  }

  async createManual(
    access: AccessContext,
    input: {
      accountingDate: string;
      description: string;
      lines: DraftLine[];
      closedPeriodAdjustment?: boolean;
    },
    correlationId?: string,
  ) {
    const companyId = await this.companyId(access.userId);
    try {
      const periodClosed = await this.isPeriodClosed(companyId, input.accountingDate);
      if (periodClosed && !input.closedPeriodAdjustment) {
        throw new PostingRejected("Fiscal period is closed");
      }
      return await this.saveJournal({
        companyId,
        actorUserId: access.userId,
        accountingDate: input.accountingDate,
        description: input.description,
        sourceModule: "manual",
        sourceDocumentType: "manual_journal",
        closedPeriodAdjustment: Boolean(input.closedPeriodAdjustment),
        lines: input.lines,
        mode: "manual",
        postNow: false,
        scope: access.scope,
      }, correlationId);
    } catch (error) {
      return this.fail(companyId, access.userId, { eventCode: "manual_journal" }, error);
    }
  }

  async approve(access: AccessContext, journalId: string, correlationId?: string) {
    const companyId = await this.companyId(access.userId);
    const journal = await this.prisma.journalEntry.findFirst({
      where: { id: journalId, companyId },
      include: { lines: true, period: true },
    });
    if (!journal) {
      throw new NotFoundException("Journal was not found");
    }
    this.assertJournalScope(access.scope, journal.lines.map((line) => line.branchId));
    if (journal.status !== "pending_approval") {
      throw new BadRequestException("Only a pending journal can be approved");
    }
    if (journal.createdByUserId === access.userId) {
      throw new ForbiddenException("You cannot approve your own restricted action");
    }
    if (journal.period.status === "closed" && !journal.closedPeriodAdjustment) {
      throw new BadRequestException("Fiscal period is closed");
    }
    const postedAt = new Date();
    await this.prisma.journalEntry.update({
      where: { id: journal.id },
      data: {
        status: "posted",
        approvedByUserId: access.userId,
        postedByUserId: access.userId,
        postedAt,
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: access.userId,
        action: "accounting.journal.approved",
        entityType: "journal_entry",
        entityId: journal.id,
        newValues: { journalNumber: journal.journalNumber },
        correlationId,
      },
    });
    return this.getJournal(access, journal.id);
  }

  async reverse(access: AccessContext, journalId: string, reason: string, correlationId?: string) {
    const companyId = await this.companyId(access.userId);
    const original = await this.prisma.journalEntry.findFirst({
      where: { id: journalId, companyId },
      include: { lines: true, reversedBy: true },
    });
    if (!original || original.status !== "posted") {
      throw new NotFoundException("Posted journal was not found");
    }
    this.assertJournalScope(access.scope, original.lines.map((line) => line.branchId));
    if (original.reversedBy) {
      throw new ConflictException("This journal has already been reversed");
    }
    const date = original.accountingDate.toISOString().slice(0, 10);
    const periodClosed = await this.isPeriodClosed(companyId, date);
    try {
      return await this.saveJournal({
        companyId,
        actorUserId: access.userId,
        accountingDate: date,
        description: `Reversal of ${original.journalNumber}`,
        sourceModule: "accounting",
        sourceDocumentType: "journal_reversal",
        sourceDocumentId: original.id,
        reversalOfId: original.id,
        reason,
        closedPeriodAdjustment: periodClosed,
        lines: original.lines.map((line) => ({
          accountId: line.accountId,
          branchId: line.branchId,
          departmentId: line.departmentId ?? undefined,
          customerId: line.customerId ?? undefined,
          supplierId: line.supplierId ?? undefined,
          projectId: line.projectId ?? undefined,
          debit: line.credit.toFixed(4),
          credit: line.debit.toFixed(4),
          description: line.description ?? undefined,
        })),
        mode: "system",
        postNow: !periodClosed,
        scope: access.scope,
      }, correlationId);
    } catch (error) {
      return this.fail(companyId, access.userId, { eventCode: "journal_reversal", sourceDocumentId: original.id }, error);
    }
  }

  async importOpeningBalances(
    access: AccessContext,
    input: {
      accountingDate: string;
      description: string;
      lines: DraftLine[];
      details: Array<{
        kind: string;
        accountCode: string;
        reference?: string;
        description?: string;
        quantity?: string;
        unitCost?: string;
        amount: string;
        branchId: string;
      }>;
    },
    correlationId?: string,
  ) {
    const companyId = await this.companyId(access.userId);
    try {
      if (await this.isPeriodClosed(companyId, input.accountingDate)) {
        throw new PostingRejected("Fiscal period is closed");
      }
      await this.assertOpeningReconciles(companyId, input.lines, input.details);
      const batchId = randomUUID();
      return await this.saveJournal({
        companyId,
        actorUserId: access.userId,
        accountingDate: input.accountingDate,
        description: input.description,
        sourceModule: "opening_balance",
        sourceDocumentType: "opening_balance",
        sourceDocumentId: batchId,
        closedPeriodAdjustment: false,
        lines: input.lines,
        mode: "opening",
        postNow: true,
        scope: access.scope,
        opening: { batchId, details: input.details },
      }, correlationId);
    } catch (error) {
      return this.fail(companyId, access.userId, { eventCode: "opening_balance" }, error);
    }
  }

  async postSystemDocument(
    access: AccessContext,
    input: {
      sourceModule?: string;
      sourceDocumentType: string;
      sourceDocumentId: string;
      accountingDate: string;
      description: string;
      lines: DraftLine[];
      stockMoves?: StockMoveInput[];
      allowNegativeStock?: boolean;
    },
    correlationId?: string,
  ) {
    const companyId = await this.companyId(access.userId);
    try {
      if (await this.isPeriodClosed(companyId, input.accountingDate)) {
        throw new PostingRejected("Fiscal period is closed");
      }
      return await this.saveJournal({
        companyId,
        actorUserId: access.userId,
        accountingDate: input.accountingDate,
        description: input.description,
        sourceModule: input.sourceModule ?? "sales",
        sourceDocumentType: input.sourceDocumentType,
        sourceDocumentId: input.sourceDocumentId,
        closedPeriodAdjustment: false,
        lines: input.lines,
        mode: "system",
        postNow: true,
        scope: access.scope,
        stockMoves: input.stockMoves,
        allowNegativeStock: input.allowNegativeStock,
      }, correlationId);
    } catch (error) {
      return this.fail(companyId, access.userId, { eventCode: input.sourceDocumentType, sourceDocumentId: input.sourceDocumentId }, error);
    }
  }

  async listJournals(access: AccessContext) {
    const companyId = await this.companyId(access.userId);
    const rows = await this.prisma.journalEntry.findMany({
      where: {
        companyId,
        lines: { some: { branchId: branchIdFilter(access.scope) } },
      },
      include: { lines: { include: { account: true } } },
      orderBy: { accountingDate: "desc" },
      take: 100,
    });
    return rows.map((row) => this.serialize(row));
  }

  async getJournal(access: AccessContext, journalId: string) {
    const companyId = await this.companyId(access.userId);
    const row = await this.prisma.journalEntry.findFirst({
      where: { id: journalId, companyId },
      include: { lines: { include: { account: true } } },
    });
    if (!row) {
      throw new NotFoundException("Journal was not found");
    }
    this.assertJournalScope(access.scope, row.lines.map((line) => line.branchId));
    return this.serialize(row);
  }

  async review(access: AccessContext) {
    const companyId = await this.companyId(access.userId);
    const lineScope = { branchId: branchIdFilter(access.scope) };
    const [posted, unposted, attempts] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where: { companyId, status: "posted", lines: { some: lineScope } },
        include: { lines: { include: { account: true } } },
        orderBy: { postedAt: "desc" },
        take: 20,
      }),
      this.prisma.journalEntry.findMany({
        where: { companyId, status: "pending_approval", lines: { some: lineScope } },
        include: { lines: { include: { account: true } } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.postingAttempt.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    const pending = unposted.map((row) => this.serialize(row));
    return {
      posted: posted.map((row) => this.serialize(row)),
      manualRequests: pending.filter((row) => row.sourceDocumentType === "manual_journal" && !row.closedPeriodAdjustment),
      reversalRequests: pending.filter((row) => row.reversalOfId),
      closedPeriodAdjustments: pending.filter((row) => row.closedPeriodAdjustment),
      failedAttempts: attempts.filter((attempt) => attempt.status === "failed"),
      suspicious: attempts.filter((attempt) => attempt.status === "suspicious"),
    };
  }

  async trialBalance(access: AccessContext) {
    const companyId = await this.companyId(access.userId);
    const accounts = await this.prisma.account.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { accountCode: "asc" },
    });
    const totals = await this.lineTotals(companyId, access.scope);
    let totalDebit = 0n;
    let totalCredit = 0n;
    const rows = accounts.map((account) => {
      const total = totals.get(account.id) ?? { debit: 0n, credit: 0n };
      totalDebit += total.debit;
      totalCredit += total.credit;
      return {
        accountId: account.id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        debit: formatMoneyUnits(total.debit),
        credit: formatMoneyUnits(total.credit),
      };
    });
    return {
      rows,
      totalDebit: formatMoneyUnits(totalDebit),
      totalCredit: formatMoneyUnits(totalCredit),
      balanced: totalDebit === totalCredit,
    };
  }

  async closePeriod(access: AccessContext, periodId: string, correlationId?: string) {
    const companyId = await this.companyId(access.userId);
    const period = await this.prisma.fiscalPeriod.findFirst({ where: { id: periodId, companyId } });
    if (!period) {
      throw new NotFoundException("Fiscal period was not found");
    }
    if (period.status === "closed") {
      throw new ConflictException("Fiscal period is already closed");
    }
    const closed = await this.prisma.fiscalPeriod.update({
      where: { id: period.id },
      data: { status: "closed", closedAt: new Date(), closedByUserId: access.userId },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: access.userId,
        action: "accounting.period.closed",
        entityType: "fiscal_period",
        entityId: period.id,
        correlationId,
      },
    });
    return {
      id: closed.id,
      startDate: closed.startDate.toISOString().slice(0, 10),
      endDate: closed.endDate.toISOString().slice(0, 10),
      status: closed.status,
    };
  }

  async listPeriods(access: AccessContext) {
    const companyId = await this.companyId(access.userId);
    const rows = await this.prisma.fiscalPeriod.findMany({
      where: { companyId },
      orderBy: { startDate: "asc" },
    });
    return rows.map((period) => ({
      id: period.id,
      startDate: period.startDate.toISOString().slice(0, 10),
      endDate: period.endDate.toISOString().slice(0, 10),
      status: period.status,
    }));
  }

  private async saveJournal(input: SaveJournalInput, correlationId?: string) {
    this.validateLines(input.lines);
    for (const line of input.lines) {
      assertBranchAllowed(input.scope, line.branchId);
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.sourceDocumentId) {
        const existing = await tx.journalEntry.findFirst({
          where: {
            companyId: input.companyId,
            sourceModule: input.sourceModule,
            sourceDocumentType: input.sourceDocumentType,
            sourceDocumentId: input.sourceDocumentId,
            status: "posted",
          },
        });
        if (existing) {
          throw new PostingRejected("This source document has already been posted");
        }
      }
      const period = await this.periodFor(tx, input.companyId, input.accountingDate);
      if (period.status === "closed" && !input.closedPeriodAdjustment) {
        throw new PostingRejected("Fiscal period is closed");
      }
      if (period.status === "closed" && input.postNow) {
        throw new PostingRejected("Fiscal period is closed");
      }
      for (const line of input.lines) {
        await this.assertAccount(tx, input.companyId, line.accountId, input.mode);
        await this.assertBranch(tx, input.companyId, line.branchId);
        if (line.departmentId) {
          await this.assertDepartment(tx, input.companyId, line.departmentId);
        }
      }
      const number = await this.documentNumbers.allocateWith(tx, input.lines[0].branchId, "journal");
      const journal = await tx.journalEntry.create({
        data: {
          companyId: input.companyId,
          journalNumber: number.documentNumber,
          accountingDate: accountingDate(input.accountingDate),
          fiscalPeriodId: period.id,
          sourceModule: input.sourceModule,
          sourceDocumentType: input.sourceDocumentType,
          sourceDocumentId: input.sourceDocumentId,
          description: input.description,
          status: "draft",
          createdByUserId: input.actorUserId,
          reversalOfId: input.reversalOfId,
          reason: input.reason,
          closedPeriodAdjustment: input.closedPeriodAdjustment,
          lines: {
            create: input.lines.map((line) => ({
              accountId: line.accountId,
              branchId: line.branchId,
              departmentId: line.departmentId,
              customerId: line.customerId,
              supplierId: line.supplierId,
              projectId: line.projectId,
              debit: line.debit,
              credit: line.credit,
              description: line.description,
            })),
          },
        },
        include: { lines: { include: { account: true } } },
      });
      const status = input.postNow ? "posted" : "pending_approval";
      const saved = await tx.journalEntry.update({
        where: { id: journal.id },
        data: input.postNow
          ? { status, postedAt: new Date(), postedByUserId: input.actorUserId }
          : { status },
        include: { lines: { include: { account: true } } },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          action: input.postNow ? "accounting.posted" : "accounting.journal.requested",
          entityType: "journal_entry",
          entityId: saved.id,
          newValues: {
            journalNumber: saved.journalNumber,
            sourceModule: saved.sourceModule,
            sourceDocumentType: saved.sourceDocumentType,
          },
          reason: input.reason,
          correlationId,
        },
      });
      if (input.opening) {
        await tx.openingBalanceBatch.create({
          data: {
            id: input.opening.batchId,
            companyId: input.companyId,
            journalEntryId: saved.id,
            description: input.description,
            createdByUserId: input.actorUserId,
            lines: {
              create: input.opening.details.map((detail) => ({
                kind: detail.kind as never,
                accountCode: detail.accountCode,
                reference: detail.reference,
                description: detail.description,
                quantity: detail.quantity,
                unitCost: detail.unitCost,
                amount: detail.amount,
                branchId: detail.branchId,
              })),
            },
          },
        });
        await this.recordOpeningStock(tx, input.companyId, input.opening.batchId, input.opening.details, input.accountingDate);
      }
      if (input.stockMoves?.length && input.sourceDocumentId) {
        await this.applyStockMoves(
          tx,
          input.companyId,
          input.sourceDocumentType,
          input.sourceDocumentId,
          input.stockMoves,
          input.allowNegativeStock === true,
          new Date(`${input.accountingDate}T12:00:00.000Z`),
        );
      }
      return this.serialize(saved);
    }, { timeout: 20_000 });
  }

  private async recordOpeningStock(
    tx: Prisma.TransactionClient,
    companyId: string,
    batchId: string,
    details: Array<{ kind: string; reference?: string; quantity?: string; unitCost?: string; branchId: string }>,
    accountingDate: string,
  ) {
    for (const detail of details) {
      if (detail.kind !== "inventory" || !detail.reference || !detail.quantity || !detail.unitCost) {
        continue;
      }
      const product = await tx.product.findFirst({
        where: { companyId, sku: detail.reference, deletedAt: null, productType: "product" },
      });
      if (!product) {
        continue;
      }
      const warehouse = await tx.warehouse.findFirst({
        where: { companyId, branchId: detail.branchId, warehouseType: "main", status: "active" },
        orderBy: { warehouseCode: "asc" },
      });
      await this.applyStockMoves(tx, companyId, "opening_balance", batchId, [{
        productId: product.id,
        branchId: detail.branchId,
        quantity: detail.quantity,
        unitCost: detail.unitCost,
        warehouseId: warehouse?.id,
        movementType: "opening_balance",
      }], true, new Date(`${accountingDate}T12:00:00.000Z`));
    }
  }

  private async applyStockMoves(
    tx: Prisma.TransactionClient,
    companyId: string,
    sourceDocumentType: string,
    sourceDocumentId: string,
    moves: StockMoveInput[],
    allowNegative: boolean,
    occurredAt: Date,
  ) {
    for (const move of moves) {
      const quantity = parseMoney(move.quantity);
      const incomingCost = parseMoney(move.unitCost);
      if (quantity <= 0n) {
        throw new PostingRejected("Stock quantity must be greater than zero");
      }
      const decreasing = move.movementType === "sales_issue" || move.movementType === "transfer_out" || move.movementType === "adjustment_out" || move.movementType === "project_issue";
      const warehouseId = move.warehouseId ?? await this.mainWarehouseId(tx, companyId, move.branchId);
      const rows = await tx.$queryRaw<Array<{ id: string; physical_quantity: Prisma.Decimal; reserved_quantity: Prisma.Decimal; average_unit_cost: Prisma.Decimal }>>(
        Prisma.sql`
          SELECT id, physical_quantity, reserved_quantity, average_unit_cost
          FROM stock_balances
          WHERE company_id = CAST(${companyId} AS uuid)
            AND product_id = CAST(${move.productId} AS uuid)
            AND branch_id = CAST(${move.branchId} AS uuid)
          FOR UPDATE
        `,
      );
      const current = rows[0];
      const physical = current ? parseMoney(current.physical_quantity.toFixed(4)) : 0n;
      const reserved = current ? parseMoney(current.reserved_quantity.toFixed(4)) : 0n;
      const oldAverage = current ? parseMoney(current.average_unit_cost.toFixed(4)) : 0n;
      if (decreasing) {
        await this.adjustWarehouseQuantity(tx, companyId, warehouseId, move.productId, -quantity, allowNegative);
        if (move.transitWarehouseId) {
          await this.adjustWarehouseQuantity(tx, companyId, move.transitWarehouseId, move.productId, quantity, true);
        }
      } else {
        if (move.transitWarehouseId) {
          await this.adjustWarehouseQuantity(tx, companyId, move.transitWarehouseId, move.productId, -quantity, allowNegative);
        }
        await this.adjustWarehouseQuantity(tx, companyId, warehouseId, move.productId, quantity, true);
      }
      const nextPhysical = await this.availableWarehouseQuantity(tx, move.branchId, move.productId);
      if (decreasing && !allowNegative && nextPhysical < reserved) {
        throw new PostingRejected("Stock is not available for this quantity");
      }
      const average = decreasing ? oldAverage : weightedAverage(physical, oldAverage, quantity, incomingCost);
      const recordedCost = decreasing ? (oldAverage > 0n ? oldAverage : incomingCost) : incomingCost;
      const data = {
        physicalQuantity: formatMoneyUnits(nextPhysical),
        averageUnitCost: formatMoneyUnits(average),
      };
      if (current) {
        await tx.stockPosition.update({ where: { id: current.id }, data });
      } else {
        await tx.stockPosition.create({
          data: {
            companyId,
            productId: move.productId,
            branchId: move.branchId,
            reservedQuantity: "0.0000",
            ...data,
          },
        });
      }
      await tx.stockMovement.create({
        data: {
          companyId,
          productId: move.productId,
          branchId: move.branchId,
          movementType: move.movementType,
          quantity: formatMoneyUnits(quantity),
          unitCost: formatMoneyUnits(recordedCost),
          totalValue: formatMoneyUnits(multiplyMoney(quantity, recordedCost)),
          sourceDocumentType,
          sourceDocumentId,
          warehouseId,
          occurredAt,
        },
      });
    }
  }

  private async mainWarehouseId(tx: Prisma.TransactionClient, companyId: string, branchId: string) {
    const warehouse = await tx.warehouse.findFirst({
      where: { companyId, branchId, warehouseType: "main", status: "active" },
      orderBy: { warehouseCode: "asc" },
    });
    if (!warehouse) {
      throw new PostingRejected("The branch has no main warehouse");
    }
    return warehouse.id;
  }

  private async adjustWarehouseQuantity(
    tx: Prisma.TransactionClient,
    companyId: string,
    warehouseId: string,
    productId: string,
    delta: bigint,
    allowNegative: boolean,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string; quantity: Prisma.Decimal }>>(
      Prisma.sql`
        SELECT id, quantity
        FROM warehouse_stocks
        WHERE warehouse_id = CAST(${warehouseId} AS uuid)
          AND product_id = CAST(${productId} AS uuid)
        FOR UPDATE
      `,
    );
    const current = rows[0] ? parseMoney(rows[0].quantity.toFixed(4)) : 0n;
    const next = current + delta;
    if (next < 0n && !allowNegative) {
      throw new PostingRejected("Warehouse stock is not available for this quantity");
    }
    const quantity = formatMoneyUnits(next);
    if (rows[0]) {
      await tx.warehouseStock.update({ where: { id: rows[0].id }, data: { quantity } });
      return;
    }
    await tx.warehouseStock.create({ data: { companyId, warehouseId, productId, quantity } });
  }

  private async availableWarehouseQuantity(tx: Prisma.TransactionClient, branchId: string, productId: string) {
    const rows = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>(
      Prisma.sql`
        SELECT COALESCE(SUM(s.quantity), 0) AS quantity
        FROM warehouse_stocks s
        INNER JOIN warehouses w ON w.id = s.warehouse_id
        WHERE w.branch_id = CAST(${branchId} AS uuid)
          AND w.warehouse_type <> 'in_transit'
          AND s.product_id = CAST(${productId} AS uuid)
      `,
    );
    return rows[0] ? parseMoney(rows[0].quantity.toFixed(4)) : 0n;
  }

  private async fail(companyId: string, actorUserId: string, source: { eventCode?: string; sourceDocumentId?: string }, error: unknown): Promise<never> {
    if (error instanceof PostingRejected) {
      await this.prisma.postingAttempt.create({
        data: {
          companyId,
          actorUserId,
          eventCode: source.eventCode,
          sourceDocumentId: source.sourceDocumentId,
          status: error.attemptStatus,
          reason: error.message,
        },
      });
      await this.notifications?.notifyFailedPosting({
        companyId,
        actorUserId,
        reason: error.message,
        sourceDocumentId: source.sourceDocumentId,
      });
      throw new BadRequestException(error.message);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await this.prisma.postingAttempt.create({
        data: {
          companyId,
          actorUserId,
          eventCode: source.eventCode,
          sourceDocumentId: source.sourceDocumentId,
          status: "failed",
          reason: "This source document has already been posted",
        },
      });
      await this.notifications?.notifyFailedPosting({
        companyId,
        actorUserId,
        reason: "This source document has already been posted",
        sourceDocumentId: source.sourceDocumentId,
      });
      throw new ConflictException("This source document has already been posted");
    }
    throw error;
  }

  private validateLines(lines: DraftLine[]) {
    if (lines.length < 2) {
      throw new PostingRejected("A journal needs at least two lines");
    }
    let debit = 0n;
    let credit = 0n;
    for (const line of lines) {
      let debitUnits: bigint;
      let creditUnits: bigint;
      try {
        debitUnits = parseMoney(line.debit);
        creditUnits = parseMoney(line.credit);
      } catch {
        throw new PostingRejected("Money amounts must be zero or positive decimal strings");
      }
      if ((debitUnits > 0n && creditUnits > 0n) || (debitUnits === 0n && creditUnits === 0n)) {
        throw new PostingRejected("Each journal line must be either a debit or a credit");
      }
      debit += debitUnits;
      credit += creditUnits;
    }
    if (debit !== credit) {
      throw new PostingRejected("Journal does not balance");
    }
  }

  private async assertOpeningReconciles(
    companyId: string,
    lines: DraftLine[],
    details: Array<{ kind: string; accountCode: string; quantity?: string; unitCost?: string; amount: string }>,
  ) {
    this.validateLines(lines);
    const accounts = await this.prisma.account.findMany({ where: { companyId, deletedAt: null } });
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const nets = new Map<string, bigint>();
    for (const line of lines) {
      const account = byId.get(line.accountId);
      if (!account) {
        throw new PostingRejected("Opening balance account was not found");
      }
      const current = nets.get(account.accountCode) ?? 0n;
      const signed = account.normalBalance === "debit"
        ? parseMoney(line.debit) - parseMoney(line.credit)
        : parseMoney(line.credit) - parseMoney(line.debit);
      nets.set(account.accountCode, current + signed);
    }
    const equityAccounts = new Set(accounts.filter((account) => account.accountType === "equity").map((account) => account.accountCode));
    const grouped = new Map<string, bigint>();
    for (const detail of details) {
      if (!OPENING_ACCOUNTS[detail.kind]) {
        throw new PostingRejected("Opening balance detail kind is not recognized");
      }
      let amount: bigint;
      try {
        amount = parseMoney(detail.amount);
      } catch {
        throw new PostingRejected("Opening balance amounts must be decimal strings");
      }
      if (detail.kind === "inventory") {
        if (!detail.quantity || !detail.unitCost) {
          throw new PostingRejected("Inventory opening balances require quantity and unit cost");
        }
        const expected = multiplyMoney(parseMoney(detail.quantity), parseMoney(detail.unitCost));
        if (expected !== amount) {
          throw new PostingRejected("Inventory quantity and unit cost do not match the opening value");
        }
      }
      grouped.set(detail.kind, (grouped.get(detail.kind) ?? 0n) + amount);
    }
    for (const [kind, rule] of Object.entries(OPENING_ACCOUNTS)) {
      const detailTotal = grouped.get(kind);
      if (detailTotal === undefined) {
        continue;
      }
      const journalTotal = rule.code
        ? nets.get(rule.code) ?? 0n
        : [...nets.entries()].filter(([code]) => equityAccounts.has(code)).reduce((sum, [, value]) => sum + value, 0n);
      if (detailTotal !== journalTotal) {
        throw new PostingRejected(`Opening ${kind.replaceAll("_", " ")} details do not reconcile`);
      }
    }
  }

  private async assertAccount(tx: Prisma.TransactionClient, companyId: string, accountId: string, mode: SaveJournalInput["mode"]) {
    const account = await tx.account.findFirst({ where: { id: accountId, companyId, deletedAt: null } });
    if (!account || !account.isActive) {
      throw new PostingRejected("Account is not active");
    }
    if (mode === "manual" && account.isControlAccount) {
      throw new PostingRejected("Control accounts cannot be used on a manual journal", "suspicious");
    }
    if (!account.isControlAccount && !account.isPostable) {
      throw new PostingRejected("Account is not postable");
    }
    return account;
  }

  private async assertBranch(tx: Prisma.TransactionClient, companyId: string, branchId: string) {
    const branch = await tx.branch.findFirst({ where: { id: branchId, companyId, deletedAt: null } });
    if (!branch) {
      throw new PostingRejected("Branch was not found");
    }
  }

  private async assertDepartment(tx: Prisma.TransactionClient, companyId: string, departmentId: string) {
    const department = await tx.department.findFirst({ where: { id: departmentId, companyId, deletedAt: null } });
    if (!department) {
      throw new PostingRejected("Department was not found");
    }
  }

  private async periodFor(tx: Prisma.TransactionClient | PrismaService, companyId: string, value: string) {
    let date: Date;
    try {
      date = accountingDate(value);
    } catch (error) {
      throw new PostingRejected(error instanceof Error ? error.message : "Accounting date is invalid");
    }
    const period = await tx.fiscalPeriod.findFirst({
      where: { companyId, startDate: { lte: date }, endDate: { gte: date } },
    });
    if (!period) {
      throw new PostingRejected("No fiscal period covers the accounting date");
    }
    return period;
  }

  private async isPeriodClosed(companyId: string, value: string) {
    const period = await this.periodFor(this.prisma, companyId, value);
    return period.status === "closed";
  }

  private async accountByCode(companyId: string, accountCode: string) {
    const account = await this.prisma.account.findUnique({
      where: { companyId_accountCode: { companyId, accountCode } },
    });
    if (!account || account.deletedAt) {
      throw new PostingRejected("Override account was not found");
    }
    return account;
  }

  private line(accountId: string, branchId: string, debit: bigint, credit: bigint, description: string): DraftLine {
    return {
      accountId,
      branchId,
      debit: formatMoneyUnits(debit),
      credit: formatMoneyUnits(credit),
      description,
    };
  }

  private assertJournalScope(scope: BranchScope, branchIds: string[]) {
    if (scope.type === "branches" && branchIds.every((branchId) => !scope.branchIds.includes(branchId))) {
      throw new NotFoundException("Journal was not found");
    }
  }

  private async lineTotals(companyId: string, scope: BranchScope) {
    const rows = await this.prisma.journalLine.groupBy({
      by: ["accountId"],
      where: {
        journal: { companyId, status: "posted" },
        branchId: branchIdFilter(scope),
      },
      _sum: { debit: true, credit: true },
    });
    return new Map(rows.map((row) => [row.accountId, {
      debit: parseMoney(row._sum.debit?.toFixed(4) ?? "0"),
      credit: parseMoney(row._sum.credit?.toFixed(4) ?? "0"),
    }]));
  }

  private async companyId(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { companyId: true } });
    return user.companyId;
  }

  private serialize(row: {
    id: string;
    journalNumber: string;
    accountingDate: Date;
    description: string;
    status: string;
    sourceModule: string;
    sourceDocumentType: string;
    sourceDocumentId: string | null;
    reversalOfId: string | null;
    reason: string | null;
    closedPeriodAdjustment: boolean;
    postedAt: Date | null;
    lines: Array<{
      id: string;
      accountId: string;
      branchId: string;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
      description: string | null;
      account?: Account;
    }>;
  }) {
    return {
      id: row.id,
      journalNumber: row.journalNumber,
      accountingDate: row.accountingDate.toISOString().slice(0, 10),
      description: row.description,
      status: row.status,
      sourceModule: row.sourceModule,
      sourceDocumentType: row.sourceDocumentType,
      sourceDocumentId: row.sourceDocumentId,
      reversalOfId: row.reversalOfId,
      reason: row.reason,
      closedPeriodAdjustment: row.closedPeriodAdjustment,
      postedAt: row.postedAt?.toISOString() ?? null,
      lines: row.lines.map((line) => ({
        id: line.id,
        accountId: line.accountId,
        accountCode: line.account?.accountCode,
        accountName: line.account?.accountName,
        branchId: line.branchId,
        debit: line.debit.toFixed(4),
        credit: line.credit.toFixed(4),
        description: line.description,
      })),
    };
  }
}

function weightedAverage(onHand: bigint, average: bigint, incomingQuantity: bigint, incomingCost: bigint): bigint {
  const next = onHand + incomingQuantity;
  if (next <= 0n) {
    return incomingCost;
  }
  const value = multiplyMoney(onHand, average) + multiplyMoney(incomingQuantity, incomingCost);
  return (value * 10000n) / next;
}
