import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ActionButton, ActionTextButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useActionSuccess, useKeyedActionSuccess } from "@/hooks/use-action-success";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MoneyValue } from "@/components/ui/money-value";
import { PageLoader } from "@/components/ui/page-loader";
import { fetchAccounts } from "@/features/accounting/api";
import { useAuth } from "@/features/auth/auth-context";
import {
  approveExpense,
  createExpense,
  fetchExpenseCategories,
  fetchExpenseReceipt,
  fetchExpenseReports,
  fetchExpenses,
  payExpense,
  rejectExpense,
  submitExpense,
  type ExpenseRecord,
} from "@/features/expenses/api";
import { fetchBranches } from "@/features/organization/api";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function ExpensesPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const canCreate = session?.permissions.includes("expenses.create") ?? false;
  const canApprove = session?.permissions.includes("expenses.approve") ?? false;
  const canPay = session?.permissions.includes("expenses.pay") ?? false;

  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"list" | "reports">("list");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expenseDate, setExpenseDate] = useState("2026-07-16");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0.0000");
  const [receiptName, setReceiptName] = useState("");
  const [receiptBase64, setReceiptBase64] = useState("");
  const [preview, setPreview] = useState<{
    url: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<ExpenseRecord | null>(null);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payError, setPayError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const expenses = useQuery({ queryKey: ["expenses"], queryFn: fetchExpenses });
  const categories = useQuery({ queryKey: ["expense-categories"], queryFn: fetchExpenseCategories });
  const reports = useQuery({ queryKey: ["expense-reports"], queryFn: fetchExpenseReports });
  const branches = useQuery({ queryKey: ["branches", "expenses"], queryFn: () => fetchBranches("") });
  const accounts = useQuery({
    queryKey: ["accounts", "expense-pay"],
    queryFn: fetchAccounts,
    enabled: Boolean(payTarget),
  });
  const cashAccounts = (accounts.data ?? []).filter(
    (account) => account.isActive && account.isPostable && account.accountSubtype === "cash",
  );

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["expenses"] });
    await queryClient.invalidateQueries({ queryKey: ["expense-reports"] });
  };

  const resetForm = () => {
    setFormError(null);
    setBranchId("");
    setCategoryId("");
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    setAmount("");
    setTaxAmount("0.0000");
    setReceiptName("");
    setReceiptBase64("");
  };

  const save = useMutation({
    mutationFn: () => {
      if (!receiptName.trim() || !receiptBase64.trim()) {
        throw new Error("Attach a receipt before saving the expense.");
      }
      return createExpense({
        branchId,
        categoryId,
        expenseDate,
        description,
        amount,
        taxAmount,
        receiptName,
        receiptBase64,
      });
    },
    onSuccess: async () => {
      setOpen(false);
      resetForm();
      await refresh();
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const saveOk = useActionSuccess(save);

  const submit = useMutation({
    mutationFn: (id: string) => submitExpense(id),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (error: Error) => setActionError(error.message),
  });
  const approve = useMutation({
    mutationFn: (id: string) => approveExpense(id),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (error: Error) => setActionError(error.message),
  });
  const reject = useMutation({
    mutationFn: (id: string) => rejectExpense(id),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (error: Error) => setActionError(error.message),
  });
  const pay = useMutation({
    mutationFn: () => {
      if (!payTarget) throw new Error("Select an expense to pay.");
      return payExpense(payTarget.id, { paymentAccountId, paymentDate });
    },
    onSuccess: async () => {
      setPayError(null);
      setPayTarget(null);
      setPaymentAccountId("");
      setActionError(null);
      await refresh();
    },
    onError: (error: Error) => setPayError(error.message),
  });
  const submitFx = useKeyedActionSuccess(submit);
  const approveFx = useKeyedActionSuccess(approve);
  const rejectFx = useKeyedActionSuccess(reject);
  const payOk = useActionSuccess(pay);

  const openReceipt = useMutation({
    mutationFn: (id: string) => fetchExpenseReceipt(id),
    onSuccess: ({ blob, fileName, mimeType }) => {
      setPreviewError(null);
      if (preview?.url) URL.revokeObjectURL(preview.url);
      const url = URL.createObjectURL(blob);
      if (mimeType.startsWith("image/")) {
        setPreview({ url, fileName, mimeType });
        return;
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (error: Error) => setPreviewError(error.message),
  });

  return (
    <section className="space-y-4">
      <Breadcrumbs items={[{ label: "Expenses" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted">Requests, approvals, and payments from the ledger.</p>
        </div>
        {canCreate ? (
          <Button
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
          >
            New expense
          </Button>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button variant={section === "list" ? "primary" : "secondary"} onClick={() => setSection("list")}>Expenses</Button>
        <Button variant={section === "reports" ? "primary" : "secondary"} onClick={() => setSection("reports")}>Reports</Button>
      </div>
      {expenses.isError ? <ErrorState message="Expenses could not be loaded." /> : null}
      {previewError ? <ErrorState message={previewError} /> : null}
      {actionError ? <p className="text-sm text-rose-600">{actionError}</p> : null}
      {section === "list" && expenses.isLoading ? <PageLoader label="Loading expenses…" /> : null}
      {section === "list" && !expenses.isLoading && (expenses.data?.data.length ?? 0) === 0 ? (
        <Card><EmptyState title="No expenses" description="A draft stores the receipt. Approval posts the accrual, and a different user records payment." /></Card>
      ) : null}
      {section === "list" && !expenses.isLoading && (expenses.data?.data.length ?? 0) > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Receipt</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.data?.data.map((row) => {
                const isCreator = Boolean(userId && row.createdByUserId === userId);
                return (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3">{row.expenseNumber}</td>
                    <td className="px-4 py-3">{row.categoryName}</td>
                    <td className="px-4 py-3 capitalize">{row.status.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3 text-right"><MoneyValue amount={row.total} /></td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={openReceipt.isPending}
                        onClick={() => {
                          setPreviewError(null);
                          openReceipt.mutate(row.id);
                        }}
                      >
                        {row.receiptName || "View"}
                      </Button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {row.status === "draft" && canCreate && isCreator ? (
                          <ActionTextButton
                            pending={submitFx.isPendingFor(row.id)}
                            success={submitFx.isSuccessFor(row.id)}
                            onClick={() => {
                              setActionError(null);
                              submit.mutate(row.id);
                            }}
                          >
                            Submit
                          </ActionTextButton>
                        ) : null}
                        {row.status === "pending_approval" && canApprove && !isCreator ? (
                          <>
                            <ActionTextButton
                              pending={approveFx.isPendingFor(row.id)}
                              success={approveFx.isSuccessFor(row.id)}
                              onClick={() => {
                                setActionError(null);
                                approve.mutate(row.id);
                              }}
                            >
                              Approve
                            </ActionTextButton>
                            <ActionTextButton
                              className="text-rose-600"
                              pending={rejectFx.isPendingFor(row.id)}
                              success={rejectFx.isSuccessFor(row.id)}
                              onClick={() => {
                                setActionError(null);
                                reject.mutate(row.id);
                              }}
                            >
                              Reject
                            </ActionTextButton>
                          </>
                        ) : null}
                        {row.status === "approved" && canPay && !isCreator ? (
                          <ActionTextButton
                            onClick={() => {
                              setPayError(null);
                              setPaymentAccountId("");
                              setPaymentDate(new Date().toISOString().slice(0, 10));
                              setPayTarget(row);
                            }}
                          >
                            Pay
                          </ActionTextButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}
      {section === "reports" && reports.isLoading ? <PageLoader label="Loading expense reports…" /> : null}
      {section === "reports" && !reports.isLoading ? (
        <Card className="space-y-3 p-4 text-sm">
          <p>Pending {reports.data?.pending.length ?? 0}</p>
          <p>Unpaid approved {reports.data?.unpaid.length ?? 0}</p>
          {(reports.data?.byCategory.length ?? 0) === 0 ? <EmptyState title="No posted expenses" description="Category totals appear after an expense is approved." /> : (
            <ul>{reports.data?.byCategory.map((row) => <li key={row.name}>{row.name} · <MoneyValue amount={row.amount} /></li>)}</ul>
          )}
        </Card>
      ) : null}
      <Modal open={open} title="New expense" onOpenChange={setOpen}>
        <div className="space-y-3">
          <label className="block text-sm">Branch
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" aria-label="Expense branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Select a branch</option>
              {(branches.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Category
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" aria-label="Expense category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Select a category</option>
              {(categories.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Date<Input className="mt-1" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label>
          <label className="block text-sm">Description<Input className="mt-1" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="block text-sm">Amount<Input className="mt-1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label className="block text-sm">Tax<Input className="mt-1" value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)} /></label>
          <label className="block text-sm">
            Receipt
            <input
              className="mt-1 block w-full text-sm"
              aria-label="Expense receipt"
              type="file"
              accept="image/*,.pdf,.txt,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  setReceiptName("");
                  setReceiptBase64("");
                  return;
                }
                setFormError(null);
                setReceiptName(file.name);
                setReceiptBase64("");
                void fileToBase64(file)
                  .then((base64) => setReceiptBase64(base64))
                  .catch(() => {
                    setReceiptName("");
                    setReceiptBase64("");
                    setFormError("The receipt could not be read.");
                  });
              }}
            />
          </label>
          {receiptName ? (
            <p className="text-xs text-muted">
              {receiptBase64 ? `Attached: ${receiptName}` : `Reading ${receiptName}…`}
            </p>
          ) : (
            <p className="text-xs text-muted">A receipt file is required.</p>
          )}
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <ActionButton
            onClick={() => save.mutate()}
            pending={save.isPending}
            success={saveOk}
            disabled={!receiptName || !receiptBase64 || save.isPending}
          >
            Save draft
          </ActionButton>
        </div>
      </Modal>

      <Modal
        open={Boolean(payTarget)}
        title={payTarget ? `Pay ${payTarget.expenseNumber}` : "Pay expense"}
        onOpenChange={(next) => {
          if (!next) {
            setPayTarget(null);
            setPayError(null);
            setPaymentAccountId("");
          }
        }}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Total <MoneyValue amount={payTarget?.total ?? "0"} /> · payment posts from a cash account.
          </p>
          <label className="block text-sm">Cash account
            <select
              className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3"
              aria-label="Payment cash account"
              value={paymentAccountId}
              onChange={(event) => setPaymentAccountId(event.target.value)}
            >
              <option value="">Select a cash account</option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountCode} · {account.accountName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Payment date
            <Input
              className="mt-1"
              type="date"
              aria-label="Payment date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </label>
          {payError ? <p className="text-sm text-rose-600">{payError}</p> : null}
          <ActionButton
            onClick={() => pay.mutate()}
            pending={pay.isPending}
            success={payOk}
            disabled={!paymentAccountId || !paymentDate || pay.isPending}
          >
            Record payment
          </ActionButton>
        </div>
      </Modal>

      <Modal
        open={Boolean(preview)}
        onOpenChange={(next) => {
          if (!next) {
            if (preview?.url) URL.revokeObjectURL(preview.url);
            setPreview(null);
          }
        }}
        title={preview?.fileName ?? "Receipt"}
        description="Stored receipt image."
      >
        {preview ? (
          <div className="space-y-3">
            <img src={preview.url} alt={preview.fileName} className="max-h-[28rem] w-full rounded-lg object-contain" />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (preview?.url) URL.revokeObjectURL(preview.url);
                  setPreview(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
