import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { BranchScope, assertBranchAllowed, branchIdFilter } from "./branch-scope";
import { CompanyService, rethrowPrisma } from "./company.service";
import { CreateEmployeeDto, UpdateEmployeeDto } from "./dto/employee.dto";
import { PageQueryDto, pageWindow } from "./dto/page-query.dto";

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompanyService,
  ) {}

  async list(scope: BranchScope, query: PageQueryDto) {
    const company = await this.companies.requireRecord();
    const ids = branchIdFilter(scope);
    const where: Prisma.EmployeeWhereInput = {
      companyId: company.id,
      deletedAt: null,
      ...(ids ? { branchId: ids } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { employeeNumber: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const { skip, take } = pageWindow(query.page, query.pageSize);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        include: {
          branch: { select: { name: true, branchCode: true } },
          department: { select: { name: true } },
          account: { select: { id: true, email: true } },
        },
        orderBy: { employeeNumber: "asc" },
        skip,
        take,
      }),
    ]);
    return {
      data: rows.map(serializeEmployee),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(scope: BranchScope, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      include: {
        branch: { select: { name: true, branchCode: true } },
        department: { select: { name: true } },
        account: { select: { id: true, email: true } },
      },
    });
    if (!employee) {
      throw new NotFoundException("Employee was not found");
    }
    assertBranchAllowed(scope, employee.branchId);
    return serializeEmployee(employee);
  }

  async create(scope: BranchScope, input: CreateEmployeeDto) {
    const company = await this.companies.requireRecord();
    assertBranchAllowed(scope, input.branchId);
    await this.assertBranch(company.id, input.branchId);
    if (input.departmentId) {
      await this.assertDepartment(company.id, input.departmentId, input.branchId);
    }
    try {
      const employee = await this.prisma.employee.create({
        data: {
          companyId: company.id,
          employeeNumber: input.employeeNumber.trim().toUpperCase(),
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          branchId: input.branchId,
          departmentId: input.departmentId,
          email: input.email,
          phone: input.phone,
          jobTitle: input.jobTitle,
          hireDate: input.hireDate ? new Date(input.hireDate) : undefined,
        },
        include: {
          branch: { select: { name: true, branchCode: true } },
          department: { select: { name: true } },
        },
      });
      return serializeEmployee(employee);
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  async update(scope: BranchScope, id: string, input: UpdateEmployeeDto) {
    const existing = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("Employee was not found");
    }
    assertBranchAllowed(scope, existing.branchId);
    const company = await this.companies.requireRecord();
    if (input.branchId) {
      assertBranchAllowed(scope, input.branchId);
      await this.assertBranch(company.id, input.branchId);
    }
    if (input.departmentId) {
      await this.assertDepartment(company.id, input.departmentId, input.branchId ?? existing.branchId);
    }
    if (input.userId) {
      const user = await this.prisma.user.findFirst({ where: { id: input.userId, companyId: company.id } });
      if (!user) throw new NotFoundException("User was not found");
      const taken = await this.prisma.employee.findFirst({ where: { userId: input.userId, deletedAt: null, NOT: { id } } });
      if (taken) throw new BadRequestException("That sign-in is already linked to another employee");
    }
    const employee = await this.prisma.$transaction(async (tx) => {
      if (input.userId === null && existing.userId) {
        await tx.user.update({ where: { id: existing.userId }, data: { employeeId: null } });
      }
      if (input.userId) {
        if (existing.userId && existing.userId !== input.userId) {
          await tx.user.update({ where: { id: existing.userId }, data: { employeeId: null } });
        }
        await tx.user.update({ where: { id: input.userId }, data: { employeeId: id } });
      }
      return tx.employee.update({
        where: { id },
        data: {
          firstName: input.firstName?.trim(),
          lastName: input.lastName?.trim(),
          branchId: input.branchId,
          departmentId: input.departmentId,
          email: input.email,
          phone: input.phone,
          jobTitle: input.jobTitle,
          hireDate: input.hireDate ? new Date(input.hireDate) : undefined,
          employmentStatus: input.employmentStatus,
          ...(input.userId !== undefined ? { userId: input.userId } : {}),
        },
        include: {
          branch: { select: { name: true, branchCode: true } },
          department: { select: { name: true } },
          account: { select: { id: true, email: true } },
        },
      });
    });
    return serializeEmployee(employee);
  }

  private async assertBranch(companyId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException("Branch was not found");
    }
  }

  private async assertDepartment(companyId: string, departmentId: string, branchId: string) {
    const department = await this.prisma.department.findFirst({
      where: {
        id: departmentId,
        companyId,
        deletedAt: null,
        OR: [{ branchId: null }, { branchId }],
      },
    });
    if (!department) {
      throw new NotFoundException("Department was not found");
    }
  }
}

function serializeEmployee(employee: {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  branchId: string;
  departmentId: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  hireDate: Date | null;
  userId: string | null;
  branch?: { name: string; branchCode: string };
  department?: { name: string } | null;
  account?: { id: string; email: string } | null;
}) {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    branchId: employee.branchId,
    branchName: employee.branch?.name ?? null,
    departmentId: employee.departmentId,
    departmentName: employee.department?.name ?? null,
    jobTitle: employee.jobTitle,
    employmentStatus: employee.employmentStatus,
    hireDate: employee.hireDate ? employee.hireDate.toISOString().slice(0, 10) : null,
    userId: employee.userId,
    userEmail: employee.account?.email ?? null,
  };
}
