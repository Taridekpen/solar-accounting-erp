import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MoneyValue } from "@/components/ui/money-value";
import { PageLoader } from "@/components/ui/page-loader";
import { createExpense, fetchExpenseCategories, fetchExpenseReports, fetchExpenses } from "@/features/expenses/api";
import { fetchBranches } from "@/features/organization/api";

export function ExpensesPage() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"list" | "reports">("list");
  const [formError, setFormError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expenseDate, setExpenseDate] = useState("2026-07-16");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0.0000");
  const [receiptName, setReceiptName] = useState("");
  const [receiptBase64, setReceiptBase64] = useState("");
  const queryClient = useQueryClient();
  const expenses = useQuery({ queryKey: ["expenses"], queryFn: fetchExpenses });
  const categories = useQuery({ queryKey: ["expense-categories"], queryFn: fetchExpenseCategories });
  const reports = useQuery({ queryKey: ["expense-reports"], queryFn: fetchExpenseReports });
  const branches = useQuery({ queryKey: ["branches", "expenses"], queryFn: () => fetchBranches("") });
  const save = useMutation({
    mutationFn: () => createExpense({ branchId, categoryId, expenseDate, description, amount, taxAmount, receiptName, receiptBase64 }),
    onSuccess: async () => {
      setOpen(false);
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });

  return (
    <section className="space-y-4">
      <Breadcrumbs items={[{ label: "Expenses" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted">Requests, approvals, and payments from the ledger.</p>
        </div>
        <Button onClick={() => { setFormError(null); setOpen(true); }}>New expense</Button>
      </div>
      <div className="flex gap-2">
        <Button variant={section === "list" ? "primary" : "secondary"} onClick={() => setSection("list")}>Expenses</Button>
        <Button variant={section === "reports" ? "primary" : "secondary"} onClick={() => setSection("reports")}>Reports</Button>
      </div>
      {expenses.isError ? <ErrorState message="Expenses could not be loaded." /> : null}
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
              </tr>
            </thead>
            <tbody>
              {expenses.data?.data.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3">{row.expenseNumber}</td>
                  <td className="px-4 py-3">{row.categoryName}</td>
                  <td className="px-4 py-3 capitalize">{row.status.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.total} /></td>
                </tr>
              ))}
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
          <label className="block text-sm">Receipt
            <input className="mt-1 block w-full text-sm" aria-label="Expense receipt" type="file" onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setReceiptName(file.name);
              const reader = new FileReader();
              reader.onload = () => {
                const result = String(reader.result ?? "");
                setReceiptBase64(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
              };
              reader.readAsDataURL(file);
            }} />
          </label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <Button onClick={() => save.mutate()}>Save draft</Button>
        </div>
      </Modal>
    </section>
  );
}
