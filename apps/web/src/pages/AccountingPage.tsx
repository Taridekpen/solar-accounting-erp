import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { formatMoney } from "@solar/shared";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ActionButton, ActionTextButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useActionSuccess, useKeyedActionSuccess } from "@/hooks/use-action-success";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MoneyValue } from "@/components/ui/money-value";
import { PageLoader } from "@/components/ui/page-loader";
import { useAuth } from "@/features/auth/auth-context";
import {
  approveJournal,
  createManualJournal,
  fetchAccounts,
  fetchReview,
  fetchTrialBalance,
  importOpeningBalances,
  reverseJournal,
  type JournalRow,
} from "@/features/accounting/api";

const money = z.string().regex(/^\d+(\.\d{1,4})?$/, "Enter a decimal amount");
const journalSchema = z.object({
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  description: z.string().trim().min(2, "Enter a description"),
  branchId: z.string().uuid("Choose a branch"),
  debitAccountId: z.string().uuid("Choose a debit account"),
  creditAccountId: z.string().uuid("Choose a credit account"),
  amount: money,
});
const reversalSchema = z.object({
  journalId: z.string().uuid("Choose a journal"),
  reason: z.string().trim().min(2, "Enter a reason"),
});
const openingSchema = journalSchema.extend({
  detailKind: z.enum(["cash", "bank", "inventory", "customer_invoice", "supplier_bill", "fixed_asset", "depreciation", "loan", "equity"]),
  detailAccountCode: z.string().min(2),
  detailAmount: money,
});

type JournalForm = z.infer<typeof journalSchema>;
type ReversalForm = z.infer<typeof reversalSchema>;
type OpeningForm = z.infer<typeof openingSchema>;

