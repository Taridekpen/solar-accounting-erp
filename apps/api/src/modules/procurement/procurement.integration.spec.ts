import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";
import type { ProcurementService } from "./procurement.service";

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

describe("suppliers and procurement", () => {
  let prisma: PrismaClient;
  let companyUser: AccessContext;
  let branchUser: AccessContext;
  let branchApprover: AccessContext;
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
      where: { companyId_branchCode: { companyId: admin.companyId, branchCode: "PROCX" } },
      update: {},
      create: { companyId: admin.companyId, branchCode: "PROCX", name: "Procurement exclusion", status: "active" },
    });
    const buyer = await prisma.user.upsert({
      where: { email: "branch-buyer@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "branch-buyer@solar.local", status: "active" },
    });
    const reviewer = await prisma.user.upsert({
      where: { email: "branch-approver@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "branch-approver@solar.local", status: "active" },
    });
    branchId = branch.id;
    otherBranchId = other.id;
    companyUser = context(admin.id, admin.email, true, { type: "company" }, ["purchases.create", "purchases.view", "purchases.approve", "purchases.receive", "suppliers.view"]);
    branchUser = context(buyer.id, buyer.email, false, { type: "branches", branchIds: [branch.id] }, ["purchases.create", "purchases.view", "purchases.receive", "suppliers.view"]);
    branchApprover = context(reviewer.id, reviewer.email, false, { type: "branches", branchIds: [branch.id] }, ["purchases.view", "purchases.approve"]);
    outsider = context(reviewer.id, reviewer.email, false, { type: "branches", branchIds: [other.id] }, ["purchases.view"]);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("receives stock, matches a bill, and settles the payable in May", async () => {
    const { SuppliersService } = await import("./suppliers.service");
    const { ProcurementService } = await import("./procurement.service");
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    const documents = new DocumentNumberService(prisma as never);
    const posting = new AccountingPostingService(prisma as never, documents);
    const suppliers = new SuppliersService(prisma as never, documents);
    const procurement = new ProcurementService(prisma as never, documents, posting);
    await prisma.company.updateMany({ data: { purchaseApprovalLimit: "500000.0000" } });
    await settleOpenBills(prisma, procurement, branchUser, companyUser);
    const suffix = randomUUID().slice(0, 8);
    const category = await prisma.productCategory.findFirstOrThrow();
    const revenue = await prisma.account.findFirstOrThrow({ where: { accountCode: "4000" } });
    const product = await prisma.product.create({
      data: {
        companyId: category.companyId,
        categoryId: category.id,
        sku: `BUY-${suffix}`,
        name: `Purchase panel ${suffix}`,
        productType: "product",
        defaultCost: "80000.0000",
        defaultSellingPrice: "120000.0000",
        revenueAccountId: revenue.id,
      },
    });
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { branchId, warehouseCode: "HO-MAIN" } });
    const supplier = await suppliers.create(branchUser, {
      businessName: `Panel Supply ${suffix}`,
      branchId,
      phone: `0803${suffix.replace(/\D/g, "").padEnd(7, "4").slice(0, 7)}`,
      email: `supply-${suffix}@solar.local`,
      paymentTermsDays: 14,
      bankName: "Test Bank",
      accountName: "Panel Supply",
      accountNumber: "0123456789",
    });
    expect(supplier.bankAccountMask).toBe("••••6789");
    expect(JSON.stringify(supplier)).not.toContain("0123456789");

    const orderInput = {
      branchId,
      warehouseId: warehouse.id,
      supplierId: supplier.id,
      procurementMode: "branch" as const,
      expectedDeliveryDate: "2026-05-20",
      lines: [{ productId: product.id, quantity: "1.0000", unitCost: "100000.0000", taxRate: "0" }],
    };
    const preview = await procurement.previewOrder(branchUser, orderInput);
    expect(preview.grandTotal).toBe("100000.0000");
    const order = await procurement.createOrder(branchUser, orderInput);
    await procurement.submitOrder(branchUser, order.id);
    await expect(procurement.approveOrder(branchUser, order.id)).rejects.toBeInstanceOf(ForbiddenException);
    const approved = await procurement.approveOrder(branchApprover, order.id);
    expect(approved.status).toBe("approved");
    const orderJournals = await prisma.journalEntry.count({ where: { sourceDocumentId: order.id } });
    expect(orderJournals).toBe(0);

    const large = await procurement.createOrder(branchUser, {
      ...orderInput,
      lines: [{ productId: product.id, quantity: "1.0000", unitCost: "600000.0000", taxRate: "0" }],
    });
    await procurement.submitOrder(branchUser, large.id);
    await expect(procurement.approveOrder(branchApprover, large.id)).rejects.toBeInstanceOf(BadRequestException);
    await procurement.approveOrder(companyUser, large.id);

    await expect(procurement.createOrder(branchUser, { ...orderInput, procurementMode: "central" })).rejects.toBeInstanceOf(ForbiddenException);
    const central = await procurement.createOrder(companyUser, { ...orderInput, procurementMode: "central" });
    expect(central.procurementMode).toBe("central");
    await expect(procurement.orderPdf(outsider, order.id)).rejects.toBeInstanceOf(NotFoundException);

    const receipt = await procurement.createReceipt(branchUser, {
      purchaseOrderId: order.id,
      receiptDate: "2026-05-16",
      deliveryDocument: `DN-${suffix}`,
      lines: [{ purchaseOrderLineId: order.lines[0].id, acceptedQuantity: "1.0000", rejectedQuantity: "0.0000", serialNumbers: [`SER-${suffix}`] }],
    });
    const stock = await prisma.stockPosition.findFirstOrThrow({ where: { productId: product.id, branchId } });
    expect(stock.physicalQuantity.toFixed(4)).toBe("1.0000");
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stored.defaultCost.toFixed(4)).toBe("80000.0000");
    const receiptLines = await prisma.journalLine.findMany({ where: { journalEntryId: receipt.journalEntryId ?? "" }, include: { account: true } });
    expect(receiptLines.some((line) => line.account.accountCode === "2000")).toBe(false);
    expect(receiptLines.find((line) => line.account.accountCode === "1300")?.debit.toFixed(4)).toBe("100000.0000");
    expect(receiptLines.find((line) => line.account.accountCode === "1310")?.credit.toFixed(4)).toBe("100000.0000");

    const billInput = {
      purchaseOrderId: order.id,
      supplierInvoiceNumber: `INV-${suffix}`,
      invoiceDate: "2026-05-17",
      attachmentName: `INV-${suffix}.pdf`,
      lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: "1.0000", unitCost: "110000.0000", taxRate: "0" }],
    };
    const matched = await procurement.previewBill(branchUser, billInput);
    expect(matched.flags.priceDifference).toBe(true);
    expect(matched.flags.missingReceipt).toBe(false);
    const bill = await procurement.createBill(branchUser, billInput);
    expect(bill.grandTotal).toBe("110000.0000");
    await expect(procurement.createBill(branchUser, billInput)).rejects.toBeInstanceOf(ConflictException);
    const billLines = await prisma.journalLine.findMany({
      where: { journal: { sourceDocumentId: bill.id, status: "posted" } },
      include: { account: true },
    });
    expect(billLines.find((line) => line.account.accountCode === "2000")?.credit.toFixed(4)).toBe("110000.0000");
    expect(billLines.find((line) => line.account.accountCode === "5100")?.debit.toFixed(4)).toBe("10000.0000");
    expect(billLines.find((line) => line.account.accountCode === "1310")?.debit.toFixed(4)).toBe("100000.0000");

    const partial = await procurement.createPayment(branchUser, {
      branchId,
      supplierId: supplier.id,
      paymentDate: "2026-05-18",
      method: "bank_transfer",
      total: "40000.0000",
      allocations: [{ billId: bill.id, amount: "40000.0000" }],
    });
    await expect(procurement.postPayment(branchUser, partial.id)).rejects.toBeInstanceOf(ForbiddenException);
    await procurement.postPayment(branchApprover, partial.id);
    const open = await suppliers.statement(companyUser, supplier.id);
    expect(open.outstandingBalance).toBe("70000.0000");
    expect(open.accountsPayable).toBe("70000.0000");

    const remainder = await procurement.createPayment(branchUser, {
      branchId,
      supplierId: supplier.id,
      paymentDate: "2026-05-19",
      method: "cash",
      total: "70000.0000",
      allocations: [{ billId: bill.id, amount: "70000.0000" }],
    });
    await procurement.postPayment(companyUser, remainder.id);
    const settled = await suppliers.statement(companyUser, supplier.id);
    expect(settled.outstandingBalance).toBe("0.0000");
    expect(settled.accountsPayable).toBe("0.0000");
    const paymentLines = await prisma.journalLine.findMany({
      where: { journal: { sourceDocumentType: "supplier_payment", status: "posted", lines: { some: { supplierId: supplier.id } } } },
      include: { account: true },
    });
    expect(paymentLines.some((line) => ["1300", "5100"].includes(line.account.accountCode))).toBe(false);
  }, 30_000);
});

