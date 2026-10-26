import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import argon2 from "argon2";
import { AppEnv } from "../../config/env.schema";
import { PrismaService } from "../../database/prisma.service";
import { PERMISSIONS } from "../../../prisma/reference-data";
import { BranchScope } from "../organization/branch-scope";
import { AccessContext, isCompanyWide, isPrivileged } from "./access";
import { AuditService } from "./audit.service";
import {
  LOCKOUT_MS,
  MAX_FAILED_LOGINS,
  SESSION_TTL_MS,
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256,
} from "./crypto";
import { generateTotpSecret, totpAuthUri, verifyTotp } from "./totp";

const INVALID_LOGIN = "Invalid email or password";

@Injectable()
export class AuthService {
  private openAccessCache: AccessContext | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /** Signed-out requests run as the seeded super administrator, with every permission. */
  async openSuperAdministratorAccess(): Promise<AccessContext> {
    if (this.openAccessCache) {
      return this.openAccessCache;
    }
    const preferredEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local").trim().toLowerCase();
    const preferred = await this.prisma.user.findUnique({
      where: { email: preferredEmail },
      include: { roles: { include: { role: true } } },
    });
    const preferredIsSuper = Boolean(
      preferred &&
        preferred.status !== "suspended" &&
        preferred.status !== "locked" &&
        preferred.roles.some((item) => item.role.code === "super_administrator"),
    );
    const fallback = preferredIsSuper
      ? null
      : await this.prisma.user.findFirst({
          where: {
            status: { notIn: ["suspended", "locked"] },
            roles: { some: { role: { code: "super_administrator" } } },
          },
          orderBy: { createdAt: "asc" },
        });
    const userId = preferredIsSuper && preferred ? preferred.id : fallback?.id;
    if (!userId) {
      throw new UnauthorizedException("Super administrator is not available");
    }
    const view = await this.sessionView(userId);
    const access: AccessContext = {
      userId,
      email: view.user.email,
      sessionId: "00000000-0000-4000-8000-000000000001",
      csrfTokenHash: "",
      permissions: [...new Set([...view.permissions, ...PERMISSIONS])].sort(),
      roleCodes: [...new Set(["super_administrator", ...view.roleCodes])],
      companyWide: true,
      mfaPending: false,
      mfaEnabled: true,
      scope: { type: "company" },
      openAccess: true,
    };
    this.openAccessCache = access;
    return access;
  }