export function AccountingPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const review = useQuery({ queryKey: ["accounting-review"], queryFn: fetchReview });
  const trial = useQuery({ queryKey: ["trial-balance"], queryFn: fetchTrialBalance });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const journalForm = useForm<JournalForm>({ resolver: zodResolver(journalSchema) });
  const reversalForm = useForm<ReversalForm>({ resolver: zodResolver(reversalSchema) });
  const openingForm = useForm<OpeningForm>({ resolver: zodResolver(openingSchema) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["accounting-review"] });
    await queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };
  const createJournal = useMutation({
    mutationFn: (values: JournalForm) =>
      createManualJournal({
        accountingDate: values.accountingDate,
        description: values.description,
        lines: [
          { accountId: values.debitAccountId, branchId: values.branchId, debit: values.amount, credit: "0" },
          { accountId: values.creditAccountId, branchId: values.branchId, debit: "0", credit: values.amount },
        ],
      }),
    onSuccess: refresh,
  });
  const approve = useMutation({ mutationFn: approveJournal, onSuccess: refresh });
  const reverse = useMutation({
    mutationFn: (values: ReversalForm) => reverseJournal(values.journalId, values.reason),
    onSuccess: refresh,
  });
  const opening = useMutation({
    mutationFn: (values: OpeningForm) =>
      importOpeningBalances({
        accountingDate: values.accountingDate,
        description: values.description,
        lines: [
          { accountId: values.debitAccountId, branchId: values.branchId, debit: values.amount, credit: "0" },
          { accountId: values.creditAccountId, branchId: values.branchId, debit: "0", credit: values.amount },
        ],
        details: [{ kind: values.detailKind, accountCode: values.detailAccountCode, amount: values.detailAmount, branchId: values.branchId }],
      }),
    onSuccess: refresh,
  });
  const createJournalOk = useActionSuccess(createJournal);
  const reverseOk = useActionSuccess(reverse);
  const openingOk = useActionSuccess(opening);
  const approveFx = useKeyedActionSuccess(approve);
  const postable = (accounts.data ?? []).filter((account) => account.isPostable && !account.isControlAccount && account.isActive);

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Accounting" }]} />
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>
        <p className="text-sm text-muted">
          Trial balance {trial.data ? `${formatMoney(trial.data.totalDebit)} / ${formatMoney(trial.data.totalCredit)}` : "…"}
          {trial.data?.balanced ? " · balanced" : ""}
        </p>
      </div>
      {review.isError ? <ErrorState message="The accounting workspace could not be loaded." onRetry={() => void review.refetch()} /> : null}
      {review.isLoading ? <PageLoader label="Loading accounting…" /> : null}
      {!review.isLoading ? (
      <div className="grid gap-4 lg:grid-cols-2">
        <Queue title="Recently posted" rows={review.data?.posted ?? []} />
        <Queue title="Manual journal requests" rows={review.data?.manualRequests ?? []} onApprove={(id) => approve.mutate(id)} approveFx={approveFx} />
        <Queue title="Reversal requests" rows={review.data?.reversalRequests ?? []} onApprove={(id) => approve.mutate(id)} approveFx={approveFx} />
        <Queue title="Closed-period adjustments" rows={review.data?.closedPeriodAdjustments ?? []} onApprove={(id) => approve.mutate(id)} approveFx={approveFx} />
        <AttemptList title="Failed posting attempts" rows={review.data?.failedAttempts ?? []} />
        <AttemptList title="Suspicious entries" rows={review.data?.suspicious ?? []} />
      </div>
      ) : null}
      {approve.error ? <p className="text-sm text-rose-600">{approve.error.message}</p> : null}
      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">Manual journal</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={journalForm.handleSubmit((values) => createJournal.mutate(values))}>
          <Input type="date" aria-label="Accounting date" {...journalForm.register("accountingDate")} />
          <Input aria-label="Description" placeholder="Description" {...journalForm.register("description")} />
          <BranchSelect branches={session?.branches ?? []} register={journalForm.register("branchId")} />
          <AccountSelect label="Debit account" accounts={postable} register={journalForm.register("debitAccountId")} />
          <AccountSelect label="Credit account" accounts={postable} register={journalForm.register("creditAccountId")} />
          <Input aria-label="Amount" placeholder="0.0000" {...journalForm.register("amount")} />
          <ActionButton type="submit" pending={createJournal.isPending} success={createJournalOk}>Submit for approval</ActionButton>
        </form>
        {createJournal.error ? <p className="text-sm text-rose-600">{createJournal.error.message}</p> : null}
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">Reversal</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={reversalForm.handleSubmit((values) => reverse.mutate(values))}>
          <select className="h-10 rounded-lg border border-line bg-card px-3 text-sm" aria-label="Journal" {...reversalForm.register("journalId")}>
            <option value="">Posted journal</option>
            {(review.data?.posted ?? []).map((journal) => (
              <option key={journal.id} value={journal.id}>{journal.journalNumber}</option>
            ))}
          </select>
          <Input aria-label="Reversal reason" placeholder="Reason" {...reversalForm.register("reason")} />
          <ActionButton type="submit" pending={reverse.isPending} success={reverseOk}>Reverse journal</ActionButton>
        </form>
        {reverse.error ? <p className="text-sm text-rose-600">{reverse.error.message}</p> : null}
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">Opening balances</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={openingForm.handleSubmit((values) => opening.mutate(values))}>
          <Input type="date" aria-label="Opening date" {...openingForm.register("accountingDate")} />
          <Input aria-label="Opening description" placeholder="Description" {...openingForm.register("description")} />
          <BranchSelect branches={session?.branches ?? []} register={openingForm.register("branchId")} />
          <AccountSelect label="Debit account" accounts={accounts.data ?? []} register={openingForm.register("debitAccountId")} />
          <AccountSelect label="Credit account" accounts={accounts.data ?? []} register={openingForm.register("creditAccountId")} />
          <Input aria-label="Opening amount" placeholder="Amount" {...openingForm.register("amount")} />
          <select className="h-10 rounded-lg border border-line bg-card px-3 text-sm" aria-label="Detail kind" {...openingForm.register("detailKind")}>
            {["cash", "bank", "inventory", "customer_invoice", "supplier_bill", "fixed_asset", "depreciation", "loan", "equity"].map((kind) => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
          <Input aria-label="Detail account code" placeholder="Account code" {...openingForm.register("detailAccountCode")} />
          <Input aria-label="Detail amount" placeholder="Detail amount" {...openingForm.register("detailAmount")} />
          <ActionButton type="submit" pending={opening.isPending} success={openingOk}>Import opening balance</ActionButton>
        </form>
        {opening.error ? <p className="text-sm text-rose-600">{opening.error.message}</p> : null}
      </Card>
    </div>
  );
}