async function settleOpenBills(prisma: PrismaClient, procurement: ProcurementService, creator: AccessContext, approver: AccessContext) {
  const bills = await prisma.supplierBill.findMany({ where: { status: "posted" }, include: { allocations: true } });
  for (const bill of bills) {
    const open = units(bill.grandTotal.toFixed(4)) - bill.allocations.reduce((total, row) => total + units(row.amount.toFixed(4)), 0n);
    if (open <= 0n) continue;
    const amount = formatUnits(open);
    const payment = await procurement.createPayment(creator, {
      branchId: bill.branchId,
      supplierId: bill.supplierId,
      paymentDate: "2026-05-19",
      method: "cash",
      total: amount,
      allocations: [{ billId: bill.id, amount }],
    });
    await procurement.postPayment(approver, payment.id);
  }
}

function units(value: string): bigint {
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const parsed = BigInt(whole) * 10000n + BigInt((fraction + "0000").slice(0, 4));
  return value.startsWith("-") ? -parsed : parsed;
}

function formatUnits(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 10000n;
  const fraction = (absolute % 10000n).toString().padStart(4, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
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
    sessionId: "00000000-0000-4000-8000-000000000007",
    csrfTokenHash: "test",
    permissions,
    roleCodes: companyWide ? ["super_administrator"] : ["branch_manager"],
    companyWide,
    mfaPending: false,
    mfaEnabled: true,
    scope,
  };
}
