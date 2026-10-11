import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";
import type { ProcurementService } from "../procurement/procurement.service";

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

const SEPTEMBER = { preset: "custom" as const, from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T23:59:59.999Z" };

describe("inventory costing and transfers", () => {
  let prisma: PrismaClient;
  let clerk: AccessContext;
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
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    const other = await prisma.branch.upsert({
      where: { companyId_branchCode: { companyId: admin.companyId, branchCode: "INVX" } },
      update: {},
      create: { companyId: admin.companyId, branchCode: "INVX", name: "Inventory destination", status: "active" },
    });
    await prisma.warehouse.upsert({
      where: { branchId_warehouseCode: { branchId: other.id, warehouseCode: "INVX-MAIN" } },
      update: {},
      create: { companyId: admin.companyId, branchId: other.id, warehouseCode: "INVX-MAIN", name: "Main", warehouseType: "main", status: "active" },
    });
    for (const sequence of [
      { documentType: "stock_count", prefix: "CNT" },
      { documentType: "journal", prefix: "JRN" },
    ]) {
      await prisma.documentSequence.upsert({
        where: { companyId_branchId_documentType: { companyId: admin.companyId, branchId: other.id, documentType: sequence.documentType } },
        update: {},
        create: { companyId: admin.companyId, branchId: other.id, documentType: sequence.documentType, prefix: sequence.prefix },
      });
    }
    const buyer = await prisma.user.upsert({
      where: { email: "inventory-clerk@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "inventory-clerk@solar.local", status: "active" },
    });
    const reviewer = await prisma.user.upsert({
      where: { email: "inventory-approver@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "inventory-approver@solar.local", status: "active" },
    });
    branchId = branch.id;
    otherBranchId = other.id;
    clerk = context(buyer.id, buyer.email, false, { type: "branches", branchIds: [branch.id, other.id] }, [
      "inventory.view", "inventory.transfer", "inventory.count", "purchases.create", "purchases.view", "purchases.receive", "sales.create", "sales.view", "suppliers.view",
    ]);
    approver = context(reviewer.id, reviewer.email, false, { type: "branches", branchIds: [branch.id, other.id] }, [
      "inventory.view", "inventory.transfer", "inventory.adjust", "purchases.view", "purchases.approve",
    ]);
    outsider = context(reviewer.id, reviewer.email, false, { type: "branches", branchIds: [other.id] }, ["inventory.view"]);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("costs a second receipt, blocks a repeated serial, and moves stock without changing company inventory", async () => {
    const { InventoryService } = await import("./inventory.service");
    const { ProcurementService } = await import("../procurement/procurement.service");
    const { SuppliersService } = await import("../procurement/suppliers.service");
    const { SalesService } = await import("../sales/sales.service");
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    const { DashboardService } = await import("../dashboard/dashboard.service");
    const documents = new DocumentNumberService(prisma as never);
    const posting = new AccountingPostingService(prisma as never, documents);
    const inventory = new InventoryService(prisma as never, documents, posting);
    const procurement = new ProcurementService(prisma as never, documents, posting);
    const suppliers = new SuppliersService(prisma as never, documents);
    const sales = new SalesService(prisma as never, documents, posting);
    const dashboard = new DashboardService(prisma as never);
    await prisma.stockTransfer.updateMany({ where: { status: "shipped" }, data: { status: "received" } });
    const suffix = randomUUID().slice(0, 8);
    const category = await prisma.productCategory.findFirstOrThrow();
    const revenue = await prisma.account.findFirstOrThrow({ where: { accountCode: "4000" } });
    const product = await prisma.product.create({
      data: {
        companyId: category.companyId,
        categoryId: category.id,
        sku: `INV-${suffix}`,
        name: `Tracked inverter ${suffix}`,
        productType: "product",
        defaultCost: "50000.0000",
        defaultSellingPrice: "180000.0000",
        trackSerial: true,
        revenueAccountId: revenue.id,
      },
    });
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { branchId, warehouseCode: "HO-MAIN" } });
    const destination = await prisma.warehouse.findFirstOrThrow({ where: { branchId: otherBranchId, warehouseCode: "INVX-MAIN" } });
    const supplier = await suppliers.create(clerk, {
      businessName: `Inverter Supply ${suffix}`,
      branchId,
      phone: `0804${suffix.replace(/\D/g, "").padEnd(7, "5").slice(0, 7)}`,
      email: `inverter-${suffix}@solar.local`,
      paymentTermsDays: 14,
      bankName: "Test Bank",
      accountName: "Inverter Supply",
      accountNumber: "1098765432",
    });
    const firstSerial = `SER-A-${suffix}`;
    const secondSerial = `SER-B-${suffix}`;
    await receive(procurement, clerk, approver, {
      branchId, warehouseId: warehouse.id, supplierId: supplier.id, productId: product.id, unitCost: "100000.0000", serial: firstSerial, date: "2026-02-11", warrantyMonths: 12,
    });
    const afterFirst = await prisma.stockPosition.findFirstOrThrow({ where: { productId: product.id, branchId } });
    expect(afterFirst.averageUnitCost.toFixed(4)).toBe("100000.0000");
    expect(afterFirst.physicalQuantity.toFixed(4)).toBe("1.0000");
    const serial = await prisma.goodsReceiptSerial.findFirstOrThrow({ where: { serialNumber: firstSerial } });
    expect(serial.status).toBe("in_stock");
    expect(serial.warrantyEnd?.toISOString().slice(0, 10)).toBe("2027-02-11");
    await receive(procurement, clerk, approver, {
      branchId, warehouseId: warehouse.id, supplierId: supplier.id, productId: product.id, unitCost: "200000.0000", serial: secondSerial, date: "2026-02-12",
    });
    const afterSecond = await prisma.stockPosition.findFirstOrThrow({ where: { productId: product.id, branchId } });
    expect(afterSecond.averageUnitCost.toFixed(4)).toBe("150000.0000");
    expect(afterSecond.physicalQuantity.toFixed(4)).toBe("2.0000");
    const catalog = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(catalog.defaultCost.toFixed(4)).toBe("50000.0000");
    const hidden = await inventory.stock(outsider);
    expect(hidden.some((row) => row.productId === product.id)).toBe(false);
    await expect(inventory.serial(outsider, secondSerial)).rejects.toBeInstanceOf(NotFoundException);

    const customer = await prisma.customer.create({
      data: {
        companyId: category.companyId,
        customerCode: `INV-${suffix}`,
        customerType: "individual",
        name: `Inventory buyer ${suffix}`,
        creditLimit: "0.0000",
        branches: { create: { branchId } },
      },
    });
    const invoice = await sales.createInvoice(clerk, {
      branchId,
      customerId: customer.id,
      invoiceDate: "2026-02-13",
      paymentTermsDays: 0,
      settlement: "cash",
      cashMethod: "cash",
      lines: [{ productId: product.id, quantity: "1.0000", unitPrice: "180000.0000", discount: "0", taxRate: "0", serialNumbers: [firstSerial] }],
    });
    const storedLine = await prisma.salesInvoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(storedLine.unitCost.toFixed(4)).toBe("150000.0000");
    await sales.finalizeInvoice(clerk, invoice.id);
    const savedInvoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    await prisma.salesInvoiceAllocation.create({
      data: { invoiceId: savedInvoice.id, amount: savedInvoice.grandTotal, sourceType: "cash", sourceId: savedInvoice.journalEntryId ?? savedInvoice.id },
    });
    const costLines = await prisma.journalLine.findMany({ where: { journalEntryId: savedInvoice.journalEntryId ?? "" }, include: { account: true } });
    expect(costLines.find((line) => line.account.accountCode === "5000")?.debit.toFixed(4)).toBe("150000.0000");
    const repeat = await sales.createInvoice(clerk, {
      branchId,
      customerId: customer.id,
      invoiceDate: "2026-02-14",
      paymentTermsDays: 0,
      settlement: "cash",
      cashMethod: "cash",
      lines: [{ productId: product.id, quantity: "1.0000", unitPrice: "180000.0000", discount: "0", taxRate: "0", serialNumbers: [firstSerial] }],
    });
    await expect(sales.finalizeInvoice(clerk, repeat.id)).rejects.toBeInstanceOf(ConflictException);

    await prisma.product.update({ where: { id: product.id }, data: { reorderLevel: "1.0000" } });
    try {
      const alert = await dashboard.getSummary({ preset: "this_month" });
      expect(alert.operations.lowStockAlerts).toBeGreaterThan(0);
    } finally {
      await prisma.product.update({ where: { id: product.id }, data: { reorderLevel: "0.0000" } });
    }

    const before = await inventoryValue(prisma);
    const transfer = await inventory.createTransfer(clerk, {
      sourceBranchId: branchId,
      destinationBranchId: otherBranchId,
      sourceWarehouseId: warehouse.id,
      destinationWarehouseId: destination.id,
      transferDate: "2026-02-16",
      lines: [{ productId: product.id, quantity: "1.0000" }],
    });
    await inventory.submitTransfer(clerk, transfer.id);
    await expect(inventory.approveTransfer(clerk, transfer.id)).rejects.toBeInstanceOf(ForbiddenException);
    await inventory.approveTransfer(approver, transfer.id);
    const shipped = await inventory.shipTransfer(clerk, transfer.id);
    const shipLines = await prisma.journalLine.findMany({ where: { journalEntryId: shipped.shipJournalId ?? "" }, include: { account: true } });
    expect(shipLines.find((line) => line.account.accountCode === "1320")?.debit.toFixed(4)).toBe("150000.0000");
    expect(shipLines.find((line) => line.account.accountCode === "1300")?.credit.toFixed(4)).toBe("150000.0000");
    expect(await inventoryValue(prisma)).toBe(before);
    const source = await prisma.stockPosition.findFirstOrThrow({ where: { productId: product.id, branchId } });
    const destinationStock = await prisma.stockPosition.findFirst({ where: { productId: product.id, branchId: otherBranchId } });
    expect(source.physicalQuantity.toFixed(4)).toBe("0.0000");
    expect(destinationStock?.physicalQuantity.toFixed(4) ?? "0.0000").toBe("0.0000");
    const inTransit = await dashboard.getSummary({ preset: "this_month" });
    expect(inTransit.operations.pendingTransfers).toBeGreaterThan(0);
    await inventory.receiveTransfer(clerk, transfer.id);
    expect(await inventoryValue(prisma)).toBe(before);
    const received = await prisma.stockPosition.findFirstOrThrow({ where: { productId: product.id, branchId: otherBranchId } });
    expect(received.physicalQuantity.toFixed(4)).toBe("1.0000");
    expect(received.averageUnitCost.toFixed(4)).toBe("150000.0000");
    const movedSerial = await prisma.goodsReceiptSerial.findFirstOrThrow({ where: { serialNumber: secondSerial } });
    expect(movedSerial.status).toBe("in_stock");
    expect(movedSerial.warehouseId).toBe(destination.id);

    const count = await inventory.createCount({ ...clerk, scope: { type: "branches", branchIds: [otherBranchId] } }, {
      branchId: otherBranchId,
      warehouseId: destination.id,
      countDate: "2026-02-18",
      lines: [{ productId: product.id, countedQuantity: "0.0000" }],
    });
    await expect(inventory.postCount({ ...clerk, scope: { type: "branches", branchIds: [otherBranchId] } }, count.id)).rejects.toBeInstanceOf(ForbiddenException);
    const postedCount = await inventory.postCount(approver, count.id);
    const countLines = await prisma.journalLine.findMany({ where: { journalEntryId: postedCount.journalEntryId ?? "" }, include: { account: true } });
    expect(countLines.find((line) => line.account.accountCode === "6900")?.debit.toFixed(4)).toBe("150000.0000");
    expect(countLines.find((line) => line.account.accountCode === "1300")?.credit.toFixed(4)).toBe("150000.0000");
    const cleared = await prisma.stockPosition.findFirstOrThrow({ where: { productId: product.id, branchId: otherBranchId } });
    expect(cleared.physicalQuantity.toFixed(4)).toBe("0.0000");
    const finished = await prisma.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
    expect(finished.status).toBe("received");
    const september = await dashboard.getSummary(SEPTEMBER);
    expect(september.inventoryByCategory).toEqual([]);
    expect(september.operations.lowStockAlerts).toBe(0);
    expect(september.operations.pendingTransfers).toBe(0);
  }, 60_000);
});

async function receive(
  procurement: ProcurementService,
  clerk: AccessContext,
  approver: AccessContext,
  input: { branchId: string; warehouseId: string; supplierId: string; productId: string; unitCost: string; serial: string; date: string; warrantyMonths?: number },
) {
  const order = await procurement.createOrder(clerk, {
    branchId: input.branchId,
    warehouseId: input.warehouseId,
    supplierId: input.supplierId,
    procurementMode: "branch",
    expectedDeliveryDate: input.date,
    lines: [{ productId: input.productId, quantity: "1.0000", unitCost: input.unitCost, taxRate: "0" }],
  });
  await procurement.submitOrder(clerk, order.id);
  await procurement.approveOrder(approver, order.id);
  return procurement.createReceipt(clerk, {
    purchaseOrderId: order.id,
    receiptDate: input.date,
    lines: [{
      purchaseOrderLineId: order.lines[0].id,
      acceptedQuantity: "1.0000",
      rejectedQuantity: "0.0000",
      serialNumbers: [input.serial],
      warrantyMonths: input.warrantyMonths,
    }],
  });
}

async function inventoryValue(prisma: PrismaClient) {
  const lines = await prisma.journalLine.findMany({
    where: { journal: { status: "posted" }, account: { accountSubtype: "inventory" } },
    select: { debit: true, credit: true },
  });
  const total = lines.reduce((sum, line) => sum + units(line.debit.toFixed(4)) - units(line.credit.toFixed(4)), 0n);
  return total;
}

function units(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  return (negative ? -1n : 1n) * (BigInt(whole) * 10000n + BigInt((fraction + "0000").slice(0, 4)));
}

function context(
  userId: string,
  email: string,
  companyWide: boolean,
  scope: AccessContext["scope"],
  permissions: string[],
): AccessContext {
  return {
    userId,
    email,
    sessionId: "00000000-0000-4000-8000-000000000008",
    csrfTokenHash: "test",
    permissions,
    roleCodes: companyWide ? ["super_administrator"] : ["inventory_officer"],
    companyWide,
    mfaPending: false,
    mfaEnabled: true,
    scope,
  };
}
