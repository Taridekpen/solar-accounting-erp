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

describe("solar installation projects", () => {
  let prisma: PrismaClient;
  let maker: AccessContext;
  let approver: AccessContext;
  let outsider: AccessContext;
  let branchId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    const reviewer = await prisma.user.upsert({
      where: { email: "project-approver@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "project-approver@solar.local", status: "active" },
    });
    branchId = branch.id;
    maker = context(admin.id, admin.email, true, { type: "company" }, ["projects.view", "projects.create", "projects.issue", "projects.approve"]);
    approver = context(reviewer.id, reviewer.email, true, { type: "company" }, ["projects.view", "projects.approve", "projects.issue"]);
    outsider = context(reviewer.id, reviewer.email, false, { type: "branches", branchIds: [randomUUID()] }, ["projects.view"]);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("reserves stock, issues it once into work in progress, and recognizes a November milestone", async () => {
    const { ProjectsService } = await import("./projects.service");
    const { DashboardService } = await import("../dashboard/dashboard.service");
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    const { AuditService } = await import("../auth/audit.service");
    const posting = new AccountingPostingService(prisma as never, new DocumentNumberService(prisma as never));
    const projects = new ProjectsService(prisma as never, new DocumentNumberService(prisma as never), posting, new AuditService(prisma as never));
    const dashboard = new DashboardService(prisma as never);
    const suffix = randomUUID().slice(0, 8);
    let productId = "";
    try {
      const companyId = (await prisma.user.findUniqueOrThrow({ where: { id: maker.userId } })).companyId;
      const category = await prisma.productCategory.findFirstOrThrow({ where: { companyId } });
      const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { branchId, warehouseType: "main", status: "active" } });
      const inventory = await prisma.account.findFirstOrThrow({ where: { companyId, accountCode: "1300", deletedAt: null } });
      const payable = await prisma.account.findFirstOrThrow({ where: { companyId, accountCode: "2000", deletedAt: null } });
      const cash = await prisma.account.findFirstOrThrow({ where: { companyId, accountCode: "1000", deletedAt: null } });
      const customer = await prisma.customer.create({
        data: { companyId, customerCode: `PRJ-${suffix}`, customerType: "corporate", name: `November site ${suffix}` },
      });
      const product = await prisma.product.create({
        data: { companyId, categoryId: category.id, sku: `PRJ-${suffix}`, name: `Project panel ${suffix}`, productType: "product", defaultCost: "10000.0000" },
      });
      productId = product.id;
      await posting.postSystemDocument(maker, {
        sourceModule: "projects",
        sourceDocumentType: "project_stock",
        sourceDocumentId: randomUUID(),
        accountingDate: "2026-11-10",
        description: "November project stock",
        lines: [
          { accountId: inventory.id, branchId, debit: "40000.0000", credit: "0.0000", description: "Receive panels" },
          { accountId: payable.id, branchId, debit: "0.0000", credit: "40000.0000", description: "Receive panels" },
        ],
        stockMoves: [{ productId, branchId, warehouseId: warehouse.id, quantity: "4.0000", unitCost: "10000.0000", movementType: "purchase_receipt" }],
      });
      const project = await projects.create(maker, {
        customerId: customer.id,
        branchId,
        name: `November installation ${suffix}`,
        projectType: "residential",
        location: "Lekki",
        contractValue: "100000.0000",
        estimatedCost: "60000.0000",
        startDate: "2026-11-01",
        expectedCompletionDate: "2026-11-30",
        status: "active",
        quotation: [{ category: "panels", description: "Roof panels", quantity: "4.0000", unitAmount: "20000.0000" }],
        budgets: [{ category: "materials", amount: "40000.0000" }],
      });
      await expect(projects.get(outsider, project.id)).rejects.toBeInstanceOf(ForbiddenException);
      const first = await projects.reserve(maker, project.id, { productId, warehouseId: warehouse.id, quantity: "3.0000" });
      expect(await available(prisma, productId, branchId)).toBe(parseMoney("1.0000"));
      await expect(projects.reserve(maker, project.id, { productId, warehouseId: warehouse.id, quantity: "2.0000" })).rejects.toBeInstanceOf(BadRequestException);
      await expect(projects.approveMaterial(maker, project.id, first.id)).rejects.toBeInstanceOf(ForbiddenException);
      await projects.approveMaterial(approver, project.id, first.id);
      const revenueBefore = await projectNet(prisma, project.id, "revenue");
      await projects.issue(approver, project.id, first.id, { accountingDate: "2026-11-12" });
      await expect(projects.issue(approver, project.id, first.id, { accountingDate: "2026-11-12" })).rejects.toBeInstanceOf(BadRequestException);
      expect(await projectNet(prisma, project.id, "1400")).toBe(parseMoney("30000.0000"));
      expect(await projectNet(prisma, project.id, "5100")).toBe(0n);
      expect(await prisma.stockMovement.count({ where: { productId, movementType: "project_issue" } })).toBe(1);
      await projects.returnMaterial(approver, project.id, first.id, { accountingDate: "2026-11-13" });
      expect(await projectNet(prisma, project.id, "1400")).toBe(0n);
      expect(await prisma.stockMovement.count({ where: { productId, movementType: "project_return" } })).toBe(1);
      const second = await projects.reserve(maker, project.id, { productId, warehouseId: warehouse.id, quantity: "2.0000" });
      await projects.approveMaterial(approver, project.id, second.id);
      await projects.issue(approver, project.id, second.id, { accountingDate: "2026-11-14" });
      await projects.deposit(maker, project.id, { accountId: cash.id, amount: "10000.0000", depositDate: "2026-11-15" });
      expect(await projectNet(prisma, project.id, "revenue")).toBe(revenueBefore);
      expect(await projectNet(prisma, project.id, "2100")).toBe(-parseMoney("10000.0000"));
      const receipt = await prisma.customerReceipt.findFirstOrThrow({ where: { customerId: customer.id } });
      expect(receipt.advanceAmount.toFixed(4)).toBe("10000.0000");
      const milestone = await projects.addMilestone(maker, project.id, { name: "Installation progress", amount: "50000.0000", sequence: 1 });
      await expect(projects.recognize(maker, project.id, milestone.id, { accountingDate: "2026-11-16" })).rejects.toBeInstanceOf(ForbiddenException);
      const recognized = await projects.recognize(approver, project.id, milestone.id, { accountingDate: "2026-11-16" });
      const invoice = await prisma.salesInvoice.findFirstOrThrow({ where: { projectId: project.id, status: "posted" } });
      expect(await customerAccountNet(prisma, customer.id, "1200")).toBe(parseMoney(invoice.grandTotal.toFixed(4)));
      expect(recognized.recognizedRevenue).toBe("50000.0000");
      expect(recognized.recognizedCost).toBe("10000.0000");
      expect(recognized.grossProfit).toBe("40000.0000");
      expect(parseMoney(recognized.grossProfit)).toBe(parseMoney(recognized.recognizedRevenue) - parseMoney(recognized.recognizedCost));
      const september = await dashboard.getSummary({ preset: "custom", from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T23:59:59.999Z" });
      expect(september.projectProfitability).toEqual([]);
      expect(september.operations.activeProjects).toBe(0);
      expect(september.operations.activeInstallations).toBe(0);
      const november = await dashboard.getSummary({ preset: "custom", from: "2026-11-01T00:00:00.000Z", to: "2026-11-30T23:59:59.999Z" });
      const row = november.projectProfitability.find((item) => item.name === project.name);
      expect(row?.grossProfit).toBe("40000.0000");
      expect(november.operations.activeProjects).toBeGreaterThan(0);
    } finally {
      if (productId) {
        await prisma.stockPosition.updateMany({ where: { productId }, data: { reservedQuantity: "0.0000" } });
      }
    }
  }, 60_000);
});

function context(userId: string, email: string, companyWide: boolean, scope: AccessContext["scope"], permissions: string[]): AccessContext {
  return {
    userId,
    email,
    sessionId: "00000000-0000-4000-8000-000000000011",
    csrfTokenHash: "test",
    permissions,
    roleCodes: companyWide ? ["super_administrator"] : ["branch_accountant"],
    companyWide,
    mfaPending: false,
    mfaEnabled: true,
    scope,
  };
}

async function available(prisma: PrismaClient, productId: string, branchId: string) {
  const position = await prisma.stockPosition.findFirstOrThrow({ where: { productId, branchId } });
  return parseMoney(position.physicalQuantity.toFixed(4)) - parseMoney(position.reservedQuantity.toFixed(4));
}

async function projectNet(prisma: PrismaClient, projectId: string, accountCodeOrType: string) {
  const lines = await prisma.journalLine.findMany({
    where: {
      projectId,
      journal: { status: "posted" },
      account: accountCodeOrType === "revenue" ? { accountType: "revenue" } : { accountCode: accountCodeOrType },
    },
  });
  return lines.reduce((sum, line) => sum + parseMoney(line.debit.toFixed(4)) - parseMoney(line.credit.toFixed(4)), 0n);
}

async function customerAccountNet(prisma: PrismaClient, customerId: string, accountCode: string) {
  const lines = await prisma.journalLine.findMany({
    where: { customerId, journal: { status: "posted" }, account: { accountCode } },
  });
  return lines.reduce((sum, line) => sum + parseMoney(line.debit.toFixed(4)) - parseMoney(line.credit.toFixed(4)), 0n);
}
