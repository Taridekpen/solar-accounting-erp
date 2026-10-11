import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { AuditReadService } from "../auth/auth.controller";

function useDisposableDatabase(): void {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { resolve } = require("node:path") as typeof import("node:path");
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

describe("administration, audit and configuration", () => {
  let prisma: PrismaClient;
  let adminAccess: AccessContext;
  let branchAccess: AccessContext;
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
    const other = await prisma.branch.create({
      data: {
        companyId: admin.companyId,
        branchCode: `A${randomUUID().slice(0, 4).toUpperCase()}`,
        name: "Admin other branch",
        isHeadOffice: false,
        status: "active",
      },
    });
    otherBranchId = other.id;
    const outsider = await prisma.user.create({
      data: {
        companyId: admin.companyId,
        email: `admin-out-${randomUUID().slice(0, 8)}@solar.local`,
        status: "active",
      },
    });
    const branchManagerRole = await prisma.role.findFirstOrThrow({ where: { code: "branch_manager" } });
    await prisma.userRole.create({ data: { userId: outsider.id, roleId: branchManagerRole.id } });
    await prisma.userBranchAssignment.create({ data: { userId: outsider.id, branchId: other.id } });

    adminAccess = {
      userId: admin.id,
      email: admin.email,
      sessionId: randomUUID(),
      csrfTokenHash: "x",
      permissions: ["settings.view", "settings.manage", "audit.view", "documents.view", "documents.manage", "notifications.view", "branches.view"],
      roleCodes: ["super_administrator"],
      companyWide: true,
      mfaPending: false,
      mfaEnabled: true,
      scope: { type: "company" },
    };
    branchAccess = {
      userId: outsider.id,
      email: outsider.email,
      sessionId: randomUUID(),
      csrfTokenHash: "x",
      permissions: ["documents.view", "notifications.view", "branches.view"],
      roleCodes: ["branch_manager"],
      companyWide: false,
      mfaPending: false,
      mfaEnabled: false,
      scope: { type: "branches", branchIds: [other.id] },
    };
  }, 120000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("audits company changes, protects documents, searches audit, and refreshes notifications", async () => {
    const { CompanyService } = await import("../organization/company.service");
    const { AdminService } = await import("./admin.service");
    const { DocumentsService } = await import("./documents.service");
    const { NotificationsService } = await import("./notifications.service");

    const audit = new AuditService(prisma as never);
    const companies = new CompanyService(prisma as never, audit);
    const admin = new AdminService(prisma as never, companies, audit);
    const documents = new DocumentsService(prisma as never, companies, audit);
    const notifications = new NotificationsService(prisma as never, companies);
    const auditRead = new AuditReadService(prisma as never);

    const before = await companies.get();
    const updated = await companies.update(
      { purchaseApprovalLimit: "750000.0000", emailNotificationsEnabled: true },
      adminAccess,
      "corr-admin-1",
    );
    expect(updated.purchaseApprovalLimit).toBe("750000.0000");
    expect(updated.emailNotificationsEnabled).toBe(true);

    const companyAudit = await prisma.auditEvent.findFirst({
      where: { action: "company.updated", entityId: companyId },
      orderBy: { occurredAt: "desc" },
    });
    expect(companyAudit).toBeTruthy();
    expect(JSON.stringify(companyAudit?.previousValues)).toContain(before.purchaseApprovalLimit);
    expect(JSON.stringify(companyAudit?.newValues)).toContain("750000.0000");

    const mappings = await admin.listAccountMappings(adminAccess);
    expect(mappings.length).toBeGreaterThan(0);
    const target = mappings[0]!;
    await admin.updateAccountMapping(
      adminAccess,
      {
        eventCode: target.eventCode,
        debitAccountId: target.debitAccountId,
        creditAccountId: target.creditAccountId,
        taxAccountId: target.taxAccountId,
      },
      "corr-map-1",
    );
    const mappingAudit = await prisma.auditEvent.findFirst({
      where: { action: "account_mapping.updated", entityType: "account_mapping" },
      orderBy: { occurredAt: "desc" },
    });
    expect(mappingAudit).toBeTruthy();

    await expect(
      admin.updateDocumentTemplates(branchAccess, { invoiceFooter: "denied" }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await admin.updateDocumentTemplates(adminAccess, { invoiceFooter: "Thank you for your business." }, "corr-tpl");
    const templates = await admin.getDocumentTemplates(adminAccess);
    expect(templates.invoiceFooter).toContain("Thank you");

    const smallPdf = Buffer.from("%PDF-1.4 admin test").toString("base64");
    const doc = await documents.upload(adminAccess, {
      branchId,
      entityType: "sales_invoice",
      entityId: randomUUID(),
      documentKind: "invoice_attachment",
      fileName: "invoice.pdf",
      mimeType: "application/pdf",
      contentBase64: smallPdf,
    });
    expect(doc.byteSize).toBeGreaterThan(0);

    await expect(
      documents.content(branchAccess, doc.id),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const otherDoc = await documents.upload(adminAccess, {
      branchId: otherBranchId,
      entityType: "sales_invoice",
      entityId: randomUUID(),
      documentKind: "invoice_attachment",
      fileName: "other.pdf",
      mimeType: "application/pdf",
      contentBase64: smallPdf,
    });
    const readable = await documents.content(branchAccess, otherDoc.id);
    expect(readable.fileName).toBe("other.pdf");

    const huge = Buffer.alloc(2_000_001, 1).toString("base64");
    await expect(
      documents.upload(adminAccess, {
        branchId,
        entityType: "sales_invoice",
        entityId: randomUUID(),
        documentKind: "invoice_attachment",
        fileName: "huge.pdf",
        mimeType: "application/pdf",
        contentBase64: huge,
      }),
    ).rejects.toThrow(/2 MB/);

    await expect(
      documents.upload(adminAccess, {
        branchId,
        entityType: "sales_invoice",
        entityId: randomUUID(),
        documentKind: "invoice_attachment",
        fileName: "bad.exe",
        mimeType: "application/x-msdownload",
        contentBase64: smallPdf,
      }),
    ).rejects.toThrow(/not allowed/);

    const redactedWrite = await audit.record({
      actorUserId: adminAccess.userId,
      action: "admin.test.redact",
      entityType: "company",
      entityId: companyId,
      previousValues: { password: "hidden", note: "before" },
      newValues: { note: "after" },
      correlationId: "admin-redact",
    });
    expect(JSON.stringify(redactedWrite)).not.toMatch(/hidden/);
    await prisma.$executeRawUnsafe(
      `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, occurred_at, previous_values, new_values, correlation_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
      randomUUID(),
      adminAccess.userId,
      "admin.test",
      "company",
      companyId,
      new Date("2028-03-15T12:00:00.000Z"),
      JSON.stringify({ password: "[redacted]", note: "before" }),
      JSON.stringify({ note: "after" }),
      "march-2028-dated",
    );
    const searched = await auditRead.list(adminAccess, {
      entityType: "company",
      from: "2028-03-01T00:00:00.000Z",
      to: "2028-03-31T23:59:59.999Z",
      q: "admin.test",
    });
    expect(searched.some((row) => row.action === "admin.test")).toBe(true);
    const marchRow = searched.find((row) => row.action === "admin.test");
    expect(JSON.stringify(marchRow?.previousValues)).toMatch(/redacted/);
    const redactSearch = await auditRead.list(adminAccess, { q: "admin.test.redact" });
    expect(JSON.stringify(redactSearch[0]?.previousValues)).not.toMatch(/hidden/);

    const year = await prisma.fiscalYear.upsert({
      where: { companyId_startDate: { companyId, startDate: new Date("2028-01-01") } },
      update: {},
      create: {
        companyId,
        startDate: new Date("2028-01-01"),
        endDate: new Date("2028-12-31"),
      },
    });
    const existingPeriod = await prisma.fiscalPeriod.findFirst({
      where: { companyId, startDate: new Date("2028-03-01") },
    });
    if (!existingPeriod) {
      await prisma.fiscalPeriod.create({
        data: {
          companyId,
          fiscalYearId: year.id,
          startDate: new Date("2028-03-01"),
          endDate: new Date("2028-03-31"),
          status: "open",
        },
      });
    }

    const customer = await prisma.customer.create({
      data: {
        companyId,
        customerCode: `C${randomUUID().slice(0, 6).toUpperCase()}`,
        customerType: "corporate",
        name: "Admin overdue customer",
        status: "active",
      },
    });
    await prisma.customerBranch.create({ data: { customerId: customer.id, branchId } });
    await prisma.salesInvoice.create({
      data: {
        companyId,
        branchId,
        customerId: customer.id,
        invoiceNumber: `INV-ADM-${randomUUID().slice(0, 4).toUpperCase()}`,
        invoiceDate: new Date("2028-02-01"),
        dueDate: new Date("2028-03-01"),
        paymentTermsDays: 30,
        settlement: "credit",
        subtotal: "1000.0000",
        discountTotal: "0.0000",
        taxTotal: "0.0000",
        grandTotal: "1000.0000",
        status: "posted",
        createdByUserId: adminAccess.userId,
        postedAt: new Date("2028-02-01T10:00:00.000Z"),
      },
    });

    const refreshed = await notifications.refresh(adminAccess);
    expect(refreshed.some((row) => row.type === "overdue_invoice")).toBe(true);
    const unread = refreshed.find((row) => row.type === "overdue_invoice" && !row.readAt);
    expect(unread).toBeTruthy();
    const marked = await notifications.markRead(adminAccess, unread!.id);
    expect(marked.readAt).toBeTruthy();
  }, 120000);
});
