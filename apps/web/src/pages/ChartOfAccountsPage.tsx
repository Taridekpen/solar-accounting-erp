import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "@solar/shared";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { fetchAccounts } from "@/features/accounting/api";

export function ChartOfAccountsPage() {
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Chart of Accounts" }]} />
      <h1 className="text-2xl font-semibold tracking-tight">Chart of Accounts</h1>
      <p className="text-sm text-muted">Balances come from posted journal lines.</p>
      {accounts.isError ? <ErrorState message="The chart of accounts could not be loaded." onRetry={() => void accounts.refetch()} /> : null}
      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Normal balance</th>
              <th className="px-4 py-3 font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {(accounts.data ?? []).map((account) => (
              <tr key={account.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{account.accountCode}</td>
                <td className="px-4 py-3">{account.parentAccountId ? `— ${account.accountName}` : account.accountName}</td>
                <td className="px-4 py-3">{account.accountType}</td>
                <td className="px-4 py-3">{account.normalBalance}</td>
                <td className="px-4 py-3">{formatMoney(account.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
