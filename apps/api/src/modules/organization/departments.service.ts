import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { BranchScope, assertBranchAllowed, branchIdFilter } from "./branch-scope";
import { CompanyService, rethrowPrisma } from "./company.service";
import { CreateDepartmentDto, UpdateDepartmentDto } from "./dto/department.dto";
import { PageQueryDto, pageWindow } from "./dto/page-query.dto";

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompanyService,
  ) {}

  async list(scope: BranchScope, query: PageQueryDto) {
    const company = await this.companies.requireRecord();
    const ids = branchIdFilter(scope);
    const where: Prisma.DepartmentWhereInput = {
      companyId: company.id,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(ids ? { OR: [{ branchId: null }, { branchId: ids }] } : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: query.search, mode: "insensitive" } },
                  { code: { contains: query.search, mode: "insensitive" } },
                ],
              },
            ],
          }
        : {}),
    };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.department.count({ where }),
      this.prisma.department.findMany({
        where,
        include: { branch: { select: { id: true, name: true, branchCode: true } } },
        orderBy: { name: "asc" },
        skip,
        take,
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        status: row.status,
        branchId: row.branchId,
        branchName: row.branch?.name ?? null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async create(scope: BranchScope, input: CreateDepartmentDto) {
    const company = await this.companies.requireRecord();
    if (!input.branchId && scope.type !== "company") {
      throw new ForbiddenException("Company-wide departments require company scope");
    }
    if (input.branchId) {
      assertBranchAllowed(scope, input.branchId);
      const branch = await this.prisma.branch.findFirst({
        where: { id: input.branchId, companyId: company.id, deletedAt: null },
      });
      if (!branch) {
        throw new NotFoundException("Branch was not found");
      }
    }
    try {
      return await this.prisma.department.create({
        data: {
          companyId: company.id,
          branchId: input.branchId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
        },
      });
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  async update(scope: BranchScope, id: string, input: UpdateDepartmentDto) {
    const department = await this.prisma.department.findFirst({ where: { id, deletedAt: null } });
    if (!department) {
      throw new NotFoundException("Department was not found");
    }
    if (department.branchId) {
      assertBranchAllowed(scope, department.branchId);
    } else if (scope.type !== "company") {
      throw new ForbiddenException("Company-wide departments require company scope");
    }
    return this.prisma.department.update({
      where: { id },
      data: { name: input.name?.trim(), status: input.status },
    });
  }
}
