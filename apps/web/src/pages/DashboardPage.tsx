import { moneyToChartValue, type DashboardSummary, type MonthAmount, type NamedAmount } from "@solar/shared";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DateRangeFilter, formatBusinessDate } from "@/components/filters/date-range-filter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { MoneyValue } from "@/components/ui/money-value";
import { PageLoader } from "@/components/ui/page-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDashboardSummary, fetchDashboardTransaction } from "@/services/api-client";
import { useUi } from "@/stores/ui-context";

const kpiConfig: {
  key: keyof DashboardSummary["kpis"];
  label: string;
  icon: LucideIcon;
  tone: string;
  metric: string;
}[] = [
  { key: "totalSales", label: "Total Sales", icon: Wallet, tone: "bg-emerald-50 text-emerald-600", metric: "sales" },
  { key: "totalPurchases", label: "Total Purchases", icon: ShoppingBag, tone: "bg-blue-50 text-blue-600", metric: "purchases" },
  { key: "grossProfit", label: "Gross Profit", icon: TrendingUp, tone: "bg-violet-50 text-violet-600", metric: "gross-profit" },
  { key: "totalExpenses", label: "Total Expenses", icon: Receipt, tone: "bg-pink-50 text-pink-600", metric: "expenses" },
];

const positionCards: { key: keyof DashboardSummary["kpis"]; label: string; metric: string }[] = [
  { key: "salesToday", label: "Sales today", metric: "daily-sales" },
  { key: "salesThisMonth", label: "Sales this month", metric: "sales-month" },
  { key: "netProfit", label: "Net profit", metric: "net-profit" },
  { key: "cashAndBank", label: "Cash and bank", metric: "cash" },
  { key: "accountsReceivable", label: "Accounts receivable", metric: "receivables" },
  { key: "accountsPayable", label: "Accounts payable", metric: "payables" },
  { key: "inventoryValuation", label: "Inventory valuation", metric: "inventory" },
];

const branchCards: { key: keyof DashboardSummary["kpis"]; label: string; metric: string }[] = [
  { key: "dailySales", label: "Daily sales", metric: "daily-sales" },
  { key: "cashCollections", label: "Cash collections", metric: "collections" },
  { key: "creditSales", label: "Credit sales", metric: "credit-sales" },
  { key: "accountsReceivable", label: "Outstanding receivables", metric: "receivables" },
  { key: "operatingExpenses", label: "Operating expenses", metric: "expenses" },
];

const emptyCards: { label: string; metric: string; value: (summary: DashboardSummary) => string }[] = [
  { label: "Active installation projects", metric: "projects", value: (summary) => String(summary.operations.activeProjects) },
  { label: "Low-stock alerts", metric: "low-stock", value: (summary) => String(summary.operations.lowStockAlerts) },
  { label: "Overdue customer invoices", metric: "overdue-invoices", value: (summary) => String(summary.operations.overdueInvoices) },
  { label: "Stock availability", metric: "stock", value: (summary) => String(summary.operations.stockAvailability) },
  { label: "Pending transfers", metric: "transfers", value: (summary) => String(summary.operations.pendingTransfers) },
  { label: "Active installations", metric: "installations", value: (summary) => String(summary.operations.activeInstallations) },
  { label: "Daily closing", metric: "daily-closing", value: () => "None" },
];

export function DashboardPage() {
  const { preset, from, to, selectedBranchIds } = useUi();
  const summary = useQuery({
    queryKey: ["dashboard-summary", preset, from, to, selectedBranchIds.join(",")],
    queryFn: () => fetchDashboardSummary({ preset, from, to }),
    enabled: preset !== "custom" || Boolean(from && to),
  });

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted">Figures come from posted ledger activity for the selected period and branches.</p>
        </div>
        <DateRangeFilter
          fromLabel={summary.data ? formatBusinessDate(summary.data.from, summary.data.timeZone) : undefined}
          toLabel={summary.data ? formatBusinessDate(summary.data.to, summary.data.timeZone) : undefined}
        />
      </div>

      {summary.isLoading ? <DashboardSkeleton /> : null}
      {summary.isError ? (
        <ErrorState message="The dashboard summary could not be loaded." onRetry={() => void summary.refetch()} />
      ) : null}
      {summary.data ? <DashboardContent summary={summary.data} /> : null}
    </div>
  );
}

