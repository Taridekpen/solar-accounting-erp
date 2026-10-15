import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { AccountingPostingService } from "../accounting/posting.service";
import { formatMoneyUnits, parseMoney } from "../accounting/money";
import { DocumentNumberService } from "../organization/document-number.service";
import { assertBranchAllowed, branchIdFilter } from "../organization/branch-scope";
import { ReportTable } from "./reports-export";
import {
  AssetDateDto,
  CreateFixedAssetDto,
  CreateStatementBudgetDto,
  CreateTaxCodeDto,
  DisposeFixedAssetDto,
  TaxPaymentDto,
} from "./reports.dto";

const CURRENT_ASSETS = new Set(["cash", "bank", "receivable", "inventory", "grni", "wip", "prepayment"]);
const CURRENT_LIABILITIES = new Set(["payable", "advance", "accrual", "payroll", "tax", "deposit"]);
const LOANS = new Set(["loan"]);
const EQUITY = new Set(["capital", "retained_earnings", "current_earnings"]);
const SALES = new Set(["sales", "service"]);
const CASH = new Set(["cash", "bank"]);
const WORKING_ASSETS = new Set(["receivable", "inventory", "grni", "wip", "prepayment"]);
const WORKING_LIABILITIES = new Set(["payable", "advance", "accrual", "payroll", "tax", "deposit"]);

type PostedLine = {
  debit: { toFixed(digits: number): string };
  credit: { toFixed(digits: number): string };
  description: string | null;
  customerId: string | null;
  supplierId: string | null;
  branchId: string;
  account: { id: string; accountCode: string; accountName: string; accountType: string; accountSubtype: string | null; normalBalance: string };
  branch: { name: string };
  journal: { id: string; journalNumber: string; accountingDate: Date; description: string; sourceDocumentType: string; sourceDocumentId: string | null; status: string };
};

