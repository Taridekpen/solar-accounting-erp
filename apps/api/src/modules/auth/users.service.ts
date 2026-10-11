import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "./access";
import { AuditService } from "./audit.service";
import { AuthService } from "./auth.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(access: AccessContext) {
    const companyId = await this.companyId(access.userId);
    const rows = await this.prisma.user.findMany({
      where: { companyId },
      include: {
        roles: { include: { role: true } },
        branchAssignments: { include: { branch: { select: { id: true, name: true } } } },
      },
      orderBy: { email: "asc" },
    });
    return rows.map((user) => ({
      id: user.id,
      email: user.email,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      roles: user.roles.map((item) => ({ code: item.role.code, name: item.role.name })),
      branches: user.branchAssignments.map((item) => ({ id: item.branch.id, name: item.branch.name })),
    }));
  }

  async invite(
    access: AccessContext,
    input: { email: string; roleCodes: string[]; branchIds?: string[] },
    correlationId?: string,
  ) {
    const companyId = await this.companyId(access.userId);
    const email = input.email.trim().toLowerCase();
    const roles = await this.prisma.role.findMany({ where: { code: { in: input.roleCodes } } });
    if (roles.length !== input.roleCodes.length) {
      throw new BadRequestException("One or more roles do not exist");
    }
    if (input.branchIds?.length) {
      const branches = await this.prisma.branch.count({
        where: { id: { in: input.branchIds }, companyId, deletedAt: null },
      });
      if (branches !== input.branchIds.length) {
        throw new BadRequestException("One or more branches do not exist");
      }
    }
    const user = await this.prisma.user.create({
      data: {
        companyId,
        email,
        status: "invited",
        roles: { create: roles.map((role) => ({ roleId: role.id })) },
        branchAssignments: input.branchIds?.length
          ? { create: input.branchIds.map((branchId) => ({ branchId })) }
          : undefined,
      },
    });
    const invitationToken = await this.auth.issueInvitation(user.id);
    await this.audit.record({
      actorUserId: access.userId,
      action: "users.invited",
      entityType: "user",
      entityId: user.id,
      newValues: { email, roleCodes: input.roleCodes, branchIds: input.branchIds ?? [] },
      correlationId,
    });
    return { id: user.id, email: user.email, invitationToken };
  }

  async updateAssignments(
    access: AccessContext,
    userId: string,
    input: { roleCodes?: string[]; branchIds?: string[] },
    correlationId?: string,
  ) {
    const user = await this.requireCompanyUser(access, userId);
    if (input.roleCodes) {
      const roles = await this.prisma.role.findMany({ where: { code: { in: input.roleCodes } } });
      if (roles.length !== input.roleCodes.length) {
        throw new BadRequestException("One or more roles do not exist");
      }
      await this.prisma.userRole.deleteMany({ where: { userId } });
      await this.prisma.userRole.createMany({ data: roles.map((role) => ({ userId, roleId: role.id })) });
    }
    if (input.branchIds) {
      const companyId = await this.companyId(access.userId);
      const branches = await this.prisma.branch.count({
        where: { id: { in: input.branchIds }, companyId, deletedAt: null },
      });
      if (branches !== input.branchIds.length) {
        throw new BadRequestException("One or more branches do not exist");
      }
      await this.prisma.userBranchAssignment.deleteMany({ where: { userId } });
      await this.prisma.userBranchAssignment.createMany({
        data: input.branchIds.map((branchId) => ({ userId, branchId })),
      });
    }
    await this.audit.record({
      actorUserId: access.userId,
      action: "users.assignments_updated",
      entityType: "user",
      entityId: user.id,
      newValues: input,
      correlationId,
    });
    return { status: "updated" as const };
  }

  async sessions(access: AccessContext, userId: string) {
    await this.requireCompanyUser(access, userId);
    return this.auth.listSessions(userId);
  }

  async suspend(access: AccessContext, userId: string, correlationId?: string) {
    const user = await this.requireCompanyUser(access, userId);
    if (user.id === access.userId) {
      throw new BadRequestException("You cannot suspend your own account");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { status: "suspended" } });
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "users.suspended",
      entityType: "user",
      entityId: userId,
      previousValues: { status: user.status },
      newValues: { status: "suspended" },
      correlationId,
    });
    return { status: "suspended" as const };
  }

  async delegate(
    access: AccessContext,
    input: { delegateUserId: string; permissionCode: string; startsAt: string; endsAt: string },
    correlationId?: string,
  ) {
    if (!access.permissions.includes(input.permissionCode) && !access.permissions.includes("users.manage")) {
      throw new BadRequestException("You cannot delegate a permission you do not hold");
    }
    await this.requireCompanyUser(access, input.delegateUserId);
    const delegation = await this.prisma.approvalDelegation.create({
      data: {
        delegatorUserId: access.userId,
        delegateUserId: input.delegateUserId,
        permissionCode: input.permissionCode,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
      },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "approvals.delegated",
      entityType: "approval_delegation",
      entityId: delegation.id,
      newValues: { delegateUserId: input.delegateUserId, permissionCode: input.permissionCode },
      correlationId,
    });
    return { id: delegation.id };
  }

  private async companyId(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { companyId: true } });
    return user.companyId;
  }

  private async requireCompanyUser(access: AccessContext, userId: string) {
    const companyId = await this.companyId(access.userId);
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) {
      throw new NotFoundException("User was not found");
    }
    return user;
  }
}
