import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { formatMoneyUnits, parseMoney } from "../accounting/money";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, branchIdFilter } from "../organization/branch-scope";
import { PageQueryDto, pageWindow } from "../organization/dto/page-query.dto";
import { CreateSupplierDto, UpdateSupplierDto } from "./procurement.dto";
import { moneyText } from "../sales/sales-math";

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
  ) {}

  async list(access: AccessContext, query: PageQueryDto) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const where: Prisma.SupplierWhereInput = {
      companyId,
      deletedAt: null,
      ...(branchIds ? { branches: { some: { branchId: branchIds } } } : {}),
      ...(query.search
        ? {
            OR: [
              { businessName: { contains: query.search, mode: "insensitive" } },
              { supplierCode: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        include: { branches: { select: { branchId: true } }, bankDetail: true },
        orderBy: { businessName: "asc" },
        skip,
        take,
      }),
    ]);
    return { data: rows.map(serializeSupplier), page: query.page, pageSize: query.pageSize, total };
  }

  async get(access: AccessContext, id: string) {
    return serializeSupplier(await this.findScoped(access, id));
  }

  async create(access: AccessContext, input: CreateSupplierDto) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    await this.assertUniqueContact(companyId, input.phone, input.email);
    const headOffice = await this.prisma.branch.findFirst({ where: { companyId, isHeadOffice: true, deletedAt: null } });
    if (!headOffice) {
      throw new NotFoundException("Head office was not found");
    }
    const supplier = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, headOffice.id, "supplier");
      return tx.supplier.create({
        data: {
          companyId,
          supplierCode: number.documentNumber,
          businessName: input.businessName.trim(),
          contactPerson: blank(input.contactPerson),
          phone: blank(input.phone),
          email: blank(input.email),
          address: input.address,
          taxIdentifier: input.taxIdentifier,
          paymentTermsDays: input.paymentTermsDays ?? 0,
          branches: { create: { branchId: input.branchId } },
          ...(input.accountNumber
            ? {
                bankDetail: {
                  create: {
                    bankName: input.bankName?.trim() || "Bank",
                    accountName: input.accountName?.trim() || input.businessName.trim(),
                    accountNumber: input.accountNumber,
                  },
                },
              }
            : {}),
        },
        include: { branches: { select: { branchId: true } }, bankDetail: true },
      });
    });
    return serializeSupplier(supplier);
  }

  async update(access: AccessContext, id: string, input: UpdateSupplierDto) {
    const existing = await this.findScoped(access, id);
    if (input.branchIds) {
      for (const branchId of input.branchIds) {
        assertBranchAllowed(access.scope, branchId);
      }
    }
    await this.assertUniqueContact(existing.companyId, input.phone, input.email, id);
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        businessName: input.businessName?.trim(),
        contactPerson: input.contactPerson,
        phone: input.phone === undefined ? undefined : blank(input.phone),
        email: input.email === undefined ? undefined : blank(input.email),
        address: input.address,
        taxIdentifier: input.taxIdentifier,
        paymentTermsDays: input.paymentTermsDays,
        status: input.status,
        ...(input.branchIds ? { branches: { deleteMany: {}, create: input.branchIds.map((branchId) => ({ branchId })) } } : {}),
        ...(input.accountNumber
          ? {
              bankDetail: {
                upsert: {
                  create: {
                    bankName: input.bankName?.trim() || "Bank",
                    accountName: input.accountName?.trim() || existing.businessName,
                    accountNumber: input.accountNumber,
                  },
                  update: {
                    bankName: input.bankName?.trim() || undefined,
                    accountName: input.accountName?.trim() || undefined,
                    accountNumber: input.accountNumber,
                  },
                },
              },
            }
          : {}),
      },
      include: { branches: { select: { branchId: true } }, bankDetail: true },
    });
    return serializeSupplier(supplier);
  }

  async statement(access: AccessContext, id: string) {
    const supplier = await this.findScoped(access, id);
    const [bills, payments, payable] = await Promise.all([
      this.prisma.supplierBill.findMany({
        where: { supplierId: id, status: "posted" },
        include: { allocations: true },
        orderBy: { invoiceDate: "asc" },
      }),
      this.prisma.supplierPayment.findMany({
        where: { supplierId: id, status: "posted" },
        orderBy: { paymentDate: "asc" },
      }),
      this.prisma.journalLine.findMany({
        where: { supplierId: id, journal: { status: "posted" }, account: { accountSubtype: "payable" } },
      }),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const aging = { current: 0n, days1To30: 0n, days31To60: 0n, days61To90: 0n, over90: 0n };
    let outstanding = 0n;
    let overdue = 0n;
    const invoiceRows = bills.map((bill) => {
      const open = openBill(bill.grandTotal.toFixed(4), bill.allocations);
      outstanding += open;
      const due = bill.dueDate.toISOString().slice(0, 10);
      if (open > 0n) {
        aging[agingBucket(due, today)] += open;
        if (due < today) overdue += open;
      }
      return {
        id: bill.id,
        billNumber: bill.billNumber,
        supplierInvoiceNumber: bill.supplierInvoiceNumber,
        invoiceDate: bill.invoiceDate.toISOString().slice(0, 10),
        dueDate: due,
        grandTotal: moneyText(bill.grandTotal),
        openBalance: formatMoneyUnits(open),
      };
    });
    const accountsPayable = payable.reduce((total, line) => total + parseMoney(line.credit.toFixed(4)) - parseMoney(line.debit.toFixed(4)), 0n);
    return {
      supplierId: supplier.id,
      businessName: supplier.businessName,
      bankAccountMask: maskAccount(supplier.bankDetail?.accountNumber),
      outstandingBalance: formatMoneyUnits(outstanding),
      overdueBalance: formatMoneyUnits(overdue),
      accountsPayable: formatMoneyUnits(accountsPayable),
      aging: {
        current: formatMoneyUnits(aging.current),
        days1To30: formatMoneyUnits(aging.days1To30),
        days31To60: formatMoneyUnits(aging.days31To60),
        days61To90: formatMoneyUnits(aging.days61To90),
        over90: formatMoneyUnits(aging.over90),
      },
      bills: invoiceRows,
      payments: payments.map((payment) => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        paymentDate: payment.paymentDate.toISOString().slice(0, 10),
        total: moneyText(payment.total),
        depositAmount: moneyText(payment.depositAmount),
      })),
    };
  }

  private async findScoped(access: AccessContext, id: string) {
    const branchIds = branchIdFilter(access.scope);
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id,
        companyId: await this.companyId(access.userId),
        deletedAt: null,
        ...(branchIds ? { branches: { some: { branchId: branchIds } } } : {}),
      },
      include: { branches: { select: { branchId: true } }, bankDetail: true },
    });
    if (!supplier) {
      throw new NotFoundException("Supplier was not found");
    }
    return supplier;
  }

  private async assertUniqueContact(companyId: string, phone?: string, email?: string, exceptId?: string) {
    if (phone) {
      const existing = await this.prisma.supplier.findFirst({ where: { companyId, phone, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) } });
      if (existing) throw new ConflictException("A supplier with this phone already exists");
    }
    if (email) {
      const existing = await this.prisma.supplier.findFirst({ where: { companyId, email, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) } });
      if (existing) throw new ConflictException("A supplier with this email already exists");
    }
  }

  private async companyId(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { companyId: true } });
    return user.companyId;
  }
}

function blank(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function maskAccount(value?: string | null) {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}

function openBill(grand: string, allocations: { amount: Prisma.Decimal }[]) {
  return parseMoney(grand) - allocations.reduce((total, row) => total + parseMoney(row.amount.toFixed(4)), 0n);
}

function agingBucket(due: string, asOf: string): "current" | "days1To30" | "days31To60" | "days61To90" | "over90" {
  if (due >= asOf) return "current";
  const days = Math.floor((Date.parse(asOf) - Date.parse(due)) / 86_400_000);
  if (days <= 30) return "days1To30";
  if (days <= 60) return "days31To60";
  if (days <= 90) return "days61To90";
  return "over90";
}

function serializeSupplier(supplier: Prisma.SupplierGetPayload<{ include: { branches: { select: { branchId: true } }; bankDetail: true } }>) {
  return {
    id: supplier.id,
    supplierCode: supplier.supplierCode,
    businessName: supplier.businessName,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    taxIdentifier: supplier.taxIdentifier,
    paymentTermsDays: supplier.paymentTermsDays,
    status: supplier.status,
    branchIds: supplier.branches.map((link) => link.branchId),
    bankAccountMask: maskAccount(supplier.bankDetail?.accountNumber),
  };
}