interface ProfitParts {
  revenue: bigint;
  returns: bigint;
  costOfSales: bigint;
  operating: bigint;
  finance: bigint;
  other: bigint;
  tax: bigint;
  netProfit: bigint;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: AccountingPostingService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly audit: AuditService,
  ) {}

  async journal(access: AccessContext, from: string, to: string) {
    const header = await this.header(access, from, to);
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        companyId: header.companyId,
        accountingDate: { gte: day(from), lte: day(to) },
        ...(header.branch ? { lines: { some: { branchId: header.branch } } } : {}),
      },
      include: { lines: { include: { account: true, branch: true } }, createdBy: true },
      orderBy: [{ accountingDate: "asc" }, { journalNumber: "asc" }],
    });
    const rows = entries.map((entry) => {
      const debits = entry.lines.filter((line) => parseMoney(line.debit.toFixed(4)) > 0n);
      const credits = entry.lines.filter((line) => parseMoney(line.credit.toFixed(4)) > 0n);
      const amount = debits.reduce((sum, line) => sum + parseMoney(line.debit.toFixed(4)), 0n);
      return {
        id: entry.id,
        journalNumber: entry.journalNumber,
        accountingDate: entry.accountingDate.toISOString().slice(0, 10),
        sourceDocument: entry.sourceDocumentType,
        sourceDocumentId: entry.sourceDocumentId,
        description: entry.description,
        debitAccounts: [...new Set(debits.map((line) => line.account.accountCode))].join(", "),
        creditAccounts: [...new Set(credits.map((line) => line.account.accountCode))].join(", "),
        amount: formatMoneyUnits(amount),
        branchName: [...new Set(entry.lines.map((line) => line.branch.name))].join(", "),
        creator: entry.createdBy.email,
        status: entry.status,
      };
    });
    return {
      ...header.meta("General journal"),
      rows,
      table: this.table(header, "General journal", ["Number", "Date", "Source", "Description", "Debit accounts", "Credit accounts", "Amount", "Branch", "Creator", "Status"], rows.map((row) => [row.journalNumber, row.accountingDate, row.sourceDocument, row.description, row.debitAccounts, row.creditAccounts, row.amount, row.branchName, row.creator, row.status])),
    };
  }

  async ledger(access: AccessContext, accountId: string, from: string, to: string) {
    const header = await this.header(access, from, to);
    const account = await this.prisma.account.findFirst({ where: { id: accountId, companyId: header.companyId, deletedAt: null } });
    if (!account) throw new NotFoundException("Account was not found");
    const lines = await this.lines(header.companyId, header.branch, undefined, to);
    const openingUnits = lines.filter((line) => line.journal.accountingDate < day(from) && line.account.id === account.id).reduce((sum, line) => sum + net(line), 0n);
    let running = openingUnits;
    const rows = lines
      .filter((line) => line.account.id === account.id && line.journal.accountingDate >= day(from))
      .sort((left, right) => left.journal.accountingDate.getTime() - right.journal.accountingDate.getTime() || left.journal.journalNumber.localeCompare(right.journal.journalNumber))
      .map((line) => {
        running += net(line);
        return {
          date: line.journal.accountingDate.toISOString().slice(0, 10),
          journalNumber: line.journal.journalNumber,
          journalId: line.journal.id,
          sourceDocumentType: line.journal.sourceDocumentType,
          sourceDocumentId: line.journal.sourceDocumentId,
          description: line.description ?? line.journal.description,
          branchName: line.branch.name,
          debit: formatMoneyUnits(parseMoney(line.debit.toFixed(4))),
          credit: formatMoneyUnits(parseMoney(line.credit.toFixed(4))),
          running: formatMoneyUnits(running),
        };
      });
    return {
      ...header.meta(`General ledger ${account.accountCode}`),
      accountCode: account.accountCode,
      accountName: account.accountName,
      opening: formatMoneyUnits(openingUnits),
      closing: formatMoneyUnits(running),
      rows,
      table: this.table(header, `General ledger ${account.accountCode}`, ["Date", "Journal", "Reference", "Description", "Branch", "Debit", "Credit", "Running"], [
        ["", "", "", "Opening", "", "", "", formatMoneyUnits(openingUnits)],
        ...rows.map((row) => [row.date, row.journalNumber, row.sourceDocumentType, row.description, row.branchName, row.debit, row.credit, row.running]),
      ]),
    };
  }

  async trialBalance(access: AccessContext, asOf: string) {
    const header = await this.header(access, asOf, asOf);
    const accounts = await this.prisma.account.findMany({ where: { companyId: header.companyId, deletedAt: null }, orderBy: { accountCode: "asc" } });
    const lines = await this.lines(header.companyId, header.branch, undefined, asOf);
    let totalDebit = 0n;
    let totalCredit = 0n;
    const rows = accounts.flatMap((account) => {
      const movement = lines.filter((line) => line.account.id === account.id).reduce((sum, line) => sum + net(line), 0n);
      if (movement === 0n) return [];
      const debit = movement > 0n ? movement : 0n;
      const credit = movement < 0n ? -movement : 0n;
      totalDebit += debit;
      totalCredit += credit;
      return [{
        accountId: account.id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        debit: formatMoneyUnits(debit),
        credit: formatMoneyUnits(credit),
      }];
    });
    return {
      ...header.meta("Trial balance"),
      rows,
      totalDebit: formatMoneyUnits(totalDebit),
      totalCredit: formatMoneyUnits(totalCredit),
      balanced: totalDebit === totalCredit,
      table: this.table(header, "Trial balance", ["Code", "Account", "Debit balance", "Credit balance"], [
        ...rows.map((row) => [row.accountCode, row.accountName, row.debit, row.credit]),
        ["", "Total", formatMoneyUnits(totalDebit), formatMoneyUnits(totalCredit)],
      ]),
    };
  }

  async profitAndLoss(access: AccessContext, from: string, to: string, mode = "period", compareFrom?: string, compareTo?: string) {
    const header = await this.header(access, from, to);
    const lines = await this.lines(header.companyId, header.branch, from, to);
    if (mode === "branch") {
      const branches = new Map<string, PostedLine[]>();
      for (const line of lines) {
        const current = branches.get(line.branch.name) ?? [];
        current.push(line);
        branches.set(line.branch.name, current);
      }
      const columns = [...branches.keys()].map((name) => ({ key: name, label: name }));
      return this.profitPayload(header, columns, columns.map((column) => ({ key: column.key, parts: profitParts(branches.get(column.label) ?? []) })));
    }
    const actual = profitParts(lines);
    if (mode === "ytd") {
      const start = `${to.slice(0, 4)}-01-01`;
      const ytd = profitParts(await this.lines(header.companyId, header.branch, start, to));
      return this.profitPayload(header, [{ key: "period", label: "Period" }, { key: "ytd", label: "Year to date" }], [
        { key: "period", parts: actual },
        { key: "ytd", parts: ytd },
      ]);
    }
    if (mode === "month") {
      const comparison = profitParts(await this.lines(header.companyId, header.branch, compareFrom ?? from, compareTo ?? to));
      return this.profitPayload(header, [{ key: "actual", label: "This period" }, { key: "comparison", label: "Comparison" }], [
        { key: "actual", parts: actual },
        { key: "comparison", parts: comparison },
      ]);
    }
    if (mode === "budget") {
      const budgets = await this.prisma.statementBudget.findMany({
        where: { companyId: header.companyId, ...(header.branch ? { branchId: header.branch } : {}), budgetMonth: { gte: day(`${from.slice(0, 7)}-01`), lte: day(to) } },
      });
      const budget = emptyProfit();
      for (const row of budgets) budgetAmount(budget, row.lineCode, parseMoney(row.amount.toFixed(4)));
      budget.netProfit = budget.revenue - budget.returns - budget.costOfSales - budget.operating - budget.finance + budget.other - budget.tax;
      return this.profitPayload(header, [{ key: "actual", label: "Actual" }, { key: "budget", label: "Budget" }], [
        { key: "actual", parts: actual },
        { key: "budget", parts: budget },
      ]);
    }
    return this.profitPayload(header, [{ key: "actual", label: "Actual" }], [{ key: "actual", parts: actual }]);
  }

  async balanceSheet(access: AccessContext, asOf: string) {
    const header = await this.header(access, asOf, asOf);
    const lines = await this.lines(header.companyId, header.branch, undefined, asOf);
    const currentAssets = movement(lines, (line) => CURRENT_ASSETS.has(line.account.accountSubtype ?? ""));
    const nonCurrent = movement(lines, (line) => line.account.accountSubtype === "fixed_asset");
    const contra = movement(lines, (line) => line.account.accountSubtype === "contra_asset");
    const assets = currentAssets + nonCurrent + contra;
    const currentLiabilities = creditMovement(lines, (line) => CURRENT_LIABILITIES.has(line.account.accountSubtype ?? ""));
    const loans = creditMovement(lines, (line) => LOANS.has(line.account.accountSubtype ?? ""));
    const equityAccounts = creditMovement(lines, (line) => EQUITY.has(line.account.accountSubtype ?? ""));
    const profit = profitParts(lines).netProfit;
    const equity = equityAccounts + profit;
    const clearing = assets - currentLiabilities - loans - equity;
    const liabilitiesAndEquity = currentLiabilities + loans + equity + clearing;
    const sections = [
      { title: "Current assets", rows: [{ label: "Current assets", amount: formatMoneyUnits(currentAssets) }], total: formatMoneyUnits(currentAssets) },
      { title: "Non-current assets", rows: [{ label: "Fixed assets", amount: formatMoneyUnits(nonCurrent) }, { label: "Accumulated depreciation", amount: formatMoneyUnits(contra) }], total: formatMoneyUnits(nonCurrent + contra) },
      { title: "Current liabilities", rows: [{ label: "Current liabilities", amount: formatMoneyUnits(currentLiabilities) }], total: formatMoneyUnits(currentLiabilities) },
      { title: "Non-current liabilities", rows: [{ label: "Loans", amount: formatMoneyUnits(loans) }], total: formatMoneyUnits(loans) },
      { title: "Equity", rows: [{ label: "Equity", amount: formatMoneyUnits(equityAccounts) }, { label: "Current year profit", amount: formatMoneyUnits(profit) }, { label: "Interbranch clearing", amount: formatMoneyUnits(clearing) }], total: formatMoneyUnits(equity + clearing) },
    ];
    return {
      ...header.meta("Balance sheet"),
      sections,
      assets: formatMoneyUnits(assets),
      liabilitiesAndEquity: formatMoneyUnits(liabilitiesAndEquity),
      clearing: formatMoneyUnits(clearing),
      balanced: assets === liabilitiesAndEquity,
      table: this.table(header, "Balance sheet", ["Section", "Amount"], [
        ...sections.flatMap((section) => section.rows.map((row) => [`${section.title} · ${row.label}`, row.amount])),
        ["Assets", formatMoneyUnits(assets)],
        ["Liabilities and equity", formatMoneyUnits(liabilitiesAndEquity)],
      ]),
    };
  }

  async cashFlow(access: AccessContext, from: string, to: string) {
    const header = await this.header(access, from, to);
    const lines = await this.lines(header.companyId, header.branch, from, to);
    const profit = profitParts(lines).netProfit;
    const depreciation = movement(lines, (line) => line.account.accountSubtype === "depreciation");
    const assetIncrease = movement(lines, (line) => WORKING_ASSETS.has(line.account.accountSubtype ?? ""));
    const liabilityIncrease = creditMovement(lines, (line) => WORKING_LIABILITIES.has(line.account.accountSubtype ?? ""));
    const fixedIncrease = movement(lines, (line) => line.account.accountSubtype === "fixed_asset");
    const accumulated = creditMovement(lines, (line) => line.account.accountSubtype === "contra_asset");
    const loans = creditMovement(lines, (line) => LOANS.has(line.account.accountSubtype ?? ""));
    const equity = creditMovement(lines, (line) => EQUITY.has(line.account.accountSubtype ?? ""));
    const operating = [
      { label: "Net profit", amount: profit },
      { label: "Depreciation", amount: depreciation },
      { label: "Working capital assets", amount: -assetIncrease },
      { label: "Working capital liabilities", amount: liabilityIncrease },
    ];
    const investing = [
      { label: "Fixed assets", amount: -fixedIncrease },
      { label: "Accumulated depreciation adjustment", amount: accumulated - depreciation },
    ];
    const financing = [
      { label: "Loans", amount: loans },
      { label: "Equity", amount: equity },
    ];
    const netChange = sum(operating) + sum(investing) + sum(financing);
    const cashChange = movement(lines, (line) => CASH.has(line.account.accountSubtype ?? ""));
    const present = (rows: { label: string; amount: bigint }[]) => rows.map((row) => ({ label: row.label, amount: formatMoneyUnits(row.amount) }));
    return {
      ...header.meta("Cash flow"),
      operating: present(operating),
      investing: present(investing),
      financing: present(financing),
      netChange: formatMoneyUnits(netChange),
      cashChange: formatMoneyUnits(cashChange),
      table: this.table(header, "Cash flow", ["Section", "Amount"], [
        ...operating.map((row) => [`Operating · ${row.label}`, formatMoneyUnits(row.amount)]),
        ...investing.map((row) => [`Investing · ${row.label}`, formatMoneyUnits(row.amount)]),
        ...financing.map((row) => [`Financing · ${row.label}`, formatMoneyUnits(row.amount)]),
        ["Net change", formatMoneyUnits(netChange)],
        ["Change in cash and bank", formatMoneyUnits(cashChange)],
      ]),
    };
  }

  async receivables(access: AccessContext, asOf: string) {
    return this.subledger(access, asOf, "1200", "customer", "Accounts receivable");
  }

  async payables(access: AccessContext, asOf: string) {
    return this.subledger(access, asOf, "2000", "supplier", "Accounts payable");
  }

  async inventory(access: AccessContext, from: string, to: string) {
    const header = await this.header(access, from, to);
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        companyId: header.companyId,
        occurredAt: { gte: day(from), lte: day(to) },
        ...(header.branch ? { branchId: header.branch } : {}),
      },
      include: { product: true, branch: true, warehouse: true },
      orderBy: { occurredAt: "asc" },
    });
    const mains = await this.prisma.warehouse.findMany({ where: { companyId: header.companyId, warehouseType: "main", status: "active" } });
    const rows = movements.map((movement) => ({
      product: movement.product.sku,
      warehouse: movement.warehouse?.name ?? mains.find((warehouse) => warehouse.branchId === movement.branchId)?.name ?? movement.branch.name,
      date: movement.occurredAt.toISOString().slice(0, 10),
      type: movement.movementType,
      quantity: movement.quantity.toFixed(4),
      value: movement.totalValue.toFixed(4),
    }));
    return {
      ...header.meta("Inventory ledger"),
      rows,
      table: this.table(header, "Inventory ledger", ["Product", "Warehouse", "Date", "Type", "Quantity", "Value"], rows.map((row) => [row.product, row.warehouse, row.date, row.type, row.quantity, row.value])),
    };
  }

  async assets(access: AccessContext) {
    const header = await this.header(access, "1900-01-01", "9999-12-31");
    const assets = await this.prisma.fixedAsset.findMany({
      where: { companyId: header.companyId, ...(header.branch ? { branchId: header.branch } : {}) },
      include: { branch: true },
      orderBy: { assetNumber: "asc" },
    });
    const rows = [];
    for (const asset of assets) {
      const accumulated = await this.depreciationOf(asset.id);
      const book = asset.status === "disposed" ? 0n : parseMoney(asset.cost.toFixed(4)) - accumulated;
      rows.push({
        id: asset.id,
        assetNumber: asset.assetNumber,
        name: asset.name,
        category: asset.category,
        branchName: asset.branch.name,
        cost: asset.cost.toFixed(4),
        usefulLifeMonths: asset.usefulLifeMonths,
        method: asset.depreciationMethod,
        accumulatedDepreciation: formatMoneyUnits(accumulated),
        bookValue: formatMoneyUnits(book),
        status: asset.status,
      });
    }
    return { ...header.meta("Fixed assets"), rows };
  }

  async acquireAsset(access: AccessContext, input: CreateFixedAssetDto, correlationId?: string) {
    const header = await this.header(access, input.acquisitionDate, input.acquisitionDate);
    assertBranchAllowed(access.scope, input.branchId);
    const cost = parseMoney(input.cost);
    if (cost <= 0n) throw new BadRequestException("Asset cost must be greater than zero");
    const payment = await this.paymentAccount(header.companyId, input.paymentAccountId);
    const assetAccount = await this.account(header.companyId, "1600");
    const assetId = randomUUID();
    const number = await this.prisma.$transaction((tx) => this.documentNumbers.allocateWith(tx, input.branchId, "fixed_asset"));
    await this.posting.postSystemDocument(access, {
      sourceModule: "reports",
      sourceDocumentType: "fixed_asset_acquisition",
      sourceDocumentId: assetId,
      accountingDate: input.acquisitionDate,
      description: `Acquire ${number.documentNumber}`,
      lines: [
        { accountId: assetAccount.id, branchId: input.branchId, debit: input.cost, credit: "0", description: input.name },
        { accountId: payment.id, branchId: input.branchId, debit: "0", credit: input.cost, description: input.name },
      ],
    }, correlationId);
    await this.prisma.fixedAsset.create({
      data: {
        id: assetId,
        companyId: header.companyId,
        branchId: input.branchId,
        assetNumber: number.documentNumber,
        name: input.name,
        category: input.category,
        acquisitionDate: day(input.acquisitionDate),
        cost: input.cost,
        usefulLifeMonths: input.usefulLifeMonths,
        createdByUserId: access.userId,
      },
    });
    await this.audit.record({ actorUserId: access.userId, action: "reports.asset_acquired", entityType: "fixed_asset", entityId: assetId, newValues: { assetNumber: number.documentNumber }, correlationId });
    return { id: assetId, assetNumber: number.documentNumber, bookValue: input.cost };
  }

  async depreciate(access: AccessContext, id: string, input: AssetDateDto, correlationId?: string) {
    const asset = await this.asset(access, id);
    if (asset.status !== "active") throw new BadRequestException("This asset is disposed");
    const accumulated = await this.depreciationOf(asset.id);
    const cost = parseMoney(asset.cost.toFixed(4));
    const monthly = cost / BigInt(asset.usefulLifeMonths);
    const remaining = cost - accumulated;
    const amount = monthly > remaining ? remaining : monthly;
    if (amount <= 0n) throw new BadRequestException("This asset is fully depreciated");
    const expense = await this.account(asset.companyId, "6700");
    const contra = await this.account(asset.companyId, "1650");
    await this.posting.postSystemDocument(access, {
      sourceModule: "reports",
      sourceDocumentType: "fixed_asset_depreciation",
      sourceDocumentId: randomUUID(),
      accountingDate: input.accountingDate,
      description: `Depreciate ${asset.assetNumber}`,
      lines: [
        { accountId: expense.id, branchId: asset.branchId, debit: formatMoneyUnits(amount), credit: "0", description: asset.name },
        { accountId: contra.id, branchId: asset.branchId, debit: "0", credit: formatMoneyUnits(amount), description: asset.name },
      ],
    }, correlationId);
    return { id: asset.id, bookValue: formatMoneyUnits(remaining - amount) };
  }

  async dispose(access: AccessContext, id: string, input: DisposeFixedAssetDto, correlationId?: string) {
    const asset = await this.asset(access, id);
    if (asset.status !== "active") throw new BadRequestException("This asset is disposed");
    const accumulated = await this.depreciationOf(asset.id);
    const cost = parseMoney(asset.cost.toFixed(4));
    const proceeds = parseMoney(input.proceeds);
    const receipt = await this.paymentAccount(asset.companyId, input.receiptAccountId);
    const fixed = await this.account(asset.companyId, "1600");
    const contra = await this.account(asset.companyId, "1650");
    const gain = await this.account(asset.companyId, "4900");
    const loss = await this.account(asset.companyId, "6900");
    const lines = [];
    if (proceeds > 0n) lines.push({ accountId: receipt.id, branchId: asset.branchId, debit: formatMoneyUnits(proceeds), credit: "0", description: "Disposal proceeds" });
    if (accumulated > 0n) lines.push({ accountId: contra.id, branchId: asset.branchId, debit: formatMoneyUnits(accumulated), credit: "0", description: "Remove depreciation" });
    lines.push({ accountId: fixed.id, branchId: asset.branchId, debit: "0", credit: formatMoneyUnits(cost), description: "Remove asset cost" });
    const difference = proceeds + accumulated - cost;
    if (difference > 0n) lines.push({ accountId: gain.id, branchId: asset.branchId, debit: "0", credit: formatMoneyUnits(difference), description: "Disposal gain" });
    if (difference < 0n) lines.push({ accountId: loss.id, branchId: asset.branchId, debit: formatMoneyUnits(-difference), credit: "0", description: "Disposal loss" });
    await this.posting.postSystemDocument(access, {
      sourceModule: "reports",
      sourceDocumentType: "fixed_asset_disposal",
      sourceDocumentId: asset.id,
      accountingDate: input.disposalDate,
      description: `Dispose ${asset.assetNumber}`,
      lines,
    }, correlationId);
    await this.prisma.fixedAsset.update({ where: { id: asset.id }, data: { status: "disposed", disposalDate: day(input.disposalDate), disposalProceeds: input.proceeds } });
    return { id: asset.id, bookValue: "0.0000" };
  }

  async taxCodes(access: AccessContext) {
    const header = await this.header(access, "1900-01-01", "9999-12-31");
    const codes = await this.prisma.taxCode.findMany({ where: { companyId: header.companyId }, include: { account: true }, orderBy: { code: "asc" } });
    return codes.map((code) => ({
      id: code.id,
      code: code.code,
      name: code.name,
      kind: code.kind,
      rate: code.rate.toFixed(4),
      effectiveFrom: code.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: code.effectiveTo?.toISOString().slice(0, 10) ?? null,
      accountCode: code.account.accountCode,
    }));
  }

  async createTaxCode(access: AccessContext, input: CreateTaxCodeDto) {
    const header = await this.header(access, input.effectiveFrom, input.effectiveTo ?? input.effectiveFrom);
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new BadRequestException("The effective end is before the start");
    const account = await this.prisma.account.findFirst({ where: { id: input.accountId, companyId: header.companyId, deletedAt: null } });
    if (!account) throw new NotFoundException("Account was not found");
    const saved = await this.prisma.taxCode.create({
      data: {
        companyId: header.companyId,
        code: input.code,
        name: input.name,
        kind: input.kind,
        rate: input.rate,
        effectiveFrom: day(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? day(input.effectiveTo) : null,
        accountId: account.id,
      },
    });
    return { id: saved.id, code: saved.code };
  }

  async taxReport(access: AccessContext, from: string, to: string) {
    const header = await this.header(access, from, to);
    const lines = await this.lines(header.companyId, header.branch, from, to);
    const asOfLines = await this.lines(header.companyId, header.branch, undefined, to);
    const output = creditMovement(lines, (line) => line.account.accountCode === "2400" && line.journal.sourceDocumentType !== "tax_payment");
    const input = lines.filter((line) => line.description === "Purchase tax" || line.description === "Expense tax").reduce((sum, line) => sum + parseMoney(line.debit.toFixed(4)), 0n);
    const withholding = creditMovement(lines, (line) => line.account.accountCode === "2420" && line.journal.sourceDocumentType !== "tax_payment");
    const liability = creditMovement(asOfLines, (line) => line.account.accountCode === "2400" || line.account.accountCode === "2420");
    const payments = lines.filter((line) => line.journal.sourceDocumentType === "tax_payment").reduce((sum, line) => sum + parseMoney(line.debit.toFixed(4)), 0n);
    const result = {
      outputTax: formatMoneyUnits(output),
      inputTax: formatMoneyUnits(input),
      withholdingTax: formatMoneyUnits(withholding),
      liability: formatMoneyUnits(liability),
      payments: formatMoneyUnits(payments),
    };
    return {
      ...header.meta("Tax report"),
      ...result,
      table: this.table(header, "Tax report", ["Item", "Amount"], Object.entries(result).map(([label, amount]) => [label, amount])),
    };
  }

  async payTax(access: AccessContext, input: TaxPaymentDto, correlationId?: string) {
    const header = await this.header(access, input.accountingDate, input.accountingDate);
    const code = await this.prisma.taxCode.findFirst({ where: { id: input.taxCodeId, companyId: header.companyId } });
    if (!code) throw new NotFoundException("Tax code was not found");
    const date = input.accountingDate;
    if (date < code.effectiveFrom.toISOString().slice(0, 10) || (code.effectiveTo && date > code.effectiveTo.toISOString().slice(0, 10))) {
      throw new BadRequestException("The tax code is outside its effective dates");
    }
    const amount = parseMoney(input.amount);
    if (amount <= 0n) throw new BadRequestException("Tax payment must be greater than zero");
    const payment = await this.paymentAccount(header.companyId, input.paymentAccountId);
    const branchId = header.branch?.in[0];
    const branch = branchId ? await this.prisma.branch.findFirst({ where: { id: branchId, companyId: header.companyId } }) : await this.prisma.branch.findFirst({ where: { companyId: header.companyId, isHeadOffice: true, deletedAt: null } });
    if (!branch) throw new NotFoundException("Branch was not found");
    await this.posting.postSystemDocument(access, {
      sourceModule: "reports",
      sourceDocumentType: "tax_payment",
      sourceDocumentId: randomUUID(),
      accountingDate: input.accountingDate,
      description: `Tax payment ${code.code}`,
      lines: [
        { accountId: code.accountId, branchId: branch.id, debit: input.amount, credit: "0", description: code.name },
        { accountId: payment.id, branchId: branch.id, debit: "0", credit: input.amount, description: code.name },
      ],
    }, correlationId);
    return { code: code.code, amount: input.amount };
  }

  async createBudget(access: AccessContext, input: CreateStatementBudgetDto) {
    const header = await this.header(access, input.budgetMonth, input.budgetMonth);
    assertBranchAllowed(access.scope, input.branchId);
    const saved = await this.prisma.statementBudget.upsert({
      where: { branchId_budgetMonth_lineCode: { branchId: input.branchId, budgetMonth: day(`${input.budgetMonth.slice(0, 7)}-01`), lineCode: input.lineCode } },
      update: { amount: input.amount },
      create: { companyId: header.companyId, branchId: input.branchId, budgetMonth: day(`${input.budgetMonth.slice(0, 7)}-01`), lineCode: input.lineCode, amount: input.amount },
    });
    return { id: saved.id, amount: saved.amount.toFixed(4) };
  }

  private async subledger(access: AccessContext, asOf: string, accountCode: string, party: "customer" | "supplier", title: string) {
    const header = await this.header(access, asOf, asOf);
    const lines = (await this.lines(header.companyId, header.branch, undefined, asOf)).filter((line) => line.account.accountCode === accountCode);
    const groups = new Map<string, { name: string; amount: bigint; current: bigint; days1To30: bigint; days31To60: bigint; days61To90: bigint; over90: bigint }>();
    for (const line of lines) {
      const id = party === "customer" ? line.customerId ?? "unassigned" : line.supplierId ?? "unassigned";
      const current = groups.get(id) ?? { name: id, amount: 0n, current: 0n, days1To30: 0n, days31To60: 0n, days61To90: 0n, over90: 0n };
      const value = party === "customer" ? net(line) : -net(line);
      current.amount += value;
      const age = bucket(line.journal.accountingDate.toISOString().slice(0, 10), asOf);
      current[age] += value;
      groups.set(id, current);
    }
    if (party === "customer") {
      const customers = await this.prisma.customer.findMany({ where: { id: { in: [...groups.keys()].filter((id) => id !== "unassigned") } } });
      for (const customer of customers) {
        const group = groups.get(customer.id);
        if (group) group.name = customer.name;
      }
    } else {
      const suppliers = await this.prisma.supplier.findMany({ where: { id: { in: [...groups.keys()].filter((id) => id !== "unassigned") } } });
      for (const supplier of suppliers) {
        const group = groups.get(supplier.id);
        if (group) group.name = supplier.businessName;
      }
    }
    const documents = await this.partyDocuments(header.companyId, header.branch, asOf, party);
    const rows = [...groups.entries()].map(([id, row]) => ({
      name: row.name,
      outstanding: formatMoneyUnits(row.amount),
      current: formatMoneyUnits(row.current),
      days1To30: formatMoneyUnits(row.days1To30),
      days31To60: formatMoneyUnits(row.days31To60),
      days61To90: formatMoneyUnits(row.days61To90),
      over90: formatMoneyUnits(row.over90),
      documents: documents.get(id) ?? [],
    }));
    const total = [...groups.values()].reduce((sum, row) => sum + row.amount, 0n);
    return {
      ...header.meta(title),
      rows,
      totalOutstanding: formatMoneyUnits(total),
      control: formatMoneyUnits(total),
      table: this.table(header, title, ["Name", "Outstanding", "Current", "1-30", "31-60", "61-90", "Over 90", "Documents"], [
        ...rows.map((row) => [row.name, row.outstanding, row.current, row.days1To30, row.days31To60, row.days61To90, row.over90, row.documents.map((document) => `${document.kind} ${document.number}`).join("; ")]),
        ["Total", formatMoneyUnits(total), "", "", "", "", "", ""],
      ]),
    };
  }

  private async partyDocuments(companyId: string, branch: { in: string[] } | undefined, asOf: string, party: "customer" | "supplier") {
    const scope = { companyId, ...(branch ? { branchId: branch } : {}) };
    const through = day(asOf);
    const documents = new Map<string, { kind: string; number: string; date: string; amount: string }[]>();
    const add = (id: string, document: { kind: string; number: string; date: string; amount: string }) => {
      const current = documents.get(id) ?? [];
      current.push(document);
      documents.set(id, current);
    };
    if (party === "customer") {
      const invoices = await this.prisma.salesInvoice.findMany({ where: { ...scope, status: "posted", invoiceDate: { lte: through } } });
      const receipts = await this.prisma.customerReceipt.findMany({ where: { ...scope, receiptDate: { lte: through } } });
      const credits = await this.prisma.salesCreditNote.findMany({ where: { ...scope, createdAt: { lte: new Date(`${asOf}T23:59:59.999Z`) } } });
      for (const invoice of invoices) add(invoice.customerId, { kind: "invoice", number: invoice.invoiceNumber, date: invoice.invoiceDate.toISOString().slice(0, 10), amount: invoice.grandTotal.toFixed(4) });
      for (const receipt of receipts) add(receipt.customerId, { kind: "receipt", number: receipt.receiptNumber, date: receipt.receiptDate.toISOString().slice(0, 10), amount: receipt.total.toFixed(4) });
      for (const credit of credits) add(credit.customerId, { kind: "credit", number: credit.creditNoteNumber, date: credit.createdAt.toISOString().slice(0, 10), amount: credit.grandTotal.toFixed(4) });
      return documents;
    }
    const bills = await this.prisma.supplierBill.findMany({ where: { ...scope, status: "posted", invoiceDate: { lte: through } } });
    const payments = await this.prisma.supplierPayment.findMany({ where: { ...scope, status: "posted", paymentDate: { lte: through } } });
    for (const bill of bills) add(bill.supplierId, { kind: "invoice", number: bill.billNumber, date: bill.invoiceDate.toISOString().slice(0, 10), amount: bill.grandTotal.toFixed(4) });
    for (const payment of payments) add(payment.supplierId, { kind: "payment", number: payment.paymentNumber, date: payment.paymentDate.toISOString().slice(0, 10), amount: payment.total.toFixed(4) });
    return documents;
  }

  private profitPayload(header: Header, columns: { key: string; label: string }[], series: { key: string; parts: ProfitParts }[]) {
    const labels: { code: keyof ProfitParts | "netRevenue" | "grossProfit" | "operatingProfit" | "profitBeforeTax"; label: string }[] = [
      { code: "revenue", label: "Revenue" },
      { code: "returns", label: "Sales returns and discounts" },
      { code: "netRevenue", label: "Net revenue" },
      { code: "costOfSales", label: "Cost of sales" },
      { code: "grossProfit", label: "Gross profit" },
      { code: "operating", label: "Operating expenses" },
      { code: "operatingProfit", label: "Operating profit" },
      { code: "finance", label: "Finance costs" },
      { code: "other", label: "Other income and expenses" },
      { code: "profitBeforeTax", label: "Profit before tax" },
      { code: "tax", label: "Tax expense" },
      { code: "netProfit", label: "Net profit" },
    ];
    const lines = labels.map((item) => ({
      code: item.code,
      label: item.label,
      amounts: Object.fromEntries(series.map((entry) => [entry.key, formatMoneyUnits(profitValue(entry.parts, item.code))])),
    }));
    return {
      ...header.meta("Profit and loss"),
      columns,
      lines,
      netProfit: lines.find((line) => line.code === "netProfit")?.amounts[columns[0]?.key ?? "actual"] ?? "0.0000",
      table: this.table(header, "Profit and loss", ["Line", ...columns.map((column) => column.label)], lines.map((line) => [line.label, ...columns.map((column) => line.amounts[column.key] ?? "0.0000")])),
    };
  }

  private async lines(companyId: string, branch: { in: string[] } | undefined, from: string | undefined, to: string) {
    return this.prisma.journalLine.findMany({
      where: {
        ...(branch ? { branchId: branch } : {}),
        journal: { companyId, status: "posted", accountingDate: { ...(from ? { gte: day(from) } : {}), lte: day(to) } },
      },
      include: { account: true, branch: true, journal: true },
    }) as Promise<PostedLine[]>;
  }

  private async depreciationOf(assetId: string) {
    const asset = await this.prisma.fixedAsset.findUnique({ where: { id: assetId } });
    if (!asset) return 0n;
    const lines = await this.prisma.journalLine.findMany({
      where: { account: { accountCode: "1650" }, journal: { status: "posted", sourceDocumentType: "fixed_asset_depreciation", description: `Depreciate ${asset.assetNumber}` } },
    });
    return lines.reduce((sum, line) => sum + parseMoney(line.credit.toFixed(4)) - parseMoney(line.debit.toFixed(4)), 0n);
  }

  private async asset(access: AccessContext, id: string) {
    const header = await this.header(access, "1900-01-01", "9999-12-31");
    const asset = await this.prisma.fixedAsset.findFirst({ where: { id, companyId: header.companyId } });
    if (!asset) throw new NotFoundException("Asset was not found");
    if (header.branch && !header.branch.in.includes(asset.branchId)) throw new NotFoundException("Asset was not found");
    return asset;
  }

  private async account(companyId: string, accountCode: string) {
    const account = await this.prisma.account.findFirst({ where: { companyId, accountCode, deletedAt: null } });
    if (!account) throw new NotFoundException(`Account ${accountCode} was not found`);
    return account;
  }

  private async paymentAccount(companyId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, companyId, deletedAt: null } });
    if (!account || !account.isPostable || (account.accountSubtype !== "cash" && account.accountSubtype !== "bank" && account.accountSubtype !== "payable")) {
      throw new BadRequestException("Choose a postable cash, bank, or payable account");
    }
    return account;
  }

  private async header(access: AccessContext, from: string, to: string) {
    if (!access.permissions.includes("reports.view")) throw new ForbiddenException("Reports are not available for this sign-in");
    if (access.scope.type === "company" && !access.permissions.includes("reports.company.view")) throw new ForbiddenException("Company reports are not available for this sign-in");
    if (access.scope.type === "branches" && !access.permissions.includes("reports.branch.view")) throw new ForbiddenException("Branch reports are not available for this sign-in");
    const user = await this.prisma.user.findUnique({ where: { id: access.userId }, select: { companyId: true, email: true } });
    if (!user) throw new NotFoundException("User was not found");
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });
    const branch = branchIdFilter(access.scope);
    const scope = access.scope.type === "company" ? "Company" : "Selected branches";
    return {
      companyId: company.id,
      branch,
      meta: (title: string) => ({
        title,
        companyName: company.legalName,
        period: from === to ? from : `${from} to ${to}`,
        scope,
        currency: company.baseCurrency,
        generatedAt: new Date().toISOString(),
        preparedBy: user.email,
      }),
    };
  }

  private table(header: { meta(title: string): Omit<ReportTable, "columns" | "rows"> }, title: string, columns: string[], rows: string[][]): ReportTable {
    return { ...header.meta(title), columns, rows };
  }
}

