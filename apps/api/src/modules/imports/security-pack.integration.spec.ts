import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { DocumentsService } from "../admin/documents.service";
import { AuditService } from "../auth/audit.service";
import type { AccessContext } from "../auth/access";
import { DocumentNumberService } from "../organization/document-number.service";
import { CompanyService } from "../organization/company.service";

function useDisposableDatabase(): void {
  const envPath = resolve(__dirname, "../../../.env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(index + 1).trim();
  }
  const current = process.env.DATABASE_URL ?? "";
  if (!current.includes("/solar_accounting_test")) {
    process.env.DATABASE_URL = current.replace("/solar_accounting", "/solar_accounting_test");
  }
}

useDisposableDatabase();

describe("Section 16 security pack", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let baseUrl = "";
  let branchId = "";
  let otherBranchId = "";
  let companyId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" },
    });
    companyId = admin.companyId;
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    branchId = branch.id;
    const other = await prisma.branch.upsert({
      where: { companyId_branchCode: { companyId, branchCode: "SEC16" } },
      update: {},
      create: {
        companyId,
        branchCode: "SEC16",
        name: "Security pack branch",
        status: "active",
        documentSequences: {
          create: [
            { companyId, documentType: "sales_invoice", prefix: "INV" },
            { companyId, documentType: "customer_receipt", prefix: "RCT" },
            { companyId, documentType: "journal", prefix: "JRN" },
          ],
        },
      },
    });
    otherBranchId = other.id;
    await openYear(prisma, companyId, 2028);
    const { AppModule } = await import("../../app.module");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it("returns 401 without a session", async () => {
    const response = await fetch(`${baseUrl}/imports`);
    expect(response.status).toBe(401);
  });

  it("rejects CSRF-missing unsafe mutations, permission gaps, and cross-branch documents", async () => {
    const email = `sec16-csrf-${randomUUID().slice(0, 8)}@solar.local`;
    const password = "SecPackStaff-2028";
    const role = await prisma.role.findFirstOrThrow({ where: { code: "branch_manager" } });
    const user = await prisma.user.create({
      data: {
        companyId,
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: "active",
        mfaEnabled: false,
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await prisma.userBranchAssignment.create({ data: { userId: user.id, branchId } });
    const jar = await signIn(email, password);
    const noCsrf = await request("/imports", {
      method: "POST",
      jar,
      body: {
        importType: "customers",
        fileName: "x.csv",
        contentBase64: Buffer.from(`customerCode,name,branchId\nA,B,${branchId}`).toString("base64"),
      },
    });
    expect(noCsrf.status).toBe(403);

    const outsider = await prisma.user.create({
      data: {
        companyId,
        email: `sec16-${randomUUID().slice(0, 8)}@solar.local`,
        status: "active",
      },
    });
    const branchRole = await prisma.role.findFirstOrThrow({ where: { code: "branch_manager" } });
    await prisma.userRole.create({ data: { userId: outsider.id, roleId: branchRole.id } });
    await prisma.userBranchAssignment.create({ data: { userId: outsider.id, branchId: otherBranchId } });
    const branchAccess: AccessContext = {
      userId: outsider.id,
      email: outsider.email,
      sessionId: randomUUID(),
      csrfTokenHash: "x",
      permissions: ["documents.view", "documents.manage"],
      roleCodes: ["branch_manager"],
      companyWide: false,
      mfaPending: false,
      mfaEnabled: false,
      scope: { type: "branches", branchIds: [otherBranchId] },
    };
    const documents = new DocumentsService(prisma as never, new CompanyService(prisma as never), new AuditService(prisma as never));
    await expect(
      documents.upload(branchAccess, {
        branchId,
        entityType: "branch",
        entityId: branchId,
        documentKind: "other",
        fileName: "note.pdf",
        mimeType: "application/pdf",
        contentBase64: Buffer.from("%PDF-1.4").toString("base64"),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const denied = await request("/imports", { jar });
    expect(denied.status).toBe(403);
  });

  it("rejects document MIME and oversize uploads", async () => {
    const access: AccessContext = {
      userId: (await prisma.user.findFirstOrThrow()).id,
      email: "admin@solar.local",
      sessionId: randomUUID(),
      csrfTokenHash: "x",
      permissions: ["documents.manage", "documents.view"],
      roleCodes: ["super_administrator"],
      companyWide: true,
      mfaPending: false,
      mfaEnabled: true,
      scope: { type: "company" },
    };
    const documents = new DocumentsService(prisma as never, new CompanyService(prisma as never), new AuditService(prisma as never));
    await expect(
      documents.upload(access, {
        branchId,
        entityType: "branch",
        entityId: branchId,
        documentKind: "other",
        fileName: "evil.exe",
        mimeType: "application/x-msdownload",
        contentBase64: Buffer.from("MZ").toString("base64"),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const huge = Buffer.alloc(2_000_001, 65).toString("base64");
    await expect(
      documents.upload(access, {
        branchId,
        entityType: "branch",
        entityId: branchId,
        documentKind: "other",
        fileName: "big.pdf",
        mimeType: "application/pdf",
        contentBase64: huge,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uses parameterized Prisma queries and unique concurrent document numbers", async () => {
    const injected = "'; DROP TABLE users; --";
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM branches WHERE branch_code = ${injected} LIMIT 1`,
    );
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);

    const numbers = new DocumentNumberService(prisma as never);
    const scope = { type: "company" as const };
    const allocated = await Promise.all([
      numbers.allocate(scope, branchId, "journal"),
      numbers.allocate(scope, branchId, "journal"),
      numbers.allocate(scope, branchId, "journal"),
    ]);
    const unique = new Set(allocated.map((row) => row.documentNumber));
    expect(unique.size).toBe(3);
  });

  it("rejects a duplicate payment allocation that exceeds the open balance", async () => {
    const { SalesService } = await import("../sales/sales.service");
    const { CustomersService } = await import("../sales/customers.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    const documents = new DocumentNumberService(prisma as never);
    const posting = new AccountingPostingService(prisma as never, documents);
    const sales = new SalesService(prisma as never, documents, posting);
    const customers = new CustomersService(prisma as never, documents);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" },
    });
    const access: AccessContext = {
      userId: admin.id,
      email: admin.email,
      sessionId: randomUUID(),
      csrfTokenHash: "x",
      permissions: ["sales.view", "sales.create", "customers.create", "customers.view"],
      roleCodes: ["super_administrator"],
      companyWide: true,
      mfaPending: false,
      mfaEnabled: true,
      scope: { type: "company" },
    };
    const suffix = randomUUID().slice(0, 8);
    const customer = await customers.create(access, {
      customerType: "corporate",
      name: `Sec pay ${suffix}`,
      branchId,
      phone: `0803${suffix.replaceAll("-", "").slice(0, 7)}`,
      email: `sec-pay-${suffix}@solar.local`,
      creditLimit: "500000.0000",
      paymentTermsDays: 0,
    });
    const category = await prisma.productCategory.findFirstOrThrow();
    const revenue = await prisma.account.findFirstOrThrow({ where: { accountCode: "4000" } });
    const product = await prisma.product.create({
      data: {
        companyId,
        categoryId: category.id,
        sku: `SEC-${suffix}`,
        name: `Sec product ${suffix}`,
        productType: "service",
        defaultCost: "0.0000",
        defaultSellingPrice: "1000.0000",
        revenueAccountId: revenue.id,
      },
    });
    const invoice = await sales.createInvoice(access, {
      customerId: customer.id,
      branchId,
      invoiceDate: "2028-04-05",
      paymentTermsDays: 0,
      settlement: "credit",
      lines: [{ productId: product.id, quantity: "1.0000", unitPrice: "1000.0000" }],
    });
    const posted = await sales.finalizeInvoice(access, invoice.id);
    const openAmount = posted.grandTotal as string;
    await sales.createReceipt(access, {
      customerId: customer.id,
      branchId,
      receiptDate: "2028-04-06",
      methods: [{ method: "cash", amount: openAmount }],
      allocations: [{ invoiceId: invoice.id, amount: openAmount }],
    });
    await expect(
      sales.createReceipt(access, {
        customerId: customer.id,
        branchId,
        receiptDate: "2028-04-07",
        methods: [{ method: "cash", amount: openAmount }],
        allocations: [{ invoiceId: invoice.id, amount: openAmount }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  }, 60000);

  async function signIn(email: string, password: string) {
    const response = await request("/auth/login", { method: "POST", body: { email, password } });
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Login failed (${response.status})`);
    }
    return response.jar;
  }

  async function request(
    path: string,
    options: { method?: string; body?: unknown; jar?: Record<string, string>; csrf?: boolean } = {},
  ) {
    const headers = new Headers();
    if (options.body) headers.set("Content-Type", "application/json");
    if (options.jar) {
      headers.set("Cookie", Object.entries(options.jar).map(([name, value]) => `${name}=${value}`).join("; "));
      if (options.csrf && options.jar.solar_csrf) headers.set("X-CSRF-Token", options.jar.solar_csrf);
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const jar = mergeCookies(options.jar ?? {}, response);
    return { status: response.status, jar };
  }
});

async function openYear(prisma: PrismaClient, companyId: string, year: number) {
  const startDate = new Date(Date.UTC(year, 0, 1));
  const fiscalYear = await prisma.fiscalYear.upsert({
    where: { companyId_startDate: { companyId, startDate } },
    update: {},
    create: { companyId, startDate, endDate: new Date(Date.UTC(year, 11, 31)) },
  });
  for (let month = 0; month < 12; month += 1) {
    const periodStart = new Date(Date.UTC(year, month, 1));
    const found = await prisma.fiscalPeriod.findFirst({ where: { companyId, startDate: periodStart } });
    if (!found) {
      await prisma.fiscalPeriod.create({
        data: {
          companyId,
          fiscalYearId: fiscalYear.id,
          startDate: periodStart,
          endDate: new Date(Date.UTC(year, month + 1, 0)),
          status: "open",
        },
      });
    }
  }
}

function mergeCookies(jar: Record<string, string>, response: Response) {
  const next = { ...jar };
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(";")[0] ?? "";
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!value) delete next[name];
    else next[name] = decodeURIComponent(value);
  }
  return next;
}
