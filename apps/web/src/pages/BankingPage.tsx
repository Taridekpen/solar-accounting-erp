import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { MoneyValue } from "@/components/ui/money-value";
import { PageLoader } from "@/components/ui/page-loader";
import { useAuth } from "@/features/auth/auth-context";
import {
  fetchBankAccounts,
  fetchBankStatements,
  fetchCashBook,
  fetchCashBookJournal,
  fetchCashDrawers,
} from "@/features/banking/api";

function sumMoney(values: string[]) {
  return values.reduce((sum, value) => sum + Number(value), 0).toFixed(4);
}

export function BankingPage() {
  const { session } = useAuth();
  const [section, setSection] = useState<"accounts" | "cash-book" | "statements">("accounts");
  const [journalId, setJournalId] = useState<string | null>(null);
  const canTransfer = session?.permissions.includes("banking.transfer") ?? false;
  const accounts = useQuery({ queryKey: ["bank-accounts"], queryFn: fetchBankAccounts });
  const drawers = useQuery({ queryKey: ["cash-drawers"], queryFn: fetchCashDrawers });
  const cashBook = useQuery({ queryKey: ["cash-book"], queryFn: fetchCashBook, enabled: section === "cash-book" });
  const statements = useQuery({ queryKey: ["bank-statements"], queryFn: fetchBankStatements, enabled: section === "statements" });
  const journal = useQuery({
    queryKey: ["cash-book-journal", journalId],
    queryFn: () => fetchCashBookJournal(journalId ?? ""),
    enabled: Boolean(journalId),
  });
  const journalTotals = useMemo(() => {
    if (!journal.data) return { debit: "0.0000", credit: "0.0000" };
    return {
      debit: sumMoney(journal.data.lines.map((line) => line.debit)),
      credit: sumMoney(journal.data.lines.map((line) => line.credit)),
    };
  }, [journal.data]);

  return (
    <section className="space-y-4">
      <Breadcrumbs items={[{ label: "Banking" }]} />
      <div>
        <h1 className="text-xl font-semibold">Banking</h1>
        <p className="text-sm text-muted">Bank balances, the cash book, and statement matching come from posted journals.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant={section === "accounts" ? "primary" : "secondary"} onClick={() => setSection("accounts")}>Accounts</Button>
        <Button variant={section === "cash-book" ? "primary" : "secondary"} onClick={() => setSection("cash-book")}>Cash book</Button>
        <Button variant={section === "statements" ? "primary" : "secondary"} onClick={() => setSection("statements")}>Statements</Button>
      </div>
      {accounts.isError ? <ErrorState message="Banking could not be loaded." /> : null}
      {section === "accounts" && (accounts.isLoading || drawers.isLoading) ? <PageLoader label="Loading banking…" /> : null}
      {section === "accounts" && !accounts.isLoading && !drawers.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-4">
            <h2 className="font-medium">Bank accounts</h2>
            {(accounts.data?.length ?? 0) === 0 ? <EmptyState title="No bank accounts" description="Each bank account maps to a general ledger account." /> : (
              <ul className="space-y-2 text-sm">
                {accounts.data?.map((account) => (
                  <li key={account.id} className="flex items-center justify-between gap-3">
                    <span>{account.accountName} · {account.maskedAccountNumber} · {account.accountCode}</span>
                    <MoneyValue amount={account.bookBalance} />
                  </li>
                ))}
              </ul>
            )}
            {canTransfer ? <p className="text-sm text-muted">Transfers and deposits are available for this sign-in.</p> : null}
          </Card>
          <Card className="space-y-3 p-4">
            <h2 className="font-medium">Cash drawers</h2>
            {(drawers.data?.length ?? 0) === 0 ? <EmptyState title="No cash drawers" description="Drawers and petty cash use the posted cash accounts." /> : (
              <ul className="space-y-2 text-sm">
                {drawers.data?.map((drawer) => (
                  <li key={drawer.id} className="flex items-center justify-between gap-3">
                    <span>{drawer.name} · {drawer.accountCode}</span>
                    <MoneyValue amount={drawer.bookBalance} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}
      {section === "cash-book" && cashBook.isLoading ? <PageLoader label="Loading cash book…" /> : null}
      {section === "cash-book" && cashBook.isError ? <ErrorState message="The cash book could not be loaded." onRetry={() => void cashBook.refetch()} /> : null}
      {section === "cash-book" && !cashBook.isLoading && !cashBook.isError ? (
        <Card className="space-y-4 p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-4">
            <p>Opening <MoneyValue amount={cashBook.data?.opening ?? "0.0000"} /></p>
            <p>Receipts <MoneyValue amount={cashBook.data?.receipts ?? "0.0000"} /></p>
            <p>Payments <MoneyValue amount={cashBook.data?.payments ?? "0.0000"} /></p>
            <p>Closing <MoneyValue amount={cashBook.data?.closing ?? "0.0000"} /></p>
          </div>
          {(cashBook.data?.lines.length ?? 0) === 0 ? (
            <EmptyState title="No cash book lines" description="Receipts and payments appear after a journal is posted." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-canvas text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 font-medium">Branch</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 text-right font-medium">Debit</th>
                    <th className="px-3 py-2 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {cashBook.data?.lines.map((line) => (
                    <tr
                      key={line.id}
                      className="cursor-pointer border-t border-line transition-colors hover:bg-canvas/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      tabIndex={0}
                      role="button"
                      onClick={() => setJournalId(line.journalId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setJournalId(line.journalId);
                        }
                      }}
                    >
                      <td className="px-3 py-2">{line.date}</td>
                      <td className="px-3 py-2">{line.accountCode}</td>
                      <td className="px-3 py-2">{line.branchName}</td>
                      <td className="px-3 py-2">{line.description || "—"}</td>
                      <td className="px-3 py-2">{line.sourceType}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(line.debit) > 0 ? <MoneyValue amount={line.debit} /> : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(line.credit) > 0 ? <MoneyValue amount={line.credit} /> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
      {section === "statements" && statements.isLoading ? <PageLoader label="Loading statements…" /> : null}
      {section === "statements" && !statements.isLoading ? (
        <Card className="p-4">
          {(statements.data?.length ?? 0) === 0 ? <EmptyState title="No statements" description="A draft statement can be matched to posted bank lines and then locked." /> : (
            <ul className="space-y-2 text-sm">
              {statements.data?.map((statement) => (
                <li key={statement.id}>{statement.accountName} · {statement.periodStart} to {statement.periodEnd} · {statement.status}</li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Modal
        open={Boolean(journalId)}
        onOpenChange={(open) => {
          if (!open) setJournalId(null);
        }}
        title={journal.data?.journalNumber ?? "Journal"}
        description={journal.data?.description ?? "Posted journal lines for this cash book entry."}
      >
        {journal.isLoading ? <PageLoader label="Loading journal…" className="py-8" /> : null}
        {journal.isError ? (
          <ErrorState message="This journal could not be loaded." onRetry={() => void journal.refetch()} />
        ) : null}
        {journal.data ? (
          <div className="space-y-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Accounting date</dt>
                <dd className="font-medium">{journal.data.accountingDate}</dd>
              </div>
              <div>
                <dt className="text-muted">Type</dt>
                <dd className="font-medium">{journal.data.sourceDocumentType}</dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="font-medium">{journal.data.status}</dd>
              </div>
              {journal.data.postedAt ? (
                <div>
                  <dt className="text-muted">Posted at</dt>
                  <dd className="font-medium">{new Date(journal.data.postedAt).toLocaleString()}</dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-muted">Description</dt>
                <dd className="font-medium">{journal.data.description}</dd>
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
                  {journal.data.lines.map((line) => (
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
                      <MoneyValue amount={journalTotals.debit} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <MoneyValue amount={journalTotals.credit} />
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setJournalId(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
