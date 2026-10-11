import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { CompanyService } from "../organization/company.service";

export type NotificationType =
  | "approval_request"
  | "approval_outcome"
  | "overdue_invoice"
  | "low_stock"
  | "supplier_bill_due"
  | "failed_posting"
  | "reconciliation_exception"
  | "period_closing_reminder";

export interface NotifyInput {
  companyId: string;
  recipientUserIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  linkPath?: string;
  branchScope?: unknown;
  emailNotificationsEnabled?: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompanyService,
  ) {}

  async list(access: AccessContext) {
    this.requireView(access);
    const rows = await this.prisma.notification.findMany({
      where: { recipientUserId: access.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map(serializeNotification);
  }

  async unreadCount(access: AccessContext) {
    this.requireView(access);
    return this.prisma.notification.count({
      where: { recipientUserId: access.userId, readAt: null },
    });
  }

  async markRead(access: AccessContext, id: string) {
    this.requireView(access);
    const row = await this.prisma.notification.findFirst({
      where: { id, recipientUserId: access.userId },
    });
    if (!row) throw new NotFoundException("Notification was not found");
    if (row.readAt) return serializeNotification(row);
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return serializeNotification(updated);
  }

  async markAllRead(access: AccessContext) {
    this.requireView(access);
    await this.prisma.notification.updateMany({
      where: { recipientUserId: access.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async notify(input: NotifyInput) {
    const unique = [...new Set(input.recipientUserIds.filter(Boolean))];
    if (!unique.length) return;
    const now = input.emailNotificationsEnabled ? new Date() : null;
    for (const recipientUserId of unique) {
      if (input.entityId) {
        const existing = await this.prisma.notification.findFirst({
          where: {
            recipientUserId,
            type: input.type,
            entityId: input.entityId,
            readAt: null,
          },
        });
        if (existing) continue;
      }
      await this.prisma.notification.create({
        data: {
          companyId: input.companyId,
          recipientUserId,
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: input.entityType,
          entityId: input.entityId,
          linkPath: input.linkPath,
          branchScope:
            input.branchScope === undefined
              ? undefined
              : (input.branchScope as Prisma.InputJsonValue),
          emailQueuedAt: now ?? undefined,
        },
      });
    }
  }

  async notifyApprovers(params: {
    companyId: string;
    branchId?: string | null;
    permissionCode: string;
    title: string;
    body: string;
    entityType: string;
    entityId: string;
    linkPath: string;
    excludeUserId?: string;
  }) {
    const company = await this.prisma.company.findFirst({ where: { id: params.companyId } });
    const users = await this.prisma.user.findMany({
      where: {
        companyId: params.companyId,
        status: "active",
        roles: { some: { role: { permissions: { some: { permission: { code: params.permissionCode } } } } } },
      },
      select: {
        id: true,
        roles: { select: { role: { select: { code: true } } } },
        branchAssignments: { select: { branchId: true } },
      },
    });
    const companyWide = new Set([
      "super_administrator",
      "managing_director",
      "finance_manager",
      "central_accountant",
      "auditor",
    ]);
    const recipients = users
      .filter((user) => user.id !== params.excludeUserId)
      .filter((user) => {
        const roles = user.roles.map((row) => row.role.code);
        if (roles.some((code) => companyWide.has(code))) return true;
        if (!params.branchId) return false;
        return user.branchAssignments.some((row) => row.branchId === params.branchId);
      })
      .map((user) => user.id);
    await this.notify({
      companyId: params.companyId,
      recipientUserIds: recipients,
      type: "approval_request",
      title: params.title,
      body: params.body,
      entityType: params.entityType,
      entityId: params.entityId,
      linkPath: params.linkPath,
      branchScope: params.branchId ? [params.branchId] : null,
      emailNotificationsEnabled: company?.emailNotificationsEnabled ?? false,
    });
  }

  async notifyOutcome(params: {
    companyId: string;
    recipientUserId: string;
    title: string;
    body: string;
    entityType: string;
    entityId: string;
    linkPath: string;
  }) {
    const company = await this.prisma.company.findFirst({ where: { id: params.companyId } });
    await this.notify({
      companyId: params.companyId,
      recipientUserIds: [params.recipientUserId],
      type: "approval_outcome",
      title: params.title,
      body: params.body,
      entityType: params.entityType,
      entityId: params.entityId,
      linkPath: params.linkPath,
      emailNotificationsEnabled: company?.emailNotificationsEnabled ?? false,
    });
  }

  async notifyFailedPosting(params: {
    companyId: string;
    actorUserId: string;
    reason: string;
    sourceDocumentId?: string | null;
  }) {
    const company = await this.prisma.company.findFirst({ where: { id: params.companyId } });
    await this.notify({
      companyId: params.companyId,
      recipientUserIds: [params.actorUserId],
      type: "failed_posting",
      title: "Posting failed",
      body: params.reason,
      entityType: "posting_attempt",
      entityId: params.sourceDocumentId ?? undefined,
      linkPath: "/accounting",
      emailNotificationsEnabled: company?.emailNotificationsEnabled ?? false,
    });
  }

  async notifyReconciliationException(params: {
    companyId: string;
    recipientUserId: string;
    statementId: string;
    reason: string;
  }) {
    const company = await this.prisma.company.findFirst({ where: { id: params.companyId } });
    await this.notify({
      companyId: params.companyId,
      recipientUserIds: [params.recipientUserId],
      type: "reconciliation_exception",
      title: "Reconciliation exception",
      body: params.reason,
      entityType: "bank_statement",
      entityId: params.statementId,
      linkPath: "/banking",
      emailNotificationsEnabled: company?.emailNotificationsEnabled ?? false,
    });
  }

  async refresh(access: AccessContext) {
    this.requireView(access);
    const company = await this.companies.requireRecord();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const branchFilter =
      access.companyWide || access.scope.type === "company" ? undefined : { in: access.scope.branchIds };
    const overdue = await this.prisma.salesInvoice.findMany({
      where: {
        companyId: company.id,
        status: "posted",
        dueDate: { lt: today },
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
      take: 50,
      select: { id: true, invoiceNumber: true, branchId: true, dueDate: true },
    });
    for (const invoice of overdue) {
      await this.notify({
        companyId: company.id,
        recipientUserIds: [access.userId],
        type: "overdue_invoice",
        title: "Overdue invoice",
        body: `Invoice ${invoice.invoiceNumber} is past due.`,
        entityType: "sales_invoice",
        entityId: invoice.id,
        linkPath: "/sales",
        branchScope: [invoice.branchId],
        emailNotificationsEnabled: company.emailNotificationsEnabled,
      });
    }

    const lowStock = await this.prisma.warehouseStock.findMany({
      where: {
        companyId: company.id,
        quantity: { lte: 0 },
        ...(branchFilter ? { warehouse: { branchId: branchFilter } } : {}),
      },
      take: 50,
      include: { product: { select: { sku: true, name: true } }, warehouse: { select: { branchId: true } } },
    });
    for (const row of lowStock) {
      await this.notify({
        companyId: company.id,
        recipientUserIds: [access.userId],
        type: "low_stock",
        title: "Low stock",
        body: `${row.product.name} (${row.product.sku}) is at or below zero.`,
        entityType: "warehouse_stock",
        entityId: row.id,
        linkPath: "/inventory",
        branchScope: [row.warehouse.branchId],
        emailNotificationsEnabled: company.emailNotificationsEnabled,
      });
    }

    const bills = await this.prisma.supplierBill.findMany({
      where: {
        companyId: company.id,
        status: "posted",
        dueDate: { lte: today },
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
      take: 50,
      select: { id: true, billNumber: true, branchId: true },
    });
    for (const bill of bills) {
      await this.notify({
        companyId: company.id,
        recipientUserIds: [access.userId],
        type: "supplier_bill_due",
        title: "Supplier bill due",
        body: `Bill ${bill.billNumber} is due.`,
        entityType: "supplier_bill",
        entityId: bill.id,
        linkPath: "/purchases",
        branchScope: [bill.branchId],
        emailNotificationsEnabled: company.emailNotificationsEnabled,
      });
    }

    const closing = await this.prisma.fiscalPeriod.findMany({
      where: { companyId: company.id, status: "closing" },
      take: 12,
      select: { id: true, startDate: true, endDate: true },
    });
    for (const period of closing) {
      await this.notify({
        companyId: company.id,
        recipientUserIds: [access.userId],
        type: "period_closing_reminder",
        title: "Period closing in progress",
        body: `Period ${period.startDate.toISOString().slice(0, 10)} to ${period.endDate.toISOString().slice(0, 10)} awaits lock.`,
        entityType: "fiscal_period",
        entityId: period.id,
        linkPath: "/closing",
        emailNotificationsEnabled: company.emailNotificationsEnabled,
      });
    }

    return this.list(access);
  }

  private requireView(access: AccessContext) {
    if (!access.permissions.includes("notifications.view") && !access.permissions.includes("settings.view")) {
      throw new ForbiddenException("Notifications are not available for this account");
    }
  }
}

function serializeNotification(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  linkPath: string | null;
  branchScope: unknown;
  readAt: Date | null;
  emailQueuedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    linkPath: row.linkPath,
    branchScope: row.branchScope,
    readAt: row.readAt?.toISOString() ?? null,
    emailQueuedAt: row.emailQueuedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
