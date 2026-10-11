import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { StockMoveInput, AccountingPostingService } from "../accounting/posting.service";
import { formatMoneyUnits, parseMoney } from "../accounting/money";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, branchIdFilter } from "../organization/branch-scope";
import { PageQueryDto, pageWindow } from "../organization/dto/page-query.dto";
import {
  ApplyAdvanceDto,
  CreateInvoiceDto,
  CreateQuotationDto,
  CreateReceiptDto,
  CreateReturnDto,
  DocumentLineDto,
  InspectReturnDto,
} from "./sales.dto";
import { addDays, moneyText, priceLine, sumMoney } from "./sales-math";

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly posting: AccountingPostingService,
  ) {}

  async products(access: AccessContext, branchId?: string) {
    const companyId = await this.companyId(access.userId);
    if (branchId) {
      assertBranchAllowed(access.scope, branchId);
    }
    const rows = await this.prisma.product.findMany({
      where: { companyId, deletedAt: null, status: "active" },
      include: { category: true, positions: branchId ? { where: { branchId } } : true },
      orderBy: { name: "asc" },
    });
    return rows.map((product) => {
      const position = product.positions[0];
      const physical = position ? parseMoney(position.physicalQuantity.toFixed(4)) : 0n;
      const reserved = position ? parseMoney(position.reservedQuantity.toFixed(4)) : 0n;
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category.name,
        productType: product.productType,
        unitOfMeasure: product.unitOfMeasure,
        sellingPrice: moneyText(product.defaultSellingPrice),
        taxRate: moneyText(product.taxRate),
        availableQuantity: product.productType === "service" ? null : formatMoneyUnits(physical - reserved),
      };
    });
  }

  async preview(access: AccessContext, input: CreateInvoiceDto) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    const prepared = await this.prepareLines(companyId, input.branchId, input.lines, access.permissions);
    return { ...prepared.totals, lines: prepared.lines.map(publicLine) };
  }

  async listQuotations(access: AccessContext, query: PageQueryDto) {
    return this.listDocuments(access, query, "salesQuotation");
  }

  async createQuotation(access: AccessContext, input: CreateQuotationDto) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    await this.assertCustomer(companyId, input.customerId, input.branchId);
    const prepared = await this.prepareLines(companyId, input.branchId, input.lines, access.permissions);
    const quotation = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.branchId, "quotation");
      return tx.salesQuotation.create({
        data: {
          companyId,
          branchId: input.branchId,
          customerId: input.customerId,
          quotationNumber: number.documentNumber,
          validityDate: new Date(input.validityDate),
          terms: input.terms,
          notes: input.notes,
          ...prepared.totals,
          createdByUserId: access.userId,
          lines: { create: prepared.lines.map(storedLine) },
        },
        include: quoteInclude,
      });
    });
    return serializeQuotation(quotation);
  }

  async submitQuotation(access: AccessContext, id: string) {
    const quotation = await this.findQuotation(access, id);
    if (quotation.status !== "draft") {
      throw new BadRequestException("Only a draft quotation can be submitted");
    }
    const saved = await this.prisma.salesQuotation.update({
      where: { id },
      data: { status: "pending_approval" },
      include: quoteInclude,
    });
    return serializeQuotation(saved);
  }

  async approveQuotation(access: AccessContext, id: string) {
    const quotation = await this.findQuotation(access, id);
    if (quotation.status !== "pending_approval") {
      throw new BadRequestException("Only a submitted quotation can be approved");
    }
    if (quotation.createdByUserId === access.userId) {
      throw new ForbiddenException("You cannot approve your own restricted action");
    }
    const saved = await this.prisma.salesQuotation.update({
      where: { id },
      data: { status: "accepted", approvedByUserId: access.userId },
      include: quoteInclude,
    });
    return serializeQuotation(saved);
  }

  async convertQuotation(access: AccessContext, id: string) {
    const quotation = await this.findQuotation(access, id);
    if (quotation.status !== "accepted") {
      throw new BadRequestException("Only an accepted quotation can be converted");
    }
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: quotation.customerId } });
    const invoice = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, quotation.branchId, "sales_invoice");
      const created = await tx.salesInvoice.create({
        data: {
          companyId: quotation.companyId,
          branchId: quotation.branchId,
          customerId: quotation.customerId,
          quotationId: quotation.id,
          invoiceNumber: number.documentNumber,
          invoiceDate: new Date(),
          dueDate: new Date(addDays(new Date().toISOString().slice(0, 10), customer.paymentTermsDays)),
          paymentTermsDays: customer.paymentTermsDays,
          settlement: "credit",
          subtotal: quotation.subtotal,
          discountTotal: quotation.discountTotal,
          taxTotal: quotation.taxTotal,
          grandTotal: quotation.grandTotal,
          notes: quotation.notes,
          createdByUserId: access.userId,
          lines: {
            create: await Promise.all(quotation.lines.map(async (line) => {
              const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
              const revenueAccountId = product.revenueAccountId ?? await this.defaultRevenueAccount(quotation.companyId);
              return {
                productId: line.productId,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                unitCost: await this.issueCost(quotation.companyId, product.id, quotation.branchId, product.defaultCost.toFixed(4)),
                discount: line.discount,
                taxRate: line.taxRate,
                lineNet: line.lineNet,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                revenueAccountId,
              };
            })),
          },
          taxes: { create: taxRows(quotation.lines) },
        },
        include: invoiceInclude,
      });
      await tx.salesQuotation.update({ where: { id }, data: { status: "converted" } });
      return created;
    });
    return serializeInvoice(invoice);
  }

  async quotationPdf(access: AccessContext, id: string) {
    const quotation = await this.findQuotation(access, id);
    return {
      title: "Quotation",
      number: quotation.quotationNumber,
      party: quotation.customer.name,
      date: quotation.validityDate.toISOString().slice(0, 10),
      grandTotal: moneyText(quotation.grandTotal),
      lines: quotation.lines.map((line) => ({
        description: line.description,
        quantity: moneyText(line.quantity),
        amount: moneyText(line.lineTotal),
      })),
    };
  }

  async listInvoices(access: AccessContext, query: PageQueryDto) {
    return this.listDocuments(access, query, "salesInvoice");
  }

  async createInvoice(access: AccessContext, input: CreateInvoiceDto) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    await this.assertCustomer(companyId, input.customerId, input.branchId);
    this.assertSettlement(input);
    const prepared = await this.prepareLines(companyId, input.branchId, input.lines, access.permissions);
    const invoice = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.branchId, "sales_invoice");
      return tx.salesInvoice.create({
        data: {
          companyId,
          branchId: input.branchId,
          customerId: input.customerId,
          invoiceNumber: number.documentNumber,
          invoiceDate: new Date(input.invoiceDate),
          dueDate: new Date(addDays(input.invoiceDate, input.paymentTermsDays)),
          paymentTermsDays: input.paymentTermsDays,
          settlement: input.settlement,
          cashMethod: input.settlement === "cash" ? input.cashMethod : null,
          ...prepared.totals,
          notes: input.notes,
          createdByUserId: access.userId,
          lines: { create: prepared.lines.map(storedInvoiceLine) },
          taxes: { create: taxRows(prepared.lines.map((line) => ({ taxRate: line.priced.taxRate, lineNet: line.priced.lineNet, taxAmount: line.priced.taxAmount }))) },
        },
        include: invoiceInclude,
      });
    });
    return serializeInvoice(invoice);
  }

  async updateInvoice(access: AccessContext, id: string, input: CreateInvoiceDto) {
    const invoice = await this.findInvoice(access, id);
    if (invoice.status !== "draft") {
      throw new BadRequestException("Only a draft invoice can be changed");
    }
    assertBranchAllowed(access.scope, input.branchId);
    this.assertSettlement(input);
    const prepared = await this.prepareLines(invoice.companyId, input.branchId, input.lines, access.permissions);
    const saved = await this.prisma.salesInvoice.update({
      where: { id },
      data: {
        branchId: input.branchId,
        customerId: input.customerId,
        invoiceDate: new Date(input.invoiceDate),
        dueDate: new Date(addDays(input.invoiceDate, input.paymentTermsDays)),
        paymentTermsDays: input.paymentTermsDays,
        settlement: input.settlement,
        cashMethod: input.settlement === "cash" ? input.cashMethod : null,
        ...prepared.totals,
        notes: input.notes,
        lines: { deleteMany: {}, create: prepared.lines.map(storedInvoiceLine) },
        taxes: {
          deleteMany: {},
          create: taxRows(prepared.lines.map((line) => ({ taxRate: line.priced.taxRate, lineNet: line.priced.lineNet, taxAmount: line.priced.taxAmount }))),
        },
      },
      include: invoiceInclude,
    });
    return serializeInvoice(saved);
  }

  async cancelInvoice(access: AccessContext, id: string) {
    const invoice = await this.findInvoice(access, id);
    if (invoice.status !== "draft") {
      throw new BadRequestException("Only a draft invoice can be cancelled");
    }
    const saved = await this.prisma.salesInvoice.update({
      where: { id },
      data: { status: "cancelled" },
      include: invoiceInclude,
    });
    return serializeInvoice(saved);
  }

  async finalizeInvoice(access: AccessContext, id: string, correlationId?: string) {
    const invoice = await this.findInvoice(access, id);
    if (invoice.status !== "draft") {
      throw new BadRequestException("Only a draft invoice can be finalized");
    }
    if (invoice.settlement === "credit") {
      await this.assertCreditLimit(invoice.customerId, invoice.grandTotal.toFixed(4));
    }
    await this.assertSerials(invoice);
    const journalLines = await this.invoiceJournal(invoice);
    const stockMoves = this.stockIssues(invoice, access.permissions.includes("inventory.adjust"));
    const journal = await this.posting.postSystemDocument(access, {
      sourceDocumentType: "sales_invoice",
      sourceDocumentId: invoice.id,
      accountingDate: invoice.invoiceDate.toISOString().slice(0, 10),
      description: invoice.invoiceNumber,
      lines: journalLines,
      stockMoves,
      allowNegativeStock: access.permissions.includes("inventory.adjust"),
    }, correlationId);
    await this.markSerialsSold(invoice);
    const saved = await this.prisma.salesInvoice.update({
      where: { id },
      data: { status: "posted", postedAt: new Date(), journalEntryId: journal.id },
      include: invoiceInclude,
    });
    return serializeInvoice(saved);
  }

  async invoicePdf(access: AccessContext, id: string) {
    const invoice = await this.findInvoice(access, id);
    return {
      title: "Invoice",
      number: invoice.invoiceNumber,
      party: invoice.customer.name,
      date: invoice.invoiceDate.toISOString().slice(0, 10),
      grandTotal: moneyText(invoice.grandTotal),
      lines: invoice.lines.map((line) => ({
        description: line.description,
        quantity: moneyText(line.quantity),
        amount: moneyText(line.lineTotal),
      })),
    };
  }

  async createReceipt(access: AccessContext, input: CreateReceiptDto, correlationId?: string) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    await this.assertCustomer(companyId, input.customerId, input.branchId);
    const methodTotal = sumMoney(input.methods.map((method) => method.amount));
    const allocatedTotal = sumMoney(input.allocations.map((row) => row.amount));
    if (parseMoney(allocatedTotal) > parseMoney(methodTotal)) {
      throw new BadRequestException("Allocations cannot exceed the receipt");
    }
    for (const allocation of input.allocations) {
      const invoice = await this.findInvoice(access, allocation.invoiceId);
      if (invoice.customerId !== input.customerId || invoice.status !== "posted") {
        throw new BadRequestException("A receipt can settle only this customer's posted invoices");
      }
      const open = await this.openBalance(invoice.id, invoice.grandTotal.toFixed(4));
      if (parseMoney(allocation.amount) > open) {
        throw new BadRequestException("Allocation exceeds the invoice open balance");
      }
    }
    const advance = formatMoneyUnits(parseMoney(methodTotal) - parseMoney(allocatedTotal));
    const lines = await this.receiptJournal(companyId, input.branchId, input.customerId, input.methods, allocatedTotal, advance);
    const receiptId = crypto.randomUUID();
    const journal = await this.posting.postSystemDocument(access, {
      sourceDocumentType: "customer_receipt",
      sourceDocumentId: receiptId,
      accountingDate: input.receiptDate,
      description: "Customer receipt",
      lines,
    }, correlationId);
    const receipt = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.branchId, "customer_receipt");
      const saved = await tx.customerReceipt.create({
        data: {
          id: receiptId,
          companyId,
          branchId: input.branchId,
          customerId: input.customerId,
          receiptNumber: number.documentNumber,
          receiptDate: new Date(input.receiptDate),
          total: methodTotal,
          advanceAmount: advance,
          journalEntryId: journal.id,
          createdByUserId: access.userId,
          methods: { create: input.methods },
          allocations: { create: input.allocations },
        },
        include: { methods: true, allocations: true },
      });
      if (input.allocations.length > 0) {
        await tx.salesInvoiceAllocation.createMany({
          data: input.allocations.map((allocation) => ({
            invoiceId: allocation.invoiceId,
            amount: allocation.amount,
            sourceType: "receipt",
            sourceId: saved.id,
          })),
        });
      }
      return saved;
    });
    return serializeReceipt(receipt);
  }

  async applyAdvance(access: AccessContext, id: string, input: ApplyAdvanceDto, correlationId?: string) {
    const receipt = await this.prisma.customerReceipt.findFirst({
      where: { id, companyId: await this.companyId(access.userId) },
    });
    if (!receipt) {
      throw new NotFoundException("Receipt was not found");
    }
    assertBranchAllowed(access.scope, receipt.branchId);
    const invoice = await this.findInvoice(access, input.invoiceId);
    if (invoice.customerId !== receipt.customerId || invoice.status !== "posted") {
      throw new BadRequestException("The advance can settle only this customer's posted invoices");
    }
    const amount = parseMoney(input.amount);
    if (amount <= 0n || amount > parseMoney(receipt.advanceAmount.toFixed(4))) {
      throw new BadRequestException("The advance does not cover this amount");
    }
    const open = await this.openBalance(invoice.id, invoice.grandTotal.toFixed(4));
    if (amount > open) {
      throw new BadRequestException("Allocation exceeds the invoice open balance");
    }
    const mapping = await this.mapping(receipt.companyId, "customer_advance_applied");
    const text = formatMoneyUnits(amount);
    const applyId = crypto.randomUUID();
    const journal = await this.posting.postSystemDocument(access, {
      sourceDocumentType: "customer_advance_applied",
      sourceDocumentId: applyId,
      accountingDate: input.receiptDate,
      description: `Apply advance ${receipt.receiptNumber}`,
      lines: [
        this.line(mapping.debitAccountId, receipt.branchId, receipt.customerId, text, "0", "Apply customer advance"),
        this.line(mapping.creditAccountId, receipt.branchId, receipt.customerId, "0", text, "Apply customer advance"),
      ],
    }, correlationId);
    await this.prisma.$transaction([
      this.prisma.customerReceipt.update({
        where: { id },
        data: { advanceAmount: formatMoneyUnits(parseMoney(receipt.advanceAmount.toFixed(4)) - amount) },
      }),
      this.prisma.customerReceiptAllocation.create({
        data: { id: applyId, receiptId: id, invoiceId: invoice.id, amount: text },
      }),
      this.prisma.salesInvoiceAllocation.create({
        data: { invoiceId: invoice.id, amount: text, sourceType: "advance", sourceId: journal.id },
      }),
    ]);
    return { receiptId: id, invoiceId: invoice.id, amount: text };
  }

  async listReceipts(access: AccessContext, query: PageQueryDto) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const where: Prisma.CustomerReceiptWhereInput = {
      companyId,
      ...(branchIds ? { branchId: branchIds } : {}),
    };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customerReceipt.count({ where }),
      this.prisma.customerReceipt.findMany({
        where,
        include: { methods: true, allocations: true, customer: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    return {
      data: rows.map((row) => ({ ...serializeReceipt(row), customerName: row.customer.name })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async listReturns(access: AccessContext, query: PageQueryDto) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const where: Prisma.SalesReturnRequestWhereInput = {
      companyId,
      ...(branchIds ? { branchId: branchIds } : {}),
    };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.salesReturnRequest.count({ where }),
      this.prisma.salesReturnRequest.findMany({ where, include: returnInclude, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    return { data: rows.map(serializeReturn), page: query.page, pageSize: query.pageSize, total };
  }

  async createReturn(access: AccessContext, input: CreateReturnDto) {
    const invoice = await this.findInvoice(access, input.invoiceId);
    if (invoice.status !== "posted") {
      throw new BadRequestException("Returns start from a posted invoice");
    }
    if (input.settlement === "refund" && !input.refundMethod) {
      throw new BadRequestException("A refund needs a payment method");
    }
    const lines = input.lines.map((line) => {
      const source = invoice.lines.find((item) => item.id === line.invoiceLineId);
      if (!source) {
        throw new BadRequestException("Return line does not belong to the invoice");
      }
      if (parseMoney(line.quantity) > parseMoney(source.quantity.toFixed(4))) {
        throw new BadRequestException("Return quantity exceeds the invoice line");
      }
      return { productId: source.productId, invoiceLineId: source.id, quantity: line.quantity };
    });
    const request = await this.prisma.salesReturnRequest.create({
      data: {
        companyId: invoice.companyId,
        branchId: invoice.branchId,
        invoiceId: invoice.id,
        settlement: input.settlement,
        refundMethod: input.refundMethod,
        reason: input.reason,
        createdByUserId: access.userId,
        lines: { create: lines },
      },
      include: returnInclude,
    });
    return serializeReturn(request);
  }

  async approveReturn(access: AccessContext, id: string) {
    const request = await this.findReturn(access, id);
    if (request.status !== "requested") {
      throw new BadRequestException("Only a requested return can be approved");
    }
    if (request.createdByUserId === access.userId) {
      throw new ForbiddenException("You cannot approve your own restricted action");
    }
    const needsInspection = request.lines.some((line) => line.product.productType === "product");
    const saved = await this.prisma.salesReturnRequest.update({
      where: { id },
      data: {
        status: needsInspection ? "approved" : "inspected",
        approvedByUserId: access.userId,
        ...(!needsInspection
          ? { lines: { update: request.lines.map((line) => ({ where: { id: line.id }, data: { acceptedQuantity: line.quantity } })) } }
          : {}),
      },
      include: returnInclude,
    });
    return serializeReturn(saved);
  }

  async inspectReturn(access: AccessContext, id: string, input: InspectReturnDto) {
    const request = await this.findReturn(access, id);
    if (request.status !== "approved") {
      throw new BadRequestException("Only an approved return can be inspected");
    }
    for (const line of input.lines) {
      const source = request.lines.find((item) => item.invoiceLineId === line.invoiceLineId);
      if (!source || parseMoney(line.quantity) > parseMoney(source.quantity.toFixed(4))) {
        throw new BadRequestException("Accepted quantity exceeds the requested return");
      }
    }
    const saved = await this.prisma.salesReturnRequest.update({
      where: { id },
      data: {
        status: "inspected",
        inspectedByUserId: access.userId,
        lines: {
          update: input.lines.flatMap((line) => {
            const source = request.lines.find((item) => item.invoiceLineId === line.invoiceLineId);
            return source ? [{ where: { id: source.id }, data: { acceptedQuantity: line.quantity } }] : [];
          }),
        },
      },
      include: returnInclude,
    });
    return serializeReturn(saved);
  }

  async postReturn(access: AccessContext, id: string, correlationId?: string) {
    const request = await this.findReturn(access, id);
    if (request.status !== "inspected") {
      throw new BadRequestException("Only an inspected return can be posted");
    }
    const invoice = await this.findInvoice(access, request.invoiceId);
    const priced = request.lines
      .map((line) => this.returnPortion(invoice, line))
      .filter((line) => parseMoney(line.quantity) > 0n);
    if (priced.length === 0) {
      throw new BadRequestException("The return has no accepted quantity");
    }
    const grand = sumMoney(priced.map((line) => line.lineTotal));
    const open = await this.openBalance(invoice.id, invoice.grandTotal.toFixed(4));
    if (request.settlement === "credit" && parseMoney(grand) > open) {
      throw new BadRequestException("Customer credit cannot exceed the invoice open balance");
    }
    if (request.settlement === "refund") {
      const paid = parseMoney(invoice.grandTotal.toFixed(4)) - open;
      if (parseMoney(grand) > paid) {
        throw new BadRequestException("Refund cannot exceed the amount already received");
      }
    }
    const journalLines = await this.returnJournal(invoice, request, priced);
    const stockMoves: StockMoveInput[] = priced
      .filter((line) => line.productType === "product")
      .map((line) => ({
        productId: line.productId,
        branchId: invoice.branchId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        movementType: "customer_return" as const,
      }));
    const noteId = crypto.randomUUID();
    const journal = await this.posting.postSystemDocument(access, {
      sourceDocumentType: "sales_credit_note",
      sourceDocumentId: noteId,
      accountingDate: invoice.invoiceDate.toISOString().slice(0, 10),
      description: `Return for ${invoice.invoiceNumber}`,
      lines: journalLines,
      stockMoves,
    }, correlationId);
    const note = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, invoice.branchId, "credit_note");
      const saved = await tx.salesCreditNote.create({
        data: {
          id: noteId,
          companyId: invoice.companyId,
          branchId: invoice.branchId,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          returnRequestId: request.id,
          creditNoteNumber: number.documentNumber,
          settlement: request.settlement,
          refundMethod: request.refundMethod,
          subtotal: sumMoney(priced.map((line) => line.lineNet)),
          taxTotal: sumMoney(priced.map((line) => line.taxAmount)),
          grandTotal: grand,
          journalEntryId: journal.id,
          lines: {
            create: priced.map((line) => ({
              productId: line.productId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              unitCost: line.unitCost,
              taxRate: line.taxRate,
              lineNet: line.lineNet,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              revenueAccountId: line.revenueAccountId,
            })),
          },
        },
      });
      if (request.settlement === "credit") {
        await tx.salesInvoiceAllocation.create({
          data: { invoiceId: invoice.id, amount: grand, sourceType: "credit_note", sourceId: saved.id },
        });
      }
      await tx.salesReturnRequest.update({ where: { id }, data: { status: "posted" } });
      return saved;
    });
    return { id: note.id, creditNoteNumber: note.creditNoteNumber, grandTotal: moneyText(note.grandTotal) };
  }

  private async issueCost(companyId: string, productId: string, branchId: string, fallback: string) {
    const position = await this.prisma.stockPosition.findUnique({
      where: { companyId_productId_branchId: { companyId, productId, branchId } },
    });
    if (!position || parseMoney(position.averageUnitCost.toFixed(4)) === 0n) {
      return fallback;
    }
    return position.averageUnitCost.toFixed(4);
  }

  private async assertSerials(invoice: InvoiceRecord) {
    for (const line of invoice.lines) {
      if (!line.product.trackSerial) {
        continue;
      }
      const expected = parseMoney(line.quantity.toFixed(4)) / 10000n;
      const serials = line.requestedSerials.map((serial) => serial.trim()).filter(Boolean);
      if (BigInt(serials.length) !== expected) {
        throw new BadRequestException("Serial-tracked products need one serial number for each unit");
      }
      const rows = await this.prisma.goodsReceiptSerial.findMany({
        where: { companyId: invoice.companyId, serialNumber: { in: serials } },
        include: { warehouse: true },
      });
      if (rows.length !== serials.length || rows.some((row) => row.status !== "in_stock" || row.warehouse?.branchId !== invoice.branchId)) {
        throw new ConflictException("A serial number is not available at this branch");
      }
    }
  }

  private async markSerialsSold(invoice: InvoiceRecord) {
    for (const line of invoice.lines) {
      const serials = line.requestedSerials.map((serial) => serial.trim()).filter(Boolean);
      if (serials.length === 0) {
        continue;
      }
      await this.prisma.goodsReceiptSerial.updateMany({
        where: { companyId: invoice.companyId, serialNumber: { in: serials }, status: "in_stock" },
        data: { status: "sold", customerId: invoice.customerId, invoiceLineId: line.id },
      });
    }
  }

  private async prepareLines(companyId: string, branchId: string, lines: DocumentLineDto[], permissions: string[]) {
    const prepared = [];
    for (const line of lines) {
      const product = await this.prisma.product.findFirst({
        where: { id: line.productId, companyId, deletedAt: null, status: "active" },
        include: { category: true },
      });
      if (!product) {
        throw new NotFoundException("Product was not found");
      }
      const priced = priceLine({
        quantity: line.quantity,
        unitPrice: line.unitPrice ?? product.defaultSellingPrice.toFixed(4),
        discount: line.discount,
        taxRate: line.taxRate ?? product.taxRate.toFixed(4),
      });
      if (parseMoney(priced.discount) > 0n && !permissions.includes("sales.discount")) {
        throw new ForbiddenException("Discount is not authorized");
      }
      const revenueAccountId = product.revenueAccountId ?? await this.defaultRevenueAccount(companyId);
      prepared.push({
        product,
        priced,
        unitCost: await this.issueCost(companyId, product.id, branchId, product.defaultCost.toFixed(4)),
        serialNumbers: line.serialNumbers ?? [],
        revenueAccountId,
        availableQuantity: await this.available(companyId, product.id, branchId, product.productType),
      });
    }
    const extended = prepared.map((line) => formatMoneyUnits(parseMoney(line.priced.lineNet) + parseMoney(line.priced.discount)));
    return {
      lines: prepared,
      totals: {
        subtotal: sumMoney(extended),
        discountTotal: sumMoney(prepared.map((line) => line.priced.discount)),
        taxTotal: sumMoney(prepared.map((line) => line.priced.taxAmount)),
        grandTotal: sumMoney(prepared.map((line) => line.priced.lineTotal)),
      },
    };
  }

  private async invoiceJournal(invoice: InvoiceRecord) {
    const sale = await this.mapping(invoice.companyId, invoice.settlement === "cash" ? "cash_sale" : "credit_sale");
    const cogs = await this.mapping(invoice.companyId, "credit_sale_cogs");
    let debitAccountId = sale.debitAccountId;
    if (invoice.settlement === "cash" && invoice.cashMethod && invoice.cashMethod !== "cash") {
      debitAccountId = (await this.mapping(invoice.companyId, "customer_payment")).debitAccountId;
    }
    const lines = [];
    lines.push(this.line(debitAccountId, invoice.branchId, invoice.customerId, moneyText(invoice.grandTotal), "0", invoice.invoiceNumber));
    const revenue = new Map<string, bigint>();
    let cost = 0n;
    for (const line of invoice.lines) {
      revenue.set(line.revenueAccountId, (revenue.get(line.revenueAccountId) ?? 0n) + parseMoney(line.lineNet.toFixed(4)));
      if (line.product.productType === "product") {
        cost += parseMoney(line.quantity.toFixed(4)) * parseMoney(line.unitCost.toFixed(4)) / 10000n;
      }
    }
    for (const [accountId, amount] of revenue) {
      if (amount > 0n) {
        lines.push(this.line(accountId, invoice.branchId, invoice.customerId, "0", formatMoneyUnits(amount), invoice.invoiceNumber));
      }
    }
    const tax = parseMoney(invoice.taxTotal.toFixed(4));
    if (tax > 0n) {
      if (!sale.taxAccountId) {
        throw new BadRequestException("Sales tax has no account mapping");
      }
      lines.push(this.line(sale.taxAccountId, invoice.branchId, invoice.customerId, "0", formatMoneyUnits(tax), "Sales tax"));
    }
    if (cost > 0n) {
      lines.push(this.line(cogs.debitAccountId, invoice.branchId, invoice.customerId, formatMoneyUnits(cost), "0", "Cost of sales"));
      lines.push(this.line(cogs.creditAccountId, invoice.branchId, invoice.customerId, "0", formatMoneyUnits(cost), "Cost of sales"));
    }
    return lines;
  }

  private stockIssues(invoice: InvoiceRecord, allowNegative: boolean): StockMoveInput[] {
    return invoice.lines
      .filter((line) => line.product.productType === "product")
      .map((line) => ({
        productId: line.productId,
        branchId: invoice.branchId,
        quantity: line.quantity.toFixed(4),
        unitCost: line.unitCost.toFixed(4),
        movementType: "sales_issue" as const,
        allowNegative,
      }))
      .map(({ allowNegative: _ignored, ...move }) => move);
  }

  private async receiptJournal(
    companyId: string,
    branchId: string,
    customerId: string,
    methods: { method: "cash" | "bank_transfer" | "pos"; amount: string }[],
    allocated: string,
    advance: string,
  ) {
    const cash = await this.mapping(companyId, "cash_sale");
    const bank = await this.mapping(companyId, "customer_payment");
    const customerAdvance = await this.mapping(companyId, "customer_advance");
    const lines = methods.map((method) => this.line(
      method.method === "cash" ? cash.debitAccountId : bank.debitAccountId,
      branchId,
      customerId,
      method.amount,
      "0",
      "Customer receipt",
    ));
    if (parseMoney(allocated) > 0n) {
      lines.push(this.line(bank.creditAccountId, branchId, customerId, "0", allocated, "Settle invoices"));
    }
    if (parseMoney(advance) > 0n) {
      lines.push(this.line(customerAdvance.creditAccountId, branchId, customerId, "0", advance, "Customer advance"));
    }
    return lines;
  }

  private async returnJournal(
    invoice: InvoiceRecord,
    request: { settlement: "credit" | "refund"; refundMethod: string | null },
    lines: ReturnPortion[],
  ) {
    const sale = await this.mapping(invoice.companyId, "credit_sale");
    const cogs = await this.mapping(invoice.companyId, "credit_sale_cogs");
    const cash = await this.mapping(invoice.companyId, "cash_sale");
    const bank = await this.mapping(invoice.companyId, "customer_payment");
    const creditAccount = request.settlement === "credit"
      ? sale.debitAccountId
      : request.refundMethod === "cash" ? cash.debitAccountId : bank.debitAccountId;
    const grand = sumMoney(lines.map((line) => line.lineTotal));
    const journal = [this.line(creditAccount, invoice.branchId, invoice.customerId, "0", grand, "Sales return")];
    const revenue = new Map<string, bigint>();
    let cost = 0n;
    for (const line of lines) {
      revenue.set(line.revenueAccountId, (revenue.get(line.revenueAccountId) ?? 0n) + parseMoney(line.lineNet));
      if (line.productType === "product") {
        cost += parseMoney(line.quantity) * parseMoney(line.unitCost) / 10000n;
      }
    }
    for (const [accountId, amount] of revenue) {
      journal.push(this.line(accountId, invoice.branchId, invoice.customerId, formatMoneyUnits(amount), "0", "Reverse revenue"));
    }
    const tax = lines.reduce((total, line) => total + parseMoney(line.taxAmount), 0n);
    if (tax > 0n && sale.taxAccountId) {
      journal.push(this.line(sale.taxAccountId, invoice.branchId, invoice.customerId, formatMoneyUnits(tax), "0", "Reverse tax"));
    }
    if (cost > 0n) {
      journal.push(this.line(cogs.creditAccountId, invoice.branchId, invoice.customerId, formatMoneyUnits(cost), "0", "Return inventory"));
      journal.push(this.line(cogs.debitAccountId, invoice.branchId, invoice.customerId, "0", formatMoneyUnits(cost), "Reverse cost of sales"));
    }
    return journal;
  }

  private returnPortion(invoice: InvoiceRecord, line: { invoiceLineId: string; acceptedQuantity: Prisma.Decimal; product: { productType: string } }): ReturnPortion {
    const source = invoice.lines.find((item) => item.id === line.invoiceLineId);
    if (!source) {
      throw new BadRequestException("Return line does not belong to the invoice");
    }
    const accepted = parseMoney(line.acceptedQuantity.toFixed(4));
    const original = parseMoney(source.quantity.toFixed(4));
    const portion = (amount: Prisma.Decimal) => formatMoneyUnits(accepted === original ? parseMoney(amount.toFixed(4)) : (parseMoney(amount.toFixed(4)) * accepted) / original);
    return {
      productId: source.productId,
      productType: source.product.productType,
      description: source.description,
      quantity: formatMoneyUnits(accepted),
      unitPrice: moneyText(source.unitPrice),
      unitCost: moneyText(source.unitCost),
      taxRate: moneyText(source.taxRate),
      lineNet: portion(source.lineNet),
      taxAmount: portion(source.taxAmount),
      lineTotal: portion(source.lineTotal),
      revenueAccountId: source.revenueAccountId,
    };
  }

  private async openBalance(invoiceId: string, grand: string) {
    const rows = await this.prisma.salesInvoiceAllocation.findMany({ where: { invoiceId } });
    return parseMoney(grand) - rows.reduce((total, row) => total + parseMoney(row.amount.toFixed(4)), 0n);
  }

  private async assertCreditLimit(customerId: string, additional: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const invoices = await this.prisma.salesInvoice.findMany({
      where: { customerId, status: "posted" },
      include: { allocations: true },
    });
    const open = invoices.reduce((total, invoice) => {
      const allocated = invoice.allocations.reduce((sum, row) => sum + parseMoney(row.amount.toFixed(4)), 0n);
      return total + parseMoney(invoice.grandTotal.toFixed(4)) - allocated;
    }, 0n);
    if (open + parseMoney(additional) > parseMoney(customer.creditLimit.toFixed(4))) {
      throw new BadRequestException("This sale exceeds the customer credit limit");
    }
  }

  private async available(companyId: string, productId: string, branchId: string, productType: string) {
    if (productType === "service") {
      return null;
    }
    const position = await this.prisma.stockPosition.findUnique({
      where: { companyId_productId_branchId: { companyId, productId, branchId } },
    });
    const physical = position ? parseMoney(position.physicalQuantity.toFixed(4)) : 0n;
    const reserved = position ? parseMoney(position.reservedQuantity.toFixed(4)) : 0n;
    return formatMoneyUnits(physical - reserved);
  }

  private async defaultRevenueAccount(companyId: string) {
    return (await this.mapping(companyId, "credit_sale")).creditAccountId;
  }

  private async mapping(companyId: string, eventCode: string) {
    const mapping = await this.prisma.accountMapping.findUnique({
      where: { companyId_eventCode: { companyId, eventCode } },
    });
    if (!mapping) {
      throw new BadRequestException("Account mapping has not been configured");
    }
    return mapping;
  }

  private line(accountId: string, branchId: string, customerId: string, debit: string, credit: string, description: string) {
    return { accountId, branchId, customerId, debit, credit, description };
  }

  private assertSettlement(input: CreateInvoiceDto) {
    if (input.settlement === "cash" && !input.cashMethod) {
      throw new BadRequestException("A cash sale needs a payment method");
    }
  }

  private async assertCustomer(companyId: string, customerId: string, branchId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId, deletedAt: null, status: "active", branches: { some: { branchId } } },
    });
    if (!customer) {
      throw new NotFoundException("Customer was not found for this branch");
    }
  }

  private async listDocuments(access: AccessContext, query: PageQueryDto, kind: "salesQuotation" | "salesInvoice") {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const where = { companyId, ...(branchIds ? { branchId: branchIds } : {}) };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    if (kind === "salesQuotation") {
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.salesQuotation.count({ where }),
        this.prisma.salesQuotation.findMany({ where, include: quoteInclude, orderBy: { createdAt: "desc" }, skip, take }),
      ]);
      return { data: rows.map(serializeQuotation), page: query.page, pageSize: query.pageSize, total };
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.salesInvoice.count({ where }),
      this.prisma.salesInvoice.findMany({ where, include: invoiceInclude, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    return { data: rows.map(serializeInvoice), page: query.page, pageSize: query.pageSize, total };
  }

  private async findQuotation(access: AccessContext, id: string) {
    const quotation = await this.prisma.salesQuotation.findFirst({
      where: { id, companyId: await this.companyId(access.userId), ...(branchIdFilter(access.scope) ? { branchId: branchIdFilter(access.scope) } : {}) },
      include: quoteInclude,
    });
    if (!quotation) {
      throw new NotFoundException("Quotation was not found");
    }
    return quotation;
  }

  private async findInvoice(access: AccessContext, id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, companyId: await this.companyId(access.userId), ...(branchIdFilter(access.scope) ? { branchId: branchIdFilter(access.scope) } : {}) },
      include: invoiceInclude,
    });
    if (!invoice) {
      throw new NotFoundException("Invoice was not found");
    }
    return invoice;
  }

  private async findReturn(access: AccessContext, id: string) {
    const request = await this.prisma.salesReturnRequest.findFirst({
      where: { id, companyId: await this.companyId(access.userId), ...(branchIdFilter(access.scope) ? { branchId: branchIdFilter(access.scope) } : {}) },
      include: returnInclude,
    });
    if (!request) {
      throw new NotFoundException("Return was not found");
    }
    return request;
  }

  private async companyId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
    if (!user) {
      throw new NotFoundException("User was not found");
    }
    return user.companyId;
  }
}

