import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { formatMoneyUnits, parseMoney } from "../accounting/money";
import { AccountingPostingService } from "../accounting/posting.service";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, branchIdFilter } from "../organization/branch-scope";
import { CreateSalaryPaymentDto, CreateSalarySummaryDto } from "./payroll.dto";

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly posting: AccountingPostingService,
    private readonly audit: AuditService,
  ) {}

  async list(access: AccessContext) {
    this.require(access, "payroll.view");
    const companyId = await this.companyId(access);
    const branch = branchIdFilter(access.scope);
    const rows = await this.prisma.salarySummary.findMany({
      where: { companyId, ...(branch ? { branchId: branch } : {}) },
      include: { branch: true, department: true, deductions: { include: { account: true } }, allocations: true },
      orderBy: { periodEnd: "desc" },
    });
    return rows.map((row) => serializeSummary(row));
  }

  async outstanding(access: AccessContext) {
    this.require(access, "payroll.view");
    const companyId = await this.companyId(access);
    const branch = branchIdFilter(access.scope);
    const rows = await this.prisma.salarySummary.findMany({
      where: { companyId, status: "posted", ...(branch ? { branchId: branch } : {}) },
      include: { branch: true, allocations: true },
      orderBy: { periodEnd: "asc" },
    });
    const items = rows
      .map((row) => {
        const paid = row.allocations.reduce((sum, item) => sum + parseMoney(item.amount.toFixed(4)), 0n);
        const open = parseMoney(row.netAmount.toFixed(4)) - paid;
        return {
          id: row.id,
          summaryNumber: row.summaryNumber,
          branchName: row.branch.name,
          periodEnd: iso(row.periodEnd),
          netAmount: row.netAmount.toFixed(4),
          outstanding: formatMoneyUnits(open),
        };
      })
      .filter((row) => signed(row.outstanding) > 0n);
    const totalOutstanding = items.reduce((sum, row) => sum + signed(row.outstanding), 0n);
    const control = await this.accountNet(companyId, "2300", branch);
    return { rows: items, totalOutstanding: formatMoneyUnits(totalOutstanding), control: formatMoneyUnits(control) };
  }

  async createSummary(access: AccessContext, input: CreateSalarySummaryDto) {
    this.require(access, "payroll.view");
    this.require(access, "payroll.create");
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access);
    if (input.periodEnd < input.periodStart) throw new BadRequestException("The payroll period end is before the start");
    const gross = parseMoney(input.grossAmount);
    const net = parseMoney(input.netAmount);
    if (gross <= 0n || net < 0n) throw new BadRequestException("Gross and net amounts must be valid");
    const deductionTotal = input.deductions.reduce((sum, line) => sum + parseMoney(line.amount), 0n);
    if (gross !== net + deductionTotal) throw new BadRequestException("Gross must equal net plus deductions");
    for (const line of input.deductions) {
      await this.deductionAccount(companyId, line.accountId);
      if (parseMoney(line.amount) <= 0n) throw new BadRequestException("Each deduction must be greater than zero");
    }
    if (input.departmentId) await this.assertDepartment(companyId, input.departmentId, input.branchId);
    const file = Buffer.from(input.summaryFileBase64, "base64");
    if (file.length === 0) throw new BadRequestException("A supporting payroll summary is required");
    const saved = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.branchId, "salary_summary");
      return tx.salarySummary.create({
        data: {
          companyId,
          branchId: input.branchId,
          departmentId: input.departmentId,
          summaryNumber: number.documentNumber,
          periodStart: day(input.periodStart),
          periodEnd: day(input.periodEnd),
          grossAmount: input.grossAmount,
          netAmount: input.netAmount,
          approvalReference: input.approvalReference.trim(),
          summaryFileName: input.summaryFileName.trim(),
          summaryFileData: file,
          createdByUserId: access.userId,
          deductions: {
            create: input.deductions.map((line) => ({
              accountId: line.accountId,
              description: line.description.trim(),
              amount: line.amount,
            })),
          },
        },
        include: { branch: true, department: true, deductions: { include: { account: true } }, allocations: true },
      });
    });
    await this.audit.record({ actorUserId: access.userId, action: "payroll.summary_created", entityType: "salary_summary", entityId: saved.id, newValues: { summaryNumber: saved.summaryNumber } });
    return serializeSummary(saved);
  }

  async approveSummary(access: AccessContext, id: string, correlationId?: string) {
    this.require(access, "payroll.view");
    this.require(access, "payroll.approve");
    const summary = await this.findSummary(access, id);
    if (summary.status !== "draft") throw new BadRequestException("Only a draft summary can be approved");
    if (summary.createdByUserId === access.userId) throw new ForbiddenException("The approver must be a different person");
    const salary = await this.account(summary.companyId, "6000");
    const payable = await this.account(summary.companyId, "2300");
    const lines = [
      { accountId: salary.id, branchId: summary.branchId, departmentId: summary.departmentId ?? undefined, debit: summary.grossAmount.toFixed(4), credit: "0", description: summary.summaryNumber },
      ...summary.deductions.map((line) => ({
        accountId: line.accountId,
        branchId: summary.branchId,
        departmentId: summary.departmentId ?? undefined,
        debit: "0",
        credit: line.amount.toFixed(4),
        description: line.description,
      })),
      { accountId: payable.id, branchId: summary.branchId, departmentId: summary.departmentId ?? undefined, debit: "0", credit: summary.netAmount.toFixed(4), description: summary.summaryNumber },
    ];
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "payroll",
      sourceDocumentType: "salary_summary",
      sourceDocumentId: summary.id,
      accountingDate: iso(summary.periodEnd),
      description: `Payroll ${summary.summaryNumber}`,
      lines,
    }, correlationId);
    const saved = await this.prisma.salarySummary.update({
      where: { id: summary.id },
      data: { status: "posted", journalEntryId: journal.id, approvedByUserId: access.userId },
      include: { branch: true, department: true, deductions: { include: { account: true } }, allocations: true },
    });
    await this.audit.record({ actorUserId: access.userId, action: "payroll.summary_approved", entityType: "salary_summary", entityId: summary.id, correlationId });
    return serializeSummary(saved);
  }

  async createPayment(access: AccessContext, input: CreateSalaryPaymentDto, correlationId?: string) {
    this.require(access, "payroll.view");
    this.require(access, "payroll.pay");
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access);
    const paymentAccount = await this.paymentAccount(companyId, input.paymentAccountId);
    let total = 0n;
    const summaries = [];
    for (const allocation of input.allocations) {
      const summary = await this.findSummary(access, allocation.summaryId);
      if (summary.status !== "posted") throw new BadRequestException("Only a posted summary can be paid");
      if (summary.branchId !== input.branchId) throw new BadRequestException("Payment allocations must stay on one branch");
      const paid = summary.allocations.reduce((sum, item) => sum + parseMoney(item.amount.toFixed(4)), 0n);
      const open = parseMoney(summary.netAmount.toFixed(4)) - paid;
      const amount = parseMoney(allocation.amount);
      if (amount <= 0n || amount > open) throw new BadRequestException("The allocation exceeds the outstanding payable");
      total += amount;
      summaries.push({ summary, amount });
    }
    if (total <= 0n) throw new BadRequestException("Payment total must be greater than zero");
    const payable = await this.account(companyId, "2300");
    const number = await this.prisma.$transaction((tx) => this.documentNumbers.allocateWith(tx, input.branchId, "salary_payment"));
    const paymentId = randomUUID();
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "payroll",
      sourceDocumentType: "salary_payment",
      sourceDocumentId: paymentId,
      accountingDate: input.paymentDate,
      description: `Salary payment ${number.documentNumber}`,
      lines: [
        { accountId: payable.id, branchId: input.branchId, debit: formatMoneyUnits(total), credit: "0", description: input.bankReference.trim() },
        { accountId: paymentAccount.id, branchId: input.branchId, debit: "0", credit: formatMoneyUnits(total), description: input.bankReference.trim() },
      ],
    }, correlationId);
    const payment = await this.prisma.salaryPayment.create({
      data: {
        id: paymentId,
        companyId,
        branchId: input.branchId,
        paymentNumber: number.documentNumber,
        paymentDate: day(input.paymentDate),
        total: formatMoneyUnits(total),
        paymentAccountId: paymentAccount.id,
        bankReference: input.bankReference.trim(),
        journalEntryId: journal.id,
        createdByUserId: access.userId,
        allocations: {
          create: summaries.map((item) => ({ summaryId: item.summary.id, amount: formatMoneyUnits(item.amount) })),
        },
      },
      include: { allocations: true },
    });
    await this.audit.record({ actorUserId: access.userId, action: "payroll.payment_created", entityType: "salary_payment", entityId: payment.id, newValues: { paymentNumber: payment.paymentNumber }, correlationId });
    return { id: payment.id, paymentNumber: payment.paymentNumber, total: payment.total.toFixed(4) };
  }

  private async findSummary(access: AccessContext, id: string) {
    const companyId = await this.companyId(access);
    const summary = await this.prisma.salarySummary.findFirst({
      where: { id, companyId },
      include: { deductions: true, allocations: true, branch: true, department: true },
    });
    if (!summary) throw new NotFoundException("Salary summary was not found");
    assertBranchAllowed(access.scope, summary.branchId);
    return summary;
  }

  private async deductionAccount(companyId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, companyId, deletedAt: null } });
    if (!account || !account.isPostable || account.accountType !== "liability" || (account.accountSubtype !== "payroll" && account.accountSubtype !== "tax")) {
      throw new BadRequestException("Choose a postable payroll or tax liability for each deduction");
    }
    return account;
  }

  private async paymentAccount(companyId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, companyId, deletedAt: null } });
    if (!account || !account.isPostable || (account.accountSubtype !== "cash" && account.accountSubtype !== "bank")) {
      throw new BadRequestException("Choose a postable cash or bank account");
    }
    return account;
  }

  private async account(companyId: string, accountCode: string) {
    const account = await this.prisma.account.findFirst({ where: { companyId, accountCode, deletedAt: null } });
    if (!account) throw new NotFoundException(`Account ${accountCode} was not found`);
    return account;
  }

  private async accountNet(companyId: string, accountCode: string, branch: { in: string[] } | undefined) {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        ...(branch ? { branchId: branch } : {}),
        account: { companyId, accountCode },
        journal: { companyId, status: "posted" },
      },
    });
    return lines.reduce((sum, line) => sum + parseMoney(line.credit.toFixed(4)) - parseMoney(line.debit.toFixed(4)), 0n);
  }

  private async assertDepartment(companyId: string, departmentId: string, branchId: string) {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, companyId, deletedAt: null, OR: [{ branchId: null }, { branchId }] },
    });
    if (!department) throw new NotFoundException("Department was not found");
  }

  private require(access: AccessContext, permission: string) {
    if (!access.permissions.includes(permission)) throw new ForbiddenException("This payroll action is not available for this sign-in");
  }

  private async companyId(access: AccessContext) {
    const user = await this.prisma.user.findUnique({ where: { id: access.userId }, select: { companyId: true } });
    if (!user) throw new NotFoundException("User was not found");
    return user.companyId;
  }
}

