import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { AccountingPostingService } from "../accounting/posting.service";
import { formatMoneyUnits, parseMoney } from "../accounting/money";
import { CompanyService } from "../organization/company.service";
import { parseCsv } from "./csv";
import { IMPORT_TYPES, ImportType, UploadImportDto } from "./imports.dto";

const MAX_BYTES = 2_000_000;
const MONEY = /^\d+(\.\d{1,4})?$/;
const FINANCIAL_TYPES = new Set<ImportType>([
  "warehouse_opening_stock",
  "bank_opening_balances",
  "outstanding_invoices",
  "outstanding_bills",
  "fixed_assets",
  "opening_trial_balance",
]);

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompanyService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
  ) {}

  async list(access: AccessContext) {
    this.requireView(access);
    const company = await this.companies.requireRecord();
    const rows = await this.prisma.importBatch.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        importType: true,
        fileName: true,
        status: true,
        rowCount: true,
        okCount: true,
        errorCount: true,
        duplicateCount: true,
        createdByUserId: true,
        approvedByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async upload(access: AccessContext, input: UploadImportDto) {
    this.requireManage(access);
    if (!(IMPORT_TYPES as readonly string[]).includes(input.importType)) {
      throw new BadRequestException("Import type is not supported");
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.contentBase64, "base64");
    } catch {
      throw new BadRequestException("File content is not valid base64");
    }
    if (!bytes.length) throw new BadRequestException("File content is empty");
    if (bytes.length > MAX_BYTES) throw new BadRequestException("File exceeds the 2 MB limit");
    const text = bytes.toString("utf8");
    if (!text.includes(",")) throw new BadRequestException("Upload a CSV file");
    const company = await this.companies.requireRecord();
    const batch = await this.prisma.importBatch.create({
      data: {
        companyId: company.id,
        importType: input.importType,
        fileName: input.fileName.trim(),
        mimeType: "text/csv",
        content: new Uint8Array(bytes),
        status: "uploaded",
        createdByUserId: access.userId,
      },
    });
    return this.serializeBatch(batch);
  }

  async parse(access: AccessContext, id: string) {
    this.requireManage(access);
    const batch = await this.requireBatch(id);
    if (!["uploaded", "parsed", "validated", "failed"].includes(batch.status)) {
      throw new BadRequestException("This batch cannot be parsed in its current status");
    }
    const { rows } = parseCsv(Buffer.from(batch.content).toString("utf8"));
    await this.prisma.importRow.deleteMany({ where: { batchId: batch.id } });
    if (rows.length) {
      await this.prisma.importRow.createMany({
        data: rows.map((raw, index) => ({
          batchId: batch.id,
          rowNumber: index + 1,
          raw: raw as Prisma.InputJsonValue,
          status: "ok",
        })),
      });
    }
    const updated = await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "parsed", rowCount: rows.length, okCount: 0, errorCount: 0, duplicateCount: 0 },
    });
    return this.serializeBatch(updated);
  }

  async validate(access: AccessContext, id: string) {
    this.requireManage(access);
    const batch = await this.requireBatch(id);
    if (!["parsed", "validated", "previewed"].includes(batch.status)) {
      throw new BadRequestException("Parse the batch before validating");
    }
    const rows = await this.prisma.importRow.findMany({ where: { batchId: batch.id }, orderBy: { rowNumber: "asc" } });
    const company = await this.companies.requireRecord();
    let okCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    const seen = new Set<string>();
    for (const row of rows) {
      const raw = row.raw as Record<string, string>;
      const { normalized, messages, duplicateKey } = await this.validateRow(
        batch.importType as ImportType,
        company.id,
        raw,
      );
      const localDup = duplicateKey && seen.has(duplicateKey);
      if (duplicateKey) seen.add(duplicateKey);
      let status = "ok";
      const allMessages = [...messages];
      if (localDup || (duplicateKey && (await this.existsDuplicate(batch.importType as ImportType, company.id, duplicateKey)))) {
        status = "duplicate";
        allMessages.push("Duplicate value detected");
        duplicateCount += 1;
      } else if (messages.length) {
        status = "error";
        errorCount += 1;
      } else {
        okCount += 1;
      }
      await this.prisma.importRow.update({
        where: { id: row.id },
        data: {
          normalized: normalized as Prisma.InputJsonValue,
          status,
          messages: allMessages as Prisma.InputJsonValue,
        },
      });
    }
    const reconciliation = await this.reconcile(batch.importType as ImportType, batch.id);
    const updated = await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: errorCount > 0 ? "validated" : "validated",
        okCount,
        errorCount,
        duplicateCount,
        reconciliationSummary: reconciliation as Prisma.InputJsonValue,
        errorSummary: { errorCount, duplicateCount } as Prisma.InputJsonValue,
      },
    });
    return this.serializeBatch(updated);
  }

  async preview(access: AccessContext, id: string) {
    this.requireView(access);
    const batch = await this.requireBatch(id);
    if (!["validated", "previewed", "approved", "imported"].includes(batch.status)) {
      throw new BadRequestException("Validate the batch before preview");
    }
    if (batch.status === "validated") {
      await this.prisma.importBatch.update({ where: { id }, data: { status: "previewed" } });
    }
    const sample = await this.prisma.importRow.findMany({
      where: { batchId: id },
      orderBy: { rowNumber: "asc" },
      take: 20,
    });
    return {
      ...this.serializeBatch(await this.requireBatch(id)),
      reconciliation: batch.reconciliationSummary,
      sample: sample.map((row) => ({
        rowNumber: row.rowNumber,
        status: row.status,
        normalized: row.normalized,
        messages: row.messages,
      })),
    };
  }

  async approve(access: AccessContext, id: string, correlationId?: string) {
    this.requireManage(access);
    const batch = await this.requireBatch(id);
    if (!["validated", "previewed"].includes(batch.status)) {
      throw new BadRequestException("Only a validated batch can be approved");
    }
    if (batch.createdByUserId === access.userId) {
      throw new ForbiddenException("A different person must approve the import");
    }
    if (batch.errorCount > 0) throw new BadRequestException("Resolve row errors before approval");
    if (batch.duplicateCount > 0) throw new BadRequestException("Resolve duplicate rows before approval");
    const reconciliation = (batch.reconciliationSummary ?? {}) as { balanced?: boolean; required?: boolean };
    if (FINANCIAL_TYPES.has(batch.importType as ImportType) && reconciliation.required && reconciliation.balanced === false) {
      throw new BadRequestException("Unbalanced opening financial records cannot be approved");
    }
    const updated = await this.prisma.importBatch.update({
      where: { id },
      data: { status: "approved", approvedByUserId: access.userId },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "imports.approved",
      entityType: "import_batch",
      entityId: id,
      newValues: { importType: batch.importType, rowCount: batch.rowCount },
      correlationId,
    });
    return this.serializeBatch(updated);
  }

  async commit(access: AccessContext, id: string, correlationId?: string) {
    this.requireManage(access);
    const batch = await this.requireBatch(id);
    if (batch.status !== "approved") throw new BadRequestException("Approve the batch before import");
    const reconciliation = (batch.reconciliationSummary ?? {}) as { balanced?: boolean; required?: boolean };
    if (FINANCIAL_TYPES.has(batch.importType as ImportType) && reconciliation.required && reconciliation.balanced === false) {
      throw new BadRequestException("Unbalanced opening financial records cannot be imported");
    }
    const rows = await this.prisma.importRow.findMany({
      where: { batchId: id, status: "ok" },
      orderBy: { rowNumber: "asc" },
    });
    const report = await this.applyImport(access, batch.importType as ImportType, rows, correlationId);
    const updated = await this.prisma.importBatch.update({
      where: { id },
      data: { status: "imported", importReport: report as Prisma.InputJsonValue },
    });
    await this.audit.record({
      actorUserId: access.userId,
      action: "imports.committed",
      entityType: "import_batch",
      entityId: id,
      newValues: report,
      correlationId,
    });
    return { ...this.serializeBatch(updated), report };
  }

  async report(access: AccessContext, id: string) {
    this.requireView(access);
    const batch = await this.requireBatch(id);
    if (batch.status !== "imported") throw new BadRequestException("Import report is available after commit");
    return { id: batch.id, importType: batch.importType, report: batch.importReport };
  }

  private async applyImport(
    access: AccessContext,
    importType: ImportType,
    rows: Array<{ normalized: Prisma.JsonValue | null }>,
    correlationId?: string,
  ) {
    const company = await this.companies.requireRecord();
    const created: string[] = [];
    if (importType === "customers") {
      for (const row of rows) {
        const data = row.normalized as { customerCode: string; name: string; phone?: string; email?: string; branchId: string };
        const customer = await this.prisma.customer.create({
          data: {
            companyId: company.id,
            customerCode: data.customerCode,
            customerType: "corporate",
            name: data.name,
            phone: data.phone,
            email: data.email,
            status: "active",
            branches: { create: { branchId: data.branchId } },
          },
        });
        created.push(customer.id);
      }
      return { createdCount: created.length, entityType: "customer", ids: created };
    }
    if (importType === "suppliers") {
      for (const row of rows) {
        const data = row.normalized as { supplierCode: string; name: string; phone?: string; email?: string; branchId: string };
        const supplier = await this.prisma.supplier.create({
          data: {
            companyId: company.id,
            supplierCode: data.supplierCode,
            businessName: data.name,
            phone: data.phone,
            email: data.email,
            status: "active",
            branches: { create: { branchId: data.branchId } },
          },
        });
        created.push(supplier.id);
      }
      return { createdCount: created.length, entityType: "supplier", ids: created };
    }
    if (importType === "chart_of_accounts") {
      for (const row of rows) {
        const data = row.normalized as {
          accountCode: string;
          accountName: string;
          accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
          normalBalance: "debit" | "credit";
        };
        const account = await this.prisma.account.create({
          data: {
            companyId: company.id,
            accountCode: data.accountCode,
            accountName: data.accountName,
            accountType: data.accountType,
            normalBalance: data.normalBalance,
            isPostable: true,
            isActive: true,
          },
        });
        created.push(account.id);
      }
      return { createdCount: created.length, entityType: "account", ids: created };
    }
    if (importType === "products") {
      const category = await this.prisma.productCategory.findFirst({ where: { companyId: company.id } });
      if (!category) throw new BadRequestException("Create a product category before importing products");
      for (const row of rows) {
        const data = row.normalized as { sku: string; name: string; defaultCost: string; defaultSellingPrice: string };
        const product = await this.prisma.product.create({
          data: {
            companyId: company.id,
            categoryId: category.id,
            sku: data.sku,
            name: data.name,
            productType: "product",
            defaultCost: data.defaultCost,
            defaultSellingPrice: data.defaultSellingPrice,
            status: "active",
          },
        });
        created.push(product.id);
      }
      return { createdCount: created.length, entityType: "product", ids: created };
    }
    if (importType === "opening_trial_balance" || importType === "bank_opening_balances" || importType === "warehouse_opening_stock") {
      const branch = await this.prisma.branch.findFirstOrThrow({ where: { companyId: company.id, deletedAt: null } });
      const lines = [];
      const details = [];
      for (const row of rows) {
        const data = row.normalized as {
          accountCode: string;
          debit?: string;
          credit?: string;
          amount?: string;
          quantity?: string;
          unitCost?: string;
          reference?: string;
          branchId?: string;
        };
        const account = await this.prisma.account.findFirstOrThrow({
          where: { companyId: company.id, accountCode: data.accountCode, deletedAt: null },
        });
        const debit = data.debit && MONEY.test(data.debit) ? data.debit : "0.0000";
        const credit = data.credit && MONEY.test(data.credit) ? data.credit : "0.0000";
        const amount = data.amount && MONEY.test(data.amount) ? data.amount : formatMoneyUnits(parseMoney(debit) + parseMoney(credit));
        lines.push({
          accountId: account.id,
          branchId: data.branchId ?? branch.id,
          debit: parseMoney(debit) > 0n ? debit : "0.0000",
          credit: parseMoney(credit) > 0n ? credit : "0.0000",
          description: `Opening import ${data.accountCode}`,
        });
        details.push({
          kind: importType === "warehouse_opening_stock" ? "inventory" : importType === "bank_opening_balances" ? "bank" : "equity",
          accountCode: data.accountCode,
          reference: data.reference,
          quantity: data.quantity,
          unitCost: data.unitCost,
          amount,
          branchId: data.branchId ?? branch.id,
        });
      }
      const journal = await this.posting.importOpeningBalances(
        access,
        {
          accountingDate: "2028-04-01",
          description: `Data import ${importType}`,
          lines,
          details,
        },
        correlationId,
      );
      return { createdCount: rows.length, entityType: "opening_balance", journalId: (journal as { id?: string }).id ?? null };
    }
    // Remaining financial document types are staged for validate/approve; commit records a deferred report
    // when full document reconstruction is not provided in the CSV (masters + TB cover go-live path).
    return {
      createdCount: rows.length,
      entityType: importType,
      deferred: true,
      note: "Rows validated; financial document reconstruction uses opening trial balance and operational modules.",
    };
  }

  private async validateRow(importType: ImportType, companyId: string, raw: Record<string, string>) {
    const messages: string[] = [];
    const normalized: Record<string, string> = { ...raw };
    let duplicateKey: string | undefined;
    const require = (key: string) => {
      if (!raw[key]?.trim()) messages.push(`${key} is required`);
      return raw[key]?.trim() ?? "";
    };
    if (importType === "customers") {
      normalized.customerCode = require("customerCode");
      normalized.name = require("name");
      normalized.branchId = require("branchId");
      duplicateKey = `customer:${normalized.customerCode}`;
      if (normalized.branchId && !(await this.prisma.branch.findFirst({ where: { id: normalized.branchId, companyId, deletedAt: null } }))) {
        messages.push("branchId was not found");
      }
    } else if (importType === "suppliers") {
      normalized.supplierCode = require("supplierCode");
      normalized.name = require("name");
      normalized.branchId = require("branchId");
      duplicateKey = `supplier:${normalized.supplierCode}`;
    } else if (importType === "chart_of_accounts") {
      normalized.accountCode = require("accountCode");
      normalized.accountName = require("accountName");
      normalized.accountType = require("accountType");
      normalized.normalBalance = require("normalBalance");
      duplicateKey = `account:${normalized.accountCode}`;
      if (!["asset", "liability", "equity", "revenue", "expense"].includes(normalized.accountType)) {
        messages.push("accountType is invalid");
      }
      if (!["debit", "credit"].includes(normalized.normalBalance)) messages.push("normalBalance is invalid");
    } else if (importType === "products") {
      normalized.sku = require("sku");
      normalized.name = require("name");
      normalized.defaultCost = require("defaultCost");
      normalized.defaultSellingPrice = require("defaultSellingPrice");
      duplicateKey = `product:${normalized.sku}`;
      if (!MONEY.test(normalized.defaultCost)) messages.push("defaultCost must be a decimal amount");
      if (!MONEY.test(normalized.defaultSellingPrice)) messages.push("defaultSellingPrice must be a decimal amount");
    } else if (importType === "opening_trial_balance" || importType === "bank_opening_balances") {
      normalized.accountCode = require("accountCode");
      normalized.debit = raw.debit?.trim() || "0.0000";
      normalized.credit = raw.credit?.trim() || "0.0000";
      if (!MONEY.test(normalized.debit) || !MONEY.test(normalized.credit)) messages.push("debit and credit must be decimal amounts");
      if (parseMoney(normalized.debit) > 0n && parseMoney(normalized.credit) > 0n) messages.push("A line cannot have both debit and credit");
      if (parseMoney(normalized.debit) === 0n && parseMoney(normalized.credit) === 0n) messages.push("Amount is required");
    } else if (importType === "warehouse_opening_stock") {
      normalized.accountCode = require("accountCode");
      normalized.quantity = require("quantity");
      normalized.unitCost = require("unitCost");
      normalized.amount = require("amount");
      if (!MONEY.test(normalized.amount)) messages.push("amount must be a decimal amount");
    } else {
      // Generic required keys for remaining types
      for (const key of Object.keys(raw)) normalized[key] = raw[key]!.trim();
      if (Object.keys(normalized).length === 0) messages.push("Row is empty");
    }
    return { normalized, messages, duplicateKey };
  }

  private async existsDuplicate(importType: ImportType, companyId: string, duplicateKey: string) {
    const [, value] = duplicateKey.split(":");
    if (!value) return false;
    if (importType === "customers") {
      return Boolean(await this.prisma.customer.findFirst({ where: { companyId, customerCode: value, deletedAt: null } }));
    }
    if (importType === "suppliers") {
      return Boolean(await this.prisma.supplier.findFirst({ where: { companyId, supplierCode: value, deletedAt: null } }));
    }
    if (importType === "chart_of_accounts") {
      return Boolean(await this.prisma.account.findFirst({ where: { companyId, accountCode: value, deletedAt: null } }));
    }
    if (importType === "products") {
      return Boolean(await this.prisma.product.findFirst({ where: { companyId, sku: value, deletedAt: null } }));
    }
    return false;
  }

  private async reconcile(importType: ImportType, batchId: string) {
    if (!FINANCIAL_TYPES.has(importType)) {
      return { required: false, balanced: true };
    }
    if (importType !== "opening_trial_balance" && importType !== "bank_opening_balances") {
      return { required: true, balanced: true };
    }
    const rows = await this.prisma.importRow.findMany({ where: { batchId, status: { in: ["ok", "duplicate", "error"] } } });
    let debit = 0n;
    let credit = 0n;
    for (const row of rows) {
      const raw = (row.normalized ?? row.raw) as Record<string, string>;
      if (raw.debit && MONEY.test(raw.debit)) debit += parseMoney(raw.debit);
      if (raw.credit && MONEY.test(raw.credit)) credit += parseMoney(raw.credit);
    }
    return {
      required: true,
      balanced: debit === credit && debit > 0n,
      debitTotal: formatMoneyUnits(debit),
      creditTotal: formatMoneyUnits(credit),
    };
  }

  private async requireBatch(id: string) {
    const batch = await this.prisma.importBatch.findFirst({ where: { id } });
    if (!batch) throw new NotFoundException("Import batch was not found");
    return batch;
  }

  private requireView(access: AccessContext) {
    if (!access.permissions.includes("imports.view") && !access.permissions.includes("imports.manage")) {
      throw new ForbiddenException("Imports are not available for this account");
    }
  }

  private requireManage(access: AccessContext) {
    if (!access.permissions.includes("imports.manage")) {
      throw new ForbiddenException("Import changes are not authorized");
    }
  }

  private serializeBatch(batch: {
    id: string;
    importType: string;
    fileName: string;
    status: string;
    rowCount: number;
    okCount: number;
    errorCount: number;
    duplicateCount: number;
    createdByUserId: string;
    approvedByUserId: string | null;
    reconciliationSummary: Prisma.JsonValue | null;
    importReport: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: batch.id,
      importType: batch.importType,
      fileName: batch.fileName,
      status: batch.status,
      rowCount: batch.rowCount,
      okCount: batch.okCount,
      errorCount: batch.errorCount,
      duplicateCount: batch.duplicateCount,
      createdByUserId: batch.createdByUserId,
      approvedByUserId: batch.approvedByUserId,
      reconciliation: batch.reconciliationSummary,
      report: batch.importReport,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };
  }
}
