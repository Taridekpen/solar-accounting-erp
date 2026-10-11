import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { parseMoney } from "../accounting/money";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { assertBranchAllowed } from "../organization/branch-scope";
import { CompanyService } from "../organization/company.service";
import {
  AuditQueryDto,
  CreateAdminExpensePolicyDto,
  CreateAdminTaxCodeDto,
  CreateSeparationRuleDto,
  UpdateAccountMappingDto,
  UpdateDocumentTemplatesDto,
} from "./admin.dto";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompanyService,
    private readonly audit: AuditService,
  ) {}

  async getDocumentTemplates(access: AccessContext) {
    this.requireSettingsView(access);
    const company = await this.companies.requireRecord();
    const row = await this.prisma.documentTemplate.upsert({
      where: { companyId: company.id },
      update: {},
      create: { companyId: company.id },
    });
    return serializeTemplates(row);
  }

  async updateDocumentTemplates(access: AccessContext, input: UpdateDocumentTemplatesDto, correlationId?: string) {
    this.requireSettingsManage(access);
    const company = await this.companies.requireRecord();
    const previous = await this.prisma.documentTemplate.upsert({
      where: { companyId: company.id },
      update: {},
      create: { companyId: company.id },
    });
    const updated = await this.prisma.documentTemplate.update({
      where: { companyId: company.id },
      data: {
        invoiceFooter: input.invoiceFooter ?? previous.invoiceFooter,
        quotationTerms: input.quotationTerms ?? previous.quotationTerms,
        paymentAdvice: input.paymentAdvice ?? previous.paymentAdvice,
        updatedByUserId: access.userId,
      },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "document_templates.updated",
      entityType: "document_template",
      entityId: updated.id,
      previousValues: {
        invoiceFooter: previous.invoiceFooter,
        quotationTerms: previous.quotationTerms,
        paymentAdvice: previous.paymentAdvice,
      },
      newValues: {
        invoiceFooter: updated.invoiceFooter,
        quotationTerms: updated.quotationTerms,
        paymentAdvice: updated.paymentAdvice,
      },
      correlationId,
    });
    return serializeTemplates(updated);
  }

  async listAccountMappings(access: AccessContext) {
    this.requireSettingsView(access);
    const company = await this.companies.requireRecord();
    const rows = await this.prisma.accountMapping.findMany({
      where: { companyId: company.id },
      include: {
        debitAccount: { select: { id: true, accountCode: true, accountName: true, isPostable: true } },
        creditAccount: { select: { id: true, accountCode: true, accountName: true, isPostable: true } },
        taxAccount: { select: { id: true, accountCode: true, accountName: true, isPostable: true } },
      },
      orderBy: { eventCode: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      eventCode: row.eventCode,
      debitAccountId: row.debitAccountId,
      creditAccountId: row.creditAccountId,
      taxAccountId: row.taxAccountId,
      taxSide: row.taxSide,
      debitAccount: row.debitAccount,
      creditAccount: row.creditAccount,
      taxAccount: row.taxAccount,
    }));
  }

  async updateAccountMapping(access: AccessContext, input: UpdateAccountMappingDto, correlationId?: string) {
    this.requireSettingsManage(access);
    const company = await this.companies.requireRecord();
    const existing = await this.prisma.accountMapping.findFirst({
      where: { companyId: company.id, eventCode: input.eventCode },
    });
    if (!existing) throw new NotFoundException("Account mapping was not found");
    await this.assertPostable(company.id, input.debitAccountId);
    await this.assertPostable(company.id, input.creditAccountId);
    if (input.taxAccountId) await this.assertPostable(company.id, input.taxAccountId);

    const updated = await this.prisma.accountMapping.update({
      where: { id: existing.id },
      data: {
        debitAccountId: input.debitAccountId,
        creditAccountId: input.creditAccountId,
        taxAccountId: input.taxAccountId === undefined ? existing.taxAccountId : input.taxAccountId,
        taxSide: input.taxSide === undefined ? existing.taxSide : input.taxSide,
      },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "account_mapping.updated",
      entityType: "account_mapping",
      entityId: updated.id,
      previousValues: {
        eventCode: existing.eventCode,
        debitAccountId: existing.debitAccountId,
        creditAccountId: existing.creditAccountId,
        taxAccountId: existing.taxAccountId,
      },
      newValues: {
        eventCode: updated.eventCode,
        debitAccountId: updated.debitAccountId,
        creditAccountId: updated.creditAccountId,
        taxAccountId: updated.taxAccountId,
      },
      correlationId,
    });
    return { id: updated.id, eventCode: updated.eventCode };
  }

  async listTaxCodes(access: AccessContext) {
    this.requireSettingsView(access);
    const company = await this.companies.requireRecord();
    const rows = await this.prisma.taxCode.findMany({
      where: { companyId: company.id },
      include: { account: { select: { id: true, accountCode: true, accountName: true } } },
      orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      rate: row.rate.toFixed(4),
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
      accountId: row.accountId,
      account: row.account,
    }));
  }

  async createTaxCode(access: AccessContext, input: CreateAdminTaxCodeDto, correlationId?: string) {
    this.requireSettingsManage(access);
    const company = await this.companies.requireRecord();
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new BadRequestException("The effective end is before the start");
    }
    await this.assertPostable(company.id, input.accountId);
    const saved = await this.prisma.taxCode.create({
      data: {
        companyId: company.id,
        code: input.code.trim(),
        name: input.name.trim(),
        kind: input.kind,
        rate: input.rate,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        accountId: input.accountId,
      },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "tax_code.created",
      entityType: "tax_code",
      entityId: saved.id,
      newValues: {
        code: saved.code,
        name: saved.name,
        kind: saved.kind,
        rate: saved.rate.toFixed(4),
        effectiveFrom: input.effectiveFrom,
        accountId: saved.accountId,
      },
      correlationId,
    });
    return { id: saved.id, code: saved.code };
  }

  async listFiscalPeriods(access: AccessContext) {
    this.requireSettingsView(access);
    const company = await this.companies.requireRecord();
    const rows = await this.prisma.fiscalPeriod.findMany({
      where: { companyId: company.id },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        closedAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      status: row.status,
      closedAt: row.closedAt?.toISOString() ?? null,
    }));
  }

  async listExpensePolicies(access: AccessContext) {
    this.requireSettingsView(access);
    const company = await this.companies.requireRecord();
    const rows = await this.prisma.expenseApprovalPolicy.findMany({
      where: { companyId: company.id },
      orderBy: [{ level: "asc" }, { minAmount: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      branchId: row.branchId,
      departmentId: row.departmentId,
      categoryId: row.categoryId,
      minAmount: row.minAmount.toFixed(4),
      maxAmount: row.maxAmount?.toFixed(4) ?? null,
      level: row.level,
      companyWide: row.companyWide,
      roleCode: row.roleCode,
      requiresBudget: row.requiresBudget,
    }));
  }

  async createExpensePolicy(access: AccessContext, input: CreateAdminExpensePolicyDto, correlationId?: string) {
    this.requireSettingsManage(access);
    if (!access.companyWide) throw new ForbiddenException("Company-wide approval is required");
    if (parseMoney(input.minAmount) > parseMoney(input.maxAmount)) {
      throw new BadRequestException("Minimum amount cannot exceed the maximum");
    }
    const company = await this.companies.requireRecord();
    const saved = await this.prisma.expenseApprovalPolicy.create({
      data: {
        companyId: company.id,
        minAmount: input.minAmount,
        maxAmount: input.maxAmount,
        branchId: input.branchId ?? null,
        departmentId: input.departmentId ?? null,
        categoryId: input.categoryId ?? null,
        roleCode: input.roleCode,
        companyWide: input.companyWide,
        level: input.level,
        requiresBudget: input.requiresBudget ?? false,
      },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "expense_policy.created",
      entityType: "expense_approval_policy",
      entityId: saved.id,
      newValues: {
        minAmount: input.minAmount,
        maxAmount: input.maxAmount,
        level: input.level,
        companyWide: input.companyWide,
        branchId: input.branchId ?? null,
      },
      correlationId,
    });
    return { id: saved.id, level: saved.level };
  }

  async listDelegations(access: AccessContext) {
    this.requireSettingsView(access);
    const now = new Date();
    const rows = await this.prisma.approvalDelegation.findMany({
      where: {
        revokedAt: null,
        endsAt: { gte: now },
        OR: [{ delegatorUserId: access.userId }, { delegateUserId: access.userId }],
        ...(access.permissions.includes("settings.manage") || access.permissions.includes("users.manage")
          ? {}
          : {}),
      },
      include: {
        delegator: { select: { id: true, email: true } },
        delegate: { select: { id: true, email: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 200,
    });
    const companyWideList =
      access.permissions.includes("settings.manage") || access.permissions.includes("users.manage");
    const visible = companyWideList
      ? await this.prisma.approvalDelegation.findMany({
          where: { revokedAt: null, endsAt: { gte: now } },
          include: {
            delegator: { select: { id: true, email: true } },
            delegate: { select: { id: true, email: true } },
          },
          orderBy: { startsAt: "desc" },
          take: 200,
        })
      : rows;
    return visible.map((row) => ({
      id: row.id,
      permissionCode: row.permissionCode,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      delegator: row.delegator,
      delegate: row.delegate,
    }));
  }

  async revokeDelegation(access: AccessContext, id: string, correlationId?: string) {
    if (!access.permissions.includes("settings.manage") && !access.permissions.includes("users.manage")) {
      throw new ForbiddenException("Revoking a delegation is not authorized");
    }
    const row = await this.prisma.approvalDelegation.findFirst({ where: { id } });
    if (!row) throw new NotFoundException("Delegation was not found");
    if (row.revokedAt) return { id: row.id, revokedAt: row.revokedAt.toISOString() };
    const updated = await this.prisma.approvalDelegation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "approval_delegation.revoked",
      entityType: "approval_delegation",
      entityId: updated.id,
      previousValues: { revokedAt: null },
      newValues: { revokedAt: updated.revokedAt?.toISOString() },
      correlationId,
    });
    return { id: updated.id, revokedAt: updated.revokedAt?.toISOString() };
  }

  async listSeparationRules(access: AccessContext) {
    this.requireSettingsView(access);
    const rows = await this.prisma.separationRule.findMany({ orderBy: { action: "asc" } });
    return rows.map((row) => ({ id: row.id, action: row.action, createdAt: row.createdAt.toISOString() }));
  }

  async addSeparationRule(access: AccessContext, input: CreateSeparationRuleDto, correlationId?: string) {
    this.requireSettingsManage(access);
    const saved = await this.prisma.separationRule.create({ data: { action: input.action.trim() } });
    await this.audit.record({
      actorUserId: access.userId,
      action: "separation_rule.created",
      entityType: "separation_rule",
      entityId: saved.id,
      newValues: { action: saved.action },
      correlationId,
    });
    return { id: saved.id, action: saved.action };
  }

  async removeSeparationRule(access: AccessContext, id: string, correlationId?: string) {
    this.requireSettingsManage(access);
    const row = await this.prisma.separationRule.findFirst({ where: { id } });
    if (!row) throw new NotFoundException("Separation rule was not found");
    await this.prisma.separationRule.delete({ where: { id } });
    await this.audit.record({
      actorUserId: access.userId,
      action: "separation_rule.deleted",
      entityType: "separation_rule",
      entityId: id,
      previousValues: { action: row.action },
      correlationId,
    });
    return { id, deleted: true };
  }

  async branchSettings(access: AccessContext, branchId: string) {
    assertBranchAllowed(access.scope, branchId);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, email: true } },
        warehouses: {
          select: { id: true, warehouseCode: true, name: true, warehouseType: true, status: true },
        },
        bankAccounts: {
          select: {
            id: true,
            bankName: true,
            accountName: true,
            maskedAccountNumber: true,
            ledgerAccountId: true,
            status: true,
          },
        },
        expensePolicies: {
          orderBy: { level: "asc" },
          select: {
            id: true,
            minAmount: true,
            maxAmount: true,
            level: true,
            companyWide: true,
          },
        },
      },
    });
    if (!branch) throw new NotFoundException("Branch was not found");
    return {
      id: branch.id,
      branchCode: branch.branchCode,
      name: branch.name,
      status: branch.status,
      manager: branch.manager
        ? {
            id: branch.manager.id,
            name: `${branch.manager.firstName} ${branch.manager.lastName}`,
            employeeNumber: branch.manager.employeeNumber,
            email: branch.manager.email,
          }
        : null,
      warehouses: branch.warehouses,
      bankAccounts: branch.bankAccounts.map((account) => ({
        id: account.id,
        bankName: account.bankName,
        accountName: account.accountName,
        maskedAccountNumber: account.maskedAccountNumber,
        ledgerAccountId: account.ledgerAccountId,
        status: account.status,
      })),
      expensePolicies: branch.expensePolicies.map((policy) => ({
        id: policy.id,
        minAmount: policy.minAmount.toFixed(4),
        maxAmount: policy.maxAmount?.toFixed(4) ?? null,
        level: policy.level,
        companyWide: policy.companyWide,
      })),
    };
  }

  async searchAudit(access: AccessContext, query: AuditQueryDto) {
    if (!access.permissions.includes("audit.view") && !access.permissions.includes("users.view")) {
      throw new ForbiddenException("Audit history is not available for this account");
    }
    const where: Prisma.AuditEventWhereInput = {
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { action: { contains: query.q, mode: "insensitive" } },
              { entityType: { contains: query.q, mode: "insensitive" } },
              { reason: { contains: query.q, mode: "insensitive" } },
              { entityId: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.auditEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: Math.min((query.take ?? 100) * (query.branchId ? 5 : 1), 500),
      include: { actor: { select: { id: true, email: true } } },
    });
    const branchId = query.branchId;
    const filtered = branchId
      ? rows.filter((row) => {
          const scope = row.branchScope;
          if (scope == null) return false;
          if (typeof scope === "string") return scope === branchId;
          if (Array.isArray(scope)) return scope.includes(branchId);
          return JSON.stringify(scope).includes(branchId);
        })
      : rows;
    return filtered.slice(0, query.take ?? 100).map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      actorEmail: row.actor?.email ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      occurredAt: row.occurredAt.toISOString(),
      branchScope: row.branchScope,
      previousValues: row.previousValues,
      newValues: row.newValues,
      reason: row.reason,
      correlationId: row.correlationId,
    }));
  }

  private async assertPostable(companyId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId, deletedAt: null, isPostable: true, isActive: true },
    });
    if (!account) throw new BadRequestException("Account must be an active postable account");
  }

  private requireSettingsView(access: AccessContext) {
    if (!access.permissions.includes("settings.view") && !access.permissions.includes("settings.manage")) {
      throw new ForbiddenException("Settings are not available for this account");
    }
  }

  private requireSettingsManage(access: AccessContext) {
    if (!access.permissions.includes("settings.manage")) {
      throw new ForbiddenException("Settings changes are not authorized");
    }
  }
}

function serializeTemplates(row: {
  id: string;
  invoiceFooter: string;
  quotationTerms: string;
  paymentAdvice: string;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    invoiceFooter: row.invoiceFooter,
    quotationTerms: row.quotationTerms,
    paymentAdvice: row.paymentAdvice,
    updatedAt: row.updatedAt.toISOString(),
  };
}
