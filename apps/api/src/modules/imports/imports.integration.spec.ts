import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { CompanyService } from "../organization/company.service";
import { DocumentNumberService } from "../organization/document-number.service";
import { AccountingPostingService } from "../accounting/posting.service";
import { ImportsService } from "./imports.service";

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

describe("imports pipeline", () => {
  let prisma: PrismaClient;
  let creator: AccessContext;
  let approver: AccessContext;
  let branchId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" },
    });
    const other = await prisma.user.upsert({
      where: { email: "import-approver@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "import-approver@solar.local", status: "active" },
    });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    branchId = branch.id;
    await openYear(prisma, admin.companyId, 2028);
    creator = access(admin.id, admin.email);
    approver = access(other.id, other.email);
  }, 120000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("imports customers through approve and commit", async () => {
    const service = makeService();
    const suffix = randomUUID().slice(0, 8);
    const csv = `customerCode,name,branchId\nIMP-${suffix},Import Customer,${branchId}\n`;
    const uploaded = await service.upload(creator, {
      importType: "customers",
      fileName: `customers-${suffix}.csv`,
      contentBase64: Buffer.from(csv, "utf8").toString("base64"),
    });
    expect(uploaded.status).toBe("uploaded");
    await service.parse(creator, uploaded.id);
    await service.validate(creator, uploaded.id);
    await service.preview(creator, uploaded.id);
    await expect(service.approve(creator, uploaded.id)).rejects.toBeInstanceOf(ForbiddenException);
    await service.approve(approver, uploaded.id);
    const committed = await service.commit(approver, uploaded.id);
    expect(committed.status).toBe("imported");
    expect((committed.report as { createdCount: number }).createdCount).toBe(1);
    const customer = await prisma.customer.findFirst({
      where: { customerCode: `IMP-${suffix}`, deletedAt: null },
    });
    expect(customer?.name).toBe("Import Customer");
    const report = await service.report(creator, uploaded.id);
    expect(report.report).toBeTruthy();
  }, 60000);

  it("rejects unbalanced opening trial balance on approve", async () => {
    const service = makeService();
    const csv = "accountCode,debit,credit\n1000,100.0000,0.0000\n3000,0.0000,50.0000\n";
    const uploaded = await service.upload(creator, {
      importType: "opening_trial_balance",
      fileName: "unbalanced-tb.csv",
      contentBase64: Buffer.from(csv, "utf8").toString("base64"),
    });
    await service.parse(creator, uploaded.id);
    const validated = await service.validate(creator, uploaded.id);
    expect((validated.reconciliation as { balanced: boolean }).balanced).toBe(false);
    await expect(service.approve(approver, uploaded.id)).rejects.toBeInstanceOf(BadRequestException);
  }, 60000);

  function makeService() {
    return new ImportsService(
      prisma as never,
      new CompanyService(prisma as never),
      new AuditService(prisma as never),
      new AccountingPostingService(prisma as never, new DocumentNumberService(prisma as never)),
    );
  }

  function access(userId: string, email: string): AccessContext {
    return {
      userId,
      email,
      sessionId: randomUUID(),
      csrfTokenHash: "test",
      permissions: ["imports.view", "imports.manage"],
      roleCodes: ["super_administrator"],
      companyWide: true,
      mfaPending: false,
      mfaEnabled: true,
      scope: { type: "company" },
    };
  }

  async function openYear(client: PrismaClient, companyId: string, year: number) {
    const startDate = new Date(Date.UTC(year, 0, 1));
    const fiscalYear = await client.fiscalYear.upsert({
      where: { companyId_startDate: { companyId, startDate } },
      update: {},
      create: { companyId, startDate, endDate: new Date(Date.UTC(year, 11, 31)) },
    });
    for (let month = 0; month < 12; month += 1) {
      const periodStart = new Date(Date.UTC(year, month, 1));
      const found = await client.fiscalPeriod.findFirst({ where: { companyId, startDate: periodStart } });
      if (!found) {
        await client.fiscalPeriod.create({
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
});
