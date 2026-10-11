import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { formatMoneyUnits, parseMoney } from "../accounting/money";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, branchIdFilter } from "../organization/branch-scope";
import { PageQueryDto, pageWindow } from "../organization/dto/page-query.dto";
import { CreateCustomerDto, UpdateCustomerDto } from "./sales.dto";
import { moneyText } from "./sales-math";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
  ) {}

  async list(access: AccessContext, query: PageQueryDto) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const where: Prisma.CustomerWhereInput = {
      companyId,
      deletedAt: null,
      ...(branchIds ? { branches: { some: { branchId: branchIds } } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { customerCode: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: { branches: { select: { branchId: true } } },
        orderBy: { name: "asc" },
        skip,
        take,
      }),
    ]);
    return { data: rows.map(serializeCustomer), page: query.page, pageSize: query.pageSize, total };
  }

  async get(access: AccessContext, id: string) {
    return serializeCustomer(await this.findScoped(access, id));
  }

  async create(access: AccessContext, input: CreateCustomerDto) {
    assertBranchAllowed(access.scope, input.branchId);
    const companyId = await this.companyId(access.userId);
    await this.assertUniqueContact(companyId, input.phone, input.email);
    const headOffice = await this.prisma.branch.findFirst({
      where: { companyId, isHeadOffice: true, deletedAt: null },
    });
    if (!headOffice) {
      throw new NotFoundException("Head office was not found");
    }
    const customer = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.allocateWith(tx, headOffice.id, "customer");
      return tx.customer.create({
        data: {
          companyId,
          customerCode: number.documentNumber,
          customerType: input.customerType,
          name: input.name.trim(),
          phone: blank(input.phone),
          email: blank(input.email),
          billingAddress: input.billingAddress,
          deliveryAddress: input.deliveryAddress,
          taxIdentifier: input.taxIdentifier,
          creditLimit: input.creditLimit ?? "0.0000",
          paymentTermsDays: input.paymentTermsDays ?? 0,
          branches: { create: { branchId: input.branchId } },
        },
        include: { branches: { select: { branchId: true } } },
      });
    });
    return serializeCustomer(customer);
  }

  async update(access: AccessContext, id: string, input: UpdateCustomerDto) {
    const existing = await this.findScoped(access, id);
    if (input.branchIds) {
      for (const branchId of input.branchIds) {
        assertBranchAllowed(access.scope, branchId);
      }
    }
    await this.assertUniqueContact(existing.companyId, input.phone, input.email, id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        phone: input.phone === undefined ? undefined : blank(input.phone),
        email: input.email === undefined ? undefined : blank(input.email),
        billingAddress: input.billingAddress,
        deliveryAddress: input.deliveryAddress,
        taxIdentifier: input.taxIdentifier,
        creditLimit: input.creditLimit,
        paymentTermsDays: input.paymentTermsDays,
        status: input.status,
        ...(input.branchIds
          ? { branches: { deleteMany: {}, create: input.branchIds.map((branchId) => ({ branchId })) } }
          : {}),
      },
      include: { branches: { select: { branchId: true } } },
    });
    return serializeCustomer(customer);
  }

  async statement(access: AccessContext, id: string) {
    const customer = await this.findScoped(access, id);
    const [invoices, receipts, creditNotes, receivable] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: { customerId: id, status: "posted" },
        include: { allocations: true },
        orderBy: { invoiceDate: "asc" },
      }),
      this.prisma.customerReceipt.findMany({
        where: { customerId: id },
        include: { methods: true, allocations: true },
        orderBy: { receiptDate: "asc" },
      }),
      this.prisma.salesCreditNote.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.journalLine.findMany({
        where: { customerId: id, journal: { status: "posted" }, account: { accountSubtype: "receivable" } },
      }),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const buckets = { current: 0n, days1To30: 0n, days31To60: 0n, days61To90: 0n, over90: 0n };
    let outstanding = 0n;
    let overdue = 0n;
    const invoiceRows = invoices.map((invoice) => {
      const open = openAmount(invoice.grandTotal.toFixed(4), invoice.allocations.map((row) => row.amount.toFixed(4)));
      outstanding += open;
      const due = invoice.dueDate.toISOString().slice(0, 10);
      if (open > 0n && due < today) {
        overdue += open;
      }
      if (open > 0n) {
        buckets[agingKey(due, today)] += open;
      }
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
        dueDate: due,
        grandTotal: moneyText(invoice.grandTotal),
        openBalance: formatMoneyUnits(open),
      };
    });
    const receivableNet = receivable.reduce(
      (total, line) => total + parseMoney(line.debit.toFixed(4)) - parseMoney(line.credit.toFixed(4)),
      0n,
    );
    return {
      customer: serializeCustomer(customer),
      invoices: invoiceRows,
      receipts: receipts.map((receipt) => ({
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        receiptDate: receipt.receiptDate.toISOString().slice(0, 10),
        total: moneyText(receipt.total),
        advanceAmount: moneyText(receipt.advanceAmount),
        methods: receipt.methods.map((method) => ({ method: method.method, amount: moneyText(method.amount) })),
      })),
      creditNotes: creditNotes.map((note) => ({
        id: note.id,
        creditNoteNumber: note.creditNoteNumber,
        settlement: note.settlement,
        grandTotal: moneyText(note.grandTotal),
        createdAt: note.createdAt.toISOString(),
      })),
      outstandingBalance: formatMoneyUnits(outstanding),
      overdueBalance: formatMoneyUnits(overdue),
      accountsReceivable: formatMoneyUnits(receivableNet),
      aging: {
        current: formatMoneyUnits(buckets.current),
        days1To30: formatMoneyUnits(buckets.days1To30),
        days31To60: formatMoneyUnits(buckets.days31To60),
        days61To90: formatMoneyUnits(buckets.days61To90),
        over90: formatMoneyUnits(buckets.over90),
      },
    };
  }

  private async findScoped(access: AccessContext, id: string) {
    const companyId = await this.companyId(access.userId);
    const branchIds = branchIdFilter(access.scope);
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        companyId,
        deletedAt: null,
        ...(branchIds ? { branches: { some: { branchId: branchIds } } } : {}),
      },
      include: { branches: { select: { branchId: true } } },
    });
    if (!customer) {
      throw new NotFoundException("Customer was not found");
    }
    return customer;
  }

  private async companyId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
    if (!user) {
      throw new NotFoundException("User was not found");
    }
    return user.companyId;
  }

  private async assertUniqueContact(companyId: string, phone?: string, email?: string, ignoreId?: string) {
    const contact = [blank(phone), blank(email)].filter(Boolean);
    if (contact.length === 0) {
      return;
    }
    const existing = await this.prisma.customer.findFirst({
      where: {
        companyId,
        deletedAt: null,
        id: ignoreId ? { not: ignoreId } : undefined,
        OR: [
          ...(blank(phone) ? [{ phone: blank(phone) }] : []),
          ...(blank(email) ? [{ email: blank(email) }] : []),
        ],
      },
    });
    if (existing) {
      throw new ConflictException("A customer with this phone or email already exists");
    }
  }
}

