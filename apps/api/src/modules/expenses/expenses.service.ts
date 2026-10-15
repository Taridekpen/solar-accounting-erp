import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, forwardRef } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { NotificationsService } from "../admin/notifications.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { AccountingPostingService } from "../accounting/posting.service";
import { formatMoneyUnits, parseMoney } from "../accounting/money";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, branchIdFilter } from "../organization/branch-scope";
import { PageQueryDto, pageWindow } from "../organization/dto/page-query.dto";
import { moneyText } from "../sales/sales-math";
import { decodeBase64ToBytes, mimeTypeFromFileName } from "../../common/base64-bytes";
import { CreateExpenseBudgetDto, CreateExpenseDto, CreateExpensePolicyDto, ExpenseReportQueryDto, PayExpenseDto } from "./expenses.dto";

const BLOCKED_SUBTYPES = new Set(["inventory", "fixed_asset", "contra_asset", "grni"]);

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly posting: AccountingPostingService,
    private readonly audit: AuditService,
    @Optional() @Inject(forwardRef(() => NotificationsService)) private readonly notifications?: NotificationsService,
  ) {}

  async list(access: AccessContext, query: PageQueryDto) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const where = { companyId, ...(branchIds ? { branchId: branchIds } : {}) };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        include: { category: true, branch: true, department: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    return { data: rows.map(serializeExpense), page: query.page ?? 1, pageSize: take, total };
  }

  async categories(access: AccessContext) {
    const rows = await this.prisma.expenseCategory.findMany({
      where: { companyId: await this.companyId(access.userId), status: "active" },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, accountId: row.accountId }));
  }

  async create(access: AccessContext, input: CreateExpenseDto) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    const category = await this.category(companyId, input.categoryId);
    await this.assertLinks(companyId, input);
    const receipt = decodeReceipt(input.receiptBase64);
    const expense = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.branchId, "expense");
      return tx.expense.create({
        data: {
          companyId,
          branchId: input.branchId,
          departmentId: input.departmentId,
          categoryId: category.id,
          expenseNumber: number.documentNumber,
          expenseDate: new Date(input.expenseDate),
          description: input.description.trim(),
          amount: input.amount,
          taxAmount: input.taxAmount ?? "0.0000",
          supplierId: input.supplierId,
          employeeId: input.employeeId,
          projectId: input.projectId,
          receiptName: input.receiptName.trim(),
          receiptData: receipt,
          createdByUserId: access.userId,
        },
        include: { category: true, branch: true, department: true },
      });
    });
    return serializeExpense(expense);
  }

  async submit(access: AccessContext, id: string, correlationId?: string) {
    const expense = await this.find(access, id);
    if (expense.status !== "draft") throw new BadRequestException("Only a draft expense can be submitted");
    if (expense.createdByUserId !== access.userId) throw new ForbiddenException("Only the creator can submit this expense");
    if (expense.receiptData.length === 0) throw new BadRequestException("A supporting receipt is required");
    if (parseMoney(expense.amount.toFixed(4)) <= 0n) throw new BadRequestException("Amount must be greater than zero");
    const saved = await this.prisma.expense.update({
      where: { id },
      data: { status: "pending_approval" },
      include: { category: true, branch: true, department: true },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "expenses.submitted",
      entityType: "expense",
      entityId: id,
      newValues: { expenseNumber: expense.expenseNumber },
      correlationId,
    });
    await this.notifications?.notifyApprovers({
      companyId: expense.companyId,
      branchId: expense.branchId,
      permissionCode: "expenses.approve",
      title: "Expense approval requested",
      body: `${expense.expenseNumber} awaits approval.`,
      entityType: "expense",
      entityId: id,
      linkPath: "/expenses",
      excludeUserId: access.userId,
    });
    return serializeExpense(saved);
  }

  async approve(access: AccessContext, id: string, correlationId?: string) {
    const expense = await this.find(access, id);
    if (expense.status !== "pending_approval") throw new BadRequestException("Only a submitted expense can be approved");
    this.assertOtherUser(access, expense.createdByUserId, expense.approvals.map((row) => row.actorUserId));
    const matched = await this.matchedPolicies(expense);
    if (matched.length === 0) throw new BadRequestException("No approval policy matches this expense");
    const nextLevel = matched.map((policy) => policy.level).filter((level) => level > expense.approvalLevel).sort((left, right) => left - right)[0];
    if (!nextLevel) throw new BadRequestException("This expense is already fully approved");
    const choices = matched.filter((policy) => policy.level === nextLevel);
    if (!choices.some((policy) => this.actorMatches(policy, access))) {
      throw new ForbiddenException("This amount is above the branch approval limit");
    }
    await this.assertBudget(expense, choices.some((policy) => policy.requiresBudget));
    const total = expenseTotal(expense);
    await this.prisma.expenseApproval.create({
      data: { companyId: expense.companyId, expenseId: expense.id, level: nextLevel, actorUserId: access.userId, decision: "approved", amount: formatMoneyUnits(total) },
    });
    const later = matched.some((policy) => policy.level > nextLevel);
    let journalId: string | null = null;
    if (!later) {
      journalId = await this.postAccrual(access, expense, correlationId);
    }
    const saved = await this.prisma.expense.update({
      where: { id },
      data: later
        ? { approvalLevel: nextLevel }
        : { approvalLevel: nextLevel, status: "approved", accrualJournalId: journalId },
      include: { category: true, branch: true, department: true },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "expenses.approved",
      entityType: "expense",
      entityId: id,
      newValues: { level: nextLevel, posted: !later },
      correlationId,
    });
    await this.notifications?.notifyOutcome({
      companyId: expense.companyId,
      recipientUserId: expense.createdByUserId,
      title: later ? "Expense approval progressed" : "Expense approved",
      body: `${expense.expenseNumber} was approved at level ${nextLevel}.`,
      entityType: "expense",
      entityId: id,
      linkPath: "/expenses",
    });
    return serializeExpense(saved);
  }

  async reject(access: AccessContext, id: string, correlationId?: string) {
    const expense = await this.find(access, id);
    if (expense.status !== "pending_approval") throw new BadRequestException("Only a submitted expense can be rejected");
    this.assertOtherUser(access, expense.createdByUserId, []);
    if (!access.permissions.includes("expenses.approve")) throw new ForbiddenException("Approval is not authorized");
    await this.prisma.expenseApproval.create({
      data: {
        companyId: expense.companyId,
        expenseId: expense.id,
        level: expense.approvalLevel + 1,
        actorUserId: access.userId,
        decision: "rejected",
        amount: formatMoneyUnits(expenseTotal(expense)),
      },
    });
    const saved = await this.prisma.expense.update({
      where: { id },
      data: { status: "rejected" },
      include: { category: true, branch: true, department: true },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "expenses.rejected",
      entityType: "expense",
      entityId: id,
      correlationId,
    });
    await this.notifications?.notifyOutcome({
      companyId: expense.companyId,
      recipientUserId: expense.createdByUserId,
      title: "Expense rejected",
      body: `${expense.expenseNumber} was rejected.`,
      entityType: "expense",
      entityId: id,
      linkPath: "/expenses",
    });
    return serializeExpense(saved);
  }

  async pay(access: AccessContext, id: string, input: PayExpenseDto, correlationId?: string) {
    const expense = await this.find(access, id);
    if (expense.status === "paid") throw new ConflictException("This expense has already been paid");
    if (expense.status !== "approved") throw new BadRequestException("Only an approved expense can be paid");
    this.assertOtherUser(access, expense.createdByUserId, []);
    if (!access.permissions.includes("expenses.pay")) throw new ForbiddenException("Payment is not authorized");
    const account = await this.prisma.account.findFirst({
      where: { id: input.paymentAccountId, companyId: expense.companyId, deletedAt: null, isActive: true },
    });
    if (!account || !account.isPostable || account.accountSubtype !== "cash") {
      throw new BadRequestException("Payment must use a postable cash account");
    }
    const total = formatMoneyUnits(expenseTotal(expense));
    const accrual = await this.account(expense.companyId, "2200");
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "expenses",
      sourceDocumentType: "expense_payment",
      sourceDocumentId: expense.id,
      accountingDate: input.paymentDate,
      description: `Pay ${expense.expenseNumber}`,
      lines: [
        { accountId: accrual.id, branchId: expense.branchId, debit: total, credit: "0", description: expense.description },
        { accountId: account.id, branchId: expense.branchId, debit: "0", credit: total, description: expense.description },
      ],
    }, correlationId);
    const saved = await this.prisma.expense.update({
      where: { id },
      data: { status: "paid", paymentJournalId: journal.id, paymentAccountId: account.id },
      include: { category: true, branch: true, department: true },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "expenses.paid",
      entityType: "expense",
      entityId: id,
      newValues: { journalId: journal.id },
      correlationId,
    });
    return serializeExpense(saved);
  }

  async receipt(access: AccessContext, id: string) {
    const expense = await this.find(access, id);
    const content = Buffer.from(expense.receiptData);
    return {
      receiptName: expense.receiptName,
      mimeType: mimeTypeFromFileName(expense.receiptName),
      content,
    };
  }

  async createPolicy(access: AccessContext, input: CreateExpensePolicyDto) {
    if (!access.companyWide) throw new ForbiddenException("Company-wide approval is required");
    return this.prisma.expenseApprovalPolicy.create({
      data: {
        companyId: await this.companyId(access.userId),
        minAmount: input.minAmount,
        maxAmount: input.maxAmount,
        branchId: input.branchId,
        departmentId: input.departmentId,
        categoryId: input.categoryId,
        roleCode: input.roleCode,
        companyWide: input.companyWide ?? false,
        level: input.level,
        requiresBudget: input.requiresBudget ?? false,
      },
      select: { id: true, level: true, requiresBudget: true },
    });
  }

  async createBudget(access: AccessContext, input: CreateExpenseBudgetDto) {
    assertBranchAllowed(access.scope, input.branchId);
    if (!access.permissions.includes("expenses.approve")) throw new ForbiddenException("Approval is not authorized");
    return this.prisma.expenseBudget.create({
      data: {
        companyId: await this.companyId(access.userId),
        branchId: input.branchId,
        categoryId: input.categoryId,
        budgetMonth: new Date(input.budgetMonth),
        amount: input.amount,
      },
      select: { id: true, amount: true },
    });
  }

  async reports(access: AccessContext, query: ExpenseReportQueryDto) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const rows = await this.prisma.expense.findMany({
      where: {
        companyId,
        ...(branchIds ? { branchId: branchIds } : {}),
        ...(from || to ? { expenseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: { category: true, branch: true, department: true },
    });
    const recognized = rows.filter((row) => row.status === "approved" || row.status === "paid");
    const budgets = await this.prisma.expenseBudget.findMany({
      where: {
        companyId,
        ...(branchIds ? { branchId: branchIds } : {}),
        ...(from || to ? { budgetMonth: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: { category: true, branch: true },
    });
    return {
      byBranch: group(recognized, (row) => row.branch.name),
      byCategory: group(recognized, (row) => row.category.name),
      byDepartment: group(recognized, (row) => row.department?.name ?? "Unassigned"),
      monthly: group(recognized, (row) => row.expenseDate.toISOString().slice(0, 7)),
      projects: group(recognized.filter((row) => row.projectId), (row) => row.projectId ?? ""),
      pending: rows.filter((row) => row.status === "pending_approval").map(serializeExpense),
      unpaid: rows.filter((row) => row.status === "approved").map(serializeExpense),
      budgetVersusActual: budgets.map((budget) => {
        const actual = recognized
          .filter((row) => row.branchId === budget.branchId && row.categoryId === budget.categoryId && sameMonth(row.expenseDate, budget.budgetMonth))
          .reduce((sum, row) => sum + expenseTotal(row), 0n);
        return {
          branchName: budget.branch.name,
          categoryName: budget.category.name,
          budget: moneyText(budget.amount),
          actual: formatMoneyUnits(actual),
        };
      }),
    };
  }

  private async postAccrual(access: AccessContext, expense: ExpenseRecord, correlationId?: string) {
    const tax = parseMoney(expense.taxAmount.toFixed(4));
    const net = parseMoney(expense.amount.toFixed(4));
    const accrual = await this.account(expense.companyId, "2200");
    let debitAccountId = expense.category.accountId;
    if (expense.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: expense.projectId, companyId: expense.companyId } });
      if (!project) throw new NotFoundException("Project was not found");
      if (project.projectType === "residential" || project.projectType === "commercial" || project.projectType === "industrial" || project.projectType === "system_upgrade") {
        debitAccountId = (await this.account(expense.companyId, "1400")).id;
      }
    }
    const lines: Array<{ accountId: string; branchId: string; debit: string; credit: string; description: string; projectId?: string }> = [
      { accountId: debitAccountId, branchId: expense.branchId, debit: formatMoneyUnits(net), credit: "0", description: expense.description, projectId: expense.projectId ?? undefined },
    ];
    if (tax > 0n) {
      const prepaid = await this.account(expense.companyId, "1500");
      lines.push({ accountId: prepaid.id, branchId: expense.branchId, debit: formatMoneyUnits(tax), credit: "0", description: "Expense tax", projectId: expense.projectId ?? undefined });
    }
    lines.push({ accountId: accrual.id, branchId: expense.branchId, debit: "0", credit: formatMoneyUnits(net + tax), description: expense.description, projectId: expense.projectId ?? undefined });
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "expenses",
      sourceDocumentType: "expense_accrual",
      sourceDocumentId: expense.id,
      accountingDate: expense.expenseDate.toISOString().slice(0, 10),
      description: expense.expenseNumber,
      lines,
    }, correlationId);
    return journal.id;
  }

  private async assertBudget(expense: ExpenseRecord, required: boolean) {
    const month = monthStart(expense.expenseDate);
    const budget = await this.prisma.expenseBudget.findUnique({
      where: { branchId_categoryId_budgetMonth: { branchId: expense.branchId, categoryId: expense.categoryId, budgetMonth: month } },
    });
    if (required && !budget) throw new BadRequestException("This expense needs a budget");
    if (!budget) return;
    const others = await this.prisma.expense.findMany({
      where: {
        branchId: expense.branchId,
        categoryId: expense.categoryId,
        id: { not: expense.id },
        status: { in: ["pending_approval", "approved", "paid"] },
        expenseDate: { gte: month, lt: nextMonth(month) },
      },
    });
    const committed = others.reduce((sum, row) => sum + expenseTotal(row), 0n) + expenseTotal(expense);
    if (committed > parseMoney(budget.amount.toFixed(4))) {
      throw new BadRequestException("This expense is above the remaining budget");
    }
  }

  private async matchedPolicies(expense: ExpenseRecord) {
    const policies = await this.prisma.expenseApprovalPolicy.findMany({ where: { companyId: expense.companyId } });
    const total = expenseTotal(expense);
    return policies.filter((policy) => {
      if (total < parseMoney(policy.minAmount.toFixed(4))) return false;
      if (policy.maxAmount && total > parseMoney(policy.maxAmount.toFixed(4))) return false;
      if (policy.branchId && policy.branchId !== expense.branchId) return false;
      if (policy.departmentId && policy.departmentId !== expense.departmentId) return false;
      if (policy.categoryId && policy.categoryId !== expense.categoryId) return false;
      return true;
    });
  }

  private actorMatches(policy: { companyWide: boolean; roleCode: string | null }, access: AccessContext) {
    if (!access.permissions.includes("expenses.approve")) return false;
    if (policy.companyWide && !access.companyWide) return false;
    if (policy.roleCode && !access.roleCodes.includes(policy.roleCode)) return false;
    return true;
  }

  private assertOtherUser(access: AccessContext, originatorId: string, previousActors: string[]) {
    if (access.userId === originatorId || previousActors.includes(access.userId)) {
      throw new ForbiddenException("You cannot approve a document you created");
    }
  }

  private async category(companyId: string, categoryId: string) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id: categoryId, companyId, status: "active" },
      include: { account: true },
    });
    if (!category || BLOCKED_SUBTYPES.has(category.account.accountSubtype ?? "")) {
      throw new NotFoundException("Expense category was not found");
    }
    return category;
  }

  private async assertLinks(companyId: string, input: CreateExpenseDto) {
    if (input.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: input.departmentId, companyId, deletedAt: null, OR: [{ branchId: null }, { branchId: input.branchId }] },
      });
      if (!department) throw new NotFoundException("Department was not found for this branch");
    }
    if (input.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: input.supplierId, companyId, deletedAt: null, status: "active", branches: { some: { branchId: input.branchId } } },
      });
      if (!supplier) throw new NotFoundException("Supplier was not found for this branch");
    }
    if (input.employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: input.employeeId, companyId, branchId: input.branchId, deletedAt: null },
      });
      if (!employee) throw new NotFoundException("Employee was not found for this branch");
    }
  }

  private async find(access: AccessContext, id: string) {
    const branchIds = branchIdFilter(access.scope);
    const expense = await this.prisma.expense.findFirst({
      where: { id, companyId: await this.companyId(access.userId), ...(branchIds ? { branchId: branchIds } : {}) },
      include: { category: true, branch: true, department: true, approvals: true },
    });
    if (!expense) throw new NotFoundException("Expense was not found");
    return expense;
  }

  private async account(companyId: string, code: string) {
    const account = await this.prisma.account.findUnique({ where: { companyId_accountCode: { companyId, accountCode: code } } });
    if (!account) throw new NotFoundException(`Account ${code} was not found`);
    return account;
  }

  private async companyId(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { companyId: true } });
    return user.companyId;
  }
}