type Header = Awaited<ReturnType<ReportsService["header"]>>;

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function net(line: PostedLine) {
  return parseMoney(line.debit.toFixed(4)) - parseMoney(line.credit.toFixed(4));
}

function movement(lines: PostedLine[], predicate: (line: PostedLine) => boolean) {
  return lines.filter(predicate).reduce((sum, line) => sum + net(line), 0n);
}

function creditMovement(lines: PostedLine[], predicate: (line: PostedLine) => boolean) {
  return -movement(lines, predicate);
}

function profitParts(lines: PostedLine[]): ProfitParts {
  const parts = emptyProfit();
  for (const line of lines) {
    const subtype = line.account.accountSubtype ?? "";
    if (SALES.has(subtype)) {
      parts.revenue += parseMoney(line.credit.toFixed(4));
      parts.returns += parseMoney(line.debit.toFixed(4));
    } else if (subtype === "cost_of_sales") parts.costOfSales += net(line);
    else if (subtype === "operating" || subtype === "depreciation") parts.operating += net(line);
    else if (subtype === "finance") parts.finance += net(line);
    else if (subtype === "other_income") parts.other += -net(line);
    else if (subtype === "tax_expense") parts.tax += net(line);
  }
  parts.netProfit = parts.revenue - parts.returns - parts.costOfSales - parts.operating - parts.finance + parts.other - parts.tax;
  return parts;
}

