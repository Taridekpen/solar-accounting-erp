import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { POSTING_EVENTS } from "@solar/accounting-rules";
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_DEPARTMENTS,
  DEVELOPMENT_COMPANY,
  DOCUMENT_TYPES,
  EXPENSE_CATEGORIES,
  HEAD_OFFICE,
  PERMISSIONS,
  PRODUCT_CATEGORIES,
  ROLES,
  SEEDED_PRODUCTS,
  SEPARATION_ACTIONS,
} from "./reference-data";

export async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.systemMetadata.upsert({
    where: { applicationName: "Solar & Inverter Accounting" },
    update: { schemaVersion: "16" },
    create: {
      applicationName: "Solar & Inverter Accounting",
      schemaVersion: "16",
    },
  });

  const company = await prisma.company.upsert({
    where: { singletonKey: DEVELOPMENT_COMPANY.singletonKey },
    update: {},
    create: {
      singletonKey: DEVELOPMENT_COMPANY.singletonKey,
      legalName: DEVELOPMENT_COMPANY.legalName,
      tradingName: DEVELOPMENT_COMPANY.tradingName,
      country: DEVELOPMENT_COMPANY.country,
      baseCurrency: DEVELOPMENT_COMPANY.baseCurrency,
      timezone: DEVELOPMENT_COMPANY.timezone,
      fiscalYearStartMonth: DEVELOPMENT_COMPANY.fiscalYearStartMonth,
      status: "active",
    },
  });

  await prisma.documentTemplate.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      invoiceFooter: "",
      quotationTerms: "",
      paymentAdvice: "",
    },
  });

  const branch = await prisma.branch.upsert({
    where: {
      companyId_branchCode: { companyId: company.id, branchCode: HEAD_OFFICE.branchCode },
    },
    update: {},
    create: {
      companyId: company.id,
      branchCode: HEAD_OFFICE.branchCode,
      name: HEAD_OFFICE.name,
      city: HEAD_OFFICE.city,
      state: HEAD_OFFICE.state,
      isHeadOffice: true,
      status: "active",
      openingDate: new Date("2026-01-01"),
    },
  });

  for (const department of DEFAULT_DEPARTMENTS) {
    const existing = await prisma.department.findFirst({
      where: { companyId: company.id, branchId: null, code: department.code, deletedAt: null },
    });
    if (!existing) {
      await prisma.department.create({
        data: {
          companyId: company.id,
          name: department.name,
          code: department.code,
          status: "active",
        },
      });
    }
  }

  for (const documentType of DOCUMENT_TYPES) {
    await prisma.documentSequence.upsert({
      where: {
        companyId_branchId_documentType: {
          companyId: company.id,
          branchId: branch.id,
          documentType: documentType.documentType,
        },
      },
      update: {},
      create: {
        companyId: company.id,
        branchId: branch.id,
        documentType: documentType.documentType,
        prefix: documentType.prefix,
      },
    });
  }

  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
  }

  for (const role of ROLES) {
    const saved = await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: { code: role.code, name: role.name },
    });
    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...role.permissions] } },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: saved.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }

  const accountIds = new Map<string, string>();
  for (const account of DEFAULT_ACCOUNTS.filter((item) => !item.parentCode)) {
    const saved = await prisma.account.upsert({
      where: { companyId_accountCode: { companyId: company.id, accountCode: account.code } },
      update: account.code === "1310" ? { accountSubtype: "grni" } : {},
      create: {
        companyId: company.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        accountSubtype: account.subtype,
        normalBalance: account.normalBalance,
        isPostable: account.postable ?? true,
        isControlAccount: account.control ?? false,
        isActive: true,
      },
    });
    accountIds.set(account.code, saved.id);
  }

  for (const account of DEFAULT_ACCOUNTS.filter((item) => item.parentCode)) {
    const parentId = accountIds.get(account.parentCode ?? "");
    await prisma.account.upsert({
      where: { companyId_accountCode: { companyId: company.id, accountCode: account.code } },
      update: {},
      create: {
        companyId: company.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        accountSubtype: account.subtype,
        parentAccountId: parentId,
        normalBalance: account.normalBalance,
        isPostable: account.postable ?? true,
        isControlAccount: account.control ?? false,
        isActive: true,
      },
    });
  }

  await prisma.separationRule.createMany({
    data: SEPARATION_ACTIONS.map((action) => ({ action })),
    skipDuplicates: true,
  });

  await seedFiscalYear(prisma, company.id, company.fiscalYearStartMonth);
  await seedTaxCode(prisma, company.id);
  await seedAccountMappings(prisma, company.id);
  await seedExpenseCategories(prisma, company.id);
  await seedBanking(prisma, company.id, branch.id);
  await seedProducts(prisma, company.id);
  await seedWarehouses(prisma, company.id);

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error("SEED_ADMIN_PASSWORD is required to create the development administrator");
    }
    const admin = await prisma.user.create({
      data: {
        companyId: company.id,
        email: adminEmail,
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
        status: "active",
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "super_administrator" } });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
  }
}

