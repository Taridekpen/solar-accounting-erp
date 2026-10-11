import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DashboardDetail, DashboardSummary } from "@solar/shared";
import { periodBounds } from "../../common/timezone";
import { PrismaService } from "../../database/prisma.service";
import { formatMoneyUnits, parseMoney } from "../accounting/money";
import { BranchScope } from "../organization/branch-scope";
import { DashboardDetailQueryDto, DashboardSummaryQueryDto } from "./dashboard-summary.query";

const ZERO = "0.0000";
const COMPANY_SCOPE: BranchScope = { type: "company" };

const EMPTY_METRICS = new Set([
  "stock",
  "daily-closing",
]);

const MONEY_METRICS = new Set([
  "sales",
  "purchases",
  "expenses",
  "gross-profit",
  "net-profit",
  "cash",
  "receivables",
  "payables",
  "inventory",
  "collections",
  "credit-sales",
  "daily-sales",
  "sales-month",
]);

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(query: DashboardSummaryQueryDto, scope: BranchScope = COMPANY_SCOPE): Promise<DashboardSummary> {
    const company = await this.prisma.company.findFirst({
      where: { deletedAt: null },
      select: { id: true, timezone: true },
    });
    const preset = query.preset ?? "this_month";
    const timeZone = company?.timezone ?? "UTC";
    const range =
      preset === "custom" && query.from && query.to
        ? { from: query.from, to: query.to }
        : periodBounds(preset === "this_year" ? "this_year" : "this_month", timeZone);
    const fromDate = calendarDate(range.from, timeZone);
    const toDate = calendarDate(range.to, timeZone);
    if (!company) {
      return emptySummary(preset, timeZone, range.from, range.to);
    }
    const today = calendarDate(new Date().toISOString(), timeZone);
    const month = periodBounds("this_month", timeZone);
    const monthFrom = calendarDate(month.from, timeZone);
    const monthTo = calendarDate(month.to, timeZone);
    const branch = branchFilter(scope);
    const [period, todayRow, monthRow, balances, months, branches, recent, pendingApprovals] = await Promise.all([
      this.activity(company.id, fromDate, toDate, branch),
      this.activity(company.id, today, today, branch),
      this.activity(company.id, monthFrom, monthTo, branch),
      this.balances(company.id, toDate, branch),
      this.monthly(company.id, fromDate, toDate, branch),
      this.branchPerformance(company.id, fromDate, toDate, branch),
      this.prisma.journalEntry.findMany({
        where: {
          companyId: company.id,
          status: "posted",
          accountingDate: { gte: new Date(`${fromDate}T00:00:00.000Z`), lte: new Date(`${toDate}T00:00:00.000Z`) },
          ...(scope.type === "branches" ? { lines: { some: { branchId: { in: scope.branchIds } } } } : {}),
        },
        include: { lines: true },
        orderBy: { postedAt: "desc" },
        take: 8,
      }),
      this.prisma.journalEntry.count({
        where: {
          companyId: company.id,
          status: "pending_approval",
          ...(scope.type === "branches" ? { lines: { some: { branchId: { in: scope.branchIds } } } } : {}),
        },
      }),
    ]);
    const [postedSales, supplierAging, inventory, projects] = await Promise.all([
      this.salesSnapshot(company.id, fromDate, toDate, scope),
      this.supplierSnapshot(company.id, toDate, scope),
      this.inventorySnapshot(company.id, fromDate, toDate, scope),
      this.projectSnapshot(company.id, fromDate, toDate, scope),
    ]);
    const sales = money(period?.sales);
    const purchases = money(period?.purchases);
    const cogs = money(period?.cogs);
    const expenses = money(period?.expenses);
    const grossProfit = sales - cogs;
    return {
      currency: "NGN",
      preset,
      timeZone,
      from: range.from,
      to: range.to,
      kpis: {
        totalSales: formatMoneyUnits(sales),
        totalPurchases: formatMoneyUnits(purchases),
        grossProfit: formatMoneyUnits(grossProfit),
        totalExpenses: formatMoneyUnits(expenses),
        salesToday: formatMoneyUnits(money(todayRow?.sales)),
        salesThisMonth: formatMoneyUnits(money(monthRow?.sales)),
        netProfit: formatMoneyUnits(grossProfit - expenses),
        cashAndBank: formatMoneyUnits(money(balances?.cash)),
        accountsReceivable: formatMoneyUnits(money(balances?.receivables)),
        accountsPayable: formatMoneyUnits(money(balances?.payables)),
        inventoryValuation: formatMoneyUnits(money(balances?.inventory)),
        cashCollections: formatMoneyUnits(money(period?.collections)),
        creditSales: formatMoneyUnits(money(period?.credit_sales)),
        operatingExpenses: formatMoneyUnits(expenses),
        dailySales: formatMoneyUnits(money(todayRow?.sales)),
      },
      salesVsPurchases: months
        .filter((point) => money(point.sales) !== 0n || money(point.purchases) !== 0n)
        .map((point) => ({
          month: point.month,
          sales: formatMoneyUnits(money(point.sales)),
          purchases: formatMoneyUnits(money(point.purchases)),
        })),
      monthlyRevenue: months
        .filter((point) => money(point.revenue) !== 0n)
        .map((point) => ({ month: point.month, amount: formatMoneyUnits(money(point.revenue)) })),
      monthlyExpenses: months
        .filter((point) => money(point.expenses) !== 0n)
        .map((point) => ({ month: point.month, amount: formatMoneyUnits(money(point.expenses)) })),
      branchPerformance: branches
        .filter((point) => money(point.sales) !== 0n || money(point.profit) !== 0n)
        .map((point) => ({
          branchId: point.branch_id,
          branchName: point.branch_name,
          sales: formatMoneyUnits(money(point.sales)),
          profit: formatMoneyUnits(money(point.profit)),
        })),
      cashFlow: months
        .filter((point) => money(point.cash_flow) !== 0n)
        .map((point) => ({ month: point.month, amount: formatMoneyUnits(money(point.cash_flow)) })),
      revenueByProductCategory: postedSales.categories,
      customerDebtAging: postedSales.aging,
      supplierLiabilityAging: supplierAging,
      inventoryByCategory: inventory.categories,
      projectProfitability: projects.profitability,
      topSellingProducts: postedSales.products,
      recentTransactions: recent.map((entry) => {
        const lines = entry.lines.filter((line) => scope.type === "company" || scope.branchIds.includes(line.branchId));
        return {
          id: entry.id,
          description: entry.description,
          type: entry.sourceDocumentType,
          amount: formatMoneyUnits(lines.reduce((sum, line) => sum + parseMoney(line.debit.toFixed(4)), 0n)),
          occurredAt: (entry.postedAt ?? entry.accountingDate).toISOString(),
        };
      }),
      operations: {
        pendingApprovals,
        activeProjects: projects.active,
        lowStockAlerts: inventory.lowStock,
        overdueInvoices: postedSales.overdue,
        stockAvailability: 0,
        pendingTransfers: inventory.pendingTransfers,
        activeInstallations: projects.installations,
        dailyClosingStatus: "none",
      },
    };
  }

  async getDetails(query: DashboardDetailQueryDto, scope: BranchScope = COMPANY_SCOPE): Promise<DashboardDetail> {
    if (EMPTY_METRICS.has(query.metric)) {
      return { metric: query.metric, kind: "empty", total: "0", rows: [] };
    }
    if (query.metric === "approvals") {
      return this.approvalDetails(scope);
    }
    if (query.metric === "customer-aging" || query.metric === "product-categories" || query.metric === "overdue-invoices") {
      return this.salesDetails(query, scope);
    }
    if (query.metric === "supplier-aging") {
      return this.supplierDetails(query, scope);
    }
    if (query.metric === "inventory-categories" || query.metric === "low-stock" || query.metric === "transfers") {
      return this.inventoryDetails(query, scope);
    }
    if (query.metric === "projects" || query.metric === "installations" || query.metric === "project-profit") {
      return this.projectDetails(query, scope);
    }
    if (!MONEY_METRICS.has(query.metric)) {
      throw new BadRequestException("Dashboard detail is not recognized");
    }
    const company = await this.prisma.company.findFirst({
      where: { deletedAt: null },
      select: { id: true, timezone: true },
    });
    const preset = query.preset ?? "this_month";
    const timeZone = company?.timezone ?? "UTC";
    const range =
      preset === "custom" && query.from && query.to
        ? { from: query.from, to: query.to }
        : periodBounds(preset === "this_year" ? "this_year" : "this_month", timeZone);
    if (!company) {
      return { metric: query.metric, kind: "money", total: ZERO, rows: [] };
    }
    const today = calendarDate(new Date().toISOString(), timeZone);
    const month = periodBounds("this_month", timeZone);
    const fromDate = query.metric === "daily-sales"
      ? today
      : query.metric === "sales-month"
        ? calendarDate(month.from, timeZone)
        : calendarDate(range.from, timeZone);
    const toDate = query.metric === "daily-sales"
      ? today
      : query.metric === "sales-month"
        ? calendarDate(month.to, timeZone)
        : calendarDate(range.to, timeZone);
    const asOf = query.metric === "cash" || query.metric === "receivables" || query.metric === "payables" || query.metric === "inventory";
    const rows = await this.prisma.$queryRaw<Array<{ id: string; label: string; amount: string; occurred_at: string }>>(
      Prisma.sql`
        SELECT
          l.id::text AS id,
          j.journal_number || ' · ' || a.account_code || ' ' || a.account_name AS label,
          (${amountExpression(query.metric)})::text AS amount,
          to_char(j.accounting_date, 'YYYY-MM-DD') AS occurred_at
        FROM journal_lines l
        INNER JOIN journal_entries j ON j.id = l.journal_entry_id
        INNER JOIN accounts a ON a.id = l.account_id
        WHERE j.company_id = CAST(${company.id} AS uuid)
          AND j.status = 'posted'
          AND ${asOf ? Prisma.sql`j.accounting_date <= CAST(${toDate} AS date)` : Prisma.sql`j.accounting_date >= CAST(${fromDate} AS date) AND j.accounting_date <= CAST(${toDate} AS date)`}
          AND ${lineCondition(query.metric)}
          AND ${branchFilter(scope)}
        ORDER BY j.accounting_date DESC, j.journal_number
      `,
    );
    const total = rows.reduce((sum, row) => sum + money(row.amount), 0n);
    return {
      metric: query.metric,
      kind: "money",
      total: formatMoneyUnits(total),
      rows: rows
        .filter((row) => money(row.amount) !== 0n)
        .map((row) => ({
          id: row.id,
          label: row.label,
          amount: formatMoneyUnits(money(row.amount)),
          occurredAt: row.occurred_at,
        })),
    };
  }

  private async approvalDetails(scope: BranchScope): Promise<DashboardDetail> {
    const company = await this.prisma.company.findFirst({ where: { deletedAt: null }, select: { id: true } });
    if (!company) {
      return { metric: "approvals", kind: "count", total: "0", rows: [] };
    }
    const rows = await this.prisma.journalEntry.findMany({
      where: {
        companyId: company.id,
        status: "pending_approval",
        ...(scope.type === "branches" ? { lines: { some: { branchId: { in: scope.branchIds } } } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      metric: "approvals",
      kind: "count",
      total: String(rows.length),
      rows: rows.map((row) => ({
        id: row.id,
        label: `${row.journalNumber} · ${row.description}`,
        amount: "1",
        occurredAt: row.createdAt.toISOString(),
      })),
    };
  }

  private activity(companyId: string, fromDate: string, toDate: string, branch: Prisma.Sql) {
    return this.one<{ sales: string; purchases: string; cogs: string; expenses: string; collections: string; credit_sales: string }>(
      Prisma.sql`
        SELECT
          COALESCE(SUM(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit ELSE 0 END), 0)::text AS sales,
          COALESCE(SUM(CASE WHEN a.account_subtype = 'inventory' THEN l.debit - l.credit ELSE 0 END), 0)::text AS purchases,
          COALESCE(SUM(CASE WHEN a.account_subtype = 'cost_of_sales' THEN l.debit - l.credit ELSE 0 END), 0)::text AS cogs,
          COALESCE(SUM(CASE WHEN a.account_type = 'expense' AND a.account_subtype IS DISTINCT FROM 'cost_of_sales' THEN l.debit - l.credit ELSE 0 END), 0)::text AS expenses,
          COALESCE(SUM(CASE WHEN a.account_subtype IN ('cash', 'bank') THEN l.debit ELSE 0 END), 0)::text AS collections,
          COALESCE(SUM(CASE WHEN a.account_type = 'revenue' AND EXISTS (
            SELECT 1 FROM journal_lines ar
            INNER JOIN accounts ara ON ara.id = ar.account_id
            WHERE ar.journal_entry_id = j.id AND ara.account_subtype = 'receivable' AND ar.debit > 0
          ) THEN l.credit - l.debit ELSE 0 END), 0)::text AS credit_sales
        FROM journal_lines l
        INNER JOIN journal_entries j ON j.id = l.journal_entry_id
        INNER JOIN accounts a ON a.id = l.account_id
        WHERE j.company_id = CAST(${companyId} AS uuid)
          AND j.status = 'posted'
          AND j.accounting_date >= CAST(${fromDate} AS date)
          AND j.accounting_date <= CAST(${toDate} AS date)
          AND ${branch}
      `,
    );
  }

  private balances(companyId: string, toDate: string, branch: Prisma.Sql) {
    return this.one<{ cash: string; receivables: string; payables: string; inventory: string }>(
      Prisma.sql`
        SELECT
          COALESCE(SUM(CASE WHEN a.account_subtype IN ('cash', 'bank') THEN l.debit - l.credit ELSE 0 END), 0)::text AS cash,
          COALESCE(SUM(CASE WHEN a.account_subtype = 'receivable' THEN l.debit - l.credit ELSE 0 END), 0)::text AS receivables,
          COALESCE(SUM(CASE WHEN a.account_subtype = 'payable' THEN l.credit - l.debit ELSE 0 END), 0)::text AS payables,
          COALESCE(SUM(CASE WHEN a.account_subtype = 'inventory' THEN l.debit - l.credit ELSE 0 END), 0)::text AS inventory
        FROM journal_lines l
        INNER JOIN journal_entries j ON j.id = l.journal_entry_id
        INNER JOIN accounts a ON a.id = l.account_id
        WHERE j.company_id = CAST(${companyId} AS uuid)
          AND j.status = 'posted'
          AND j.accounting_date <= CAST(${toDate} AS date)
          AND ${branch}
      `,
    );
  }

  private monthly(companyId: string, fromDate: string, toDate: string, branch: Prisma.Sql) {
    return this.prisma.$queryRaw<Array<{ month: string; sales: string; purchases: string; revenue: string; expenses: string; cash_flow: string }>>(
      Prisma.sql`
        SELECT
          to_char(j.accounting_date, 'YYYY-MM') AS month,
          COALESCE(SUM(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit ELSE 0 END), 0)::text AS sales,
          COALESCE(SUM(CASE WHEN a.account_subtype = 'inventory' THEN l.debit - l.credit ELSE 0 END), 0)::text AS purchases,
          COALESCE(SUM(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit ELSE 0 END), 0)::text AS revenue,
          COALESCE(SUM(CASE WHEN a.account_type = 'expense' AND a.account_subtype IS DISTINCT FROM 'cost_of_sales' THEN l.debit - l.credit ELSE 0 END), 0)::text AS expenses,
          COALESCE(SUM(CASE WHEN a.account_subtype IN ('cash', 'bank') THEN l.debit - l.credit ELSE 0 END), 0)::text AS cash_flow
        FROM journal_lines l
        INNER JOIN journal_entries j ON j.id = l.journal_entry_id
        INNER JOIN accounts a ON a.id = l.account_id
        WHERE j.company_id = CAST(${companyId} AS uuid)
          AND j.status = 'posted'
          AND j.accounting_date >= CAST(${fromDate} AS date)
          AND j.accounting_date <= CAST(${toDate} AS date)
          AND ${branch}
        GROUP BY to_char(j.accounting_date, 'YYYY-MM')
        ORDER BY month
      `,
    );
  }

  private branchPerformance(companyId: string, fromDate: string, toDate: string, branch: Prisma.Sql) {
    return this.prisma.$queryRaw<Array<{ branch_id: string; branch_name: string; sales: string; profit: string }>>(
      Prisma.sql`
        SELECT
          b.id::text AS branch_id,
          b.name AS branch_name,
          COALESCE(SUM(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit ELSE 0 END), 0)::text AS sales,
          COALESCE(SUM(CASE
            WHEN a.account_type = 'revenue' THEN l.credit - l.debit
            WHEN a.account_type = 'expense' THEN l.credit - l.debit
            ELSE 0
          END), 0)::text AS profit
        FROM journal_lines l
        INNER JOIN journal_entries j ON j.id = l.journal_entry_id
        INNER JOIN accounts a ON a.id = l.account_id
        INNER JOIN branches b ON b.id = l.branch_id
        WHERE j.company_id = CAST(${companyId} AS uuid)
          AND j.status = 'posted'
          AND j.accounting_date >= CAST(${fromDate} AS date)
          AND j.accounting_date <= CAST(${toDate} AS date)
          AND ${branch}
        GROUP BY b.id, b.name
        ORDER BY branch_name
      `,
    );
  }

  private async one<T>(query: Prisma.Sql): Promise<T | undefined> {
    const [row] = await this.prisma.$queryRaw<T[]>(query);
    return row;
  }

  private async salesSnapshot(companyId: string, fromDate: string, toDate: string, scope: BranchScope) {
    const invoices = await this.postedInvoices(companyId, toDate, scope);
    const categories = new Map<string, bigint>();
    const products = new Map<string, { quantity: bigint; revenue: bigint }>();
    const aging = { current: 0n, days1To30: 0n, days31To60: 0n, days61To90: 0n, over90: 0n };
    let overdue = 0;
    for (const invoice of invoices) {
      const open = openInvoice(invoice);
      if (open > 0n) {
        aging[agingBucket(invoice.dueDate.toISOString().slice(0, 10), toDate)] += open;
        if (invoice.dueDate.toISOString().slice(0, 10) < toDate) {
          overdue += 1;
        }
      }
      const invoiceDate = invoice.invoiceDate.toISOString().slice(0, 10);
      if (invoiceDate < fromDate || invoiceDate > toDate) {
        continue;
      }
      for (const line of invoice.lines) {
        const revenue = parseMoney(line.lineNet.toFixed(4));
        const category = line.product.category.name;
        categories.set(category, (categories.get(category) ?? 0n) + revenue);
        const product = products.get(line.product.name) ?? { quantity: 0n, revenue: 0n };
        product.quantity += parseMoney(line.quantity.toFixed(4));
        product.revenue += revenue;
        products.set(line.product.name, product);
      }
    }
    return {
      categories: [...categories.entries()]
        .filter(([, amount]) => amount !== 0n)
        .map(([name, amount]) => ({ name, amount: formatMoneyUnits(amount) })),
      aging: [
        { name: "Current", amount: aging.current },
        { name: "1-30 days", amount: aging.days1To30 },
        { name: "31-60 days", amount: aging.days31To60 },
        { name: "61-90 days", amount: aging.days61To90 },
        { name: "Over 90 days", amount: aging.over90 },
      ].filter((row) => row.amount !== 0n).map((row) => ({ name: row.name, amount: formatMoneyUnits(row.amount) })),
      products: [...products.entries()]
        .filter(([, value]) => value.revenue !== 0n)
        .map(([name, value]) => ({
          name,
          quantity: formatMoneyUnits(value.quantity),
          revenue: formatMoneyUnits(value.revenue),
        })),
      overdue,
    };
  }

  private async inventorySnapshot(companyId: string, fromDate: string, toDate: string, scope: BranchScope) {
    const branchWhere = scope.type === "branches" ? { branchId: { in: scope.branchIds } } : {};
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        companyId,
        occurredAt: { gte: new Date(`${fromDate}T00:00:00.000Z`), lte: new Date(`${toDate}T23:59:59.999Z`) },
        ...branchWhere,
      },
      include: { product: { include: { category: true } } },
    });
    const totals = new Map<string, bigint>();
    for (const movement of movements) {
      const name = movement.product.category.name;
      totals.set(name, (totals.get(name) ?? 0n) + parseMoney(movement.totalValue.toFixed(4)));
    }
    const products = await this.prisma.product.findMany({
      where: { companyId, deletedAt: null, reorderLevel: { gt: 0 } },
      include: { positions: { where: branchWhere } },
    });
    const lowStockRows = products.flatMap((product) => {
      const available = product.positions.reduce((sum, position) => {
        return sum + parseMoney(position.physicalQuantity.toFixed(4)) - parseMoney(position.reservedQuantity.toFixed(4));
      }, 0n);
      if (available > parseMoney(product.reorderLevel.toFixed(4))) {
        return [];
      }
      return [{
        id: product.id,
        label: product.name,
        amount: formatMoneyUnits(available),
        occurredAt: toDate,
      }];
    });
    const transfers = await this.prisma.stockTransfer.findMany({
      where: { companyId, status: "shipped", ...(scope.type === "branches" ? { sourceBranchId: { in: scope.branchIds } } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return {
      categories: [...totals.entries()]
        .filter(([, amount]) => amount !== 0n)
        .map(([name, amount]) => ({ name, amount: formatMoneyUnits(amount) })),
      lowStock: lowStockRows.length,
      pendingTransfers: transfers.length,
      lowStockRows,
      transferRows: transfers.map((transfer) => ({
        id: transfer.id,
        label: transfer.transferNumber,
        amount: "0.0000",
        occurredAt: transfer.transferDate.toISOString().slice(0, 10),
      })),
    };
  }

  private async inventoryDetails(query: DashboardDetailQueryDto, scope: BranchScope): Promise<DashboardDetail> {
    const company = await this.prisma.company.findFirst({ where: { deletedAt: null }, select: { id: true, timezone: true } });
    const preset = query.preset ?? "this_month";
    const timeZone = company?.timezone ?? "UTC";
    const range = preset === "custom" && query.from && query.to
      ? { from: query.from, to: query.to }
      : periodBounds(preset === "this_year" ? "this_year" : "this_month", timeZone);
    if (!company) {
      return { metric: query.metric, kind: "empty", total: "0", rows: [] };
    }
    const snapshot = await this.inventorySnapshot(company.id, calendarDate(range.from, timeZone), calendarDate(range.to, timeZone), scope);
    if (query.metric === "inventory-categories") {
      return namedDetail(query.metric, snapshot.categories.map((row) => ({ ...row, occurredAt: calendarDate(range.to, timeZone) })));
    }
    if (query.metric === "low-stock") {
      return { metric: query.metric, kind: "count", total: String(snapshot.lowStock), rows: snapshot.lowStockRows };
    }
    return { metric: query.metric, kind: "count", total: String(snapshot.pendingTransfers), rows: snapshot.transferRows };
  }

  private async supplierSnapshot(companyId: string, toDate: string, scope: BranchScope) {
    const bills = await this.prisma.supplierBill.findMany({
      where: {
        companyId,
        status: "posted",
        invoiceDate: { lte: new Date(`${toDate}T00:00:00.000Z`) },
        ...(scope.type === "branches" ? { branchId: { in: scope.branchIds } } : {}),
      },
      include: { allocations: true },
    });
    const aging = { current: 0n, days1To30: 0n, days31To60: 0n, days61To90: 0n, over90: 0n };
    for (const bill of bills) {
      const open = openInvoice(bill);
      if (open > 0n) {
        aging[agingBucket(bill.dueDate.toISOString().slice(0, 10), toDate)] += open;
      }
    }
    return [
      { name: "Current", amount: aging.current },
      { name: "1-30 days", amount: aging.days1To30 },
      { name: "31-60 days", amount: aging.days31To60 },
      { name: "61-90 days", amount: aging.days61To90 },
      { name: "Over 90 days", amount: aging.over90 },
    ].filter((row) => row.amount !== 0n).map((row) => ({ name: row.name, amount: formatMoneyUnits(row.amount) }));
  }

  private async supplierDetails(query: DashboardDetailQueryDto, scope: BranchScope): Promise<DashboardDetail> {
    const company = await this.prisma.company.findFirst({ where: { deletedAt: null }, select: { id: true, timezone: true } });
    const preset = query.preset ?? "this_month";
    const timeZone = company?.timezone ?? "UTC";
    const range = preset === "custom" && query.from && query.to
      ? { from: query.from, to: query.to }
      : periodBounds(preset === "this_year" ? "this_year" : "this_month", timeZone);
    if (!company) {
      return { metric: query.metric, kind: "money", total: ZERO, rows: [] };
    }
    const asOf = calendarDate(range.to, timeZone);
    const aging = await this.supplierSnapshot(company.id, asOf, scope);
    return namedDetail(query.metric, aging.map((row) => ({ ...row, occurredAt: asOf })));
  }

  private async salesDetails(query: DashboardDetailQueryDto, scope: BranchScope): Promise<DashboardDetail> {
    const company = await this.prisma.company.findFirst({ where: { deletedAt: null }, select: { id: true, timezone: true } });
    const preset = query.preset ?? "this_month";
    const timeZone = company?.timezone ?? "UTC";
    const range = preset === "custom" && query.from && query.to
      ? { from: query.from, to: query.to }
      : periodBounds(preset === "this_year" ? "this_year" : "this_month", timeZone);
    if (!company) {
      return { metric: query.metric, kind: "money", total: ZERO, rows: [] };
    }
    const snapshot = await this.salesSnapshot(company.id, calendarDate(range.from, timeZone), calendarDate(range.to, timeZone), scope);
    if (query.metric === "product-categories") {
      return namedDetail(query.metric, snapshot.categories.map((row) => ({ ...row, occurredAt: calendarDate(range.to, timeZone) })));
    }
    if (query.metric === "customer-aging") {
      return namedDetail(query.metric, snapshot.aging.map((row) => ({ ...row, occurredAt: calendarDate(range.to, timeZone) })));
    }
    const invoices = await this.postedInvoices(company.id, calendarDate(range.to, timeZone), scope);
    const rows = invoices.flatMap((invoice) => {
      const open = openInvoice(invoice);
      const due = invoice.dueDate.toISOString().slice(0, 10);
      if (open <= 0n || due >= calendarDate(range.to, timeZone)) {
        return [];
      }
      return [{
        id: invoice.id,
        label: invoice.invoiceNumber,
        amount: formatMoneyUnits(open),
        occurredAt: due,
      }];
    });
    return {
      metric: query.metric,
      kind: "money",
      total: formatMoneyUnits(rows.reduce((total, row) => total + parseMoney(row.amount), 0n)),
      rows,
    };
  }

  private postedInvoices(companyId: string, toDate: string, scope: BranchScope) {
    return this.prisma.salesInvoice.findMany({
      where: {
        companyId,
        status: "posted",
        invoiceDate: { lte: new Date(`${toDate}T00:00:00.000Z`) },
        ...(scope.type === "branches" ? { branchId: { in: scope.branchIds } } : {}),
      },
      include: {
        allocations: true,
        lines: { include: { product: { include: { category: true } } } },
      },
    });
  }

  private async projectSnapshot(companyId: string, fromDate: string, toDate: string, scope: BranchScope) {
    const start = new Date(`${fromDate}T00:00:00.000Z`);
    const end = new Date(`${toDate}T00:00:00.000Z`);
    const branchWhere = scope.type === "branches" ? { branchId: { in: scope.branchIds } } : {};
    const overlapping = await this.prisma.project.findMany({
      where: {
        companyId,
        status: { in: ["active", "completed"] },
        startDate: { lte: end },
        OR: [{ actualCompletionDate: null }, { actualCompletionDate: { gte: start } }],
        ...branchWhere,
      },
      select: { id: true, name: true, status: true, projectType: true, contractValue: true, startDate: true },
    });
    const installationTypes = new Set(["residential", "commercial", "industrial", "system_upgrade"]);
    const active = overlapping.filter((row) => row.status === "active");
    const lines = await this.prisma.journalLine.findMany({
      where: {
        projectId: { not: null },
        journal: { companyId, status: "posted", accountingDate: { gte: start, lte: end } },
        OR: [{ account: { accountType: "revenue" } }, { account: { accountCode: "5100" } }],
        ...branchWhere,
      },
      include: { account: true, project: true },
    });
    const grouped = new Map<string, { name: string; contract: bigint; revenue: bigint; cost: bigint }>();
    for (const line of lines) {
      if (!line.project || !line.projectId) continue;
      const current = grouped.get(line.projectId) ?? {
        name: line.project.name,
        contract: parseMoney(line.project.contractValue.toFixed(4)),
        revenue: 0n,
        cost: 0n,
      };
      const debit = parseMoney(line.debit.toFixed(4));
      const credit = parseMoney(line.credit.toFixed(4));
      if (line.account.accountType === "revenue") current.revenue += credit - debit;
      if (line.account.accountCode === "5100") current.cost += debit - credit;
      grouped.set(line.projectId, current);
    }
    return {
      active: active.length,
      installations: active.filter((row) => installationTypes.has(row.projectType)).length,
      activeRows: active,
      profitability: [...grouped.values()]
        .filter((row) => row.revenue !== 0n || row.cost !== 0n)
        .map((row) => ({
          name: row.name,
          contractValue: formatMoneyUnits(row.contract),
          recognizedRevenue: formatMoneyUnits(row.revenue),
          recognizedCost: formatMoneyUnits(row.cost),
          grossProfit: formatMoneyUnits(row.revenue - row.cost),
        })),
    };
  }

  private async projectDetails(query: DashboardDetailQueryDto, scope: BranchScope): Promise<DashboardDetail> {
    const company = await this.prisma.company.findFirst({ where: { deletedAt: null }, select: { id: true, timezone: true } });
    const preset = query.preset ?? "this_month";
    const timeZone = company?.timezone ?? "UTC";
    const range = preset === "custom" && query.from && query.to ? { from: query.from, to: query.to } : periodBounds(preset === "this_year" ? "this_year" : "this_month", timeZone);
    if (!company) return { metric: query.metric, kind: query.metric === "project-profit" ? "money" : "count", total: "0", rows: [] };
    const snapshot = await this.projectSnapshot(company.id, calendarDate(range.from, timeZone), calendarDate(range.to, timeZone), scope);
    if (query.metric === "project-profit") {
      return namedDetail(query.metric, snapshot.profitability.map((row) => ({ name: row.name, amount: row.grossProfit, occurredAt: range.from })));
    }
    const installationTypes = new Set(["residential", "commercial", "industrial", "system_upgrade"]);
    const rows = snapshot.activeRows.filter((row) => query.metric === "projects" || installationTypes.has(row.projectType));
    return {
      metric: query.metric,
      kind: "count",
      total: String(rows.length),
      rows: rows.map((row) => ({ id: row.id, label: row.name, amount: row.contractValue.toFixed(4), occurredAt: row.startDate.toISOString() })),
    };
  }
}

function amountExpression(metric: string): Prisma.Sql {
  if (metric === "collections") {
    return Prisma.sql`l.debit`;
  }
  if (metric === "purchases" || metric === "expenses" || metric === "cash" || metric === "receivables" || metric === "inventory") {
    return Prisma.sql`l.debit - l.credit`;
  }
  if (metric === "payables") {
    return Prisma.sql`l.credit - l.debit`;
  }
  return Prisma.sql`l.credit - l.debit`;
}

function lineCondition(metric: string): Prisma.Sql {
  if (metric === "sales" || metric === "daily-sales" || metric === "sales-month") {
    return Prisma.sql`a.account_type = 'revenue'`;
  }
  if (metric === "purchases" || metric === "inventory") {
    return Prisma.sql`a.account_subtype = 'inventory'`;
  }
  if (metric === "expenses") {
    return Prisma.sql`a.account_type = 'expense' AND a.account_subtype IS DISTINCT FROM 'cost_of_sales'`;
  }
  if (metric === "gross-profit") {
    return Prisma.sql`(a.account_type = 'revenue' OR a.account_subtype = 'cost_of_sales')`;
  }
  if (metric === "net-profit") {
    return Prisma.sql`(a.account_type = 'revenue' OR a.account_type = 'expense')`;
  }
  if (metric === "cash" || metric === "collections") {
    return Prisma.sql`a.account_subtype IN ('cash', 'bank')`;
  }
  if (metric === "receivables") {
    return Prisma.sql`a.account_subtype = 'receivable'`;
  }
  if (metric === "payables") {
    return Prisma.sql`a.account_subtype = 'payable'`;
  }
  return Prisma.sql`a.account_type = 'revenue' AND EXISTS (
    SELECT 1 FROM journal_lines ar
    INNER JOIN accounts ara ON ara.id = ar.account_id
    WHERE ar.journal_entry_id = j.id AND ara.account_subtype = 'receivable' AND ar.debit > 0
  )`;
}

function branchFilter(scope: BranchScope): Prisma.Sql {
  if (scope.type === "company") {
    return Prisma.sql`TRUE`;
  }
  if (scope.branchIds.length === 0) {
    return Prisma.sql`FALSE`;
  }
  return Prisma.sql`l.branch_id IN (${Prisma.join(scope.branchIds.map((id) => Prisma.sql`CAST(${id} AS uuid)`))})`;
}

function money(value: string | undefined): bigint {
  if (!value || !/^-?\d+(\.\d+)?$/.test(value.trim())) {
    return 0n;
  }
  const negative = value.trim().startsWith("-");
  const absolute = value.trim().replace("-", "");
  const [whole, fraction = ""] = absolute.split(".");
  const parsed = parseMoney(`${whole}.${(fraction + "0000").slice(0, 4)}`);
  return negative ? -parsed : parsed;
}

function openInvoice(invoice: { grandTotal: { toFixed(digits: number): string }; allocations: { amount: { toFixed(digits: number): string } }[] }) {
  return parseMoney(invoice.grandTotal.toFixed(4)) - invoice.allocations.reduce((total, row) => total + parseMoney(row.amount.toFixed(4)), 0n);
}

function agingBucket(due: string, asOf: string): "current" | "days1To30" | "days31To60" | "days61To90" | "over90" {
  if (due >= asOf) return "current";
  const days = Math.round((Date.parse(`${asOf}T00:00:00.000Z`) - Date.parse(`${due}T00:00:00.000Z`)) / 86_400_000);
  if (days <= 30) return "days1To30";
  if (days <= 60) return "days31To60";
  if (days <= 90) return "days61To90";
  return "over90";
}

function namedDetail(metric: string, rows: { name: string; amount: string; occurredAt: string }[]): DashboardDetail {
  return {
    metric,
    kind: "money",
    total: formatMoneyUnits(rows.reduce((total, row) => total + parseMoney(row.amount), 0n)),
    rows: rows.map((row) => ({ id: row.name, label: row.name, amount: row.amount, occurredAt: row.occurredAt })),
  };
}

function calendarDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function emptyOperations(): DashboardSummary["operations"] {
  return {
    pendingApprovals: 0,
    activeProjects: 0,
    lowStockAlerts: 0,
    overdueInvoices: 0,
    stockAvailability: 0,
    pendingTransfers: 0,
    activeInstallations: 0,
    dailyClosingStatus: "none",
  };
}

function emptySummary(preset: DashboardSummary["preset"], timeZone: string, from: string, to: string): DashboardSummary {
  return {
    currency: "NGN",
    preset,
    timeZone,
    from,
    to,
    kpis: {
      totalSales: ZERO,
      totalPurchases: ZERO,
      grossProfit: ZERO,
      totalExpenses: ZERO,
      salesToday: ZERO,
      salesThisMonth: ZERO,
      netProfit: ZERO,
      cashAndBank: ZERO,
      accountsReceivable: ZERO,
      accountsPayable: ZERO,
      inventoryValuation: ZERO,
      cashCollections: ZERO,
      creditSales: ZERO,
      operatingExpenses: ZERO,
      dailySales: ZERO,
    },
    salesVsPurchases: [],
    monthlyRevenue: [],
    monthlyExpenses: [],
    branchPerformance: [],
    cashFlow: [],
    revenueByProductCategory: [],
    customerDebtAging: [],
    supplierLiabilityAging: [],
    inventoryByCategory: [],
    projectProfitability: [],
    topSellingProducts: [],
    recentTransactions: [],
    operations: emptyOperations(),
  };
}