function emptyProfit(): ProfitParts {
  return { revenue: 0n, returns: 0n, costOfSales: 0n, operating: 0n, finance: 0n, other: 0n, tax: 0n, netProfit: 0n };
}

function budgetAmount(parts: ProfitParts, code: string, amount: bigint) {
  if (code === "revenue") parts.revenue += amount;
  if (code === "returns") parts.returns += amount;
  if (code === "cost_of_sales") parts.costOfSales += amount;
  if (code === "operating") parts.operating += amount;
  if (code === "finance") parts.finance += amount;
  if (code === "other_income") parts.other += amount;
  if (code === "tax_expense") parts.tax += amount;
}

function profitValue(parts: ProfitParts, code: string) {
  const netRevenue = parts.revenue - parts.returns;
  const gross = netRevenue - parts.costOfSales;
  const operatingProfit = gross - parts.operating;
  const beforeTax = operatingProfit - parts.finance + parts.other;
  if (code === "netRevenue") return netRevenue;
  if (code === "grossProfit") return gross;
  if (code === "operatingProfit") return operatingProfit;
  if (code === "profitBeforeTax") return beforeTax;
  return parts[code as keyof ProfitParts];
}

function sum(rows: { amount: bigint }[]) {
  return rows.reduce((total, row) => total + row.amount, 0n);
}

function bucket(date: string, asOf: string): "current" | "days1To30" | "days31To60" | "days61To90" | "over90" {
  if (date >= asOf) return "current";
  const days = Math.round((Date.parse(`${asOf}T00:00:00.000Z`) - Date.parse(`${date}T00:00:00.000Z`)) / 86_400_000);
  if (days <= 30) return "days1To30";
  if (days <= 60) return "days31To60";
  if (days <= 90) return "days61To90";
  return "over90";
}