  async login(input: {
    email: string;
    password: string;
    totp?: string;
    userAgent?: string;
    ipAddress?: string;
    correlationId?: string;
  }) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });
    const roleCodes = user?.roles.map((item) => item.role.code) ?? [];
    if (!user || !user.passwordHash || user.status === "invited" || user.status === "suspended") {
      await this.audit.record({
        action: "auth.login_failed",
        entityType: "user",
        entityId: user?.id,
        correlationId: input.correlationId,
      });
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    const passwordMatches = await argon2.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      const failures = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failures,
          status: failures >= MAX_FAILED_LOGINS ? "locked" : user.status,
          lockedUntil: failures >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : user.lockedUntil,
        },
      });
      await this.audit.record({
        actorUserId: user.id,
        action: "auth.login_failed",
        entityType: "user",
        entityId: user.id,
        correlationId: input.correlationId,
      });
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    if (user.status === "locked" && user.lockedUntil && user.lockedUntil.getTime() <= Date.now()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: "active", failedLoginCount: 0, lockedUntil: null },
      });
    } else if (user.status === "locked") {
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    if (user.mfaEnabled) {
      if (!input.totp || !user.mfaSecretEncrypted || !verifyTotp(decryptSecret(user.mfaSecretEncrypted, this.secret()), input.totp)) {
        throw new UnauthorizedException(input.totp ? INVALID_LOGIN : "Authenticator code is required");
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, status: "active" },
    });
    const pending = isPrivileged(roleCodes) && !user.mfaEnabled;
    const session = await this.createSession(user.id, pending, input.userAgent, input.ipAddress);
    await this.audit.record({
      actorUserId: user.id,
      action: pending ? "auth.mfa_enrollment_required" : "auth.login",
      entityType: "session",
      entityId: session.id,
      correlationId: input.correlationId,
    });
    const view = await this.sessionView(user.id);
    return {
      status: pending ? "mfa_enrollment_required" : "authenticated",
      csrfToken: session.csrfToken,
      sessionToken: session.sessionToken,
      ...view,
    };
  }

  async logout(access: AccessContext, correlationId?: string) {
    if (access.openAccess) {
      return;
    }
    await this.prisma.session.update({
      where: { id: access.sessionId },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "auth.logout",
      entityType: "session",
      entityId: access.sessionId,
      correlationId,
    });
  }

  async sessionView(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        branchAssignments: true,
      },
    });
    const roleCodes = user.roles.map((item) => item.role.code);
    const permissions = [
      ...new Set(user.roles.flatMap((item) => item.role.permissions.map((entry) => entry.permission.code))),
    ].sort();
    const companyWide = isCompanyWide(roleCodes);
    const branchIds = companyWide
      ? (
          await this.prisma.branch.findMany({
            where: { companyId: user.companyId, deletedAt: null },
            select: { id: true },
          })
        ).map((branch) => branch.id)
      : user.branchAssignments.map((assignment) => assignment.branchId);
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, deletedAt: null },
      select: { id: true, name: true, branchCode: true, status: true },
      orderBy: { name: "asc" },
    });
    return {
      user: { id: user.id, email: user.email, status: user.status, mfaEnabled: user.mfaEnabled },
      permissions,
      roleCodes,
      companyWide,
      branches,
    };
  }

  async resolveAccess(sessionToken: string): Promise<AccessContext | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(sessionToken) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    if (session.user.status === "suspended" || session.user.status === "locked") {
      return null;
    }
    const view = await this.sessionView(session.userId);
    const scope: BranchScope = view.companyWide
      ? { type: "company" }
      : { type: "branches", branchIds: view.branches.map((branch) => branch.id) };
    return {
      userId: session.userId,
      email: session.user.email,
      sessionId: session.id,
      csrfTokenHash: session.csrfTokenHash,
      permissions: view.permissions,
      roleCodes: view.roleCodes,
      companyWide: view.companyWide,
      mfaPending: session.mfaPending,
      mfaEnabled: session.user.mfaEnabled,
      scope,
    };
  }

  async enrollMfa(access: AccessContext) {
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: access.userId },
      data: { mfaSecretEncrypted: encryptSecret(secret, this.secret()), mfaEnabled: false },
    });
    return { secret, uri: totpAuthUri(access.email, secret) };
  }

  async verifyMfa(access: AccessContext, code: string, correlationId?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: access.userId } });
    if (!user.mfaSecretEncrypted) {
      throw new BadRequestException("Authenticator enrollment has not started");
    }
    if (!verifyTotp(decryptSecret(user.mfaSecretEncrypted, this.secret()), code)) {
      throw new UnauthorizedException("Authenticator code is invalid");
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await this.prisma.session.update({ where: { id: access.sessionId }, data: { mfaPending: false } });
    await this.audit.record({
      actorUserId: user.id,
      action: "auth.mfa_enabled",
      entityType: "user",
      entityId: user.id,
      correlationId,
    });
  }

  async changePassword(access: AccessContext, currentPassword: string, newPassword: string, correlationId?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: access.userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }),
        passwordChangedAt: new Date(),
      },
    });
    await this.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null, NOT: { id: access.sessionId } },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: "auth.password_changed",
      entityType: "user",
      entityId: user.id,
      correlationId,
    });
  }

  async forgotPassword(email: string, correlationId?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user && user.status === "active" && user.passwordHash) {
      await this.issueToken(user.id, "password_reset", 60 * 60 * 1000);
      await this.audit.record({
        actorUserId: user.id,
        action: "auth.password_reset_requested",
        entityType: "user",
        entityId: user.id,
        correlationId,
      });
    }
    return { status: "accepted" as const };
  }

  async resetPassword(token: string, password: string, correlationId?: string) {
    const userId = await this.consumeToken(token, "password_reset");
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        status: "active",
      },
    });
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: userId,
      action: "auth.password_reset",
      entityType: "user",
      entityId: userId,
      correlationId,
    });
  }

  async activate(token: string, password: string, correlationId?: string) {
    const userId = await this.consumeToken(token, "invitation");
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: "active",
        passwordChangedAt: new Date(),
      },
    });
    await this.audit.record({
      actorUserId: userId,
      action: "auth.activated",
      entityType: "user",
      entityId: userId,
      correlationId,
    });
  }

  async listSessions(userId: string) {
    const rows = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      lastSeenAt: row.lastSeenAt.toISOString(),
      userAgent: row.userAgent,
    }));
  }

  async revokeSession(actor: AccessContext, sessionId: string, canManageUsers: boolean, correlationId?: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || (!canManageUsers && session.userId !== actor.userId)) {
      throw new ForbiddenException("Session cannot be revoked");
    }
    if (!session.revokedAt) {
      await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    }
    await this.audit.record({
      actorUserId: actor.userId,
      action: "auth.session_revoked",
      entityType: "session",
      entityId: sessionId,
      correlationId,
    });
    return { status: "revoked" as const };
  }

  async issueInvitation(userId: string) {
    return this.issueToken(userId, "invitation", 7 * 24 * 60 * 60 * 1000);
  }

  async rotateCsrf(sessionId: string) {
    const csrfToken = randomToken();
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { csrfTokenHash: sha256(csrfToken) },
    });
    return csrfToken;
  }

  private async createSession(userId: string, mfaPending: boolean, userAgent?: string, ipAddress?: string) {
    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(sessionToken),
        csrfTokenHash: sha256(csrfToken),
        mfaPending,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        userAgent,
        ipAddress,
      },
    });
    return { id: session.id, sessionToken, csrfToken };
  }

  private async issueToken(userId: string, purpose: "invitation" | "password_reset", ttlMs: number) {
    const token = randomToken();
    await this.prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return token;
  }

  private async consumeToken(token: string, purpose: "invitation" | "password_reset") {
    const row = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Token is invalid or expired");
    }
    await this.prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return row.userId;
  }

  private secret(): string {
    return this.config.get("SESSION_SECRET", { infer: true });
  }
}
