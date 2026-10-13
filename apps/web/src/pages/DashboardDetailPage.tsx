import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { MoneyValue } from "@/components/ui/money-value";
import { PageLoader } from "@/components/ui/page-loader";
import { fetchDashboardDetails } from "@/services/api-client";
import { useUi } from "@/stores/ui-context";

const TITLES: Record<string, string> = {
  sales: "Sales",
  purchases: "Purchases",
  expenses: "Operating expenses",
  "gross-profit": "Gross profit",
  "net-profit": "Net profit",
  cash: "Cash and bank",
  receivables: "Accounts receivable",
  payables: "Accounts payable",
  inventory: "Inventory valuation",
  collections: "Cash collections",
  "credit-sales": "Credit sales",
  "daily-sales": "Sales today",
  "sales-month": "Sales this month",
  approvals: "Pending approvals",
  projects: "Active installation projects",
  "low-stock": "Low-stock alerts",
  "overdue-invoices": "Overdue customer invoices",
  stock: "Stock availability",
  transfers: "Pending transfers",
  installations: "Active installations",
  "daily-closing": "Daily closing",
  "product-categories": "Revenue by product category",
  "customer-aging": "Customer debt aging",
  "supplier-aging": "Supplier liability aging",
  "inventory-categories": "Inventory by category",
  "project-profit": "Project profitability",
};

export function DashboardDetailPage() {
  const { metric = "" } = useParams();
  const { preset, from, to, selectedBranchIds } = useUi();
  const detail = useQuery({
    queryKey: ["dashboard-detail", metric, preset, from, to, selectedBranchIds.join(",")],
    queryFn: () => fetchDashboardDetails({ metric, preset, from, to }),
    enabled: Boolean(metric) && (preset !== "custom" || Boolean(from && to)),
  });
  const title = TITLES[metric] ?? "Dashboard detail";

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Dashboard", to: "/" }, { label: title }]} />
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <Link to="/" className="text-sm text-primary">Back to dashboard</Link>
      </div>
      {detail.isError ? <ErrorState message="This dashboard detail could not be loaded." onRetry={() => void detail.refetch()} /> : null}
      {detail.isLoading ? <PageLoader label="Loading detail…" /> : null}
      {!detail.isLoading && detail.data?.kind === "empty" ? (
        <EmptyState title="No source records" description="This figure stays empty until its module posts records." />
      ) : null}
      {!detail.isLoading && detail.data && detail.data.kind !== "empty" ? (
        <Card className="overflow-x-auto p-4">
          <p className="text-sm text-muted">
            Total {detail.data.kind === "money" ? <MoneyValue amount={detail.data.total} /> : detail.data.total}
          </p>
          {detail.data.rows.length === 0 ? (
            <EmptyState title="No posted lines" description="Nothing in the selected period and branches contributes to this figure." />
          ) : (
            <table className="mt-3 min-w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {detail.data.rows.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2">{row.occurredAt.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-right">
                      {detail.data?.kind === "money" ? <MoneyValue amount={row.amount} /> : row.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
