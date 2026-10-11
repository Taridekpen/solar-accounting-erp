import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { MoneyValue } from "@/components/ui/money-value";
import { useAuth } from "@/features/auth/auth-context";
import { fetchBankAccounts, fetchBankStatements, fetchCashBook, fetchCashDrawers } from "@/features/banking/api";

export function BankingPage() {
  const { session } = useAuth();
  const [section, setSection] = useState<"accounts" | "cash-book" | "statements">("accounts");
  const canTransfer = session?.permissions.includes("banking.transfer") ?? false;
  const accounts = useQuery({ queryKey: ["bank-accounts"], queryFn: fetchBankAccounts });
  const drawers = useQuery({ queryKey: ["cash-drawers"], queryFn: fetchCashDrawers });
  const cashBook = useQuery({ queryKey: ["cash-book"], queryFn: fetchCashBook, enabled: section === "cash-book" });
  const statements = useQuery({ queryKey: ["bank-statements"], queryFn: fetchBankStatements, enabled: section === "statements" });

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
      {section === "accounts" ? (
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
      {section === "cash-book" ? (
        <Card className="space-y-3 p-4 text-sm">
          <p>Opening <MoneyValue amount={cashBook.data?.opening ?? "0.0000"} /></p>
          <p>Receipts <MoneyValue amount={cashBook.data?.receipts ?? "0.0000"} /></p>
          <p>Payments <MoneyValue amount={cashBook.data?.payments ?? "0.0000"} /></p>
          <p>Closing <MoneyValue amount={cashBook.data?.closing ?? "0.0000"} /></p>
          {(cashBook.data?.lines.length ?? 0) === 0 ? <EmptyState title="No cash book lines" description="Receipts and payments appear after a journal is posted." /> : (
            <ul>{cashBook.data?.lines.map((line) => <li key={line.id}>{line.date} · {line.accountCode} · {line.sourceType}</li>)}</ul>
          )}
        </Card>
      ) : null}
      {section === "statements" ? (
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
    </section>
  );
}
