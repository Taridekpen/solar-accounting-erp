import { useQuery } from "@tanstack/react-query";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { MoneyValue } from "@/components/ui/money-value";
import { fetchClosingPeriods, fetchDailyClosing } from "@/features/closing/api";

const FIGURES = [
  ["sales", "Sales"],
  ["cashReceipts", "Cash receipts"],
  ["bankCollections", "Bank collections"],
  ["posCollections", "POS collections"],
  ["creditSales", "Credit sales"],
  ["expenses", "Expenses"],
  ["refunds", "Refunds"],
  ["bookCash", "Book cash"],
  ["countedCash", "Counted cash"],
  ["cashDifference", "Cash difference"],
] as const;

export function ClosingPage() {
  const periods = useQuery({ queryKey: ["closing", "periods"], queryFn: fetchClosingPeriods });
  const daily = useQuery({ queryKey: ["closing", "daily"], queryFn: () => fetchDailyClosing("2027-01-01") });

  return (
    <section className="space-y-4">
      <Breadcrumbs items={[{ label: "Closing" }]} />
      <div>
        <h1 className="text-xl font-semibold">Daily closing and fiscal periods</h1>
        <p className="text-sm text-muted">Period status and the daily report come from the accounting records.</p>
      </div>
      {periods.isError || daily.isError ? <ErrorState message="The closing records could not be loaded." /> : null}
      {daily.data ? (
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">{daily.data.branchName} · {daily.data.businessDate}</h2>
          <p className="text-sm text-muted">Status {daily.data.status}. Inventory exceptions {daily.data.report.inventoryExceptions}. Pending approvals {daily.data.report.pendingApprovals}.</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {FIGURES.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3 border-t border-line py-2">
                <dt>{label}</dt>
                <dd><MoneyValue amount={daily.data?.report[key] ?? "0.0000"} /></dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}
      {periods.data ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted"><tr><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tasks</th></tr></thead>
            <tbody>
              {periods.data.map((period) => (
                <tr key={period.id} className="border-t border-line">
                  <td className="px-4 py-3">{period.startDate}</td>
                  <td className="px-4 py-3">{period.endDate}</td>
                  <td className="px-4 py-3">{period.status}</td>
                  <td className="px-4 py-3">{period.tasks.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </section>
  );
}
