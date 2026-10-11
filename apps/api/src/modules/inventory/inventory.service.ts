import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AccountingPostingService, StockMoveInput } from "../accounting/posting.service";
import { formatMoneyUnits, multiplyMoney, parseMoney } from "../accounting/money";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, branchIdFilter } from "../organization/branch-scope";
import { moneyText } from "../sales/sales-math";
import { CreateCountDto, CreateTransferDto } from "./inventory.dto";

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly posting: AccountingPostingService,
  ) {}

  async stock(access: AccessContext, branchId?: string) {
    if (branchId) assertBranchAllowed(access.scope, branchId);
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const rows = await this.prisma.warehouseStock.findMany({
      where: {
        companyId,
        ...(branchId ? { warehouse: { branchId } } : branchIds ? { warehouse: { branchId: branchIds } } : {}),
      },
      include: { product: { include: { category: true } }, warehouse: { include: { branch: true } } },
      orderBy: [{ warehouse: { name: "asc" } }, { product: { name: "asc" } }],
    });
    const positions = await this.prisma.stockPosition.findMany({
      where: { companyId, ...(branchId ? { branchId } : branchIds ? { branchId: branchIds } : {}) },
    });
    return rows.map((row) => {
      const position = positions.find((item) => item.productId === row.productId && item.branchId === row.warehouse.branchId);
      const average = position ? moneyText(position.averageUnitCost) : "0.0000";
      const available = position ? formatMoneyUnits(parseMoney(position.physicalQuantity.toFixed(4)) - parseMoney(position.reservedQuantity.toFixed(4))) : "0.0000";
      return {
        warehouseId: row.warehouseId,
        warehouseName: row.warehouse.name,
        warehouseType: row.warehouse.warehouseType,
        branchId: row.warehouse.branchId,
        branchName: row.warehouse.branch.name,
        productId: row.productId,
        sku: row.product.sku,
        productName: row.product.name,
        category: row.product.category.name,
        quantity: moneyText(row.quantity),
        availableQuantity: available,
        averageUnitCost: average,
        valuation: formatMoneyUnits(multiplyMoney(parseMoney(row.quantity.toFixed(4)), parseMoney(average))),
        reorderLevel: moneyText(row.product.reorderLevel),
      };
    });
  }

  async serial(access: AccessContext, serialNumber: string) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const serial = await this.prisma.goodsReceiptSerial.findFirst({
      where: {
        companyId,
        serialNumber,
        ...(branchIds ? { warehouse: { branchId: branchIds } } : {}),
      },
      include: { warehouse: { include: { branch: true } }, customer: true, line: { include: { product: true } } },
    });
    if (!serial) throw new NotFoundException("Serial number was not found");
    return {
      serialNumber: serial.serialNumber,
      status: serial.status,
      productName: serial.line.product.name,
      warehouseName: serial.warehouse?.name ?? null,
      branchName: serial.warehouse?.branch.name ?? null,
      warrantyStart: serial.warrantyStart?.toISOString().slice(0, 10) ?? null,
      warrantyEnd: serial.warrantyEnd?.toISOString().slice(0, 10) ?? null,
      customerName: serial.customer?.name ?? null,
    };
  }

  async createTransfer(access: AccessContext, input: CreateTransferDto) {
    assertBranchAllowed(access.scope, input.sourceBranchId);
    const companyId = await this.companyId(access.userId);
    await this.assertWarehouse(companyId, input.sourceWarehouseId, input.sourceBranchId, false);
    await this.assertWarehouse(companyId, input.destinationWarehouseId, input.destinationBranchId, false);
    const transfer = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.sourceBranchId, "stock_transfer");
      return tx.stockTransfer.create({
        data: {
          companyId,
          sourceBranchId: input.sourceBranchId,
          destinationBranchId: input.destinationBranchId,
          sourceWarehouseId: input.sourceWarehouseId,
          destinationWarehouseId: input.destinationWarehouseId,
          transferNumber: number.documentNumber,
          transferDate: new Date(input.transferDate),
          createdByUserId: access.userId,
          lines: { create: input.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })) },
        },
        include: { lines: true },
      });
    });
    return { id: transfer.id, transferNumber: transfer.transferNumber, status: transfer.status };
  }

  async submitTransfer(access: AccessContext, id: string) {
    const transfer = await this.findTransfer(access, id);
    if (transfer.status !== "draft") throw new BadRequestException("Only a draft transfer can be submitted");
    return this.prisma.stockTransfer.update({ where: { id }, data: { status: "pending_approval" }, select: { id: true, status: true } });
  }

  async approveTransfer(access: AccessContext, id: string) {
    const transfer = await this.findTransfer(access, id);
    if (transfer.status !== "pending_approval") throw new BadRequestException("Only a submitted transfer can be approved");
    this.assertOtherUser(access, transfer.createdByUserId, "inventory.transfer");
    for (const line of transfer.lines) {
      const cost = await this.averageCost(transfer.companyId, line.productId, transfer.sourceBranchId);
      await this.prisma.stockTransferLine.update({ where: { id: line.id }, data: { unitCost: cost } });
    }
    return this.prisma.stockTransfer.update({
      where: { id },
      data: { status: "approved", approvedByUserId: access.userId },
      select: { id: true, status: true },
    });
  }

  async shipTransfer(access: AccessContext, id: string, correlationId?: string) {
    const transfer = await this.findTransfer(access, id);
    if (transfer.status !== "approved") throw new BadRequestException("Only an approved transfer can be shipped");
    assertBranchAllowed(access.scope, transfer.sourceBranchId);
    const transit = await this.transitWarehouse(transfer.companyId, transfer.sourceBranchId);
    const inventory = await this.account(transfer.companyId, "1300");
    const inTransit = await this.account(transfer.companyId, "1320");
    let total = 0n;
    const stockMoves: StockMoveInput[] = transfer.lines.map((line) => {
      const cost = parseMoney(line.unitCost.toFixed(4));
      total += multiplyMoney(parseMoney(line.quantity.toFixed(4)), cost);
      return {
        productId: line.productId,
        branchId: transfer.sourceBranchId,
        quantity: line.quantity.toFixed(4),
        unitCost: line.unitCost.toFixed(4),
        warehouseId: transfer.sourceWarehouseId,
        transitWarehouseId: transit.id,
        movementType: "transfer_out" as const,
      };
    });
    const amount = formatMoneyUnits(total);
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "inventory",
      sourceDocumentType: "stock_transfer_ship",
      sourceDocumentId: transfer.id,
      accountingDate: transfer.transferDate.toISOString().slice(0, 10),
      description: `Ship ${transfer.transferNumber}`,
      lines: [
        { accountId: inTransit.id, branchId: transfer.sourceBranchId, debit: amount, credit: "0", description: "Inventory in transit" },
        { accountId: inventory.id, branchId: transfer.sourceBranchId, debit: "0", credit: amount, description: "Inventory shipped" },
      ],
      stockMoves,
    }, correlationId);
    for (const line of transfer.lines) {
      await this.moveSerials(transfer.sourceWarehouseId, transit.id, line.productId, line.quantity.toFixed(4), "in_stock", "in_transit");
    }
    return this.prisma.stockTransfer.update({
      where: { id },
      data: { status: "shipped", shipJournalId: journal.id },
      select: { id: true, status: true, shipJournalId: true },
    });
  }

  async receiveTransfer(access: AccessContext, id: string, correlationId?: string) {
    const transfer = await this.findTransfer(access, id);
    if (transfer.status !== "shipped") throw new BadRequestException("Only a shipped transfer can be received");
    assertBranchAllowed(access.scope, transfer.destinationBranchId);
    const transit = await this.transitWarehouse(transfer.companyId, transfer.sourceBranchId);
    const inventory = await this.account(transfer.companyId, "1300");
    const inTransit = await this.account(transfer.companyId, "1320");
    let total = 0n;
    const stockMoves: StockMoveInput[] = transfer.lines.map((line) => {
      const cost = parseMoney(line.unitCost.toFixed(4));
      total += multiplyMoney(parseMoney(line.quantity.toFixed(4)), cost);
      return {
        productId: line.productId,
        branchId: transfer.destinationBranchId,
        quantity: line.quantity.toFixed(4),
        unitCost: line.unitCost.toFixed(4),
        warehouseId: transfer.destinationWarehouseId,
        transitWarehouseId: transit.id,
        movementType: "transfer_in" as const,
      };
    });
    const amount = formatMoneyUnits(total);
    const journal = await this.posting.postSystemDocument(access, {
      sourceModule: "inventory",
      sourceDocumentType: "stock_transfer_receive",
      sourceDocumentId: crypto.randomUUID(),
      accountingDate: transfer.transferDate.toISOString().slice(0, 10),
      description: `Receive ${transfer.transferNumber}`,
      lines: [
        { accountId: inventory.id, branchId: transfer.destinationBranchId, debit: amount, credit: "0", description: "Inventory received" },
        { accountId: inTransit.id, branchId: transfer.sourceBranchId, debit: "0", credit: amount, description: "Inventory in transit cleared" },
      ],
      stockMoves,
    }, correlationId);
    for (const line of transfer.lines) {
      await this.moveSerials(transit.id, transfer.destinationWarehouseId, line.productId, line.quantity.toFixed(4), "in_transit", "in_stock");
    }
    return this.prisma.stockTransfer.update({
      where: { id },
      data: { status: "received", receiveJournalId: journal.id },
      select: { id: true, status: true },
    });
  }

  async createCount(access: AccessContext, input: CreateCountDto) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    await this.assertWarehouse(companyId, input.warehouseId, input.branchId, false);
    const count = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, input.branchId, "stock_count");
      const lines = [];
      for (const line of input.lines) {
        const stock = await tx.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: line.productId } } });
        const position = await tx.stockPosition.findUnique({ where: { companyId_productId_branchId: { companyId, productId: line.productId, branchId: input.branchId } } });
        lines.push({
          productId: line.productId,
          bookQuantity: stock ? stock.quantity : "0.0000",
          countedQuantity: line.countedQuantity,
          unitCost: position && parseMoney(position.averageUnitCost.toFixed(4)) > 0n ? position.averageUnitCost : "0.0000",
        });
      }
      return tx.stockCount.create({
        data: {
          companyId,
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          countNumber: number.documentNumber,
          countDate: new Date(input.countDate),
          createdByUserId: access.userId,
          lines: { create: lines },
        },
      });
    });
    return { id: count.id, countNumber: count.countNumber, status: count.status };
  }

  async postCount(access: AccessContext, id: string, correlationId?: string) {
    const count = await this.prisma.stockCount.findFirst({
      where: { id, companyId: await this.companyId(access.userId) },
      include: { lines: true },
    });
    if (!count) throw new NotFoundException("Stock count was not found");
    if (count.status !== "draft") throw new BadRequestException("Only a draft count can be posted");
    this.assertOtherUser(access, count.createdByUserId, "inventory.adjust");
    assertBranchAllowed(access.scope, count.branchId);
    const inventory = await this.account(count.companyId, "1300");
    const expense = await this.account(count.companyId, "6900");
    const journalLines: { accountId: string; branchId: string; debit: string; credit: string; description: string }[] = [];
    const stockMoves: StockMoveInput[] = [];
    for (const line of count.lines) {
      const variance = parseMoney(line.countedQuantity.toFixed(4)) - parseMoney(line.bookQuantity.toFixed(4));
      if (variance === 0n) continue;
      const quantity = variance < 0n ? -variance : variance;
      const amount = formatMoneyUnits(multiplyMoney(quantity, parseMoney(line.unitCost.toFixed(4))));
      if (variance > 0n) {
        journalLines.push({ accountId: inventory.id, branchId: count.branchId, debit: amount, credit: "0", description: "Stock count surplus" });
        journalLines.push({ accountId: expense.id, branchId: count.branchId, debit: "0", credit: amount, description: "Stock count surplus" });
        stockMoves.push({ productId: line.productId, branchId: count.branchId, warehouseId: count.warehouseId, quantity: formatMoneyUnits(quantity), unitCost: line.unitCost.toFixed(4), movementType: "adjustment_in" });
      } else {
        journalLines.push({ accountId: expense.id, branchId: count.branchId, debit: amount, credit: "0", description: "Stock count shortage" });
        journalLines.push({ accountId: inventory.id, branchId: count.branchId, debit: "0", credit: amount, description: "Stock count shortage" });
        stockMoves.push({ productId: line.productId, branchId: count.branchId, warehouseId: count.warehouseId, quantity: formatMoneyUnits(quantity), unitCost: line.unitCost.toFixed(4), movementType: "adjustment_out" });
      }
    }
    let journalId: string | null = null;
    if (journalLines.length > 0) {
      const journal = await this.posting.postSystemDocument(access, {
        sourceModule: "inventory",
        sourceDocumentType: "stock_count",
        sourceDocumentId: count.id,
        accountingDate: count.countDate.toISOString().slice(0, 10),
        description: `Stock count ${count.countNumber}`,
        lines: journalLines,
        stockMoves,
      }, correlationId);
      journalId = journal.id;
    }
    return this.prisma.stockCount.update({
      where: { id },
      data: { status: "posted", postedByUserId: access.userId, journalEntryId: journalId },
      select: { id: true, status: true, journalEntryId: true },
    });
  }

  async reports(access: AccessContext) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const [stock, movements, serials, transfers] = await Promise.all([
      this.stock(access),
      this.prisma.stockMovement.findMany({
        where: { companyId, ...(branchIds ? { branchId: branchIds } : {}) },
        include: { product: true },
        orderBy: { occurredAt: "desc" },
        take: 50,
      }),
      this.prisma.goodsReceiptSerial.findMany({
        where: { companyId, ...(branchIds ? { warehouse: { branchId: branchIds } } : {}) },
        include: { line: { include: { product: true } }, warehouse: true },
        take: 50,
      }),
      this.prisma.stockTransfer.findMany({
        where: { companyId, status: { in: ["approved", "shipped"] }, ...(branchIds ? { sourceBranchId: branchIds } : {}) },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const valuation = stock.reduce((total, row) => total + parseMoney(row.valuation), 0n);
    return {
      onHand: stock,
      valuation: formatMoneyUnits(valuation),
      lowStock: stock.filter((row) => parseMoney(row.reorderLevel) > 0n && parseMoney(row.availableQuantity) <= parseMoney(row.reorderLevel)),
      movements: movements.map((row) => ({
        productName: row.product.name,
        movementType: row.movementType,
        quantity: moneyText(row.quantity),
        unitCost: moneyText(row.unitCost),
        occurredAt: row.occurredAt.toISOString(),
      })),
      serials: serials.map((row) => ({
        serialNumber: row.serialNumber,
        productName: row.line.product.name,
        status: row.status,
        warehouseName: row.warehouse?.name ?? null,
      })),
      openTransfers: transfers.map((row) => ({ id: row.id, transferNumber: row.transferNumber, status: row.status })),
    };
  }

  private async moveSerials(fromWarehouseId: string, toWarehouseId: string, productId: string, quantity: string, fromStatus: "in_stock" | "in_transit", toStatus: "in_stock" | "in_transit") {
    const count = Number(parseMoney(quantity) / 10000n);
    if (count <= 0) return;
    const serials = await this.prisma.goodsReceiptSerial.findMany({
      where: { warehouseId: fromWarehouseId, status: fromStatus, line: { productId } },
      take: count,
    });
    if (serials.length === 0) return;
    await this.prisma.goodsReceiptSerial.updateMany({
      where: { id: { in: serials.map((serial) => serial.id) } },
      data: { warehouseId: toWarehouseId, status: toStatus },
    });
  }

  private async findTransfer(access: AccessContext, id: string) {
    const branchIds = branchIdFilter(access.scope);
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: {
        id,
        companyId: await this.companyId(access.userId),
        ...(branchIds ? { OR: [{ sourceBranchId: branchIds }, { destinationBranchId: branchIds }] } : {}),
      },
      include: { lines: true },
    });
    if (!transfer) throw new NotFoundException("Stock transfer was not found");
    return transfer;
  }

  private assertOtherUser(access: AccessContext, originatorId: string, permission: string) {
    if (access.userId === originatorId) throw new ForbiddenException("You cannot approve a document you created");
    if (!access.permissions.includes(permission)) throw new ForbiddenException("This action is not authorized");
  }

  private async assertWarehouse(companyId: string, warehouseId: string, branchId: string, allowTransit: boolean) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, companyId, branchId, status: "active" } });
    if (!warehouse || (!allowTransit && warehouse.warehouseType === "in_transit")) {
      throw new NotFoundException("Warehouse was not found for this branch");
    }
    return warehouse;
  }

  private async transitWarehouse(companyId: string, branchId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { companyId, branchId, warehouseType: "in_transit", status: "active" } });
    if (!warehouse) throw new NotFoundException("In-transit warehouse was not found");
    return warehouse;
  }

  private async averageCost(companyId: string, productId: string, branchId: string) {
    const position = await this.prisma.stockPosition.findUnique({ where: { companyId_productId_branchId: { companyId, productId, branchId } } });
    if (position && parseMoney(position.averageUnitCost.toFixed(4)) > 0n) return position.averageUnitCost;
    const product = await this.prisma.product.findUniqueOrThrow({ where: { id: productId } });
    return product.defaultCost;
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