function DashboardContent({ summary }: { summary: DashboardSummary }) {
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const transaction = useQuery({
    queryKey: ["dashboard-transaction", transactionId],
    queryFn: () => fetchDashboardTransaction(transactionId ?? ""),
    enabled: Boolean(transactionId),
  });
  const transactionTotals = useMemo(() => {
    const lines = transaction.data?.lines ?? [];
    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      debit += Number(line.debit) || 0;
      credit += Number(line.credit) || 0;
    }
    return { debit: debit.toFixed(4), credit: credit.toFixed(4) };
  }, [transaction.data]);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiConfig.map((kpi) => (
          <Link key={kpi.key} to={`/dashboard/details/${kpi.metric}`} className="block">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">{kpi.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight" data-testid={`kpi-${kpi.key}`}>
                    <MoneyValue amount={summary.kpis[kpi.key]} />
                  </p>
                  <p className="mt-2 text-xs text-muted">No prior period</p>
                </div>
                <div className={`rounded-xl p-2.5 ${kpi.tone}`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {positionCards.map((card) => (
          <Link key={card.label} to={`/dashboard/details/${card.metric}`} className="block">
            <Card className="p-5">
              <p className="text-sm text-muted">{card.label}</p>
              <p className="mt-2 text-xl font-semibold tracking-tight" data-testid={`kpi-${card.key}`}>
                <MoneyValue amount={summary.kpis[card.key]} />
              </p>
            </Card>
          </Link>
        ))}
        <Link to="/accounting" className="block">
          <Card className="p-5">
            <p className="text-sm text-muted">Pending approvals</p>
            <p className="mt-2 text-xl font-semibold tracking-tight" data-testid="kpi-pendingApprovals">
              {summary.operations.pendingApprovals}
            </p>
          </Card>
        </Link>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-1">
          <h2 className="text-base font-semibold">Sales vs Purchases</h2>
          {summary.salesVsPurchases.length === 0 ? (
            <EmptyState title="No posted activity" description="Sales and purchase totals will appear after journals are posted." />
          ) : (
            <AmountChart
              data={summary.salesVsPurchases.map((point) => ({
                month: point.month,
                sales: moneyToChartValue(point.sales),
                purchases: moneyToChartValue(point.purchases),
              }))}
              series={[{ key: "sales", fill: "#22c55e" }, { key: "purchases", fill: "#2563eb" }]}
            />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold">Top Selling Products</h2>
          {summary.topSellingProducts.length === 0 ? (
            <EmptyState title="No product sales" description="Product rankings will use posted sales lines." />
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Quantity</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {summary.topSellingProducts.map((product) => (
                  <tr key={product.name} className="border-t border-line">
                    <td className="py-3">{product.name}</td>
                    <td className="py-3">{product.quantity}</td>
                    <td className="py-3 text-right">
                      <MoneyValue amount={product.revenue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 text-base font-semibold">Recent Transactions</h2>
          {summary.recentTransactions.length === 0 ? (
            <EmptyState title="No transactions" description="Receipts, invoices, and payments will show here after posting." />
          ) : (
            <ul className="divide-y divide-line">
              {summary.recentTransactions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm transition-colors hover:bg-canvas/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => setTransactionId(item.id)}
                  >
                    <span>
                      <span className="block font-medium">{item.description}</span>
                      <span className="text-muted">{item.type}</span>
                    </span>
                    <span>
                      <MoneyValue amount={item.amount} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Modal
        open={Boolean(transactionId)}
        onOpenChange={(open) => {
          if (!open) setTransactionId(null);
        }}
        title={transaction.data?.journalNumber ?? "Transaction"}
        description={transaction.data?.description ?? "Posted journal lines for this transaction."}
      >
        {transaction.isLoading ? <PageLoader label="Loading transaction…" className="py-8" /> : null}
        {transaction.isError ? (
          <ErrorState message="This transaction could not be loaded." onRetry={() => void transaction.refetch()} />
        ) : null}
        {transaction.data ? (
          <div className="space-y-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Accounting date</dt>
                <dd className="font-medium">{transaction.data.accountingDate}</dd>
              </div>
              <div>
                <dt className="text-muted">Type</dt>
                <dd className="font-medium">{transaction.data.sourceDocumentType}</dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="font-medium">{transaction.data.status}</dd>
              </div>
              {transaction.data.postedAt ? (
                <div>
                  <dt className="text-muted">Posted at</dt>
                  <dd className="font-medium">{new Date(transaction.data.postedAt).toLocaleString()}</dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-muted">Description</dt>
                <dd className="font-medium">{transaction.data.description}</dd>
              </div>
            </dl>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-canvas text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">Debit</th>
                    <th className="px-3 py-2 text-right font-medium">Credit</th>
                    <th className="px-3 py-2 font-medium">Line note</th>
                  </tr>
                </thead>
                <tbody>
                  {transaction.data.lines.map((line) => (
                    <tr key={line.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        {line.accountCode} {line.accountName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(line.debit) > 0 ? <MoneyValue amount={line.debit} /> : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(line.credit) > 0 ? <MoneyValue amount={line.credit} /> : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted">{line.description || "—"}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line font-medium">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <MoneyValue amount={transactionTotals.debit} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <MoneyValue amount={transactionTotals.credit} />
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setTransactionId(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <section className="grid gap-4 xl:grid-cols-2">
        <TrendCard title="Monthly revenue" empty="No revenue in this range" points={summary.monthlyRevenue} />
        <TrendCard title="Monthly expenses" empty="No expenses in this range" points={summary.monthlyExpenses} />
        <Card className="p-5">
          <h2 className="text-base font-semibold">Branch sales</h2>
          {summary.branchPerformance.length === 0 ? (
            <EmptyState title="No branch sales" description="Branch sales appear after revenue is posted to a branch." />
          ) : (
            <AmountChart
              data={summary.branchPerformance.map((point) => ({
                month: point.branchName,
                sales: moneyToChartValue(point.sales),
              }))}
              series={[{ key: "sales", fill: "#22c55e" }]}
            />
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-base font-semibold">Branch profit</h2>
          {summary.branchPerformance.length === 0 ? (
            <EmptyState title="No branch profit" description="Branch profit is revenue minus expenses on posted lines." />
          ) : (
            <AmountChart
              data={summary.branchPerformance.map((point) => ({
                month: point.branchName,
                profit: moneyToChartValue(point.profit),
              }))}
              series={[{ key: "profit", fill: "#7c3aed" }]}
            />
          )}
        </Card>
        <TrendCard title="Cash flow" empty="No cash movement" points={summary.cashFlow} />
        <NamedChart title="Revenue by product category" empty="Nothing to chart" description="Product categories are recorded with sales lines." metric="product-categories" points={summary.revenueByProductCategory} />
        <NamedChart title="Customer debt aging" empty="Nothing to chart" description="Open customer invoices will appear here." metric="customer-aging" points={summary.customerDebtAging} />
        <NamedChart title="Supplier liability aging" empty="Nothing to chart" description="Open supplier bills will appear here." metric="supplier-aging" points={summary.supplierLiabilityAging} />
        <NamedChart title="Inventory by category" empty="Nothing to chart" description="Inventory movement in this period will appear here." metric="inventory-categories" points={summary.inventoryByCategory} />
        <EmptyChart title="Project profitability" body="Installation projects will appear when that module is posted." metric="project-profit" />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Branch activity</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {branchCards.map((card) => (
            <Link key={card.label} to={`/dashboard/details/${card.metric}`} className="block">
              <Card className="p-5">
                <p className="text-sm text-muted">{card.label}</p>
                <p className="mt-2 text-xl font-semibold">
                  <MoneyValue amount={summary.kpis[card.key]} />
                </p>
              </Card>
            </Link>
          ))}
          {emptyCards.map((card) => (
            <Link key={card.metric} to={`/dashboard/details/${card.metric}`} className="block">
              <Card className="p-5">
                <p className="text-sm text-muted">{card.label}</p>
                <p className="mt-2 text-xl font-semibold">{card.value(summary)}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function NamedChart({ title, empty, description, metric, points }: { title: string; empty: string; description: string; metric: string; points: NamedAmount[] }) {
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <Link to={`/dashboard/details/${metric}`} className="text-sm text-primary">Open details</Link>
      </div>
      {points.length === 0 ? (
        <EmptyState title={empty} description={description} />
      ) : (
        <AmountChart
          data={points.map((point) => ({ month: point.name, amount: moneyToChartValue(point.amount) }))}
          series={[{ key: "amount", fill: "#0f766e" }]}
        />
      )}
    </Card>
  );
}

function TrendCard({ title, empty, points }: { title: string; empty: string; points: MonthAmount[] }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {points.length === 0 ? (
        <EmptyState title={empty} description="This chart uses posted journal lines in the selected date range." />
      ) : (
        <AmountChart
          data={points.map((point) => ({ month: point.month, amount: moneyToChartValue(point.amount) }))}
          series={[{ key: "amount", fill: "#2563eb" }]}
        />
      )}
    </Card>
  );
}

function EmptyChart({ title, body, metric }: { title: string; body: string; metric: string }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <EmptyState title="Nothing to chart" description={body} />
      <Link to={`/dashboard/details/${metric}`} className="text-sm text-primary">Open details</Link>
    </Card>
  );
}

function AmountChart({ data, series }: { data: Array<Record<string, string | number>>; series: Array<{ key: string; fill: string }> }) {
  return (
    <div className="mt-4 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip />
          {series.map((item) => (
            <Bar key={item.key} dataKey={item.key} fill={item.fill} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-28" />
      ))}
    </div>
  );
}