const quoteInclude = { customer: true, lines: { include: { product: true } } } satisfies Prisma.SalesQuotationInclude;
const invoiceInclude = {
  customer: true,
  lines: { include: { product: true } },
  taxes: true,
  allocations: true,
} satisfies Prisma.SalesInvoiceInclude;
const returnInclude = { lines: { include: { product: true } }, invoice: true } satisfies Prisma.SalesReturnRequestInclude;

type InvoiceRecord = Prisma.SalesInvoiceGetPayload<{ include: typeof invoiceInclude }>;
type ReturnPortion = {
  productId: string;
  productType: string;
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  taxRate: string;
  lineNet: string;
  taxAmount: string;
  lineTotal: string;
  revenueAccountId: string;
};

function storedLine(line: { product: { id: string; name: string }; priced: { quantity: string; unitPrice: string; discount: string; taxRate: string; lineNet: string; taxAmount: string; lineTotal: string } }) {
  return {
    productId: line.product.id,
    description: line.product.name,
    quantity: line.priced.quantity,
    unitPrice: line.priced.unitPrice,
    discount: line.priced.discount,
    taxRate: line.priced.taxRate,
    lineNet: line.priced.lineNet,
    taxAmount: line.priced.taxAmount,
    lineTotal: line.priced.lineTotal,
  };
}

