import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";
import { renderSalesPdf } from "./sales-pdf";

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

describe("customers and sales", () => {
  let prisma: PrismaClient;
  let access: AccessContext;
  let approver: AccessContext;
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
      where: { companyId_branchCode: { companyId: admin.companyId, branchCode: "SALEX" } },
      update: {},
      create: {
        companyId: admin.companyId,
        branchCode: "SALEX",
        name: "Sales exclusion branch",
        status: "active",
        documentSequences: {
          create: [
            { companyId: admin.companyId, documentType: "sales_invoice", prefix: "INV" },
            { companyId: admin.companyId, documentType: "quotation", prefix: "QT" },
            { companyId: admin.companyId, documentType: "customer_receipt", prefix: "RCT" },
            { companyId: admin.companyId, documentType: "credit_note", prefix: "CN" },
            { companyId: admin.companyId, documentType: "journal", prefix: "JRN" },
          ],
        },
      },
    });
    const reviewer = await prisma.user.upsert({
      where: { email: "sales-approver@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "sales-approver@solar.local", status: "active" },
    });
    branchId = branch.id;
    otherBranchId = other.id;
    access = context(admin.id, admin.email);
    approver = context(reviewer.id, reviewer.email);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("calculates, collects, reconciles, and reverses a product sale", async () => {
    const { CustomersService } = await import("./customers.service");
    const { SalesService } = await import("./sales.service");
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    const { DashboardService } = await import("../dashboard/dashboard.service");
    const documents = new DocumentNumberService(prisma as never);
    const posting = new AccountingPostingService(prisma as never, documents);
    const customers = new CustomersService(prisma as never, documents);
    const sales = new SalesService(prisma as never, documents, posting);
    const dashboard = new DashboardService(prisma as never);
    const suffix = randomUUID().slice(0, 8);
    const category = await prisma.productCategory.findFirstOrThrow({ where: { name: "Solar Panels" } });
    const revenue = await prisma.account.findFirstOrThrow({ where: { accountCode: "4000" } });
    const product = await prisma.product.create({
      data: {
        companyId: category.companyId,
        categoryId: category.id,
        sku: `PNL-${suffix}`,
        name: `Test panel ${suffix}`,
        productType: "product",
        defaultCost: "100000.0000",
        defaultSellingPrice: "150000.0000",
        revenueAccountId: revenue.id,
      },
    });
    const inventory = await prisma.account.findFirstOrThrow({ where: { accountCode: "1300" } });
    const equity = await prisma.account.findFirstOrThrow({ where: { accountCode: "3000" } });
    const customer = await customers.create(access, {
      customerType: "corporate",
      name: `Lagos Solar ${suffix}`,
      branchId,
      phone: `0801${suffix.replaceAll("-", "").slice(0, 7)}`,
      email: `lagos-${suffix}@solar.local`,
      creditLimit: "1000000.0000",
      paymentTermsDays: 30,
    });
    await posting.importOpeningBalances(access, {
      accountingDate: "2026-06-02",
      description: `Opening stock ${suffix}`,
      lines: [
        { accountId: inventory.id, branchId, debit: "200000.0000", credit: "0", description: "Opening inventory" },
        { accountId: equity.id, branchId, debit: "0", credit: "200000.0000", description: "Opening equity" },
      ],
      details: [
        { kind: "inventory", accountCode: "1300", reference: product.sku, quantity: "2.0000", unitCost: "100000.0000", amount: "200000.0000", branchId },
        { kind: "equity", accountCode: "3000", amount: "200000.0000", branchId },
      ],
    });
    const preview = await sales.preview(access, invoiceBody(branchId, customer.id, product.id));
    expect(preview.grandTotal).toBe("150000.0000");
    expect(preview.taxTotal).toBe("0.0000");
    const quotation = await sales.createQuotation(access, {
      branchId,
      customerId: customer.id,
      validityDate: "2026-06-30",
      lines: [{ productId: product.id, quantity: "1.0000", unitPrice: "150000.0000" }],
    });
    expect(await prisma.journalEntry.count({ where: { sourceDocumentType: "sales_quotation", sourceDocumentId: quotation.id } })).toBe(0);
    const invoice = await sales.createInvoice(access, invoiceBody(branchId, customer.id, product.id));
    const salesBefore = await dashboard.getSummary({ preset: "custom", from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T23:59:59.999Z" });
    const posted = await sales.finalizeInvoice(access, invoice.id);
    const salesAfterInvoice = await dashboard.getSummary({ preset: "custom", from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T23:59:59.999Z" });
    expect(posted.grandTotal).toBe("150000.0000");
    expect(posted.status).toBe("posted");
    const stock = await prisma.stockPosition.findUniqueOrThrow({
      where: { companyId_productId_branchId: { companyId: product.companyId, productId: product.id, branchId } },
    });
    expect(stock.physicalQuantity.toFixed(4)).toBe("1.0000");
    const cogs = await prisma.journalLine.findFirst({
      where: { journal: { sourceDocumentId: invoice.id, status: "posted" }, account: { accountCode: "5000" }, debit: { gt: 0 } },
    });
    expect(cogs?.debit.toFixed(4)).toBe("100000.0000");
    const receipt = await sales.createReceipt(access, {
      branchId,
      customerId: customer.id,
      receiptDate: "2026-06-21",
      methods: [{ method: "cash", amount: "50000.0000" }],
      allocations: [{ invoiceId: invoice.id, amount: "50000.0000" }],
    });
    expect(receipt.advanceAmount).toBe("0.0000");
    const salesAfterReceipt = await dashboard.getSummary({ preset: "custom", from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T23:59:59.999Z" });
    expect(units(salesAfterInvoice.kpis.totalSales) - units(salesBefore.kpis.totalSales)).toBe(1500000000n);
    expect(units(salesAfterReceipt.kpis.totalSales) - units(salesAfterInvoice.kpis.totalSales)).toBe(0n);
    const open = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { allocations: true } });
    const allocated = open.allocations.reduce((total, row) => total + units(row.amount.toFixed(4)), 0n);
    expect(units(open.grandTotal.toFixed(4)) - allocated).toBe(1000000000n);
    const statement = await customers.statement(access, customer.id);
    expect(statement.outstandingBalance).toBe(statement.accountsReceivable);
    expect(statement.outstandingBalance).toBe("100000.0000");
    await expect(sales.finalizeInvoice({ ...access, scope: { type: "branches", branchIds: [otherBranchId] } }, invoice.id)).rejects.toBeInstanceOf(NotFoundException);
    const pdf = await renderSalesPdf(await sales.invoicePdf(access, invoice.id));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const encoded = [...pdf.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>/g)].map((match) => Buffer.from(match[1], "hex").toString("latin1")).join("");
    expect(encoded).toContain("150000.0000");
    await sales.createReceipt(access, {
      branchId,
      customerId: customer.id,
      receiptDate: "2026-06-22",
      methods: [{ method: "cash", amount: "100000.0000" }],
      allocations: [{ invoiceId: invoice.id, amount: "100000.0000" }],
    });
    const request = await sales.createReturn(access, {
      invoiceId: invoice.id,
      settlement: "refund",
      refundMethod: "cash",
      reason: "Panel returned",
      lines: [{ invoiceLineId: posted.lines[0].id, quantity: "1.0000" }],
    });
    await sales.approveReturn(approver, request.id);
    await sales.inspectReturn(access, request.id, { lines: [{ invoiceLineId: posted.lines[0].id, quantity: "1.0000" }] });
    const note = await sales.postReturn(access, request.id);
    const restored = await prisma.stockPosition.findUniqueOrThrow({
      where: { companyId_productId_branchId: { companyId: product.companyId, productId: product.id, branchId } },
    });
    expect(restored.physicalQuantity.toFixed(4)).toBe("2.0000");
    const reversal = await prisma.journalLine.findFirst({
      where: { journal: { sourceDocumentId: note.id, status: "posted" }, account: { accountCode: "4000" }, debit: { gt: 0 } },
    });
    expect(reversal).toBeTruthy();
  }, 30_000);
});

function invoiceBody(branchId: string, customerId: string, productId: string) {
  return {
    branchId,
    customerId,
    invoiceDate: "2026-06-20",
    paymentTermsDays: 30,
    settlement: "credit" as const,
    lines: [{ productId, quantity: "1.0000", unitPrice: "150000.0000", discount: "0", taxRate: "0" }],
  };
}

function context(userId: string, email: string): AccessContext {
  return {
    userId,
    email,
    sessionId: "00000000-0000-4000-8000-000000000006",
    csrfTokenHash: "test",
    permissions: ["sales.create", "sales.view", "sales.discount", "sales.approve", "sales.reverse", "inventory.view", "customers.view", "accounting.journal.create"],
    roleCodes: ["super_administrator"],
    companyWide: true,
    mfaPending: false,
    mfaEnabled: true,
    scope: { type: "company" },
  };
}

function units(value: string): bigint {
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const parsed = BigInt(whole) * 10000n + BigInt((fraction + "0000").slice(0, 4));
  return value.startsWith("-") ? -parsed : parsed;
}
