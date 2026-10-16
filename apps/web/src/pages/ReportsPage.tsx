import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { MoneyValue } from "@/components/ui/money-value";
import { PageLoader } from "@/components/ui/page-loader";
import {
  downloadReport,
  fetchBalanceSheet,
  fetchCashFlow,
  fetchLedger,
  fetchProfitAndLoss,
  fetchTrialBalance,
} from "@/features/reports/api";
import { useKeyedAsyncAction } from "@/hooks/use-action-success";

const TRIAL_AS_OF = "2026-12-31";
const TRIAL_FROM = `${TRIAL_AS_OF.slice(0, 4)}-01-01`;
const PERIOD_FROM = "2026-12-01";
const PERIOD_TO = "2026-12-31";

type ReportTab = "trial" | "profit" | "balance" | "cashflow";

export function ReportsPage() {
  const [report, setReport] = useState<ReportTab>("trial");
  const [ledgerAccount, setLedgerAccount] = useState<{
    accountId: string;
    accountCode: string;
    accountName: string;
  } | null>(null);
  const trial = useQuery({ queryKey: ["reports", "trial-balance"], queryFn: () => fetchTrialBalance(TRIAL_AS_OF) });
  const profit = useQuery({
    queryKey: ["reports", "profit"],
    queryFn: () => fetchProfitAndLoss(PERIOD_FROM, PERIOD_TO),
    enabled: report === "profit",
  });
  const balance = useQuery({
    queryKey: ["reports", "balance-sheet"],
    queryFn: () => fetchBalanceSheet(TRIAL_AS_OF),
    enabled: report === "balance",
  });
  const cashFlow = useQuery({
    queryKey: ["reports", "cash-flow"],
    queryFn: () => fetchCashFlow(PERIOD_FROM, PERIOD_TO),
    enabled: report === "cashflow",
  });
  const ledger = useQuery({
    queryKey: ["reports", "ledger", ledgerAccount?.accountId, TRIAL_FROM, TRIAL_AS_OF],
    queryFn: () => fetchLedger(ledgerAccount?.accountId ?? "", TRIAL_FROM, TRIAL_AS_OF),
    enabled: Boolean(ledgerAccount),
  });

  const current =
    report === "trial"
      ? trial.data
      : report === "profit"
        ? profit.data
        : report === "balance"
          ? balance.data
          : cashFlow.data;
  const error =
    report === "trial"
      ? trial.isError
      : report === "profit"
        ? profit.isError
        : report === "balance"
          ? balance.isError
          : cashFlow.isError;
  const loading =
    report === "trial"
      ? trial.isLoading
      : report === "profit"
        ? profit.isLoading
        : report === "balance"
          ? balance.isLoading
          : cashFlow.isLoading;
  const exportFx = useKeyedAsyncAction();
  const reportPath =
    report === "trial"
      ? `trial-balance?asOf=${TRIAL_AS_OF}`
      : report === "profit"
        ? `profit-and-loss?from=${PERIOD_FROM}&to=${PERIOD_TO}`
        : report === "balance"
          ? `balance-sheet?asOf=${TRIAL_AS_OF}`
          : `cash-flow?from=${PERIOD_FROM}&to=${PERIOD_TO}`;
  const baseName =
    report === "trial"
      ? "trial-balance"
      : report === "profit"
        ? "profit-and-loss"
        : report === "balance"
          ? "balance-sheet"
          : "cash-flow";

  const cashFlowEmpty =
    cashFlow.data &&
    cashFlow.data.operating.every((row) => Number(row.amount) === 0) &&
    cashFlow.data.investing.every((row) => Number(row.amount) === 0) &&
    cashFlow.data.financing.every((row) => Number(row.amount) === 0) &&
    Number(cashFlow.data.netChange) === 0 &&
    Number(cashFlow.data.cashChange) === 0;

  const balanceEmpty =
    balance.data &&
    balance.data.sections.every((section) => Number(section.total) === 0) &&
    Number(balance.data.assets) === 0 &&
    Number(balance.data.liabilitiesAndEquity) === 0;

  return (
    <section className="space-y-4 print:space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Breadcrumbs items={[{ label: "Reports" }]} />
        <div className="flex flex-wrap gap-2">
          <Button variant={report === "trial" ? "primary" : "secondary"} onClick={() => setReport("trial")}>
            Trial balance
          </Button>
          <Button variant={report === "profit" ? "primary" : "secondary"} onClick={() => setReport("profit")}>
            Profit and loss
          </Button>
          <Button variant={report === "balance" ? "primary" : "secondary"} onClick={() => setReport("balance")}>
            Balance sheet
          </Button>
          <Button variant={report === "cashflow" ? "primary" : "secondary"} onClick={() => setReport("cashflow")}>
            Cash flow
          </Button>
          {(["csv", "pdf", "xlsx"] as const).map((format) => (
            <ActionButton
              key={format}
              variant="secondary"
              pending={exportFx.isPendingFor(format)}
              success={exportFx.isSuccessFor(format)}
              onClick={() =>
                void exportFx.run(format, () =>
                  downloadReport(
                    `/reports/${reportPath}&format=${format}`,
                    `${baseName}.${format === "xlsx" ? "xlsx" : format}`,
                  ),
                )
              }
            >
              {format === "csv" ? "CSV" : format === "pdf" ? "PDF" : "Spreadsheet"}
            </ActionButton>
          ))}
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>
      <div>
        <h1 className="text-xl font-semibold">{current?.title ?? "Financial reports"}</h1>
        <p className="text-sm text-muted">
          {current
            ? `${current.companyName} · ${current.period} · ${current.scope} · ${current.currency}`
            : "Figures come from posted journals."}
        </p>
        {current ? (
          <p className="text-xs text-muted">
            Generated {current.generatedAt} · Prepared by {current.preparedBy}
          </p>
        ) : null}
      </div>
      {error ? <ErrorState message="The report could not be loaded." /> : null}
      {loading ? <PageLoader label="Loading report…" /> : null}
      {!loading && report === "trial" && trial.data && trial.data.rows.length === 0 ? (
        <Card>
          <EmptyState title="No posted balances" description="The trial balance lists each account once journals are posted." />
        </Card>
      ) : null}
      {!loading && report === "trial" && trial.data && trial.data.rows.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Debit balance</th>
                <th className="px-4 py-3 text-right">Credit balance</th>
              </tr>
            </thead>
            <tbody>
              {trial.data.rows.map((row) => (
                <tr
                  key={row.accountId}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-canvas/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary print:cursor-default"
                  tabIndex={0}
                  role="button"
                  onClick={() =>
                    setLedgerAccount({
                      accountId: row.accountId,
                      accountCode: row.accountCode,
                      accountName: row.accountName,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setLedgerAccount({
                        accountId: row.accountId,
                        accountCode: row.accountCode,
                        accountName: row.accountName,
                      });
                    }
                  }}
                >
                  <td className="px-4 py-3">{row.accountCode}</td>
                  <td className="px-4 py-3">{row.accountName}</td>
                  <td className="px-4 py-3 text-right">
                    <MoneyValue amount={row.debit} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MoneyValue amount={row.credit} />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line font-medium">
                <td className="px-4 py-3" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-3 text-right">
                  <MoneyValue amount={trial.data.totalDebit} />
                </td>
                <td className="px-4 py-3 text-right">
                  <MoneyValue amount={trial.data.totalCredit} />
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      ) : null}
      {!loading && report === "profit" && profit.data ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <tbody>
              {profit.data.lines.map((line) => (
                <tr key={line.code} className="border-t border-line">
                  <td className="px-4 py-3">{line.label}</td>
                  <td className="px-4 py-3 text-right">
                    <MoneyValue amount={line.amounts.actual ?? "0.0000"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      {!loading && report === "balance" && balanceEmpty ? (
        <Card>
          <EmptyState title="No balance sheet figures" description="Balances appear after journals are posted." />
        </Card>
      ) : null}
      {!loading && report === "balance" && balance.data && !balanceEmpty ? (
        <div className="space-y-4">
          {balance.data.sections.map((section) => (
            <Card key={section.title} className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">{section.title}</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={`${section.title}-${row.label}`} className="border-t border-line">
                      <td className="px-4 py-3">{row.label}</td>
                      <td className="px-4 py-3 text-right">
                        <MoneyValue amount={row.amount} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-line font-medium">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">
                      <MoneyValue amount={section.total} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </Card>
          ))}
          <Card className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <tbody>
                <tr className="border-t border-line font-medium">
                  <td className="px-4 py-3">Assets</td>
                  <td className="px-4 py-3 text-right">
                    <MoneyValue amount={balance.data.assets} />
                  </td>
                </tr>
                <tr className="border-t border-line font-medium">
                  <td className="px-4 py-3">Liabilities and equity</td>
                  <td className="px-4 py-3 text-right">
                    <MoneyValue amount={balance.data.liabilitiesAndEquity} />
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="px-4 py-3 text-sm text-muted">
              {balance.data.balanced ? "Balance sheet is balanced." : "Balance sheet is not balanced — review interbranch clearing and postings."}
            </p>
          </Card>
        </div>
      ) : null}
      {!loading && report === "cashflow" && cashFlowEmpty ? (
        <Card>
          <EmptyState title="No cash flow figures" description="Cash flow lines appear after journals are posted in the period." />
        </Card>
      ) : null}
      {!loading && report === "cashflow" && cashFlow.data && !cashFlowEmpty ? (
        <div className="space-y-4">
          {(
            [
              ["Operating", cashFlow.data.operating],
              ["Investing", cashFlow.data.investing],
              ["Financing", cashFlow.data.financing],
            ] as const
          ).map(([title, rows]) => (
            <Card key={title} className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">{title}</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${title}-${row.label}`} className="border-t border-line">
                      <td className="px-4 py-3">{row.label}</td>
                      <td className="px-4 py-3 text-right">
                        <MoneyValue amount={row.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
          <Card className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <tbody>
                <tr className="border-t border-line font-medium">
                  <td className="px-4 py-3">Net change</td>
                  <td className="px-4 py-3 text-right">
                    <MoneyValue amount={cashFlow.data.netChange} />
                  </td>
                </tr>
                <tr className="border-t border-line font-medium">
                  <td className="px-4 py-3">Change in cash and bank</td>
                  <td className="px-4 py-3 text-right">
                    <MoneyValue amount={cashFlow.data.cashChange} />
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      <Modal
        open={Boolean(ledgerAccount)}
        onOpenChange={(open) => {
          if (!open) setLedgerAccount(null);
        }}
        title={ledgerAccount ? `${ledgerAccount.accountCode} ${ledgerAccount.accountName}` : "Account ledger"}
        description={`Movements from ${TRIAL_FROM} to ${TRIAL_AS_OF}.`}
      >
        {ledger.isLoading ? <PageLoader label="Loading ledger…" className="py-8" /> : null}
        {ledger.isError ? (
          <ErrorState message="This account ledger could not be loaded." onRetry={() => void ledger.refetch()} />
        ) : null}
        {ledger.data ? (
          <div className="space-y-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Opening</dt>
                <dd className="font-medium">
                  <MoneyValue amount={ledger.data.opening} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Closing</dt>
                <dd className="font-medium">
                  <MoneyValue amount={ledger.data.closing} />
                </dd>
              </div>
            </dl>
            {ledger.data.rows.length === 0 ? (
              <EmptyState title="No movements" description="This account has no posted lines in the selected period." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-canvas text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Journal</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">Branch</th>
                      <th className="px-3 py-2 text-right font-medium">Debit</th>
                      <th className="px-3 py-2 text-right font-medium">Credit</th>
                      <th className="px-3 py-2 text-right font-medium">Running</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.data.rows.map((row) => (
                      <tr key={`${row.journalId}-${row.date}-${row.running}`} className="border-t border-line">
                        <td className="px-3 py-2">{row.date}</td>
                        <td className="px-3 py-2">{row.journalNumber}</td>
                        <td className="px-3 py-2">{row.description || "—"}</td>
                        <td className="px-3 py-2">{row.branchName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(row.debit) > 0 ? <MoneyValue amount={row.debit} /> : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(row.credit) > 0 ? <MoneyValue amount={row.credit} /> : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <MoneyValue amount={row.running} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setLedgerAccount(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
