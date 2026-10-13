import { useQuery } from "@tanstack/react-query";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { MoneyValue } from "@/components/ui/money-value";
import { PageLoader } from "@/components/ui/page-loader";
import { fetchPayrollOutstanding, fetchSalarySummaries } from "@/features/payroll/api";

export function PayrollPage() {
  const summaries = useQuery({ queryKey: ["payroll", "summaries"], queryFn: fetchSalarySummaries });
  const outstanding = useQuery({ queryKey: ["payroll", "outstanding"], queryFn: fetchPayrollOutstanding });

  return (
    <section className="space-y-4">
      <Breadcrumbs items={[{ label: "Payroll" }]} />
      <div>
        <h1 className="text-xl font-semibold">Payroll summaries</h1>
        <p className="text-sm text-muted">Approved external payroll summaries and the salaries payable outstanding.</p>
      </div>
      {summaries.isError || outstanding.isError ? <ErrorState message="Payroll could not be loaded." /> : null}
      {summaries.isLoading || outstanding.isLoading ? <PageLoader label="Loading payroll…" /> : null}
      {!outstanding.isLoading && outstanding.data ? (
        <Card className="space-y-2 p-4">
          <p className="text-sm text-muted">Outstanding salaries payable</p>
          <p className="text-lg font-medium"><MoneyValue amount={outstanding.data.totalOutstanding} /></p>
          <p className="text-sm text-muted">Control account <MoneyValue amount={outstanding.data.control} /></p>
        </Card>
      ) : null}
      {!summaries.isLoading && summaries.data && summaries.data.length === 0 ? (
        <Card><EmptyState title="No payroll summaries" description="Accountants enter an approved summary from the external payroll process." /></Card>
      ) : null}
      {!summaries.isLoading && summaries.data && summaries.data.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {summaries.data.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3">{row.summaryNumber}</td>
                  <td className="px-4 py-3">{row.branchName ?? "—"}</td>
                  <td className="px-4 py-3">{row.periodStart} to {row.periodEnd}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.grossAmount} /></td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.netAmount} /></td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.outstanding} /></td>
                  <td className="px-4 py-3">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </section>
  );
}
