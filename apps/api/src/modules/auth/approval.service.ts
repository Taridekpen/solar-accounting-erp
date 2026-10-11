import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { assertBranchAllowed } from "../organization/branch-scope";
import { AccessContext } from "./access";
import { AuditService } from "./audit.service";

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async authorize(
    access: AccessContext,
    input: { permission: string; originatorUserId: string; branchId?: string },
    correlationId?: string,
  ) {
    const holdsPermission = access.permissions.includes(input.permission);
    const delegation = holdsPermission
      ? null
      : await this.prisma.approvalDelegation.findFirst({
          where: {
            delegateUserId: access.userId,
            permissionCode: input.permission,
            revokedAt: null,
            startsAt: { lte: new Date() },
            endsAt: { gte: new Date() },
          },
        });
    if (!holdsPermission && !delegation) {
      throw new ForbiddenException("Permission is not granted");
    }
    if (input.branchId) {
      assertBranchAllowed(access.scope, input.branchId);
    }
    const rule = await this.prisma.separationRule.findUnique({ where: { action: input.permission } });
    if (rule && input.originatorUserId === access.userId) {
      await this.audit.record({
        actorUserId: access.userId,
        action: "approvals.rejected",
        entityType: "separation_rule",
        entityId: rule.id,
        reason: "Originator cannot approve their own restricted action",
        newValues: { permission: input.permission },
        correlationId,
      });
      throw new ForbiddenException("You cannot approve your own restricted action");
    }
    await this.audit.record({
      actorUserId: access.userId,
      action: "approvals.authorized",
      entityType: "user",
      entityId: input.originatorUserId,
      newValues: { permission: input.permission, branchId: input.branchId ?? null },
      correlationId,
    });
    return { authorized: true };
  }
}
