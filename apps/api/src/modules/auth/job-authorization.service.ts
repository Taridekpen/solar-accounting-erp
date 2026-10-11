import { ForbiddenException, Injectable } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { SYSTEM_QUEUE } from "../../jobs/jobs.module";
import { PrismaService } from "../../database/prisma.service";
import { isCompanyWide } from "./access";
import { AuditService } from "./audit.service";

export interface AuthorizedJobPayload {
  userId: string;
  permission: string;
  branchId?: string;
}

@Injectable()
export class JobAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async assertCanRun(payload: AuthorizedJobPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        branchAssignments: true,
      },
    });
    const permissions = new Set(
      user?.roles.flatMap((item) => item.role.permissions.map((entry) => entry.permission.code)) ?? [],
    );
    const roleCodes = user?.roles.map((item) => item.role.code) ?? [];
    const allowed =
      user &&
      user.status === "active" &&
      permissions.has(payload.permission) &&
      (!payload.branchId ||
        isCompanyWide(roleCodes) ||
        user.branchAssignments.some((assignment) => assignment.branchId === payload.branchId));
    if (!allowed) {
      await this.audit.record({
        actorUserId: user?.id,
        action: "jobs.rejected",
        entityType: "job",
        entityId: payload.permission,
        reason: "User lacks the permission required by the job",
        newValues: { permission: payload.permission, branchId: payload.branchId ?? null },
      });
      throw new ForbiddenException("Job is not authorized");
    }
  }
}

@Processor(SYSTEM_QUEUE)
export class AuthorizedJobProcessor extends WorkerHost {
  constructor(private readonly authorization: JobAuthorizationService) {
    super();
  }

  async process(job: Job<AuthorizedJobPayload>): Promise<void> {
    if (job.name !== "authorized.task") {
      return;
    }
    await this.authorization.assertCanRun(job.data);
  }
}