type ExpenseRecord = {
  id: string;
  companyId: string;
  branchId: string;
  categoryId: string;
  expenseNumber: string;
  expenseDate: Date;
  description: string;
  amount: { toFixed(digits: number): string };
  taxAmount: { toFixed(digits: number): string };
  status: string;
  approvalLevel: number;
  createdByUserId: string;
  projectId: string | null;
  category: { accountId: string; name: string };
  approvals: { actorUserId: string }[];
  departmentId: string | null;
};

function expenseTotal(expense: { amount: { toFixed(digits: number): string }; taxAmount: { toFixed(digits: number): string } }) {
  return parseMoney(expense.amount.toFixed(4)) + parseMoney(expense.taxAmount.toFixed(4));
}

function serializeExpense(expense: {
  id: string;
  expenseNumber: string;
  branchId: string;
  branch?: { name: string };
  categoryId: string;
  category?: { name: string };
  departmentId: string | null;
  department?: { name: string } | null;
  expenseDate: Date;
  description: string;
  amount: { toFixed(digits: number): string };
  taxAmount: { toFixed(digits: number): string };
  status: string;
  approvalLevel: number;
  projectId: string | null;
  receiptName: string;
  supplierId: string | null;
  employeeId: string | null;
  createdByUserId: string;
}) {
  return {
    id: expense.id,
    expenseNumber: expense.expenseNumber,
    branchId: expense.branchId,
    branchName: expense.branch?.name ?? "",
    categoryId: expense.categoryId,
    categoryName: expense.category?.name ?? "",
    departmentId: expense.departmentId,
    departmentName: expense.department?.name ?? null,
    expenseDate: expense.expenseDate.toISOString().slice(0, 10),
    description: expense.description,
    amount: moneyText(expense.amount),
    taxAmount: moneyText(expense.taxAmount),
    total: formatMoneyUnits(expenseTotal(expense)),
    status: expense.status,
    approvalLevel: expense.approvalLevel,
    projectId: expense.projectId,
    receiptName: expense.receiptName,
    supplierId: expense.supplierId,
    employeeId: expense.employeeId,
    createdByUserId: expense.createdByUserId,
  };
}

function group<T extends { amount: { toFixed(digits: number): string }; taxAmount: { toFixed(digits: number): string } }>(rows: T[], key: (row: T) => string) {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const name = key(row);
    totals.set(name, (totals.get(name) ?? 0n) + expenseTotal(row));
  }
  return [...totals.entries()].filter(([, amount]) => amount !== 0n).map(([name, amount]) => ({ name, amount: formatMoneyUnits(amount) }));
}

function decodeReceipt(value: string) {
  return decodeBase64ToBytes(value, 1_000_000, "receipt");
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function sameMonth(left: Date, right: Date) {
  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth();
}
