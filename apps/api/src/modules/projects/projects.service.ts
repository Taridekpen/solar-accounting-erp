import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Project } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { AccountingPostingService } from "../accounting/posting.service";
import { formatMoneyUnits, multiplyMoney, parseMoney } from "../accounting/money";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, branchIdFilter } from "../organization/branch-scope";
import {
  CreateMaterialRequestDto,
  CreateProjectDepositDto,
  CreateProjectDto,
  CreateProjectMilestoneDto,
  ProjectBudgetLineDto,
  ProjectDateDto,
  ProjectQuotationLineDto,
} from "./projects.dto";

const MILESTONE_TYPES = new Set(["residential", "commercial", "industrial", "system_upgrade"]);

function usesMilestones(projectType: string) {
  return MILESTONE_TYPES.has(projectType);
}

function revenueCode(projectType: string) {
  return projectType === "maintenance" || projectType === "repairs" ? "4500" : "4400";
}

function issueCode(projectType: string) {
  return usesMilestones(projectType) ? "1400" : "5100";
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly posting: AccountingPostingService,
    private readonly audit: AuditService,
  ) {}

  async list(access: AccessContext) {
    const companyId = await this.companyId(access.userId);
    const projects = await this.prisma.project.findMany({
      where: { companyId, branchId: branchIdFilter(access.scope) },
      include: { customer: true },
      orderBy: { projectNumber: "desc" },
    });
    return Promise.all(projects.map((project) => this.present(project)));
  }

  async get(access: AccessContext, id: string) {
    const project = await this.project(access, id);
    const base = await this.present(project);
    const [materials, milestones] = await Promise.all([
      this.prisma.projectMaterialRequest.findMany({
        where: { projectId: project.id },
        include: { product: true, warehouse: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.projectMilestone.findMany({
        where: { projectId: project.id },
        orderBy: { sequence: "asc" },
      }),
    ]);
    return {
      ...base,
      materials: materials.map((row) => ({
        id: row.id,
        productName: row.product.name,
        sku: row.product.sku,
        warehouseName: row.warehouse.name,
        quantity: row.quantity.toFixed(4),
        status: row.status,
        createdByUserId: row.createdByUserId,
      })),
      milestones: milestones.map((row) => ({
        id: row.id,
        name: row.name,
        amount: formatMoneyUnits(parseMoney(row.amount.toFixed(4))),
        sequence: row.sequence,
        status: row.status,
        createdByUserId: row.createdByUserId,
      })),
    };
  }

  async activate(access: AccessContext, id: string) {
    const project = await this.project(access, id);
    if (project.status !== "draft") {
      throw new BadRequestException("Only a draft project can be activated");
    }
    const saved = await this.prisma.project.update({
      where: { id: project.id },
      data: { status: "active" },
      include: { customer: true },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "projects.activated",
      entityType: "project",
      entityId: project.id,
      newValues: { status: "active" },
    });
    return this.get(access, saved.id);
  }

  async create(access: AccessContext, input: CreateProjectDto) {
    const companyId = await this.companyId(access.userId);
    assertBranchAllowed(access.scope, input.branchId);
    await this.customer(companyId, input.customerId);
    if (parseMoney(input.contractValue) <= 0n) {
      throw new BadRequestException("Contract value must be greater than zero");
    }
    const project = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.branchId, "project");
      return tx.project.create({
        data: {
          companyId,
          branchId: input.branchId,
          customerId: input.customerId,
          projectNumber: number.documentNumber,
          name: input.name,
          projectType: input.projectType,
          location: input.location,
          contractValue: input.contractValue,
          estimatedCost: input.estimatedCost,
          startDate: new Date(input.startDate),
          expectedCompletionDate: new Date(input.expectedCompletionDate),
          managerId: input.managerId,
          status: input.status ?? "draft",
          createdByUserId: access.userId,
          quotations: input.quotation?.length
            ? { create: { companyId, lines: { create: input.quotation.map((line) => this.quotationLine(line)) } } }
            : undefined,
          budgets: input.budgets?.length ? { create: input.budgets.map((line) => this.budgetLine(companyId, line)) } : undefined,
        },
        include: { customer: true },
      });
    });
    await this.audit.record({ actorUserId: access.userId, action: "projects.created", entityType: "project", entityId: project.id, newValues: { projectNumber: project.projectNumber, status: project.status } });
    return this.present(project);
  }

  async deposit(access: AccessContext, id: string, input: CreateProjectDepositDto, correlationId?: string) {
    const project = await this.project(access, id);
    if (project.status !== "active") throw new BadRequestException("Only an active project can take a deposit");
    const amount = parseMoney(input.amount);
    if (amount <= 0n) throw new BadRequestException("Deposit amount must be greater than zero");
    const account = await this.prisma.account.findFirst({ where: { id: input.accountId, companyId: project.companyId, deletedAt: null } });
    if (!account || !account.isPostable || (account.accountSubtype !== "cash" && account.accountSubtype !== "bank")) {
      throw new BadRequestException("The deposit account must be a postable cash or bank account");
    }
    const advance = await this.account(project.companyId, "2100");
    const receiptId = randomUUID();
    const description = `Project deposit ${project.projectNumber}`;
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "projects",
      sourceDocumentType: "project_deposit",
      sourceDocumentId: receiptId,
      accountingDate: input.depositDate,
      description,
      lines: [
        this.line(account.id, project.branchId, project.customerId, project.id, input.amount, "0", description),
        this.line(advance.id, project.branchId, project.customerId, project.id, "0", input.amount, description),
      ],
    }, correlationId);
    const number = await this.prisma.$transaction((tx) => this.documentNumbers.allocateWith(tx, project.branchId, "customer_receipt"));
    await this.prisma.customerReceipt.create({
      data: {
        id: receiptId,
        companyId: project.companyId,
        branchId: project.branchId,
        customerId: project.customerId,
        receiptNumber: number.documentNumber,
        receiptDate: new Date(input.depositDate),
        total: input.amount,
        advanceAmount: input.amount,
        journalEntryId: journal.id,
        createdByUserId: access.userId,
        methods: { create: { method: account.accountSubtype === "cash" ? "cash" : "bank_transfer", amount: input.amount } },
      },
    });
    await this.audit.record({ actorUserId: access.userId, action: "projects.deposit", entityType: "project", entityId: project.id, newValues: { amount: input.amount, receiptNumber: number.documentNumber }, correlationId });
    return this.present(project);
  }

  async reserve(access: AccessContext, id: string, input: CreateMaterialRequestDto) {
    const project = await this.project(access, id);
    if (project.status !== "active") throw new BadRequestException("Only an active project can reserve materials");
    const quantity = parseMoney(input.quantity);
    if (quantity <= 0n) throw new BadRequestException("Quantity must be greater than zero");
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId: project.companyId, branchId: project.branchId } });
    if (!warehouse) throw new NotFoundException("Warehouse was not found");
    const product = await this.prisma.product.findFirst({ where: { id: input.productId, companyId: project.companyId, deletedAt: null, productType: "product" } });
    if (!product) throw new NotFoundException("Product was not found");
    const position = await this.prisma.stockPosition.findUnique({
      where: { companyId_productId_branchId: { companyId: project.companyId, productId: product.id, branchId: project.branchId } },
    });
    const physical = position ? parseMoney(position.physicalQuantity.toFixed(4)) : 0n;
    const reserved = position ? parseMoney(position.reservedQuantity.toFixed(4)) : 0n;
    if (physical - reserved < quantity) throw new BadRequestException("Stock is not available for this quantity");
    await this.prisma.stockPosition.update({
      where: { id: position!.id },
      data: { reservedQuantity: { increment: input.quantity } },
    });
    const request = await this.prisma.projectMaterialRequest.create({
      data: {
        companyId: project.companyId,
        projectId: project.id,
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: input.quantity,
        reservedQuantity: input.quantity,
        status: "reserved",
        createdByUserId: access.userId,
      },
    });
    return { id: request.id, status: request.status, quantity: request.quantity.toFixed(4), reservedQuantity: request.reservedQuantity.toFixed(4) };
  }

  async approveMaterial(access: AccessContext, projectId: string, requestId: string, correlationId?: string) {
    const request = await this.material(access, projectId, requestId);
    if (request.createdByUserId === access.userId) throw new ForbiddenException("The requester cannot approve this issue");
    if (request.status !== "reserved") throw new BadRequestException("Only a reserved request can be approved");
    const saved = await this.prisma.projectMaterialRequest.update({ where: { id: request.id }, data: { status: "approved" } });
    await this.audit.record({ actorUserId: access.userId, action: "projects.material_approved", entityType: "project_material_request", entityId: request.id, correlationId });
    return { id: saved.id, status: saved.status };
  }

  async issue(access: AccessContext, projectId: string, requestId: string, input: ProjectDateDto, correlationId?: string) {
    const request = await this.material(access, projectId, requestId);
    if (request.status !== "approved") throw new BadRequestException("The issue must be approved first");
    const project = request.project;
    const position = await this.prisma.stockPosition.findUniqueOrThrow({
      where: { companyId_productId_branchId: { companyId: project.companyId, productId: request.productId, branchId: project.branchId } },
    });
    const unitCost = position.averageUnitCost.toFixed(4);
    const amount = formatMoneyUnits(multiplyMoney(parseMoney(request.quantity.toFixed(4)), parseMoney(unitCost)));
    const inventory = await this.account(project.companyId, "1300");
    const destination = await this.account(project.companyId, issueCode(project.projectType));
    const reserved = request.reservedQuantity.toFixed(4);
    await this.prisma.stockPosition.update({ where: { id: position.id }, data: { reservedQuantity: { decrement: reserved } } });
    try {
      await this.posting.postSystemDocument(access, {
        sourceModule: "projects",
        sourceDocumentType: "project_issue",
        sourceDocumentId: request.id,
        accountingDate: input.accountingDate,
        description: `Project issue ${project.projectNumber}`,
        lines: [
          this.line(destination.id, project.branchId, project.customerId, project.id, amount, "0", "Issue materials"),
          this.line(inventory.id, project.branchId, project.customerId, project.id, "0", amount, "Issue materials"),
        ],
        stockMoves: [{
          productId: request.productId,
          branchId: project.branchId,
          warehouseId: request.warehouseId,
          quantity: request.quantity.toFixed(4),
          unitCost,
          movementType: "project_issue",
        }],
      }, correlationId);
    } catch (error) {
      await this.prisma.stockPosition.update({ where: { id: position.id }, data: { reservedQuantity: { increment: reserved } } });
      throw error;
    }
    await this.prisma.projectMaterialRequest.update({ where: { id: request.id }, data: { status: "issued", unitCost, reservedQuantity: "0.0000" } });
    await this.audit.record({ actorUserId: access.userId, action: "projects.issued", entityType: "project_material_request", entityId: request.id, newValues: { amount, unitCost }, correlationId });
    return this.present(project);
  }

  async returnMaterial(access: AccessContext, projectId: string, requestId: string, input: ProjectDateDto, correlationId?: string) {
    const request = await this.material(access, projectId, requestId);
    if (request.status !== "issued" || !request.unitCost) throw new BadRequestException("Only issued materials can be returned");
    const project = request.project;
    const amountUnits = multiplyMoney(parseMoney(request.quantity.toFixed(4)), parseMoney(request.unitCost.toFixed(4)));
    const code = issueCode(project.projectType);
    const held = await this.accountNet(project.id, code);
    if (held < amountUnits) throw new BadRequestException("The project account does not cover this return");
    const amount = formatMoneyUnits(amountUnits);
    const inventory = await this.account(project.companyId, "1300");
    const destination = await this.account(project.companyId, code);
    await this.posting.postSystemDocument(access, {
      sourceModule: "projects",
      sourceDocumentType: "project_return",
      sourceDocumentId: request.id,
      accountingDate: input.accountingDate,
      description: `Project return ${project.projectNumber}`,
      lines: [
        this.line(inventory.id, project.branchId, project.customerId, project.id, amount, "0", "Return materials"),
        this.line(destination.id, project.branchId, project.customerId, project.id, "0", amount, "Return materials"),
      ],
      stockMoves: [{
        productId: request.productId,
        branchId: project.branchId,
        warehouseId: request.warehouseId,
        quantity: request.quantity.toFixed(4),
        unitCost: request.unitCost.toFixed(4),
        movementType: "project_return",
      }],
    }, correlationId);
    await this.prisma.projectMaterialRequest.update({ where: { id: request.id }, data: { status: "returned" } });
    return this.present(project);
  }

  async addMilestone(access: AccessContext, id: string, input: CreateProjectMilestoneDto) {
    const project = await this.project(access, id);
    if (parseMoney(input.amount) <= 0n) throw new BadRequestException("Milestone amount must be greater than zero");
    const milestone = await this.prisma.projectMilestone.create({
      data: {
        companyId: project.companyId,
        projectId: project.id,
        name: input.name,
        amount: input.amount,
        sequence: input.sequence,
        createdByUserId: access.userId,
      },
    });
    return {
      id: milestone.id,
      name: milestone.name,
      amount: formatMoneyUnits(parseMoney(milestone.amount.toFixed(4))),
      sequence: milestone.sequence,
      status: milestone.status,
      createdByUserId: milestone.createdByUserId,
    };
  }

  async recognize(access: AccessContext, projectId: string, milestoneId: string, input: ProjectDateDto, correlationId?: string) {
    const project = await this.project(access, projectId);
    const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId: project.id } });
    if (!milestone) throw new NotFoundException("Milestone was not found");
    if (milestone.createdByUserId === access.userId) throw new ForbiddenException("The requester cannot approve this milestone");
    if (milestone.status !== "pending") throw new BadRequestException("This milestone is already invoiced");
    if (project.status !== "active") throw new BadRequestException("Only an active project can recognize a milestone");
    const amount = parseMoney(milestone.amount.toFixed(4));
    const contract = parseMoney(project.contractValue.toFixed(4));
    const revenue = await this.account(project.companyId, revenueCode(project.projectType));
    const receivable = await this.account(project.companyId, "1200");
    const service = await this.prisma.product.findFirst({ where: { companyId: project.companyId, productType: "service", deletedAt: null, status: "active" }, orderBy: { sku: "asc" } });
    if (!service) throw new NotFoundException("A service product is required for the milestone invoice");
    const description = `${project.projectNumber} ${milestone.name}`;
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "projects",
      sourceDocumentType: "project_revenue",
      sourceDocumentId: milestone.id,
      accountingDate: input.accountingDate,
      description,
      lines: [
        this.line(receivable.id, project.branchId, project.customerId, project.id, milestone.amount.toFixed(4), "0", description),
        this.line(revenue.id, project.branchId, project.customerId, project.id, "0", milestone.amount.toFixed(4), description),
      ],
    }, correlationId);
    const number = await this.prisma.$transaction((tx) => this.documentNumbers.allocateWith(tx, project.branchId, "sales_invoice"));
    const invoice = await this.prisma.salesInvoice.create({
      data: {
        companyId: project.companyId,
        branchId: project.branchId,
        customerId: project.customerId,
        projectId: project.id,
        invoiceNumber: number.documentNumber,
        invoiceDate: new Date(input.accountingDate),
        dueDate: new Date(input.accountingDate),
        paymentTermsDays: 0,
        settlement: "credit",
        subtotal: milestone.amount,
        grandTotal: milestone.amount,
        status: "posted",
        journalEntryId: journal.id,
        createdByUserId: access.userId,
        postedAt: new Date(),
        lines: {
          create: {
            productId: service.id,
            description: milestone.name,
            quantity: "1.0000",
            unitPrice: milestone.amount,
            unitCost: "0.0000",
            lineNet: milestone.amount,
            taxAmount: "0.0000",
            lineTotal: milestone.amount,
            revenueAccountId: revenue.id,
          },
        },
      },
    });
    const wip = await this.accountNet(project.id, "1400");
    const slice = contract <= 0n ? 0n : (wip * amount) / contract;
    const recognized = slice > wip ? wip : slice;
    if (recognized > 0n) {
      const cost = await this.account(project.companyId, "5100");
      const work = await this.account(project.companyId, "1400");
      const costAmount = formatMoneyUnits(recognized);
      await this.posting.postSystemDocument(access, {
        sourceModule: "projects",
        sourceDocumentType: "project_cost",
        sourceDocumentId: milestone.id,
        accountingDate: input.accountingDate,
        description: `Recognize cost ${project.projectNumber}`,
        lines: [
          this.line(cost.id, project.branchId, project.customerId, project.id, costAmount, "0", "Recognize installation cost"),
          this.line(work.id, project.branchId, project.customerId, project.id, "0", costAmount, "Recognize installation cost"),
        ],
      }, correlationId);
    }
    await this.prisma.projectMilestone.update({ where: { id: milestone.id }, data: { status: "invoiced", invoiceId: invoice.id } });
    await this.audit.record({ actorUserId: access.userId, action: "projects.milestone_invoiced", entityType: "project_milestone", entityId: milestone.id, newValues: { invoiceNumber: invoice.invoiceNumber, recognizedCost: formatMoneyUnits(recognized) }, correlationId });
    return this.present(project);
  }

  private async present(project: Project & { customer?: { name: string } }) {
    const customer = project.customer ?? await this.prisma.customer.findUniqueOrThrow({ where: { id: project.customerId } });
    const budgets = await this.prisma.projectBudget.findMany({ where: { projectId: project.id } });
    const milestones = await this.prisma.projectMilestone.findMany({ where: { projectId: project.id, status: "invoiced" } });
    const budget = budgets.reduce((sum, row) => sum + parseMoney(row.amount.toFixed(4)), 0n);
    const contract = parseMoney(project.contractValue.toFixed(4));
    const estimated = parseMoney(project.estimatedCost.toFixed(4));
    const invoiced = milestones.reduce((sum, row) => sum + parseMoney(row.amount.toFixed(4)), 0n);
    const wip = await this.accountNet(project.id, "1400");
    const recognizedCost = await this.accountNet(project.id, "5100");
    const recognizedRevenue = await this.revenueNet(project.id);
    const actual = wip + recognizedCost;
    return {
      id: project.id,
      projectNumber: project.projectNumber,
      name: project.name,
      customerName: customer.name,
      branchId: project.branchId,
      projectType: project.projectType,
      status: project.status,
      location: project.location,
      contractValue: formatMoneyUnits(contract),
      estimatedCost: formatMoneyUnits(estimated),
      budget: formatMoneyUnits(budget),
      actualCost: formatMoneyUnits(actual),
      recognizedRevenue: formatMoneyUnits(recognizedRevenue),
      recognizedCost: formatMoneyUnits(recognizedCost),
      grossProfit: formatMoneyUnits(recognizedRevenue - recognizedCost),
      contractOutstanding: formatMoneyUnits(contract - invoiced),
      costVariance: formatMoneyUnits(budget - actual),
      estimatedCompletionMargin: formatMoneyUnits(contract - estimated),
      startDate: project.startDate.toISOString().slice(0, 10),
      expectedCompletionDate: project.expectedCompletionDate.toISOString().slice(0, 10),
    };
  }

  private async project(access: AccessContext, id: string) {
    const companyId = await this.companyId(access.userId);
    const project = await this.prisma.project.findFirst({ where: { id, companyId }, include: { customer: true } });
    if (!project) throw new NotFoundException("Project was not found");
    assertBranchAllowed(access.scope, project.branchId);
    return project;
  }

  private async material(access: AccessContext, projectId: string, requestId: string) {
    const project = await this.project(access, projectId);
    const request = await this.prisma.projectMaterialRequest.findFirst({ where: { id: requestId, projectId: project.id } });
    if (!request) throw new NotFoundException("Material request was not found");
    return { ...request, project };
  }

  private async customer(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException("Customer was not found");
    return customer;
  }

  private async account(companyId: string, accountCode: string) {
    const account = await this.prisma.account.findFirst({ where: { companyId, accountCode, deletedAt: null } });
    if (!account) throw new NotFoundException(`Account ${accountCode} was not found`);
    return account;
  }

  private async accountNet(projectId: string, accountCode: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: { projectId, account: { accountCode }, journal: { status: "posted" } },
      select: { debit: true, credit: true },
    });
    return lines.reduce((sum, line) => sum + parseMoney(line.debit.toFixed(4)) - parseMoney(line.credit.toFixed(4)), 0n);
  }

  private async revenueNet(projectId: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: { projectId, account: { accountType: "revenue" }, journal: { status: "posted" } },
      select: { debit: true, credit: true },
    });
    return lines.reduce((sum, line) => sum + parseMoney(line.credit.toFixed(4)) - parseMoney(line.debit.toFixed(4)), 0n);
  }

  private async companyId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
    if (!user) throw new NotFoundException("User was not found");
    return user.companyId;
  }

  private quotationLine(line: ProjectQuotationLineDto) {
    return { category: line.category, description: line.description, quantity: line.quantity, unitAmount: line.unitAmount };
  }

  private budgetLine(companyId: string, line: ProjectBudgetLineDto) {
    return { companyId, category: line.category, amount: line.amount };
  }

  private line(accountId: string, branchId: string, customerId: string, projectId: string, debit: string, credit: string, description: string) {
    return { accountId, branchId, customerId, projectId, debit, credit, description };
  }
}