function storedInvoiceLine(line: {
  product: { id: string; name: string };
  priced: { quantity: string; unitPrice: string; discount: string; taxRate: string; lineNet: string; taxAmount: string; lineTotal: string };
  unitCost: string;
  revenueAccountId: string;
  serialNumbers?: string[];
}) {
  return { ...storedLine(line), unitCost: line.unitCost, revenueAccountId: line.revenueAccountId, requestedSerials: line.serialNumbers ?? [] };
}

function publicLine(line: {
  product: { id: string; name: string; sku: string };
  priced: { quantity: string; unitPrice: string; discount: string; taxRate: string; lineNet: string; taxAmount: string; lineTotal: string };
  availableQuantity: string | null;
}) {
  return {
    productId: line.product.id,
    sku: line.product.sku,
    description: line.product.name,
    availableQuantity: line.availableQuantity,
    ...line.priced,
  };
}

function taxRows(lines: { taxRate: string | Prisma.Decimal; lineNet: string | Prisma.Decimal; taxAmount: string | Prisma.Decimal }[]) {
  const grouped = new Map<string, { taxable: bigint; tax: bigint }>();
  for (const line of lines) {
    const rate = typeof line.taxRate === "string" ? line.taxRate : line.taxRate.toFixed(4);
    const current = grouped.get(rate) ?? { taxable: 0n, tax: 0n };
    current.taxable += parseMoney(typeof line.lineNet === "string" ? line.lineNet : line.lineNet.toFixed(4));
    current.tax += parseMoney(typeof line.taxAmount === "string" ? line.taxAmount : line.taxAmount.toFixed(4));
    grouped.set(rate, current);
  }
  return [...grouped.entries()].filter(([, value]) => value.tax > 0n).map(([taxRate, value]) => ({
    taxRate,
    taxableAmount: formatMoneyUnits(value.taxable),
    taxAmount: formatMoneyUnits(value.tax),
  }));
}

