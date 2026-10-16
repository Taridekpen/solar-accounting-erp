import { Body, Controller, Delete, ForbiddenException, Get, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { Request, Response } from "express";
import { AppEnv } from "../../config/env.schema";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "./access";
import { clearSessionCookie, sessionCookieOptions } from "./access.guard";
import { ApprovalService } from "./approval.service";
import { AuthService } from "./auth.service";
import { SESSION_COOKIE, CSRF_COOKIE, readCookie } from "./crypto";
import { AllowPendingMfa, Public, RequirePermissions } from "./decorators";
import {
  AuthorizeApprovalDto,
  ChangePasswordDto,
  DelegationDto,
  EmailDto,
  InviteUserDto,
  LoginDto,
  ResetPasswordDto,
  TotpDto,
  UpdateUserDto,
} from "./dto";
import { UsersService } from "./users.service";

class AuditListQuery {
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}

interface AuthRequest extends Request {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Public()
  @Post("login")
  async login(@Body() body: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login({
      email: body.email,
      password: body.password,
      totp: body.totp,
      userAgent: request.header("user-agent"),
      ipAddress: request.ip,
      correlationId: (request as AuthRequest).correlationId,
    });
    response.cookie(SESSION_COOKIE, result.sessionToken, sessionCookieOptions(this.secure()));
    response.cookie(CSRF_COOKIE, result.csrfToken, { ...sessionCookieOptions(this.secure()), httpOnly: false });
    const { sessionToken: _ignored, ...view } = result;
    return view;
  }

  @AllowPendingMfa()
  @Post("logout")
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.access, request.correlationId);
    clearSessionCookie(response, this.secure());
    response.clearCookie(CSRF_COOKIE, { ...sessionCookieOptions(this.secure()), httpOnly: false });
    return { status: "signed_out" };
  }

  @AllowPendingMfa()
  @Get("session")
  async session(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    const view = await this.auth.sessionView(request.access.userId);
    // Echo the CSRF cookie in JSON so cross-origin clients (web on a different host)
    // can store it after refresh/new tabs — document.cookie cannot read the API-domain cookie.
    let csrfToken = readCookie(request.headers.cookie, CSRF_COOKIE);
    if (!csrfToken) {
      csrfToken = await this.auth.rotateCsrf(request.access.sessionId);
      response.cookie(CSRF_COOKIE, csrfToken, { ...sessionCookieOptions(this.secure()), httpOnly: false });
    }
    return { ...view, mfaPending: request.access.mfaPending, csrfToken };
  }

  @Public()
  @Post("forgot-password")
  forgotPassword(@Body() body: EmailDto, @Req() request: Request) {
    return this.auth.forgotPassword(body.email, (request as AuthRequest).correlationId);
  }

  @Public()
  @Post("reset-password")
  async resetPassword(@Body() body: ResetPasswordDto, @Req() request: Request) {
    await this.auth.resetPassword(body.token, body.password, (request as AuthRequest).correlationId);
    return { status: "reset" };
  }

  @Public()
  @Post("activate")
  async activate(@Body() body: ResetPasswordDto, @Req() request: Request) {
    await this.auth.activate(body.token, body.password, (request as AuthRequest).correlationId);
    return { status: "activated" };
  }

  @Post("change-password")
  async changePassword(@Body() body: ChangePasswordDto, @Req() request: AuthRequest) {
    await this.auth.changePassword(request.access, body.currentPassword, body.newPassword, request.correlationId);
    return { status: "changed" };
  }

  @AllowPendingMfa()
  @Post("mfa/enroll")
  enroll(@Req() request: AuthRequest) {
    return this.auth.enrollMfa(request.access);
  }

  @AllowPendingMfa()
  @Post("mfa/verify")
  async verify(@Body() body: TotpDto, @Req() request: AuthRequest) {
    await this.auth.verifyMfa(request.access, body.code, request.correlationId);
    return { status: "mfa_enabled" };
  }

  @Get("sessions")
  sessions(@Req() request: AuthRequest) {
    return this.auth.listSessions(request.access.userId);
  }

  @Delete("sessions/:id")
  revoke(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
    return this.auth.revokeSession(
      request.access,
      id,
      request.access.permissions.includes("users.manage"),
      request.correlationId,
    );
  }

  private secure() {
    return this.config.get("NODE_ENV", { infer: true }) === "production";
  }
}

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermissions("users.view")
  @Get()
  list(@Req() request: AuthRequest) {
    return this.users.list(request.access);
  }

  @RequirePermissions("users.manage")
  @Post()
  invite(@Body() body: InviteUserDto, @Req() request: AuthRequest) {
    return this.users.invite(request.access, body, request.correlationId);
  }

  @RequirePermissions("users.manage")
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateUserDto, @Req() request: AuthRequest) {
    return this.users.updateAssignments(request.access, id, body, request.correlationId);
  }

  @RequirePermissions("users.manage")
  @Get(":id/sessions")
  sessions(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
    return this.users.sessions(request.access, id);
  }

  @RequirePermissions("users.manage")
  @Patch(":id/status")
  suspend(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
    return this.users.suspend(request.access, id, request.correlationId);
  }
}

@ApiTags("approvals")
@Controller()
export class ApprovalController {
  constructor(
    private readonly approvals: ApprovalService,
    private readonly users: UsersService,
  ) {}

  @Post("approvals/authorize")
  authorize(@Body() body: AuthorizeApprovalDto, @Req() request: AuthRequest) {
    return this.approvals.authorize(request.access, body, request.correlationId);
  }

  @Post("approval-delegations")
  delegate(@Body() body: DelegationDto, @Req() request: AuthRequest) {
    return this.users.delegate(request.access, body, request.correlationId);
  }
}

@Injectable()
export class AuditReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(access: AccessContext, query: AuditListQuery = {}) {
    if (!access.permissions.includes("audit.view") && !access.permissions.includes("users.view")) {
      throw new ForbiddenException("Audit history is not available for this account");
    }
    const take = Math.min(query.take ?? 100, 500);
    const where: Prisma.AuditEventWhereInput = {
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { action: { contains: query.q, mode: "insensitive" } },
              { entityType: { contains: query.q, mode: "insensitive" } },
              { reason: { contains: query.q, mode: "insensitive" } },
              { entityId: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.auditEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: query.branchId ? Math.min(take * 5, 500) : take,
      include: { actor: { select: { id: true, email: true } } },
    });
    const branchId = query.branchId;
    const filtered = branchId
      ? rows.filter((row) => {
          const scope = row.branchScope;
          if (scope == null) return false;
          if (typeof scope === "string") return scope === branchId;
          if (Array.isArray(scope)) return scope.includes(branchId);
          return JSON.stringify(scope).includes(branchId);
        })
      : rows;
    return filtered.slice(0, take).map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      actorEmail: row.actor?.email ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      occurredAt: row.occurredAt.toISOString(),
      branchScope: row.branchScope,
      previousValues: row.previousValues,
      newValues: row.newValues,
      reason: row.reason,
      correlationId: row.correlationId,
    }));
  }
}

@ApiTags("audit")
@Controller("audit-events")
export class AuditController {
  constructor(private readonly audit: AuditReadService) {}

  @RequirePermissions("audit.view")
  @Get()
  list(@Req() request: AuthRequest, @Query() query: AuditListQuery) {
    return this.audit.list(request.access, query);
  }
}
