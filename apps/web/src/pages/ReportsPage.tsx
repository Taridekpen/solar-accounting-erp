import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { MoneyValue } from "@/components/ui/money-value";
import { downloadReport, fetchProfitAndLoss, fetchTrialBalance } from "@/features/reports/api";

export function ReportsPage() {
  const [report, setReport] = useState<"trial" | "profit">("trial");
  const trial = useQuery({ queryKey: ["reports", "trial-balance"], queryFn: () => fetchTrialBalance("2026-12-31") });
  const profit = useQuery({ queryKey: ["reports", "profit"], queryFn: () => fetchProfitAndLoss("2026-12-01", "2026-12-31"), enabled: report === "profit" });
  const current = report === "trial" ? trial.data : profit.data;
  const error = report === "trial" ? trial.isError : profit.isError;

  return (
    <section className="space-y-4 print:space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Breadcrumbs items={[{ label: "Reports" }]} />
        <div className="flex flex-wrap gap-2">
          <Button variant={report === "trial" ? "primary" : "secondary"} onClick={() => setReport("trial")}>Trial balance</Button>
          <Button variant={report === "profit" ? "primary" : "secondary"} onClick={() => setReport("profit")}>Profit and loss</Button>
          <Button variant="secondary" onClick={() => downloadReport(`/reports/${report === "trial" ? "trial-balance?asOf=2026-12-31" : "profit-and-loss?from=2026-12-01&to=2026-12-31"}&format=csv`, report === "trial" ? "trial-balance.csv" : "profit-and-loss.csv")}>CSV</Button>
          <Button variant="secondary" onClick={() => downloadReport(`/reports/${report === "trial" ? "trial-balance?asOf=2026-12-31" : "profit-and-loss?from=2026-12-01&to=2026-12-31"}&format=pdf`, report === "trial" ? "trial-balance.pdf" : "profit-and-loss.pdf")}>PDF</Button>
          <Button variant="secondary" onClick={() => downloadReport(`/reports/${report === "trial" ? "trial-balance?asOf=2026-12-31" : "profit-and-loss?from=2026-12-01&to=2026-12-31"}&format=xlsx`, report === "trial" ? "trial-balance.xlsx" : "profit-and-loss.xlsx")}>Spreadsheet</Button>
          <Button variant="secondary" onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      <div>
        <h1 className="text-xl font-semibold">{current?.title ?? "Financial reports"}</h1>
        <p className="text-sm text-muted">{current ? `${current.companyName} · ${current.period} · ${current.scope} · ${current.currency}` : "Figures come from posted journals."}</p>
        {current ? <p className="text-xs text-muted">Generated {current.generatedAt} · Prepared by {current.preparedBy}</p> : null}
      </div>
      {error ? <ErrorState message="The report could not be loaded." /> : null}
      {report === "trial" && trial.data && trial.data.rows.length === 0 ? <Card><EmptyState title="No posted balances" description="The trial balance lists each account once journals are posted." /></Card> : null}
      {report === "trial" && trial.data && trial.data.rows.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Account</th><th className="px-4 py-3 text-right">Debit balance</th><th className="px-4 py-3 text-right">Credit balance</th></tr></thead>
            <tbody>
              {trial.data.rows.map((row) => (
                <tr key={row.accountCode} className="border-t border-line">
                  <td className="px-4 py-3">{row.accountCode}</td>
                  <td className="px-4 py-3">{row.accountName}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.debit} /></td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.credit} /></td>
                </tr>
              ))}
              <tr className="border-t border-line font-medium">
                <td className="px-4 py-3" colSpan={2}>Total</td>
                <td className="px-4 py-3 text-right"><MoneyValue amount={trial.data.totalDebit} /></td>
                <td className="px-4 py-3 text-right"><MoneyValue amount={trial.data.totalCredit} /></td>
              </tr>
            </tbody>
          </table>
        </Card>
      ) : null}
      {report === "profit" && profit.data ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <tbody>
              {profit.data.lines.map((line) => (
                <tr key={line.code} className="border-t border-line">
                  <td className="px-4 py-3">{line.label}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={line.amounts.actual ?? "0.0000"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </section>
  );
}
