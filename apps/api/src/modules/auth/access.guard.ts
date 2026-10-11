import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request, Response } from "express";
import { BranchScope } from "../organization/branch-scope";
import { AccessContext } from "./access";
import { AuthService } from "./auth.service";
import { ALLOW_PENDING_MFA, IS_PUBLIC, REQUIRED_PERMISSIONS } from "./decorators";
import { SESSION_COOKIE, readCookie, sha256 } from "./crypto";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { access?: AccessContext; branchScope?: BranchScope }>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const access = token ? await this.auth.resolveAccess(token) : null;
    if (!access) {
      throw new UnauthorizedException("Authentication is required");
    }
    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_MFA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (access.mfaPending && !allowPending) {
      throw new ForbiddenException("Multi-factor enrollment is required");
    }
    if (UNSAFE.has(request.method)) {
      const header = request.header("x-csrf-token");
      if (!header || sha256(header) !== access.csrfTokenHash) {
        throw new ForbiddenException("CSRF token is missing or invalid");
      }
    }
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.some((permission) => !access.permissions.includes(permission))) {
      throw new ForbiddenException("Permission is not granted");
    }
    request.access = access;
    request.branchScope = narrow(access.scope, request.header("x-branch-ids"));
    return true;
  }
}

export function sessionCookieOptions(secure: boolean) {
  // Cross-site web (e.g. Vercel) → API (e.g. Render) needs SameSite=None; Secure.
  // Local HTTP keeps Lax so cookies work without Secure on localhost.
  return {
    httpOnly: true,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    secure,
    path: "/",
    maxAge: 12 * 60 * 60 * 1000,
  };
}

export function clearSessionCookie(response: Response, secure: boolean) {
  response.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(secure), maxAge: undefined });
}

function narrow(scope: BranchScope, header: string | undefined): BranchScope {
  if (!header) {
    return scope;
  }
  const requested = header.split(",").map((value) => value.trim()).filter(Boolean);
  if (requested.length === 0) {
    return scope;
  }
  if (scope.type === "company") {
    return { type: "branches", branchIds: requested };
  }
  const allowed = new Set(scope.branchIds);
  if (requested.some((id) => !allowed.has(id))) {
    throw new ForbiddenException("Branch is outside the authorized scope");
  }
  return { type: "branches", branchIds: requested };
}
