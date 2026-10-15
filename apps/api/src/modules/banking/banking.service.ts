import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { AccountingPostingService } from "../accounting/posting.service";
import { formatMoneyUnits, parseMoney } from "../accounting/money";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, branchIdFilter } from "../organization/branch-scope";
import { moneyText } from "../sales/sales-math";
import {
  BankAdjustmentDto,
  BankStatementLineDto,
  CashBookQueryDto,
  CreateBankAccountDto,
  CreateBankStatementDto,
  CreateCashCountDto,
  CreateCashDrawerDto,
  CreateCashTransferDto,
  ImportStatementDto,
  MatchStatementDto,
} from "./banking.dto";

const DAY = 86_400_000;

@Injectable()
export class BankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly posting: AccountingPostingService,
    private readonly audit: AuditService,
  ) {}

  async accounts(access: AccessContext) {
    const companyId = await this.companyId(access.userId);
    const rows = await this.prisma.bankAccount.findMany({
      where: this.accountWhere(access, companyId),
      include: { branch: true, ledgerAccount: true },
      orderBy: { accountName: "asc" },
    });
    return Promise.all(rows.map(async (row) => ({
      ...this.serializeAccount(row),
      bookBalance: formatMoneyUnits(await this.net(row.ledgerAccountId)),
    })));
  }

  async createAccount(access: AccessContext, input: CreateBankAccountDto) {
    if (input.branchId) assertBranchAllowed(access.scope, input.branchId);
    if (!input.branchId && !access.companyWide) throw new ForbiddenException("Company-wide approval is required");
    if ((input.currency ?? "NGN") !== "NGN") throw new BadRequestException("Bank accounts use NGN");
    const companyId = await this.companyId(access.userId);
    const parent = await this.accountByCode(companyId, "1100");
    const code = await this.nextBankCode(companyId);
    const saved = await this.prisma.$transaction(async (tx) => {
      const ledger = await tx.account.create({
        data: {
          companyId,
          accountCode: code,
          accountName: input.accountName.trim(),
          accountType: "asset",
          accountSubtype: "bank",
          parentAccountId: parent.id,
          normalBalance: "debit",
          isPostable: true,
          isControlAccount: false,
          isActive: true,
        },
      });
      return tx.bankAccount.create({
        data: {
          companyId,
          branchId: input.branchId,
          bankName: input.bankName.trim(),
          accountName: input.accountName.trim(),
          maskedAccountNumber: maskAccountNumber(input.accountNumber),
          currency: "NGN",
          ledgerAccountId: ledger.id,
          status: "active",
        },
        include: { branch: true, ledgerAccount: true },
      });
    });
    return { ...this.serializeAccount(saved), bookBalance: "0.0000" };
  }

  async drawers(access: AccessContext) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const rows = await this.prisma.cashDrawer.findMany({
      where: { companyId, ...(branchIds ? { branchId: branchIds } : {}) },
      include: { branch: true, ledgerAccount: true },
      orderBy: { name: "asc" },
    });
    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      branchId: row.branchId,
      branchName: row.branch.name,
      accountCode: row.ledgerAccount.accountCode,
      ledgerAccountId: row.ledgerAccountId,
      bookBalance: formatMoneyUnits(await this.net(row.ledgerAccountId, { branchId: row.branchId })),
    })));
  }

  async createDrawer(access: AccessContext, input: CreateCashDrawerDto) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    const ledger = await this.cashAccount(companyId, input.ledgerAccountId);
    if (input.kind === "petty" && ledger.accountCode !== "1010") throw new BadRequestException("Petty cash must use account 1010");
    if (input.kind === "drawer" && ledger.accountSubtype !== "cash") throw new BadRequestException("A cash drawer must use a cash account");
    return this.prisma.cashDrawer.create({
      data: { companyId, branchId: input.branchId, name: input.name.trim(), kind: input.kind, ledgerAccountId: ledger.id, status: "active" },
      select: { id: true, name: true, kind: true },
    });
  }

  async transfer(access: AccessContext, input: CreateCashTransferDto, correlationId?: string) {
    this.assertTransfer(access);
    assertBranchAllowed(access.scope, input.sourceBranchId);
    assertBranchAllowed(access.scope, input.destinationBranchId);
    if (input.sourceAccountId === input.destinationAccountId) throw new BadRequestException("Choose two different accounts");
    const companyId = await this.companyId(access.userId);
    const source = await this.cashAccount(companyId, input.sourceAccountId);
    const destination = await this.cashAccount(companyId, input.destinationAccountId);
    this.assertTransferLegs(input.kind, source.accountSubtype, destination.accountSubtype);
    const later = Boolean(input.receivedDate && input.receivedDate > input.sentDate);
    if (input.receivedDate && input.receivedDate < input.sentDate) throw new BadRequestException("The receive date is before the send date");
    const id = randomUUID();
    const amount = formatMoneyUnits(parseMoney(input.amount));
    const transit = later ? await this.accountByCode(companyId, "1110") : null;
    const number = await this.prisma.$transaction((tx) => this.documentNumbers.allocateWith(tx, input.sourceBranchId, "bank_transfer"));
    const journalId = await this.postPair(access, id, later ? "cash_transfer_send" : "cash_transfer", input.sentDate, number.documentNumber, transit?.id ?? destination.id, later ? input.sourceBranchId : input.destinationBranchId, source.id, input.sourceBranchId, amount, correlationId);
    const saved = await this.prisma.cashTransfer.create({
      data: {
        id,
        companyId,
        transferNumber: number.documentNumber,
        kind: input.kind,
        sourceBranchId: input.sourceBranchId,
        destinationBranchId: input.destinationBranchId,
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
        amount,
        sentDate: new Date(input.sentDate),
        receivedDate: input.receivedDate ? new Date(input.receivedDate) : null,
        status: later ? "in_transit" : "received",
        sendJournalId: journalId,
        createdByUserId: access.userId,
      },
    });
    await this.audit.record({ actorUserId: access.userId, action: "banking.transferred", entityType: "cash_transfer", entityId: saved.id, newValues: { transferNumber: saved.transferNumber, status: saved.status }, correlationId });
    return { id: saved.id, transferNumber: saved.transferNumber, status: saved.status, amount: moneyText(saved.amount) };
  }

  async receive(access: AccessContext, id: string, correlationId?: string) {
    this.assertTransfer(access);
    const transfer = await this.findTransfer(access, id);
    if (transfer.status === "received") throw new ConflictException("This transfer has already been received");
    if (!transfer.receivedDate) throw new BadRequestException("This transfer was completed on the send date");
    const companyId = transfer.companyId;
    const transit = await this.accountByCode(companyId, "1110");
    const receivedDate = transfer.receivedDate.toISOString().slice(0, 10);
    const journalId = await this.postPair(access, transfer.id, "cash_transfer_receive", receivedDate, transfer.transferNumber, transfer.destinationAccountId, transfer.destinationBranchId, transit.id, transfer.sourceBranchId, moneyText(transfer.amount), correlationId);
    const saved = await this.prisma.cashTransfer.update({ where: { id }, data: { status: "received", receiveJournalId: journalId } });
    await this.audit.record({ actorUserId: access.userId, action: "banking.transfer_received", entityType: "cash_transfer", entityId: id, correlationId });
    return { id: saved.id, status: saved.status };
  }

  async createCount(access: AccessContext, input: CreateCashCountDto) {
    this.assertReconcile(access);
    const drawer = await this.findDrawer(access, input.drawerId);
    const book = await this.net(drawer.ledgerAccountId, { branchId: drawer.branchId, to: new Date(input.countDate) });
    const counted = parseMoney(input.countedAmount);
    const number = await this.prisma.$transaction((tx) => this.documentNumbers.allocateWith(tx, drawer.branchId, "cash_count"));
    const saved = await this.prisma.cashCount.create({
      data: {
        companyId: drawer.companyId,
        branchId: drawer.branchId,
        drawerId: drawer.id,
        countNumber: number.documentNumber,
        countDate: new Date(input.countDate),
        countedAmount: input.countedAmount,
        bookAmount: formatMoneyUnits(book),
        varianceAmount: formatMoneyUnits(counted - book),
        status: "draft",
        createdByUserId: access.userId,
      },
    });
    return this.serializeCount(saved);
  }

  async postCount(access: AccessContext, id: string, correlationId?: string) {
    this.assertReconcile(access);
    const count = await this.findCount(access, id);
    if (count.status === "posted") throw new ConflictException("This cash count has already been posted");
    if (count.createdByUserId === access.userId) throw new ForbiddenException("You cannot approve a document you created");
    const book = await this.net(count.drawer.ledgerAccountId, { branchId: count.branchId, to: count.countDate });
    const variance = parseMoney(count.countedAmount.toFixed(4)) - book;
    let journalId: string | null = null;
    if (variance !== 0n) {
      const expense = await this.accountByCode(count.companyId, variance < 0n ? "6900" : "4900");
      const amount = formatMoneyUnits(variance < 0n ? -variance : variance);
      const date = count.countDate.toISOString().slice(0, 10);
      journalId = variance < 0n
        ? await this.postPair(access, count.id, "cash_count", date, count.countNumber, expense.id, count.branchId, count.drawer.ledgerAccountId, count.branchId, amount, correlationId)
        : await this.postPair(access, count.id, "cash_count", date, count.countNumber, count.drawer.ledgerAccountId, count.branchId, expense.id, count.branchId, amount, correlationId);
    }
    const saved = await this.prisma.cashCount.update({
      where: { id },
      data: { status: "posted", bookAmount: formatMoneyUnits(book), varianceAmount: formatMoneyUnits(variance), journalId, postedByUserId: access.userId },
    });
    await this.audit.record({ actorUserId: access.userId, action: "banking.count_posted", entityType: "cash_count", entityId: id, newValues: { variance: formatMoneyUnits(variance) }, correlationId });
    return this.serializeCount(saved);
  }

  async cashBook(access: AccessContext, query: CashBookQueryDto) {
    this.assertReconcile(access);
    const companyId = await this.companyId(access.userId);
    if (query.branchId) assertBranchAllowed(access.scope, query.branchId);
    const from = new Date(query.from ?? monthStart());
    const to = new Date(query.to ?? monthEnd());
    const branchIds = query.branchId ? { in: [query.branchId] } : branchIdFilter(access.scope);
    const account = query.accountId ? await this.cashAccount(companyId, query.accountId) : null;
    const where = {
      ...(account ? { accountId: account.id } : { account: { accountSubtype: { in: ["cash", "bank"] } } }),
      ...(branchIds ? { branchId: branchIds } : {}),
      journal: {
        companyId,
        status: "posted" as const,
        ...(query.sourceType ? { sourceDocumentType: query.sourceType } : {}),
      },
    };
    const [openingLines, rangeLines] = await Promise.all([
      this.prisma.journalLine.findMany({ where: { ...where, journal: { ...where.journal, accountingDate: { lt: from } } }, select: { debit: true, credit: true } }),
      this.prisma.journalLine.findMany({
        where: { ...where, journal: { ...where.journal, accountingDate: { gte: from, lte: to } } },
        include: { account: true, branch: true, journal: true },
        orderBy: { journal: { accountingDate: "asc" } },
      }),
    ]);
    const opening = signedSum(openingLines);
    const receipts = rangeLines.reduce((sum, line) => sum + parseMoney(line.debit.toFixed(4)), 0n);
    const payments = rangeLines.reduce((sum, line) => sum + parseMoney(line.credit.toFixed(4)), 0n);
    return {
      opening: formatMoneyUnits(opening),
      receipts: formatMoneyUnits(receipts),
      payments: formatMoneyUnits(payments),
      closing: formatMoneyUnits(opening + receipts - payments),
      lines: rangeLines.map((line) => ({
        id: line.id,
        journalId: line.journal.id,
        journalNumber: line.journal.journalNumber,
        date: line.journal.accountingDate.toISOString().slice(0, 10),
        accountCode: line.account.accountCode,
        branchName: line.branch.name,
        description: line.description ?? line.journal.description,
        sourceType: line.journal.sourceDocumentType,
        debit: moneyText(line.debit),
        credit: moneyText(line.credit),
      })),
    };
  }

  async cashBookJournal(access: AccessContext, id: string) {
    this.assertReconcile(access);
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const entry = await this.prisma.journalEntry.findFirst({
      where: {
        id,
        companyId,
        status: "posted",
        ...(branchIds ? { lines: { some: { branchId: branchIds } } } : {}),
      },
      include: { lines: { include: { account: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!entry) {
      throw new NotFoundException("Journal was not found");
    }
    const lines = branchIds
      ? entry.lines.filter((line) => branchIds.in.includes(line.branchId))
      : entry.lines;
    if (lines.length === 0) {
      throw new NotFoundException("Journal was not found");
    }
    return {
      id: entry.id,
      journalNumber: entry.journalNumber,
      accountingDate: entry.accountingDate.toISOString().slice(0, 10),
      description: entry.description,
      status: entry.status,
      sourceDocumentType: entry.sourceDocumentType,
      postedAt: entry.postedAt?.toISOString() ?? null,
      lines: lines.map((line) => ({
        id: line.id,
        accountCode: line.account.accountCode,
        accountName: line.account.accountName,
        debit: formatMoneyUnits(parseMoney(line.debit.toFixed(4))),
        credit: formatMoneyUnits(parseMoney(line.credit.toFixed(4))),
        description: line.description,
      })),
    };
  }

  async statements(access: AccessContext) {
    this.assertReconcile(access);
    const companyId = await this.companyId(access.userId);
    const accounts = await this.prisma.bankAccount.findMany({ where: this.accountWhere(access, companyId), select: { id: true } });
    const rows = await this.prisma.bankStatement.findMany({
      where: { companyId, bankAccountId: { in: accounts.map((row) => row.id) } },
      include: { bankAccount: true },
      orderBy: { periodStart: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      accountName: row.bankAccount.accountName,
      periodStart: row.periodStart.toISOString().slice(0, 10),
      periodEnd: row.periodEnd.toISOString().slice(0, 10),
      statementEnding: moneyText(row.statementEnding),
      status: row.status,
    }));
  }

  async createStatement(access: AccessContext, input: CreateBankStatementDto) {
    this.assertReconcile(access);
    if (input.periodEnd < input.periodStart) throw new BadRequestException("The statement period ends before it starts");
    const bank = await this.findAccount(access, input.bankAccountId);
    const saved = await this.prisma.bankStatement.create({
      data: {
        companyId: bank.companyId,
        bankAccountId: bank.id,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        statementEnding: input.statementEnding,
        createdByUserId: access.userId,
      },
    });
    return { id: saved.id, status: saved.status };
  }

  async statement(access: AccessContext, id: string) {
    const statement = await this.findStatement(access, id);
    const lines = await this.prisma.bankStatementLine.findMany({ where: { statementId: id }, orderBy: { lineDate: "asc" } });
    const ledger = await this.ledgerLines(statement);
    const book = await this.net(statement.bankAccount.ledgerAccountId, { to: statement.periodEnd });
    const ending = signedUnits(moneyText(statement.statementEnding));
    const unmatchedStatement = lines.filter((line) => !line.matchedJournalLineId).reduce((sum, line) => sum + signedUnits(moneyText(line.amount)), 0n);
    const matchedIds = new Set(lines.map((line) => line.matchedJournalLineId).filter((value): value is string => Boolean(value)));
    const unmatchedLedger = ledger.filter((line) => !matchedIds.has(line.id)).reduce((sum, line) => sum + line.net, 0n);
    return {
      id: statement.id,
      status: statement.status,
      accountName: statement.bankAccount.accountName,
      statementEnding: formatMoneyUnits(ending),
      bookBalance: formatMoneyUnits(book),
      unmatchedStatement: formatMoneyUnits(unmatchedStatement),
      unmatchedLedger: formatMoneyUnits(unmatchedLedger),
      difference: formatMoneyUnits(ending - book),
      lines: lines.map((line) => ({
        id: line.id,
        lineDate: line.lineDate.toISOString().slice(0, 10),
        description: line.description,
        amount: moneyText(line.amount),
        reference: line.reference,
        source: line.source,
        matchedJournalLineId: line.matchedJournalLineId,
      })),
      ledger: ledger.map((line) => ({ id: line.id, date: line.date, description: line.description, amount: formatMoneyUnits(line.net), matched: matchedIds.has(line.id) })),
      suggestions: this.suggestions(lines, ledger),
    };
  }

  async addLine(access: AccessContext, id: string, input: BankStatementLineDto) {
    const statement = await this.editableStatement(access, id);
    this.assertPeriod(statement, input.lineDate);
    const saved = await this.prisma.bankStatementLine.create({
      data: {
        companyId: statement.companyId,
        statementId: id,
        lineDate: new Date(input.lineDate),
        description: input.description.trim(),
        amount: input.amount,
        reference: input.reference?.trim() || null,
        source: "manual",
      },
    });
    return { id: saved.id };
  }

  async importCsv(access: AccessContext, id: string, input: ImportStatementDto) {
    const statement = await this.editableStatement(access, id);
    const rows = parseCsv(input.csv);
    if (rows.length === 0) throw new BadRequestException("The statement file has no lines");
    for (const row of rows) this.assertPeriod(statement, row.lineDate);
    await this.prisma.bankStatementLine.createMany({
      data: rows.map((row) => ({
        companyId: statement.companyId,
        statementId: id,
        lineDate: new Date(row.lineDate),
        description: row.description,
        amount: row.amount,
        reference: row.reference,
        source: "csv" as const,
      })),
    });
    return { imported: rows.length };
  }

  async match(access: AccessContext, id: string, input: MatchStatementDto) {
    const statement = await this.editableStatement(access, id);
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: input.statementLineId, statementId: id } });
    if (!line) throw new NotFoundException("Statement line was not found");
    if (line.matchedJournalLineId) throw new ConflictException("This statement line is already matched");
    const ledger = await this.ledgerLines(statement);
    const journalLine = ledger.find((candidate) => candidate.id === input.journalLineId);
    if (!journalLine) throw new NotFoundException("Ledger line was not found");
    const taken = await this.prisma.bankStatementLine.findFirst({ where: { matchedJournalLineId: journalLine.id } });
    if (taken) throw new ConflictException("This ledger line is already matched");
    if (journalLine.net !== signedUnits(moneyText(line.amount))) throw new BadRequestException("The amounts do not match");
    await this.prisma.bankStatementLine.update({ where: { id: line.id }, data: { matchedJournalLineId: journalLine.id } });
    await this.audit.record({ actorUserId: access.userId, action: "banking.matched", entityType: "bank_statement", entityId: id, newValues: { statementLineId: line.id, journalLineId: journalLine.id } });
    return { matched: true };
  }

  async adjust(access: AccessContext, id: string, input: BankAdjustmentDto, correlationId?: string) {
    const statement = await this.editableStatement(access, id);
    this.assertPeriod(statement, input.accountingDate);
    const branchId = await this.postingBranch(statement.companyId, statement.bankAccount.branchId);
    const bank = statement.bankAccount.ledgerAccountId;
    const other = await this.accountByCode(statement.companyId, input.kind === "charge" ? "6600" : "4900");
    const amount = formatMoneyUnits(parseMoney(input.amount));
    const lineId = randomUUID();
    const journalId = input.kind === "charge"
      ? await this.postPair(access, lineId, "bank_charge", input.accountingDate, "Bank charge", other.id, branchId, bank, branchId, amount, correlationId)
      : await this.postPair(access, lineId, "bank_interest", input.accountingDate, "Bank interest", bank, branchId, other.id, branchId, amount, correlationId);
    const signed = input.kind === "charge" ? `-${amount}` : amount;
    await this.prisma.bankStatementLine.create({
      data: {
        id: lineId,
        companyId: statement.companyId,
        statementId: id,
        lineDate: new Date(input.accountingDate),
        description: input.kind === "charge" ? "Bank charge" : "Bank interest",
        amount: signed,
        source: "adjustment",
        adjustmentJournalId: journalId,
      },
    });
    return { id: lineId, journalId };
  }

  async approve(access: AccessContext, id: string, correlationId?: string) {
    this.assertReconcile(access);
    const statement = await this.findStatement(access, id);
    if (statement.status !== "draft") throw new ConflictException("This reconciliation is locked");
    if (statement.createdByUserId === access.userId) throw new ForbiddenException("You cannot approve a document you created");
    await this.prisma.bankStatement.update({ where: { id }, data: { status: "locked", approvedByUserId: access.userId } });
    await this.audit.record({ actorUserId: access.userId, action: "banking.reconciliation_locked", entityType: "bank_statement", entityId: id, correlationId });
    return { id, status: "locked" as const };
  }

  private suggestions(lines: Array<{ id: string; lineDate: Date; amount: Prisma.Decimal; matchedJournalLineId: string | null }>, ledger: LedgerLine[]) {
    const used = new Set(lines.map((line) => line.matchedJournalLineId).filter((value): value is string => Boolean(value)));
    return lines.filter((line) => !line.matchedJournalLineId).flatMap((line) => {
      const amount = signedUnits(moneyText(line.amount));
      const candidates = ledger.filter((journalLine) => !used.has(journalLine.id) && journalLine.net === amount && daysApart(line.lineDate, journalLine.rawDate) <= 3);
      if (candidates.length !== 1) return [];
      used.add(candidates[0].id);
      return [{ statementLineId: line.id, journalLineId: candidates[0].id }];
    });
  }

  private async ledgerLines(statement: { companyId: string; periodStart: Date; periodEnd: Date; bankAccount: { ledgerAccountId: string } }) {
    const rows = await this.prisma.journalLine.findMany({
      where: {
        accountId: statement.bankAccount.ledgerAccountId,
        journal: { companyId: statement.companyId, status: "posted", accountingDate: { gte: statement.periodStart, lte: statement.periodEnd } },
      },
      include: { journal: true },
    });
    return rows.map((row) => ({
      id: row.id,
      date: row.journal.accountingDate.toISOString().slice(0, 10),
      rawDate: row.journal.accountingDate,
      description: row.description ?? row.journal.description,
      net: parseMoney(row.debit.toFixed(4)) - parseMoney(row.credit.toFixed(4)),
    }));
  }

  private async postPair(
    access: AccessContext,
    documentId: string,
    documentType: string,
    accountingDate: string,
    description: string,
    debitAccountId: string,
    debitBranchId: string,
    creditAccountId: string,
    creditBranchId: string,
    amount: string,
    correlationId?: string,
  ) {
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "banking",
      sourceDocumentType: documentType,
      sourceDocumentId: documentId,
      accountingDate,
      description,
      lines: [
        { accountId: debitAccountId, branchId: debitBranchId, debit: amount, credit: "0", description },
        { accountId: creditAccountId, branchId: creditBranchId, debit: "0", credit: amount, description },
      ],
    }, correlationId);
    return journal.id;
  }

  private async net(accountId: string, options: { branchId?: string; to?: Date } = {}) {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        ...(options.branchId ? { branchId: options.branchId } : {}),
        journal: { status: "posted", ...(options.to ? { accountingDate: { lte: options.to } } : {}) },
      },
      select: { debit: true, credit: true },
    });
    return signedSum(lines);
  }

  private async editableStatement(access: AccessContext, id: string) {
    this.assertReconcile(access);
    const statement = await this.findStatement(access, id);
    if (statement.status !== "draft") throw new ConflictException("This reconciliation is locked");
    return statement;
  }

  private assertPeriod(statement: { periodStart: Date; periodEnd: Date }, value: string) {
    const date = new Date(value);
    if (date < statement.periodStart || date > statement.periodEnd) throw new BadRequestException("The date is outside the statement period");
  }

  private async findStatement(access: AccessContext, id: string) {
    const companyId = await this.companyId(access.userId);
    const statement = await this.prisma.bankStatement.findFirst({
      where: { id, companyId },
      include: { bankAccount: true },
    });
    if (!statement || !(await this.visibleAccount(access, statement.bankAccount))) throw new NotFoundException("Bank statement was not found");
    return statement;
  }

  private async findAccount(access: AccessContext, id: string) {
    const companyId = await this.companyId(access.userId);
    const account = await this.prisma.bankAccount.findFirst({ where: { id, companyId } });
    if (!account || !(await this.visibleAccount(access, account))) throw new NotFoundException("Bank account was not found");
    return account;
  }

  private async visibleAccount(access: AccessContext, account: { branchId: string | null }) {
    if (!account.branchId) return access.companyWide;
    if (access.companyWide && access.scope.type === "company") return true;
    const branchIds = branchIdFilter(access.scope);
    return !branchIds || branchIds.in.includes(account.branchId);
  }

  private accountWhere(access: AccessContext, companyId: string): Prisma.BankAccountWhereInput {
    if (access.companyWide && access.scope.type === "company") return { companyId };
    const branchIds = branchIdFilter(access.scope);
    const branchFilter = branchIds ?? { in: [] as string[] };
    if (access.companyWide) return { companyId, OR: [{ branchId: null }, { branchId: branchFilter }] };
    return { companyId, branchId: branchFilter };
  }

  private async findDrawer(access: AccessContext, id: string) {
    const companyId = await this.companyId(access.userId);
    const drawer = await this.prisma.cashDrawer.findFirst({ where: { id, companyId } });
    if (!drawer) throw new NotFoundException("Cash drawer was not found");
    assertBranchAllowed(access.scope, drawer.branchId);
    return drawer;
  }

  private async findCount(access: AccessContext, id: string) {
    const companyId = await this.companyId(access.userId);
    const count = await this.prisma.cashCount.findFirst({ where: { id, companyId }, include: { drawer: true } });
    if (!count) throw new NotFoundException("Cash count was not found");
    assertBranchAllowed(access.scope, count.branchId);
    return count;
  }

  private async findTransfer(access: AccessContext, id: string) {
    const companyId = await this.companyId(access.userId);
    const transfer = await this.prisma.cashTransfer.findFirst({ where: { id, companyId } });
    if (!transfer) throw new NotFoundException("Transfer was not found");
    assertBranchAllowed(access.scope, transfer.sourceBranchId);
    assertBranchAllowed(access.scope, transfer.destinationBranchId);
    return transfer;
  }

  private async cashAccount(companyId: string, id: string) {
    const account = await this.prisma.account.findFirst({ where: { id, companyId, deletedAt: null, isActive: true } });
    if (!account || account.accountCode === "1110" || (account.accountSubtype !== "cash" && account.accountSubtype !== "bank")) {
      throw new BadRequestException("Choose a cash or bank account");
    }
    if (account.accountType === "revenue" || account.accountType === "expense") {
      throw new BadRequestException("Internal transfers cannot use an income or expense account");
    }
    return account;
  }

  private assertTransferLegs(kind: CreateCashTransferDto["kind"], source: string | null, destination: string | null) {
    if (kind === "deposit" && (source !== "cash" || destination !== "bank")) throw new BadRequestException("A deposit moves cash into a bank account");
    if (kind === "drawer" && (source !== "cash" || destination !== "cash")) throw new BadRequestException("A drawer transfer stays in cash");
    if (kind !== "deposit" && kind !== "drawer" && kind !== "account_to_account" && (source !== "bank" || destination !== "bank")) {
      throw new BadRequestException("A bank transfer stays in bank accounts");
    }
  }

  private async postingBranch(companyId: string, branchId: string | null) {
    if (branchId) return branchId;
    const office = await this.prisma.branch.findFirst({ where: { companyId, isHeadOffice: true, deletedAt: null } });
    if (!office) throw new NotFoundException("Head office was not found");
    return office.id;
  }

  private async nextBankCode(companyId: string) {
    const rows = await this.prisma.account.findMany({ where: { companyId, accountCode: { startsWith: "11" } }, select: { accountCode: true } });
    const numbers = rows.map((row) => Number(row.accountCode)).filter((value) => value >= 1101 && value < 1200 && value !== 1110);
    let next = numbers.length === 0 ? 1101 : Math.max(...numbers) + 1;
    if (next === 1110) next = 1111;
    return String(next);
  }

  private async accountByCode(companyId: string, code: string) {
    const account = await this.prisma.account.findUnique({ where: { companyId_accountCode: { companyId, accountCode: code } } });
    if (!account) throw new NotFoundException(`Account ${code} was not found`);
    return account;
  }

  private async companyId(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { companyId: true } });
    return user.companyId;
  }

  private assertTransfer(access: AccessContext) {
    if (!access.permissions.includes("banking.transfer")) throw new ForbiddenException("Transfer is not authorized");
  }

  private assertReconcile(access: AccessContext) {
    if (!access.permissions.includes("banking.reconcile")) throw new ForbiddenException("Reconciliation is not authorized");
  }

  private serializeAccount(row: { id: string; bankName: string; accountName: string; maskedAccountNumber: string; currency: string; branchId: string | null; ledgerAccountId: string; branch: { name: string } | null; ledgerAccount: { accountCode: string } }) {
    return {
      id: row.id,
      bankName: row.bankName,
      accountName: row.accountName,
      maskedAccountNumber: row.maskedAccountNumber,
      currency: row.currency,
      branchId: row.branchId,
      branchName: row.branch?.name ?? "Company",
      accountCode: row.ledgerAccount.accountCode,
      ledgerAccountId: row.ledgerAccountId,
    };
  }

  private serializeCount(row: { id: string; countNumber: string; status: string; countedAmount: Prisma.Decimal; bookAmount: Prisma.Decimal; varianceAmount: Prisma.Decimal }) {
    return {
      id: row.id,
      countNumber: row.countNumber,
      status: row.status,
      countedAmount: moneyText(row.countedAmount),
      bookAmount: moneyText(row.bookAmount),
      varianceAmount: moneyText(row.varianceAmount),
    };
  }
}

