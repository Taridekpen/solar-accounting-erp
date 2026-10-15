import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { formatMoney } from "@solar/shared";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ActionButton, ActionTextButton } from "@/components/ui/action-button";
import { useActionSuccess, useKeyedActionSuccess } from "@/hooks/use-action-success";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
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
  rows: Array<{ id: string; journalNumber: string; description: string; status: string }>;
  onApprove?: (id: string) => void;
  approveFx?: { isPendingFor: (key: string) => boolean; isSuccessFor: (key: string) => boolean };
}) {
  return (
    <Card className="p-4">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.length === 0 ? <li className="text-muted">None</li> : null}
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3">
            <span>{row.journalNumber} · {row.description}</span>
            {onApprove && row.status === "pending_approval" ? (
              <ActionTextButton
                pending={approveFx?.isPendingFor(row.id)}
                success={approveFx?.isSuccessFor(row.id)}
                onClick={() => onApprove(row.id)}
              >
                Approve
              </ActionTextButton>
            ) : null}
          </li>
        ))}
      </ul>
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