async function seedFiscalYear(prisma: PrismaClient, companyId: string, startMonth: number) {
  const today = new Date();
  const month = today.getUTCMonth() + 1;
  const year = today.getUTCFullYear();
  const startYear = month >= startMonth ? year : year - 1;
  const startDate = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const existing = await prisma.fiscalYear.findUnique({
    where: { companyId_startDate: { companyId, startDate } },
  });
  if (existing) {
    return;
  }
  const endDate = new Date(Date.UTC(startYear + 1, startMonth - 1, 0));
  const fiscalYear = await prisma.fiscalYear.create({
    data: { companyId, startDate, endDate },
  });
  for (let index = 0; index < 12; index += 1) {
    await prisma.fiscalPeriod.create({
      data: {
        companyId,
        fiscalYearId: fiscalYear.id,
        startDate: new Date(Date.UTC(startYear, startMonth - 1 + index, 1)),
        endDate: new Date(Date.UTC(startYear, startMonth + index, 0)),
        status: "open",
      },
    });
  }
}

async function seedAccountMappings(prisma: PrismaClient, companyId: string) {
  for (const event of POSTING_EVENTS) {
    const [debit, credit, tax] = await Promise.all([
      prisma.account.findUniqueOrThrow({
        where: { companyId_accountCode: { companyId, accountCode: event.debitAccountCode } },
      }),
      prisma.account.findUniqueOrThrow({
        where: { companyId_accountCode: { companyId, accountCode: event.creditAccountCode } },
      }),
      event.taxAccountCode
        ? prisma.account.findUniqueOrThrow({
            where: { companyId_accountCode: { companyId, accountCode: event.taxAccountCode } },
          })
        : Promise.resolve(null),
    ]);
    await prisma.accountMapping.upsert({
      where: { companyId_eventCode: { companyId, eventCode: event.code } },
      update: {},
      create: {
        companyId,
        eventCode: event.code,
        debitAccountId: debit.id,
        creditAccountId: credit.id,
        taxAccountId: tax?.id,
        taxSide: event.taxSide,
      },
    });
  }
}

async function seedExpenseCategories(prisma: PrismaClient, companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  for (const category of EXPENSE_CATEGORIES) {
    const account = await prisma.account.findUniqueOrThrow({
      where: { companyId_accountCode: { companyId, accountCode: category.accountCode } },
    });
    const existing = await prisma.expenseCategory.findFirst({ where: { companyId, name: category.name } });
    if (!existing) {
      await prisma.expenseCategory.create({
        data: { companyId, name: category.name, accountId: account.id, status: "active" },
      });
    }
  }
  const branchPolicy = await prisma.expenseApprovalPolicy.findFirst({
    where: { companyId, level: 1, companyWide: false, categoryId: null, branchId: null },
  });
  if (!branchPolicy) {
    await prisma.expenseApprovalPolicy.create({
      data: { companyId, minAmount: "0.0000", maxAmount: company.purchaseApprovalLimit, level: 1, companyWide: false },
    });
  }
  const companyPolicy = await prisma.expenseApprovalPolicy.findFirst({
    where: { companyId, level: 1, companyWide: true, categoryId: null, branchId: null },
  });
  if (!companyPolicy) {
    await prisma.expenseApprovalPolicy.create({
      data: { companyId, minAmount: "0.0000", level: 1, companyWide: true },
    });
  }
}

