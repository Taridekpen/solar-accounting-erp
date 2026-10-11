import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AccountingPostingService, StockMoveInput } from "../accounting/posting.service";
import { formatMoneyUnits, multiplyMoney, parseMoney } from "../accounting/money";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, branchIdFilter } from "../organization/branch-scope";
import { PageQueryDto, pageWindow } from "../organization/dto/page-query.dto";
import { addDays, moneyText, priceLine, sumMoney } from "../sales/sales-math";
import {
  ApplyDepositDto,
  CreateBillDto,
  CreatePaymentDto,
  CreatePurchaseOrderDto,
  CreateReceiptDto,
  CreateRequisitionDto,
} from "./procurement.dto";

const orderInclude = {
  supplier: true,
  lines: { include: { product: true } },
  warehouse: true,
} satisfies Prisma.PurchaseOrderInclude;

type OrderRecord = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly posting: AccountingPostingService,
  ) {}

  async listRequisitions(access: AccessContext, query: PageQueryDto) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const where: Prisma.PurchaseRequisitionWhereInput = { companyId, ...(branchIds ? { branchId: branchIds } : {}) };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.purchaseRequisition.count({ where }),
      this.prisma.purchaseRequisition.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        requisitionNumber: row.requisitionNumber,
        purpose: row.purpose,
        status: row.status,
        estimatedCost: moneyText(row.estimatedCost),
        requiredDate: row.requiredDate.toISOString().slice(0, 10),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async createRequisition(access: AccessContext, input: CreateRequisitionDto) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    const estimated = input.lines.map((line) => formatMoneyUnits(multiplyMoney(parseMoney(line.quantity), parseMoney(line.estimatedUnitCost))));
    const requisition = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.branchId, "requisition");
      return tx.purchaseRequisition.create({
        data: {
          companyId,
          branchId: input.branchId,
          requisitionNumber: number.documentNumber,
          purpose: input.purpose.trim(),
          requiredDate: new Date(input.requiredDate),
          priority: input.priority ?? "normal",
          estimatedCost: sumMoney(estimated),
          createdByUserId: access.userId,
          lines: {
            create: input.lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              estimatedUnitCost: line.estimatedUnitCost,
            })),
          },
        },
      });
    });
    return { id: requisition.id, requisitionNumber: requisition.requisitionNumber, estimatedCost: moneyText(requisition.estimatedCost), status: requisition.status };
  }

  async submitRequisition(access: AccessContext, id: string) {
    const requisition = await this.findRequisition(access, id);
    if (requisition.status !== "draft") throw new BadRequestException("Only a draft requisition can be submitted");
    return this.prisma.purchaseRequisition.update({ where: { id }, data: { status: "pending_approval" }, select: { id: true, status: true } });
  }

  async approveRequisition(access: AccessContext, id: string) {
    const requisition = await this.findRequisition(access, id);
    if (requisition.status !== "pending_approval") throw new BadRequestException("Only a submitted requisition can be approved");
    await this.assertCanApprove(access, requisition.createdByUserId, requisition.estimatedCost.toFixed(4));
    await this.recordApproval(requisition.companyId, "requisition", id, access.userId, "approved", requisition.estimatedCost.toFixed(4));
    return this.prisma.purchaseRequisition.update({
      where: { id },
      data: { status: "approved", approvedByUserId: access.userId },
      select: { id: true, status: true },
    });
  }

  async convertRequisition(access: AccessContext, id: string, input: Omit<CreatePurchaseOrderDto, "requisitionId" | "lines"> & { supplierId: string; warehouseId: string; procurementMode: "central" | "branch"; expectedDeliveryDate: string }) {
    const requisition = await this.findRequisition(access, id);
    if (requisition.status !== "approved") throw new BadRequestException("Only an approved requisition can become a purchase order");
    const full = await this.prisma.purchaseRequisition.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    const order = await this.createOrder(access, {
      ...input,
      branchId: requisition.branchId,
      requisitionId: id,
      lines: full.lines.map((line) => ({ productId: line.productId, quantity: line.quantity.toFixed(4), unitCost: line.estimatedUnitCost.toFixed(4) })),
    });
    await this.prisma.purchaseRequisition.update({ where: { id }, data: { status: "converted" } });
    return order;
  }

  async previewOrder(access: AccessContext, input: CreatePurchaseOrderDto) {
    await this.assertOrderContext(access, input);
    const prepared = await this.prepareOrderLines(await this.companyId(access.userId), input);
    return prepared.totals;
  }

  async listOrders(access: AccessContext, query: PageQueryDto) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const where: Prisma.PurchaseOrderWhereInput = { companyId, ...(branchIds ? { branchId: branchIds } : {}) };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({ where, include: orderInclude, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    return { data: rows.map(serializeOrder), page: query.page, pageSize: query.pageSize, total };
  }

  async createOrder(access: AccessContext, input: CreatePurchaseOrderDto) {
    const companyId = await this.assertOrderContext(access, input);
    const prepared = await this.prepareOrderLines(companyId, input);
    const order = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.branchId, "purchase_order");
      return tx.purchaseOrder.create({
        data: {
          companyId,
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          supplierId: input.supplierId,
          requisitionId: input.requisitionId,
          purchaseOrderNumber: number.documentNumber,
          procurementMode: input.procurementMode,
          expectedDeliveryDate: new Date(input.expectedDeliveryDate),
          subtotal: prepared.totals.subtotal,
          discountTotal: prepared.totals.discountTotal,
          taxTotal: prepared.totals.taxTotal,
          grandTotal: prepared.totals.grandTotal,
          createdByUserId: access.userId,
          lines: {
            create: prepared.lines.map((line) => ({
              productId: line.product.id,
              description: line.product.name,
              quantity: line.priced.quantity,
              unitCost: line.priced.unitPrice,
              discount: line.priced.discount,
              taxRate: line.priced.taxRate,
              lineNet: line.priced.lineNet,
              taxAmount: line.priced.taxAmount,
              lineTotal: line.priced.lineTotal,
            })),
          },
        },
        include: orderInclude,
      });
    });
    return serializeOrder(order);
  }

  async submitOrder(access: AccessContext, id: string) {
    const order = await this.findOrder(access, id);
    if (order.status !== "draft") throw new BadRequestException("Only a draft purchase order can be submitted");
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: "pending_approval" }, select: { id: true, status: true } });
  }

  async approveOrder(access: AccessContext, id: string) {
    const order = await this.findOrder(access, id);
    if (order.status !== "pending_approval") throw new BadRequestException("Only a submitted purchase order can be approved");
    await this.assertCanApprove(access, order.createdByUserId, order.grandTotal.toFixed(4));
    await this.recordApproval(order.companyId, "purchase_order", id, access.userId, "approved", order.grandTotal.toFixed(4));
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: "approved", approvedByUserId: access.userId },
      select: { id: true, status: true, grandTotal: true },
    }).then((row) => ({ id: row.id, status: row.status, grandTotal: moneyText(row.grandTotal) }));
  }

  async orderPdf(access: AccessContext, id: string) {
    const order = await this.findOrder(access, id);
    return {
      title: "Purchase order",
      number: order.purchaseOrderNumber,
      party: order.supplier.businessName,
      date: order.expectedDeliveryDate.toISOString().slice(0, 10),
      grandTotal: moneyText(order.grandTotal),
      lines: order.lines.map((line) => ({ description: line.description, quantity: moneyText(line.quantity), amount: moneyText(line.lineTotal) })),
    };
  }

  async createReceipt(access: AccessContext, input: CreateReceiptDto, correlationId?: string) {
    const order = await this.findOrder(access, input.purchaseOrderId);
    if (!["approved", "partially_received"].includes(order.status)) {
      throw new BadRequestException("Goods can be received only against an approved purchase order");
    }
    const serials: string[] = [];
    const acceptedLines: { source: OrderRecord["lines"][number]; accepted: bigint; rejected: bigint; serialNumbers: string[]; warrantyMonths?: number }[] = [];
    for (const line of input.lines) {
      const source = order.lines.find((item) => item.id === line.purchaseOrderLineId);
      if (!source) throw new BadRequestException("Receipt line does not belong to the purchase order");
      const accepted = parseMoney(line.acceptedQuantity);
      const rejected = parseMoney(line.rejectedQuantity ?? "0");
      const open = parseMoney(source.quantity.toFixed(4)) - parseMoney(source.receivedQuantity.toFixed(4));
      if (accepted > open) throw new BadRequestException("Accepted quantity exceeds the quantity still open");
      if (accepted < 0n || rejected < 0n) throw new BadRequestException("Receipt quantities cannot be negative");
      for (const serial of line.serialNumbers ?? []) {
        const value = serial.trim();
        if (!value || serials.includes(value)) throw new ConflictException("Serial numbers must be unique");
        serials.push(value);
      }
      if (source.product.trackSerial && BigInt((line.serialNumbers ?? []).length) !== accepted / 10000n) {
        throw new BadRequestException("Serial-tracked products need one serial number for each accepted unit");
      }
      acceptedLines.push({ source, accepted, rejected, serialNumbers: line.serialNumbers ?? [], warrantyMonths: line.warrantyMonths });
    }
    if (serials.length > 0) {
      const existing = await this.prisma.goodsReceiptSerial.findFirst({ where: { companyId: order.companyId, serialNumber: { in: serials } } });
      if (existing) throw new ConflictException("A serial number is already recorded");
    }
    const receiptValue = acceptedLines.reduce((total, line) => total + multiplyMoney(line.accepted, parseMoney(line.source.unitCost.toFixed(4))), 0n);
    const receiptId = crypto.randomUUID();
    let journalId: string | null = null;
    if (receiptValue > 0n) {
      const inventory = await this.account(order.companyId, "1300");
      const accrual = await this.account(order.companyId, "1310");
      const amount = formatMoneyUnits(receiptValue);
      const stockMoves: StockMoveInput[] = acceptedLines
        .filter((line) => line.accepted > 0n && line.source.product.productType === "product")
        .map((line) => ({
          productId: line.source.productId,
          branchId: order.branchId,
          quantity: formatMoneyUnits(line.accepted),
          unitCost: line.source.unitCost.toFixed(4),
          warehouseId: order.warehouseId,
          movementType: "purchase_receipt" as const,
        }));
      const journal = await this.posting.postSystemDocument(access, {
        sourceModule: "purchases",
        sourceDocumentType: "goods_receipt",
        sourceDocumentId: receiptId,
        accountingDate: input.receiptDate,
        description: `Goods receipt for ${order.purchaseOrderNumber}`,
        lines: [
          this.line(inventory.id, order.branchId, order.supplierId, amount, "0", "Inventory received"),
          this.line(accrual.id, order.branchId, order.supplierId, "0", amount, "Goods received not invoiced"),
        ],
        stockMoves,
      }, correlationId);
      journalId = journal.id;
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, order.branchId, "goods_receipt");
      const receipt = await tx.goodsReceipt.create({
        data: {
          id: receiptId,
          companyId: order.companyId,
          branchId: order.branchId,
          warehouseId: order.warehouseId,
          supplierId: order.supplierId,
          purchaseOrderId: order.id,
          goodsReceiptNumber: number.documentNumber,
          receiptDate: new Date(input.receiptDate),
          deliveryDocument: input.deliveryDocument,
          receivingUserId: access.userId,
          journalEntryId: journalId,
          lines: {
            create: acceptedLines.map((line) => ({
              purchaseOrderLineId: line.source.id,
              productId: line.source.productId,
              orderedQuantity: line.source.quantity,
              acceptedQuantity: formatMoneyUnits(line.accepted),
              rejectedQuantity: formatMoneyUnits(line.rejected),
              unitCost: line.source.unitCost,
              serials: {
                create: line.serialNumbers.map((serialNumber) => ({
                  companyId: order.companyId,
                  serialNumber: serialNumber.trim(),
                  warehouseId: order.warehouseId,
                  status: "in_stock" as const,
                  warrantyStart: line.warrantyMonths ? new Date(input.receiptDate) : undefined,
                  warrantyEnd: line.warrantyMonths ? addMonths(input.receiptDate, line.warrantyMonths) : undefined,
                })),
              },
            })),
          },
        },
      });
      for (const line of acceptedLines) {
        await tx.purchaseOrderLine.update({
          where: { id: line.source.id },
          data: { receivedQuantity: formatMoneyUnits(parseMoney(line.source.receivedQuantity.toFixed(4)) + line.accepted) },
        });
      }
      const refreshed = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: order.id } });
      const complete = refreshed.every((line) => parseMoney(line.receivedQuantity.toFixed(4)) >= parseMoney(line.quantity.toFixed(4)));
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: complete ? "received" : "partially_received" } });
      return receipt;
    });
    return { id: saved.id, goodsReceiptNumber: saved.goodsReceiptNumber, journalEntryId: journalId };
  }

  async previewBill(access: AccessContext, input: CreateBillDto) {
    return this.matchBill(access, input);
  }

  async createBill(access: AccessContext, input: CreateBillDto, correlationId?: string) {
    const order = await this.findOrder(access, input.purchaseOrderId);
    const duplicate = await this.prisma.supplierBill.findFirst({ where: { supplierId: order.supplierId, supplierInvoiceNumber: input.supplierInvoiceNumber } });
    if (duplicate) throw new ConflictException("This supplier invoice number is already recorded");
    const matched = await this.matchBill(access, input);
    if (matched.flags.unapprovedOrder) throw new BadRequestException("The purchase order is not approved");
    if (matched.flags.missingReceipt) throw new BadRequestException("The bill has no matching goods receipt");
    const supplier = order.supplier;
    const due = input.dueDate ?? addDays(input.invoiceDate, supplier.paymentTermsDays);
    const billId = crypto.randomUUID();
    const inventory = await this.account(order.companyId, "1310");
    const varianceAccount = await this.account(order.companyId, "5100");
    const payable = await this.account(order.companyId, "2000");
    const taxMapping = await this.prisma.accountMapping.findUnique({ where: { companyId_eventCode: { companyId: order.companyId, eventCode: "supplier_invoice_inventory" } } });
    const lines = [
      this.line(inventory.id, order.branchId, order.supplierId, matched.receiptCost, "0", "Clear goods received"),
    ];
    const variance = parseMoney(matched.varianceTotal);
    if (variance > 0n) lines.push(this.line(varianceAccount.id, order.branchId, order.supplierId, matched.varianceTotal, "0", "Purchase price variance"));
    if (variance < 0n) lines.push(this.line(varianceAccount.id, order.branchId, order.supplierId, "0", formatMoneyUnits(-variance), "Purchase price variance"));
    if (parseMoney(matched.taxTotal) > 0n) {
      if (!taxMapping?.taxAccountId) throw new BadRequestException("Purchase tax has no account mapping");
      lines.push(this.line(taxMapping.taxAccountId, order.branchId, order.supplierId, matched.taxTotal, "0", "Purchase tax"));
    }
    lines.push(this.line(payable.id, order.branchId, order.supplierId, "0", matched.grandTotal, input.supplierInvoiceNumber));
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "purchases",
      sourceDocumentType: "supplier_bill",
      sourceDocumentId: billId,
      accountingDate: input.invoiceDate,
      description: `Supplier bill ${input.supplierInvoiceNumber}`,
      lines,
    }, correlationId);
    const bill = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, order.branchId, "supplier_bill");
      return tx.supplierBill.create({
        data: {
          id: billId,
          companyId: order.companyId,
          branchId: order.branchId,
          supplierId: order.supplierId,
          purchaseOrderId: order.id,
          billNumber: number.documentNumber,
          supplierInvoiceNumber: input.supplierInvoiceNumber.trim(),
          invoiceDate: new Date(input.invoiceDate),
          dueDate: new Date(due),
          attachmentName: input.attachmentName.trim(),
          quantityDifference: matched.flags.quantityDifference,
          priceDifference: matched.flags.priceDifference,
          missingReceipt: matched.flags.missingReceipt,
          unapprovedOrder: matched.flags.unapprovedOrder,
          subtotal: matched.subtotal,
          taxTotal: matched.taxTotal,
          varianceTotal: matched.varianceTotal,
          grandTotal: matched.grandTotal,
          journalEntryId: journal.id,
          createdByUserId: access.userId,
          lines: {
            create: matched.lines.map((line) => ({
              purchaseOrderLineId: line.purchaseOrderLineId,
              goodsReceiptLineId: line.goodsReceiptLineId,
              productId: line.productId,
              description: line.description,
              quantity: line.quantity,
              unitCost: line.unitCost,
              receiptUnitCost: line.receiptUnitCost,
              taxRate: line.taxRate,
              lineNet: line.lineNet,
              taxAmount: line.taxAmount,
              varianceAmount: line.varianceAmount,
              lineTotal: line.lineTotal,
            })),
          },
        },
      });
    });
    return { id: bill.id, billNumber: bill.billNumber, grandTotal: moneyText(bill.grandTotal), flags: matched.flags };
  }

  async createPayment(access: AccessContext, input: CreatePaymentDto) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    const allocated = input.allocations.reduce((total, row) => total + parseMoney(row.amount), 0n);
    const total = parseMoney(input.total);
    if (allocated > total) throw new BadRequestException("Allocations cannot exceed the payment");
    for (const allocation of input.allocations) {
      const bill = await this.prisma.supplierBill.findFirst({ where: { id: allocation.billId, supplierId: input.supplierId, status: "posted" }, include: { allocations: true } });
      if (!bill) throw new NotFoundException("Supplier bill was not found");
      const open = openAmount(bill.grandTotal.toFixed(4), bill.allocations);
      if (parseMoney(allocation.amount) > open) throw new BadRequestException("Allocation exceeds the bill open balance");
    }
    const payment = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.branchId, "supplier_payment");
      return tx.supplierPayment.create({
        data: {
          companyId,
          branchId: input.branchId,
          supplierId: input.supplierId,
          paymentNumber: number.documentNumber,
          paymentDate: new Date(input.paymentDate),
          method: input.method,
          total: input.total,
          depositAmount: formatMoneyUnits(total - allocated),
          createdByUserId: access.userId,
          allocations: { create: input.allocations.map((row) => ({ billId: row.billId, amount: row.amount })) },
        },
      });
    });
    return { id: payment.id, paymentNumber: payment.paymentNumber, status: payment.status, depositAmount: moneyText(payment.depositAmount) };
  }

  async postPayment(access: AccessContext, id: string, correlationId?: string) {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: { id, companyId: await this.companyId(access.userId), ...(branchIdFilter(access.scope) ? { branchId: branchIdFilter(access.scope) } : {}) },
      include: { allocations: true },
    });
    if (!payment) throw new NotFoundException("Supplier payment was not found");
    if (payment.status !== "draft") throw new BadRequestException("Only a draft payment can be posted");
    await this.assertCanApprove(access, payment.createdByUserId, payment.total.toFixed(4));
    const payable = await this.account(payment.companyId, "2000");
    const cash = await this.account(payment.companyId, payment.method === "cash" ? "1000" : "1100");
    const deposit = await this.account(payment.companyId, "2500");
    const allocated = payment.allocations.reduce((total, row) => total + parseMoney(row.amount.toFixed(4)), 0n);
    const lines: { accountId: string; branchId: string; supplierId: string; debit: string; credit: string; description: string }[] = [];
    if (allocated > 0n) lines.push(this.line(payable.id, payment.branchId, payment.supplierId, formatMoneyUnits(allocated), "0", "Settle supplier bills"));
    if (parseMoney(payment.depositAmount.toFixed(4)) > 0n) {
      lines.push(this.line(deposit.id, payment.branchId, payment.supplierId, moneyText(payment.depositAmount), "0", "Supplier deposit"));
    }
    lines.push(this.line(cash.id, payment.branchId, payment.supplierId, "0", moneyText(payment.total), "Supplier payment"));
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "purchases",
      sourceDocumentType: "supplier_payment",
      sourceDocumentId: payment.id,
      accountingDate: payment.paymentDate.toISOString().slice(0, 10),
      description: `Supplier payment ${payment.paymentNumber}`,
      lines,
    }, correlationId);
    await this.recordApproval(payment.companyId, "supplier_payment", payment.id, access.userId, "posted", payment.total.toFixed(4));
    await this.prisma.supplierPayment.update({
      where: { id },
      data: { status: "posted", journalEntryId: journal.id, approvedByUserId: access.userId },
    });
    return { id, status: "posted", journalEntryId: journal.id };
  }

  async applyDeposit(access: AccessContext, id: string, input: ApplyDepositDto, correlationId?: string) {
    const payment = await this.prisma.supplierPayment.findFirst({ where: { id, status: "posted" } });
    if (!payment) throw new NotFoundException("Supplier payment was not found");
    await this.assertCanApprove(access, payment.createdByUserId, input.amount);
    const amount = parseMoney(input.amount);
    if (amount > parseMoney(payment.depositAmount.toFixed(4))) throw new BadRequestException("The deposit balance is not enough");
    const bill = await this.prisma.supplierBill.findFirst({ where: { id: input.billId, supplierId: payment.supplierId, status: "posted" }, include: { allocations: true } });
    if (!bill) throw new NotFoundException("Supplier bill was not found");
    if (amount > openAmount(bill.grandTotal.toFixed(4), bill.allocations)) throw new BadRequestException("The bill open balance is smaller than the deposit");
    const payable = await this.account(payment.companyId, "2000");
    const deposit = await this.account(payment.companyId, "2500");
    const applyId = crypto.randomUUID();
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "purchases",
      sourceDocumentType: "supplier_deposit_applied",
      sourceDocumentId: applyId,
      accountingDate: input.paymentDate,
      description: `Apply supplier deposit ${payment.paymentNumber}`,
      lines: [
        this.line(payable.id, payment.branchId, payment.supplierId, input.amount, "0", "Apply supplier deposit"),
        this.line(deposit.id, payment.branchId, payment.supplierId, "0", input.amount, "Supplier deposit applied"),
      ],
    }, correlationId);
    await this.prisma.$transaction([
      this.prisma.supplierPayment.update({
        where: { id },
        data: { depositAmount: formatMoneyUnits(parseMoney(payment.depositAmount.toFixed(4)) - amount) },
      }),
      this.prisma.supplierPaymentAllocation.create({ data: { id: applyId, paymentId: id, billId: bill.id, amount: input.amount } }),
    ]);
    return { paymentId: id, billId: bill.id, amount: input.amount, journalEntryId: journal.id };
  }

  async reports(access: AccessContext, from: string, to: string) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const branch = branchIds ? { branchId: branchIds } : {};
    const [bills, orders, receipts, approvals] = await Promise.all([
      this.prisma.supplierBill.findMany({
        where: { companyId, status: "posted", invoiceDate: { gte: new Date(from), lte: new Date(to) }, ...branch },
        include: { supplier: true, branch: true, allocations: true, lines: true },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { companyId, status: { in: ["approved", "partially_received"] }, ...branch },
        include: { lines: true, supplier: true },
      }),
      this.prisma.goodsReceiptLine.findMany({
        where: { receipt: { companyId, ...branch } },
        include: { billLines: true, receipt: true },
      }),
      this.prisma.procurementApproval.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const byBranch = new Map<string, bigint>();
    const bySupplier = new Map<string, bigint>();
    let unpaid = 0n;
    for (const bill of bills) {
      const grand = parseMoney(bill.grandTotal.toFixed(4));
      byBranch.set(bill.branch.name, (byBranch.get(bill.branch.name) ?? 0n) + grand);
      bySupplier.set(bill.supplier.businessName, (bySupplier.get(bill.supplier.businessName) ?? 0n) + grand);
      unpaid += openAmount(bill.grandTotal.toFixed(4), bill.allocations);
    }
    const grni = receipts.reduce((total, line) => {
      const billed = line.billLines.reduce((sum, row) => sum + parseMoney(row.quantity.toFixed(4)), 0n);
      const openQty = parseMoney(line.acceptedQuantity.toFixed(4)) - billed;
      return total + multiplyMoney(openQty > 0n ? openQty : 0n, parseMoney(line.unitCost.toFixed(4)));
    }, 0n);
    return {
      purchasesByBranch: [...byBranch.entries()].map(([name, amount]) => ({ name, amount: formatMoneyUnits(amount) })),
      purchasesBySupplier: [...bySupplier.entries()].map(([name, amount]) => ({ name, amount: formatMoneyUnits(amount) })),
      outstandingPurchaseOrders: orders.map((order) => ({
        id: order.id,
        number: order.purchaseOrderNumber,
        supplier: order.supplier.businessName,
        openQuantity: formatMoneyUnits(order.lines.reduce((total, line) => total + parseMoney(line.quantity.toFixed(4)) - parseMoney(line.receivedQuantity.toFixed(4)), 0n)),
      })),
      goodsReceivedNotInvoiced: formatMoneyUnits(grni),
      unpaidSupplierBills: formatMoneyUnits(unpaid),
      purchasePriceVariances: bills.flatMap((bill) => bill.lines.filter((line) => parseMoney(line.varianceAmount.toFixed(4)) !== 0n).map((line) => ({
        billNumber: bill.billNumber,
        description: line.description,
        amount: moneyText(line.varianceAmount),
      }))),
      approvalHistory: approvals.map((row) => ({
        documentType: row.documentType,
        documentId: row.documentId,
        decision: row.decision,
        amount: moneyText(row.amount),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async listWarehouses(access: AccessContext, branchId?: string) {
    if (branchId) assertBranchAllowed(access.scope, branchId);
    const branchIds = branchIdFilter(access.scope);
    return this.prisma.warehouse.findMany({
      where: {
        companyId: await this.companyId(access.userId),
        status: "active",
        ...(branchId ? { branchId } : branchIds ? { branchId: branchIds } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  private async matchBill(access: AccessContext, input: CreateBillDto) {
    const order = await this.findOrder(access, input.purchaseOrderId);
    const flags = { quantityDifference: false, priceDifference: false, missingReceipt: false, unapprovedOrder: !["approved", "partially_received", "received"].includes(order.status) };
    const prepared: {
      purchaseOrderLineId: string;
      goodsReceiptLineId: string | null;
      productId: string;
      description: string;
      quantity: string;
      unitCost: string;
      receiptUnitCost: string;
      taxRate: string;
      lineNet: string;
      taxAmount: string;
      varianceAmount: string;
      lineTotal: string;
    }[] = [];
    for (const line of input.lines) {
      const source = order.lines.find((item) => item.id === line.purchaseOrderLineId);
      if (!source) throw new BadRequestException("Bill line does not belong to the purchase order");
      const receiptLines = await this.prisma.goodsReceiptLine.findMany({
        where: { purchaseOrderLineId: source.id },
        include: { billLines: true },
      });
      const accepted = receiptLines.reduce((total, row) => total + parseMoney(row.acceptedQuantity.toFixed(4)), 0n);
      const billed = receiptLines.reduce((total, row) => total + row.billLines.reduce((sum, billLine) => sum + parseMoney(billLine.quantity.toFixed(4)), 0n), 0n);
      const openAccepted = accepted - billed;
      if (openAccepted <= 0n) flags.missingReceipt = true;
      const quantity = parseMoney(line.quantity);
      if (!flags.missingReceipt && quantity > openAccepted) {
        throw new BadRequestException("Billed quantity is above the accepted receipt");
      }
      if (quantity !== openAccepted) flags.quantityDifference = true;
      const receiptUnit = parseMoney(source.unitCost.toFixed(4));
      const invoiceUnit = parseMoney(line.unitCost);
      if (invoiceUnit !== receiptUnit) flags.priceDifference = true;
      const priced = priceLine({ quantity: line.quantity, unitPrice: line.unitCost, taxRate: line.taxRate ?? "0" });
      const variance = multiplyMoney(quantity, invoiceUnit) - multiplyMoney(quantity, receiptUnit);
      prepared.push({
        purchaseOrderLineId: source.id,
        goodsReceiptLineId: receiptLines[0]?.id ?? null,
        productId: source.productId,
        description: source.description,
        quantity: line.quantity,
        unitCost: line.unitCost,
        receiptUnitCost: source.unitCost.toFixed(4),
        taxRate: priced.taxRate,
        lineNet: priced.lineNet,
        taxAmount: priced.taxAmount,
        varianceAmount: formatMoneyUnits(variance),
        lineTotal: priced.lineTotal,
      });
    }
    const varianceTotal = prepared.reduce((total, line) => total + parseMoney(line.varianceAmount), 0n);
    const receiptCost = prepared.reduce((total, line) => total + multiplyMoney(parseMoney(line.quantity), parseMoney(line.receiptUnitCost)), 0n);
    return {
      flags,
      lines: prepared,
      subtotal: sumMoney(prepared.map((line) => line.lineNet)),
      taxTotal: sumMoney(prepared.map((line) => line.taxAmount)),
      varianceTotal: formatMoneyUnits(varianceTotal),
      receiptCost: formatMoneyUnits(receiptCost),
      grandTotal: sumMoney(prepared.map((line) => line.lineTotal)),
    };
  }

  private async prepareOrderLines(companyId: string, input: CreatePurchaseOrderDto) {
    const prepared: { product: { id: string; name: string }; priced: ReturnType<typeof priceLine> }[] = [];
    for (const line of input.lines) {
      const product = await this.prisma.product.findFirst({ where: { id: line.productId, companyId, deletedAt: null, status: "active" } });
      if (!product) throw new NotFoundException("Product was not found");
      prepared.push({ product, priced: priceLine({ quantity: line.quantity, unitPrice: line.unitCost, discount: line.discount, taxRate: line.taxRate }) });
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

  private async assertOrderContext(access: AccessContext, input: CreatePurchaseOrderDto) {
    if (input.procurementMode === "central" && !access.companyWide) {
      throw new ForbiddenException("Central procurement requires a company-wide user");
    }
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: input.supplierId, companyId, deletedAt: null, status: "active", branches: { some: { branchId: input.branchId } } },
    });
    if (!supplier) throw new NotFoundException("Supplier was not found for this branch");
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId, branchId: input.branchId, status: "active" } });
    if (!warehouse) throw new NotFoundException("Warehouse was not found for this branch");
    return companyId;
  }

  private async assertCanApprove(access: AccessContext, originatorId: string, amount: string) {
    if (access.userId === originatorId) throw new ForbiddenException("You cannot approve a document you created");
    if (!access.permissions.includes("purchases.approve")) throw new ForbiddenException("Approval is not authorized");
    const company = await this.prisma.company.findFirstOrThrow({ where: { deletedAt: null } });
    if (!access.companyWide && parseMoney(amount) > parseMoney(company.purchaseApprovalLimit.toFixed(4))) {
      throw new BadRequestException("This amount is above the branch approval limit");
    }
  }

  private async recordApproval(companyId: string, documentType: string, documentId: string, actorUserId: string, decision: string, amount: string) {
    await this.prisma.procurementApproval.create({ data: { companyId, documentType, documentId, actorUserId, decision, amount } });
  }

  private async findRequisition(access: AccessContext, id: string) {
    const requisition = await this.prisma.purchaseRequisition.findFirst({
      where: { id, companyId: await this.companyId(access.userId), ...(branchIdFilter(access.scope) ? { branchId: branchIdFilter(access.scope) } : {}) },
    });
    if (!requisition) throw new NotFoundException("Requisition was not found");
    return requisition;
  }

  private async findOrder(access: AccessContext, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId: await this.companyId(access.userId), ...(branchIdFilter(access.scope) ? { branchId: branchIdFilter(access.scope) } : {}) },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException("Purchase order was not found");
    return order;
  }

  private async account(companyId: string, code: string) {
    const account = await this.prisma.account.findUnique({ where: { companyId_accountCode: { companyId, accountCode: code } } });
    if (!account) throw new NotFoundException(`Account ${code} was not found`);
    return account;
  }

  private line(accountId: string, branchId: string, supplierId: string, debit: string, credit: string, description: string) {
    return { accountId, branchId, supplierId, debit, credit, description };
  }

  private async companyId(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { companyId: true } });
    return user.companyId;
  }
}

function addMonths(date: string, months: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value;
}

function openAmount(grand: string, allocations: { amount: Prisma.Decimal }[]) {
  return parseMoney(grand) - allocations.reduce((total, row) => total + parseMoney(row.amount.toFixed(4)), 0n);
}

function serializeOrder(order: OrderRecord) {
  return {
    id: order.id,
    purchaseOrderNumber: order.purchaseOrderNumber,
    supplierId: order.supplierId,
    supplierName: order.supplier.businessName,
    branchId: order.branchId,
    warehouseId: order.warehouseId,
    procurementMode: order.procurementMode,
    status: order.status,
    expectedDeliveryDate: order.expectedDeliveryDate.toISOString().slice(0, 10),
    subtotal: moneyText(order.subtotal),
    discountTotal: moneyText(order.discountTotal),
    taxTotal: moneyText(order.taxTotal),
    grandTotal: moneyText(order.grandTotal),
    lines: order.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      description: line.description,
      quantity: moneyText(line.quantity),
      receivedQuantity: moneyText(line.receivedQuantity),
      unitCost: moneyText(line.unitCost),
      lineTotal: moneyText(line.lineTotal),
    })),
  };
}
