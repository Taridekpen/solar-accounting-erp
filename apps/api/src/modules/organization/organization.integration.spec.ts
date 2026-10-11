import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConflictException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

function useDisposableDatabase(): void {
  if (!process.env.DATABASE_URL) {
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
  }
  const current = process.env.DATABASE_URL ?? "";
  if (!current.includes("/solar_accounting_test")) {
    process.env.DATABASE_URL = current.replace("/solar_accounting", "/solar_accounting_test");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl.includes("/solar_accounting_test")) {
    throw new Error("Organization tests must use the disposable solar_accounting_test database");
  }
}

useDisposableDatabase();

const companyScope = { type: "company" as const };

describe("organization database", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    const { PERMISSIONS } = await import("../../../prisma/reference-data");
    prisma = new client.PrismaClient();
    await seed(prisma);
    await seed(prisma);
    const [companies, headOffices, permissions] = await Promise.all([
      prisma.company.count(),
      prisma.branch.count({ where: { branchCode: "HO", deletedAt: null } }),
      prisma.permission.count(),
    ]);
    expect(companies).toBe(1);
    expect(headOffices).toBe(1);
    expect(permissions).toBe(PERMISSIONS.length);
  }, 30_000);

  afterAll(async () => {
    const extras = await prisma.branch.findMany({ where: { branchCode: { startsWith: "TST" } } });
    for (const branch of extras) {
      await prisma.documentSequence.deleteMany({ where: { branchId: branch.id } });
      await prisma.employee.deleteMany({ where: { branchId: branch.id } });
      await prisma.department.deleteMany({ where: { branchId: branch.id } });
      await prisma.warehouse.deleteMany({ where: { branchId: branch.id } });
      await prisma.branch.delete({ where: { id: branch.id } });
    }
    await prisma.$disconnect();
  });

  it("rejects a second legal company", async () => {
    const { CompanyService } = await import("./company.service");
    const companies = new CompanyService(prisma as never);
    await expect(companies.create({ legalName: "Another Company" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects a duplicate branch code", async () => {
    const { CompanyService } = await import("./company.service");
    const { BranchesService } = await import("./branches.service");
    const branches = new BranchesService(prisma as never, new CompanyService(prisma as never));
    await expect(branches.create(companyScope, { branchCode: "HO", name: "Duplicate" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("keeps a deactivated branch readable", async () => {
    const { CompanyService } = await import("./company.service");
    const { BranchesService } = await import("./branches.service");
    const branches = new BranchesService(prisma as never, new CompanyService(prisma as never));
    const created = await branches.create(companyScope, { branchCode: "TST1", name: "Test Branch One", city: "Abuja" });
    const inactive = await branches.changeStatus(companyScope, created.id, "inactive");
    const loaded = await branches.get(companyScope, created.id);
    expect(inactive.status).toBe("inactive");
    expect(loaded.status).toBe("inactive");
    expect(loaded.name).toBe("Test Branch One");
  });

  it("does not return a branch outside the requested scope", async () => {
    const { CompanyService } = await import("./company.service");
    const { BranchesService } = await import("./branches.service");
    const branches = new BranchesService(prisma as never, new CompanyService(prisma as never));
    const headOffice = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    const other = await branches.create(companyScope, { branchCode: "TST2", name: "Test Branch Two" });
    const scoped = await branches.list({ type: "branches", branchIds: [headOffice.id] }, { page: 1, pageSize: 50 });
    expect(scoped.data.map((branch) => branch.id)).toContain(headOffice.id);
    expect(scoped.data.map((branch) => branch.id)).not.toContain(other.id);
  });

  it("allocates distinct document numbers under concurrent requests", async () => {
    const { DocumentNumberService } = await import("./document-number.service");
    const numbers = new DocumentNumberService(prisma as never);
    const headOffice = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    const allocated = await Promise.all(
      Array.from({ length: 6 }, () => numbers.allocate(companyScope, headOffice.id, "sales_invoice")),
    );
    const values = allocated.map((item) => item.documentNumber);
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((value) => value.startsWith("INV-HO-"))).toBe(true);
  });

  it("enforces the company foreign key", async () => {
    await expect(
      prisma.department.create({
        data: {
          companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          code: "ORPHAN",
          name: "Orphan",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});