type LedgerLine = { id: string; date: string; rawDate: Date; description: string | null; net: bigint };

function signedSum(lines: Array<{ debit: { toFixed(digits: number): string }; credit: { toFixed(digits: number): string } }>) {
  return lines.reduce((sum, line) => sum + parseMoney(line.debit.toFixed(4)) - parseMoney(line.credit.toFixed(4)), 0n);
}

function signedUnits(value: string) {
  const negative = value.startsWith("-");
  const units = parseMoney(negative ? value.slice(1) : value);
  return negative ? -units : units;
}

function maskAccountNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) throw new BadRequestException("Account number needs four digits");
  return `****${digits.slice(-4)}`;
}

function parseCsv(csv: string) {
  const rows = csv.trim().split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  const start = rows[0]?.toLowerCase().includes("date") ? 1 : 0;
  return rows.slice(start).map((row) => {
    const [lineDate, description, amount, reference] = row.split(",").map((part) => part.trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lineDate ?? "") || !/^-?\d+(\.\d{1,4})?$/.test(amount ?? "")) {
      throw new BadRequestException("Each statement row needs a date, description, and amount");
    }
    return { lineDate, description: description || "Statement line", amount, reference: reference || null };
  });
}

function daysApart(left: Date, right: Date) {
  return Math.abs(Math.round((left.getTime() - right.getTime()) / DAY));
}

function monthStart() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthEnd() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}
