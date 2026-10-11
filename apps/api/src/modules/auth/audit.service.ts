import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { redactSensitive } from "./crypto";

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  branchScope?: unknown;
  previousValues?: unknown;
  newValues?: unknown;
  reason?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditInput) {
    return this.prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        branchScope: input.branchScope === undefined ? undefined : (redactSensitive(input.branchScope) as Prisma.InputJsonValue),
        previousValues:
          input.previousValues === undefined ? undefined : (redactSensitive(input.previousValues) as Prisma.InputJsonValue),
        newValues: input.newValues === undefined ? undefined : (redactSensitive(input.newValues) as Prisma.InputJsonValue),
        reason: input.reason ?? undefined,
        correlationId: input.correlationId ?? undefined,
      },
    });
  }
}