function serializeSummary(row: {
  id: string;
  summaryNumber: string;
  branchId: string;
  departmentId: string | null;
  periodStart: Date;
  periodEnd: Date;
  grossAmount: { toFixed(digits: number): string };
  netAmount: { toFixed(digits: number): string };
  approvalReference: string;
  summaryFileName: string;
  status: string;
  createdByUserId: string;
  branch?: { name: string };
  department?: { name: string } | null;
  deductions: { accountId: string; description: string; amount: { toFixed(digits: number): string }; account?: { accountCode: string } }[];
  allocations: { amount: { toFixed(digits: number): string } }[];
}) {
  const paid = row.allocations.reduce((sum, item) => sum + parseMoney(item.amount.toFixed(4)), 0n);
  const outstanding = parseMoney(row.netAmount.toFixed(4)) - paid;
  return {
    id: row.id,
    summaryNumber: row.summaryNumber,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    departmentId: row.departmentId,
    departmentName: row.department?.name ?? null,
    periodStart: iso(row.periodStart),
    periodEnd: iso(row.periodEnd),
    grossAmount: row.grossAmount.toFixed(4),
    netAmount: row.netAmount.toFixed(4),
    approvalReference: row.approvalReference,
    summaryFileName: row.summaryFileName,
    status: row.status,
    createdByUserId: row.createdByUserId,
    outstanding: formatMoneyUnits(outstanding),
    deductions: row.deductions.map((line) => ({
      accountId: line.accountId,
      accountCode: line.account?.accountCode ?? null,
      description: line.description,
      amount: line.amount.toFixed(4),
    })),
  };
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function iso(value: Date) {
  return value.toISOString().slice(0, 10);
}

function signed(value: string) {
  return value.startsWith("-") ? -parseMoney(value.slice(1)) : parseMoney(value);
}

