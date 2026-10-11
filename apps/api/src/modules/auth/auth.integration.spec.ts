import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ForbiddenException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { decryptSecret } from "./crypto";
import { currentTotpCode } from "./totp";

function useDisposableDatabase(): void {
  const envPath = resolve(__dirname, "../../../.env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  const current = process.env.DATABASE_URL ?? "";
  if (!current.includes("/solar_accounting_test")) {
    process.env.DATABASE_URL = current.replace("/solar_accounting", "/solar_accounting_test");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl.includes("/solar_accounting_test")) {
    throw new Error("Authentication tests must use the disposable solar_accounting_test database");
  }
}

useDisposableDatabase();

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
const branchEmail = "auth-branch@solar.local";
const branchPassword = "BranchStaff-2026";

describe("authentication", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let baseUrl = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    await seed(prisma);
    const { AppModule } = await import("../../app.module");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it("does not duplicate the seeded administrator", async () => {
    const count = await prisma.user.count({ where: { email: adminEmail } });
    expect(count).toBe(1);
  });

  it("rejects a request without a session", async () => {
    const response = await request("/branches");
    expect(response.status).toBe(401);
  });

  it("returns the same login error for an unknown email and a wrong password", async () => {
    await ensureBranchUser();
    const unknown = await request("/auth/login", {
      method: "POST",
      body: { email: "missing@solar.local", password: "WrongPassword-1" },
    });
    const wrong = await request("/auth/login", {
      method: "POST",
      body: { email: branchEmail, password: "WrongPassword-1" },
    });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toBe("Invalid email or password");
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it("rejects a cookie mutation without a CSRF token", async () => {
    const jar = await signIn(branchEmail, branchPassword);
    const response = await request("/auth/change-password", {
      method: "POST",
      jar,
      body: { currentPassword: branchPassword, newPassword: "AnotherStaff-2026" },
    });
    expect(response.status).toBe(403);
  });

  it("stops a branch user from reading another branch", async () => {
    const admin = await signInAdmin();
    const existing = await prisma.branch.findFirst({ where: { branchCode: "AUTHX", deletedAt: null } });
    let otherId = existing?.id;
    if (!otherId) {
      const created = await request("/branches", {
        method: "POST",
        jar: admin,
        csrf: true,
        body: { branchCode: "AUTHX", name: "Auth Other Branch" },
      });
      expect(created.status).toBe(201);
      otherId = created.body.id;
    }
    const jar = await signIn(branchEmail, branchPassword);
    const list = await request("/branches", { jar });
    expect(list.status).toBe(200);
    const ids = (list.body.data ?? []).map((branch) => branch.id);
    expect(ids).not.toContain(otherId);
    const other = await request(`/branches/${otherId}`, { jar });
    expect(other.status).toBe(403);
  });

  it("rejects the next request after a session is revoked", async () => {
    const jar = await signIn(branchEmail, branchPassword);
    const current = await request("/auth/session", { jar });
    expect(current.status).toBe(200);
    const sessions = await request("/auth/sessions", { jar });
    const rows = sessions.body as unknown as { id: string; revokedAt: string | null }[];
    const active = rows.find((item) => !item.revokedAt);
    const revoked = await request(`/auth/sessions/${active?.id}`, { method: "DELETE", jar, csrf: true });
    expect(revoked.status).toBe(200);
    const again = await request("/auth/session", { jar });
    expect(again.status).toBe(401);
  });

  it("rejects a user authorizing their own restricted approval", async () => {
    const { ApprovalService } = await import("./approval.service");
    const { AuditService } = await import("./audit.service");
    const approvals = new ApprovalService(prisma as never, new AuditService(prisma as never));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: branchEmail } });
    await expect(
      approvals.authorize(
        {
          userId: user.id,
          email: user.email,
          sessionId: "00000000-0000-4000-8000-000000000000",
          csrfTokenHash: "hash",
          permissions: ["purchases.approve"],
          roleCodes: ["branch_manager"],
          companyWide: false,
          mfaPending: false,
          mfaEnabled: false,
          scope: { type: "company" },
        },
        { permission: "purchases.approve", originatorUserId: user.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a queued job when the user lacks the permission", async () => {
    const { JobAuthorizationService, AuthorizedJobProcessor } = await import("./job-authorization.service");
    const authorization = app.get(JobAuthorizationService);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: branchEmail } });
    await expect(authorization.assertCanRun({ userId: user.id, permission: "users.manage" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const processor = app.get(AuthorizedJobProcessor);
    await expect(
      processor.process({ name: "authorized.task", data: { userId: user.id, permission: "settings.manage" } } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("writes privileged audit rows without secrets", async () => {
    const admin = await signInAdmin();
    const invited = await request("/users", {
      method: "POST",
      jar: admin,
      csrf: true,
      body: { email: `invited-${Date.now()}@solar.local`, roleCodes: ["sales_officer"] },
    });
    expect(invited.status).toBe(201);
    const suspended = await request(`/users/${invited.body.id}/status`, { method: "PATCH", jar: admin, csrf: true });
    expect(suspended.status).toBe(200);
    const branchJar = await signIn(branchEmail, branchPassword);
    const listed = await request("/auth/sessions", { jar: branchJar });
    const sessionRows = listed.body as unknown as { id: string; revokedAt: string | null }[];
    const active = sessionRows.find((item) => !item.revokedAt);
    const revoked = await request(`/auth/sessions/${active?.id}`, { method: "DELETE", jar: admin, csrf: true });
    expect(revoked.status).toBe(200);
    const events = await prisma.auditEvent.findMany({
      where: {
        action: { in: ["auth.login", "auth.mfa_enrollment_required", "users.invited", "users.suspended", "auth.session_revoked"] },
      },
      orderBy: { occurredAt: "desc" },
      take: 30,
    });
    expect(events.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(adminPassword);
    expect(serialized).not.toContain(invited.body.invitationToken);
    expect(serialized.toLowerCase()).not.toContain("passwordhash");
    expect(serialized.toLowerCase()).not.toContain("mfasecret");
  });

  it("rejects updates to an audit event", async () => {
    const event = await prisma.auditEvent.findFirstOrThrow();
    await expect(prisma.auditEvent.update({ where: { id: event.id }, data: { reason: "changed" } })).rejects.toThrow();
  });

  async function signInAdmin() {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
    const totp =
      admin.mfaEnabled && admin.mfaSecretEncrypted
        ? currentTotpCode(decryptSecret(admin.mfaSecretEncrypted, process.env.SESSION_SECRET ?? ""))
        : undefined;
    const loggedIn = await request("/auth/login", {
      method: "POST",
      body: { email: adminEmail, password: adminPassword, totp },
    });
    expect(loggedIn.status).toBe(201);
    if (loggedIn.body.status !== "mfa_enrollment_required") {
      return loggedIn.jar;
    }
    const enrolled = await request("/auth/mfa/enroll", { method: "POST", jar: loggedIn.jar, csrf: true });
    expect(enrolled.status).toBe(201);
    const secret = enrolled.body.secret;
    expect(secret).toEqual(expect.any(String));
    const verified = await request("/auth/mfa/verify", {
      method: "POST",
      jar: loggedIn.jar,
      csrf: true,
      body: { code: currentTotpCode(secret ?? "") },
    });
    expect(verified.status).toBe(201);
    return loggedIn.jar;
  }

  async function signIn(email: string, password: string) {
    await ensureBranchUser();
    const loggedIn = await request("/auth/login", { method: "POST", body: { email, password } });
    expect(loggedIn.status).toBe(201);
    return loggedIn.jar;
  }

  async function ensureBranchUser() {
    const company = await prisma.company.findFirstOrThrow();
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    const passwordHash = await argon2.hash(branchPassword, { type: argon2.argon2id });
    const existing = await prisma.user.findUnique({ where: { email: branchEmail } });
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash, status: "active", failedLoginCount: 0, lockedUntil: null, mfaEnabled: false },
        })
      : await prisma.user.create({
          data: { companyId: company.id, email: branchEmail, passwordHash, status: "active" },
        });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userBranchAssignment.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await prisma.userBranchAssignment.create({ data: { userId: user.id, branchId: branch.id } });
  }

  async function request(
    path: string,
    options: { method?: string; body?: unknown; jar?: Record<string, string>; csrf?: boolean } = {},
  ) {
    const headers = new Headers();
    if (options.body) {
      headers.set("Content-Type", "application/json");
    }
    if (options.jar) {
      headers.set("Cookie", Object.entries(options.jar).map(([name, value]) => `${name}=${value}`).join("; "));
      if (options.csrf && options.jar.solar_csrf) {
        headers.set("X-CSRF-Token", options.jar.solar_csrf);
      }
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const jar = mergeCookies(options.jar ?? {}, response);
    const body = (await response.json().catch(() => null)) as {
      data?: { id: string }[];
      id?: string;
      status?: string;
      invitationToken?: string;
      secret?: string;
      message?: string | string[];
    } | null;
    return { status: response.status, body: body ?? {}, jar };
  }
});

function mergeCookies(jar: Record<string, string>, response: Response) {
  const next = { ...jar };
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(";")[0] ?? "";
    const index = pair.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!value) {
      delete next[name];
    } else {
      next[name] = decodeURIComponent(value);
    }
  }
  return next;
}