function Queue({
  title,
  rows,
  onApprove,
  approveFx,
}: {
  title: string;
  rows: JournalRow[];
  onApprove?: (id: string) => void;
  approveFx?: { isPendingFor: (key: string) => boolean; isSuccessFor: (key: string) => boolean };
}) {
  const [viewing, setViewing] = useState<JournalRow | null>(null);
  const totals = useMemo(() => {
    if (!viewing) return { debit: "0.0000", credit: "0.0000" };
    let debit = 0;
    let credit = 0;
    for (const line of viewing.lines) {
      debit += Number(line.debit) || 0;
      credit += Number(line.credit) || 0;
    }
    return { debit: debit.toFixed(4), credit: credit.toFixed(4) };
  }, [viewing]);

  return (
    <Card className="p-4">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.length === 0 ? <li className="text-muted">None</li> : null}
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3">
            <span>{row.journalNumber} · {row.description}</span>
            <span className="flex shrink-0 items-center gap-3">
              <ActionTextButton onClick={() => setViewing(row)}>View</ActionTextButton>
              {onApprove && row.status === "pending_approval" ? (
                <ActionTextButton
                  pending={approveFx?.isPendingFor(row.id)}
                  success={approveFx?.isSuccessFor(row.id)}
                  onClick={() => onApprove(row.id)}
                >
                  Approve
                </ActionTextButton>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <Modal
        open={Boolean(viewing)}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
        title={viewing ? viewing.journalNumber : "Journal"}
        description={viewing?.description ?? "Journal lines"}
      >
        {viewing ? (
          <div className="space-y-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Accounting date</dt>
                <dd className="font-medium">{viewing.accountingDate}</dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="font-medium">{viewing.status}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">Description</dt>
                <dd className="font-medium">{viewing.description}</dd>
              </div>
              {viewing.closedPeriodAdjustment ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted">Closed-period adjustment</dt>
                  <dd className="font-medium">Yes</dd>
                </div>
              ) : null}
              {viewing.reason ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted">Reason</dt>
                  <dd className="font-medium">{viewing.reason}</dd>
                </div>
              ) : null}
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
                  {viewing.lines.map((line) => (
                    <tr key={line.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        {[line.accountCode, line.accountName].filter(Boolean).join(" ") || line.accountId}
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
                    <td className="px-3 py-2 text-right tabular-nums"><MoneyValue amount={totals.debit} /></td>
                    <td className="px-3 py-2 text-right tabular-nums"><MoneyValue amount={totals.credit} /></td>
                    <td className="px-3 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setViewing(null)}>
                Close
              </Button>
              {onApprove && viewing.status === "pending_approval" ? (
                <ActionButton
                  type="button"
                  pending={approveFx?.isPendingFor(viewing.id)}
                  success={approveFx?.isSuccessFor(viewing.id)}
                  onClick={() => {
                    onApprove(viewing.id);
                    setViewing(null);
                  }}
                >
                  Approve
                </ActionButton>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}

function AttemptList({ title, rows }: { title: string; rows: Array<{ id: string; reason: string }> }) {
  return (
    <Card className="p-4">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.length === 0 ? <li className="text-muted">None</li> : null}
        {rows.map((row) => <li key={row.id}>{row.reason}</li>)}
      </ul>
    </Card>
  );
}

function BranchSelect({ branches, register }: { branches: Array<{ id: string; name: string }>; register: UseFormRegisterReturn }) {
  return (
    <select className="h-10 rounded-lg border border-line bg-card px-3 text-sm" aria-label="Branch" {...register}>
      <option value="">Branch</option>
      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
    </select>
  );
}

function AccountSelect({ label, accounts, register }: { label: string; accounts: Array<{ id: string; accountCode: string; accountName: string }>; register: UseFormRegisterReturn }) {
  return (
    <select className="h-10 rounded-lg border border-line bg-card px-3 text-sm" aria-label={label} {...register}>
      <option value="">{label}</option>
      {accounts.map((account) => <option key={account.id} value={account.id}>{account.accountCode} {account.accountName}</option>)}
    </select>
  );
}