function serializeQuotation(quotation: Prisma.SalesQuotationGetPayload<{ include: typeof quoteInclude }>) {
  return {
    id: quotation.id,
    quotationNumber: quotation.quotationNumber,
    customerId: quotation.customerId,
    customerName: quotation.customer.name,
    branchId: quotation.branchId,
    validityDate: quotation.validityDate.toISOString().slice(0, 10),
    status: quotation.status,
    terms: quotation.terms,
    subtotal: moneyText(quotation.subtotal),
    discountTotal: moneyText(quotation.discountTotal),
    taxTotal: moneyText(quotation.taxTotal),
    grandTotal: moneyText(quotation.grandTotal),
    lines: quotation.lines.map((line) => ({
      description: line.description,
      quantity: moneyText(line.quantity),
      unitPrice: moneyText(line.unitPrice),
      lineTotal: moneyText(line.lineTotal),
    })),
  };
}

function serializeInvoice(invoice: InvoiceRecord) {
  const allocated = invoice.allocations.reduce((total, row) => total + parseMoney(row.amount.toFixed(4)), 0n);
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    customerName: invoice.customer.name,
    branchId: invoice.branchId,
    invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    paymentTermsDays: invoice.paymentTermsDays,
    settlement: invoice.settlement,
    status: invoice.status,
    subtotal: moneyText(invoice.subtotal),
    discountTotal: moneyText(invoice.discountTotal),
    taxTotal: moneyText(invoice.taxTotal),
    grandTotal: moneyText(invoice.grandTotal),
    openBalance: formatMoneyUnits(parseMoney(invoice.grandTotal.toFixed(4)) - allocated),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      description: line.description,
      quantity: moneyText(line.quantity),
      unitPrice: moneyText(line.unitPrice),
      discount: moneyText(line.discount),
      taxRate: moneyText(line.taxRate),
      lineTotal: moneyText(line.lineTotal),
      availableQuantity: null,
    })),
  };
}

function serializeReceipt(receipt: Prisma.CustomerReceiptGetPayload<{ include: { methods: true; allocations: true } }>) {
  return {
    id: receipt.id,
    receiptNumber: receipt.receiptNumber,
    customerId: receipt.customerId,
    receiptDate: receipt.receiptDate.toISOString().slice(0, 10),
    total: moneyText(receipt.total),
    advanceAmount: moneyText(receipt.advanceAmount),
    methods: receipt.methods.map((method) => ({ method: method.method, amount: moneyText(method.amount) })),
    allocations: receipt.allocations.map((allocation) => ({ invoiceId: allocation.invoiceId, amount: moneyText(allocation.amount) })),
  };
}

function serializeReturn(request: Prisma.SalesReturnRequestGetPayload<{ include: typeof returnInclude }>) {
  return {
    id: request.id,
    invoiceId: request.invoiceId,
    invoiceNumber: request.invoice.invoiceNumber,
    status: request.status,
    settlement: request.settlement,
    reason: request.reason,
    lines: request.lines.map((line) => ({
      invoiceLineId: line.invoiceLineId,
      productName: line.product.name,
      quantity: moneyText(line.quantity),
      acceptedQuantity: moneyText(line.acceptedQuantity),
    })),
  };
}