function blank(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function openAmount(grand: string, allocations: string[]) {
  return parseMoney(grand) - allocations.reduce((total, amount) => total + parseMoney(amount), 0n);
}

function agingKey(due: string, asOf: string): "current" | "days1To30" | "days31To60" | "days61To90" | "over90" {
  if (due >= asOf) {
    return "current";
  }
  const days = Math.round((Date.parse(`${asOf}T00:00:00.000Z`) - Date.parse(`${due}T00:00:00.000Z`)) / 86_400_000);
  if (days <= 30) return "days1To30";
  if (days <= 60) return "days31To60";
  if (days <= 90) return "days61To90";
  return "over90";
}

function serializeCustomer(customer: {
  id: string;
  customerCode: string;
  customerType: string;
  name: string;
  phone: string | null;
  email: string | null;
  billingAddress: string | null;
  deliveryAddress: string | null;
  taxIdentifier: string | null;
  creditLimit: { toFixed(digits: number): string };
  paymentTermsDays: number;
  status: string;
  branches: { branchId: string }[];
}) {
  return {
    id: customer.id,
    customerCode: customer.customerCode,
    customerType: customer.customerType,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    billingAddress: customer.billingAddress,
    deliveryAddress: customer.deliveryAddress,
    taxIdentifier: customer.taxIdentifier,
    creditLimit: moneyText(customer.creditLimit),
    paymentTermsDays: customer.paymentTermsDays,
    status: customer.status,
    branchIds: customer.branches.map((branch) => branch.branchId),
  };
}

export type ScopedCustomer = Awaited<ReturnType<CustomersService["get"]>>;