async function seedBanking(prisma: PrismaClient, companyId: string, branchId: string) {
  const [operating, cash, petty] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { companyId_accountCode: { companyId, accountCode: "1100" } } }),
    prisma.account.findUniqueOrThrow({ where: { companyId_accountCode: { companyId, accountCode: "1000" } } }),
    prisma.account.findUniqueOrThrow({ where: { companyId_accountCode: { companyId, accountCode: "1010" } } }),
  ]);
  const bank = await prisma.bankAccount.findFirst({ where: { companyId, accountName: "Operating account" } });
  if (!bank) {
    await prisma.bankAccount.create({
      data: {
        companyId,
        bankName: "Operating bank",
        accountName: "Operating account",
        maskedAccountNumber: "****0000",
        currency: "NGN",
        ledgerAccountId: operating.id,
        status: "active",
      },
    });
  }
  const drawer = await prisma.cashDrawer.findFirst({ where: { branchId, kind: "drawer" } });
  if (!drawer) {
    await prisma.cashDrawer.create({
      data: { companyId, branchId, name: "Head office cash", kind: "drawer", ledgerAccountId: cash.id, status: "active" },
    });
  }
  const pettyDrawer = await prisma.cashDrawer.findFirst({ where: { branchId, kind: "petty" } });
  if (!pettyDrawer) {
    await prisma.cashDrawer.create({
      data: { companyId, branchId, name: "Head office petty cash", kind: "petty", ledgerAccountId: petty.id, status: "active" },
    });
  }
}

async function seedProducts(prisma: PrismaClient, companyId: string) {
  const categoryIds = new Map<string, string>();
  for (const name of PRODUCT_CATEGORIES) {
    const existing = await prisma.productCategory.findFirst({ where: { companyId, name } });
    const saved = existing ?? await prisma.productCategory.create({ data: { companyId, name } });
    categoryIds.set(name, saved.id);
  }
  for (const product of SEEDED_PRODUCTS) {
    const revenue = await prisma.account.findUnique({
      where: { companyId_accountCode: { companyId, accountCode: product.revenueCode } },
    });
    await prisma.product.upsert({
      where: { companyId_sku: { companyId, sku: product.sku } },
      update: {},
      create: {
        companyId,
        categoryId: categoryIds.get(product.category) ?? "",
        sku: product.sku,
        name: product.name,
        productType: product.productType,
        defaultCost: product.cost,
        defaultSellingPrice: product.sellingPrice,
        revenueAccountId: revenue?.id,
        status: "active",
      },
    });
  }
}

async function seedWarehouses(prisma: PrismaClient, companyId: string) {
  const branches = await prisma.branch.findMany({ where: { companyId, deletedAt: null } });
  for (const branch of branches) {
    const locations = [
      { warehouseCode: `${branch.branchCode}-MAIN`, name: "Main", warehouseType: "main" as const },
      { warehouseCode: `${branch.branchCode}-TRANSIT`, name: "In transit", warehouseType: "in_transit" as const },
    ];
    for (const location of locations) {
      const existing = await prisma.warehouse.findFirst({ where: { branchId: branch.id, warehouseCode: location.warehouseCode } });
      if (!existing) {
        await prisma.warehouse.create({
          data: { companyId, branchId: branch.id, ...location, status: "active" },
        });
      }
    }
  }
}

async function seedTaxCode(prisma: PrismaClient, companyId: string) {
  const account = await prisma.account.findFirst({ where: { companyId, accountCode: "2400", deletedAt: null } });
  if (!account) return;
  await prisma.taxCode.upsert({
    where: { companyId_code: { companyId, code: "VAT-OUTPUT" } },
    update: {},
    create: {
      companyId,
      code: "VAT-OUTPUT",
      name: "Output VAT",
      kind: "output",
      rate: "7.5000",
      effectiveFrom: new Date("2026-01-01"),
      accountId: account.id,
    },
  });
}

const prisma = new PrismaClient();

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (require.main === module || entry.endsWith("/prisma/seed.ts") || entry.endsWith("/prisma/seed.js")) {
  seed(prisma)
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
