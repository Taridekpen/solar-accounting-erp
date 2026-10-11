import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { BranchScope, assertBranchAllowed, branchIdFilter } from "./branch-scope";
import { CompanyService, rethrowPrisma } from "./company.service";
import { CreateBranchDto, UpdateBranchDto } from "./dto/branch.dto";
import { DOCUMENT_TYPE_VALUES } from "./dto/document-number.dto";
import { PageQueryDto, pageWindow } from "./dto/page-query.dto";

const DOCUMENT_PREFIX = {
  sales_invoice: "INV",
  quotation: "QT",
  purchase_order: "PO",
  goods_receipt: "GRN",
  customer_receipt: "RCT",
  supplier_payment: "PAY",
  expense: "EXP",
  journal: "JRN",
  project: "PRJ",
  customer: "CUS",
  credit_note: "CN",
  supplier: "SUP",
  requisition: "REQ",
  supplier_bill: "PIN",
  stock_transfer: "TRF",
  stock_count: "CNT",
  bank_transfer: "BTR",
  cash_count: "CSH",
  fixed_asset: "AST",
  salary_summary: "PAYR",
  salary_payment: "SPAY",
} as const;

const branchInclude = {
  manager: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
} satisfies Prisma.BranchInclude;

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompanyService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async list(scope: BranchScope, query: PageQueryDto) {
    const company = await this.companies.requireRecord();
    const where: Prisma.BranchWhereInput = {
      companyId: company.id,
      deletedAt: null,
      ...(branchIdFilter(scope) ? { id: branchIdFilter(scope) } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { branchCode: { contains: query.search, mode: "insensitive" } },
              { city: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.branch.count({ where }),
      this.prisma.branch.findMany({
        where,
        include: branchInclude,
        orderBy: [{ isHeadOffice: "desc" }, { name: "asc" }],
        skip,
        take,
      }),
    ]);
    return { data: rows.map(serializeBranch), page: query.page, pageSize: query.pageSize, total };
  }

  async get(scope: BranchScope, id: string) {
    const branch = await this.findScoped(scope, id);
    return serializeBranch(branch);
  }

  async create(scope: BranchScope, input: CreateBranchDto, access?: AccessContext, correlationId?: string) {
    const company = await this.companies.requireRecord();
    if (input.managerId) {
      await this.assertManager(company.id, input.managerId);
    }
    try {
      const branch = await this.prisma.$transaction(async (tx) => {
        if (input.isHeadOffice) {
          const headOffice = await tx.branch.findFirst({
            where: { companyId: company.id, isHeadOffice: true, deletedAt: null },
          });
          if (headOffice) {
            throw new ConflictException("A head office already exists");
          }
        }
        const branchCode = input.branchCode.trim().toUpperCase();
        const branch = await tx.branch.create({
          data: {
            companyId: company.id,
            branchCode,
            name: input.name.trim(),
            address: input.address,
            city: input.city,
            state: input.state,
            phone: input.phone,
            email: input.email,
            managerId: input.managerId,
            isHeadOffice: input.isHeadOffice ?? false,
            openingDate: input.openingDate ? new Date(input.openingDate) : undefined,
            documentSequences: {
              create: DOCUMENT_TYPE_VALUES.map((documentType) => ({
                companyId: company.id,
                documentType,
                prefix: DOCUMENT_PREFIX[documentType],
              })),
            },
          },
          include: branchInclude,
        });
        await tx.warehouse.create({
          data: {
            companyId: company.id,
            branchId: branch.id,
            warehouseCode: `${branchCode}-MAIN`,
            name: "Main",
            warehouseType: "main",
            status: "active",
          },
        });
        await tx.warehouse.create({
          data: {
            companyId: company.id,
            branchId: branch.id,
            warehouseCode: `${branchCode}-TRANSIT`,
            name: "In transit",
            warehouseType: "in_transit",
            status: "active",
          },
        });
        return branch;
      });
      const serialized = serializeBranch(branch);
      if (access && this.audit) {
        await this.audit.record({
          actorUserId: access.userId,
          action: "branch.created",
          entityType: "branch",
          entityId: branch.id,
          branchScope: [branch.id],
          newValues: serialized,
          correlationId,
        });
      }
      return serialized;
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  async update(scope: BranchScope, id: string, input: UpdateBranchDto, access?: AccessContext, correlationId?: string) {
    const previous = serializeBranch(await this.findScoped(scope, id));
    const company = await this.companies.requireRecord();
    if (input.managerId) {
      await this.assertManager(company.id, input.managerId);
    }
    try {
      const branch = await this.prisma.$transaction(async (tx) => {
        if (input.isHeadOffice) {
          const headOffice = await tx.branch.findFirst({
            where: { companyId: company.id, isHeadOffice: true, deletedAt: null, NOT: { id } },
          });
          if (headOffice) {
            throw new ConflictException("A head office already exists");
          }
        }
        return tx.branch.update({
          where: { id },
          data: {
            name: input.name?.trim(),
            address: input.address,
            city: input.city,
            state: input.state,
            phone: input.phone,
            email: input.email,
            managerId: input.managerId,
            isHeadOffice: input.isHeadOffice,
            openingDate: input.openingDate ? new Date(input.openingDate) : undefined,
            status: input.status,
          },
          include: branchInclude,
        });
      });
      const serialized = serializeBranch(branch);
      if (access && this.audit) {
        await this.audit.record({
          actorUserId: access.userId,
          action: "branch.updated",
          entityType: "branch",
          entityId: branch.id,
          branchScope: [branch.id],
          previousValues: previous,
          newValues: serialized,
          correlationId,
        });
      }
      return serialized;
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  async changeStatus(scope: BranchScope, id: string, status: "active" | "inactive", access?: AccessContext, correlationId?: string) {
    const previous = serializeBranch(await this.findScoped(scope, id));
    const branch = await this.prisma.branch.update({
      where: { id },
      data: { status },
      include: branchInclude,
    });
    const serialized = serializeBranch(branch);
    if (access && this.audit) {
      await this.audit.record({
        actorUserId: access.userId,
        action: "branch.status_changed",
        entityType: "branch",
        entityId: branch.id,
        branchScope: [branch.id],
        previousValues: { status: previous.status },
        newValues: { status: serialized.status },
        correlationId,
      });
    }
    return serialized;
  }

  private async findScoped(scope: BranchScope, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      include: branchInclude,
    });
    if (!branch) {
      throw new NotFoundException("Branch was not found");
    }
    try {
      assertBranchAllowed(scope, branch.id);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw error;
    }
    return branch;
  }

  private async assertManager(companyId: string, managerId: string) {
    const manager = await this.prisma.employee.findFirst({
      where: { id: managerId, companyId, deletedAt: null },
    });
    if (!manager) {
      throw new NotFoundException("Manager was not found");
    }
  }
}

function serializeBranch(branch: {
  id: string;
  companyId: string;
  branchCode: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  managerId: string | null;
  isHeadOffice: boolean;
  status: string;
  openingDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  manager?: { id: string; firstName: string; lastName: string; employeeNumber: string } | null;
}) {
  return {
    id: branch.id,
    companyId: branch.companyId,
    branchCode: branch.branchCode,
    name: branch.name,
    address: branch.address,
    city: branch.city,
    state: branch.state,
    phone: branch.phone,
    email: branch.email,
    managerId: branch.managerId,
    managerName: branch.manager ? `${branch.manager.firstName} ${branch.manager.lastName}` : null,
    isHeadOffice: branch.isHeadOffice,
    status: branch.status,
    openingDate: branch.openingDate ? branch.openingDate.toISOString().slice(0, 10) : null,
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };
}
