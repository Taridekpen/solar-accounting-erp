import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MoneyValue } from "@/components/ui/money-value";
import { PageLoader } from "@/components/ui/page-loader";
import { fetchBranches } from "@/features/organization/api";
import { createSupplier, fetchSupplierStatement, fetchSuppliers, updateSupplier, type SupplierRecord } from "@/features/procurement/api";

const schema = z.object({
  businessName: z.string().trim().min(2, "Enter the supplier name"),
  branchId: z.string().uuid("Select a branch"),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  address: z.string().trim().optional(),
  paymentTermsDays: z.coerce.number().int().min(0),
  bankName: z.string().trim().optional(),
  accountName: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
});

type SupplierForm = z.infer<typeof schema>;

export function SuppliersPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SupplierRecord | null>(null);
  const queryClient = useQueryClient();
  const suppliers = useQuery({ queryKey: ["suppliers", search], queryFn: () => fetchSuppliers(search) });
  const branches = useQuery({ queryKey: ["branches", "supplier-form"], queryFn: () => fetchBranches("") });
  const statement = useQuery({
    queryKey: ["supplier-statement", statementId],
    queryFn: () => fetchSupplierStatement(statementId ?? ""),
    enabled: Boolean(statementId),
  });
  const form = useForm<SupplierForm>({
    resolver: zodResolver(schema),
    defaultValues: { businessName: "", branchId: "", phone: "", email: "", address: "", paymentTermsDays: 30, bankName: "", accountName: "", accountNumber: "" },
  });
  const save = useMutation({
    mutationFn: (values: SupplierForm) => {
      const body = {
        businessName: values.businessName,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        paymentTermsDays: values.paymentTermsDays,
        bankName: values.bankName || undefined,
        accountName: values.accountName || undefined,
        accountNumber: values.accountNumber || undefined,
      };
      return editing
        ? updateSupplier(editing.id, body)
        : createSupplier({ ...body, branchId: values.branchId });
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const rows = suppliers.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Suppliers" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <Button onClick={() => { setEditing(null); setFormError(null); form.reset(); setOpen(true); }}>+ Add Supplier</Button>
      </div>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search suppliers" aria-label="Search suppliers" />
      {suppliers.isError ? <ErrorState message="Suppliers could not be loaded." onRetry={() => void suppliers.refetch()} /> : null}
      {suppliers.isLoading ? <PageLoader label="Loading suppliers…" /> : null}
      {!suppliers.isLoading && suppliers.data && rows.length === 0 ? (
        <Card><EmptyState title="No suppliers" description="Add a supplier before raising a purchase order." /></Card>
      ) : null}
      {!suppliers.isLoading && rows.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Bank</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((supplier) => (
                <tr key={supplier.id} className="border-t border-line">
                  <td className="px-4 py-3">{supplier.businessName}</td>
                  <td className="px-4 py-3">{supplier.supplierCode}</td>
                  <td className="px-4 py-3">{supplier.phone ?? "—"}</td>
                  <td className="px-4 py-3">{supplier.bankAccountMask ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button type="button" className="mr-3 text-primary" onClick={() => {
                      setEditing(supplier);
                      setFormError(null);
                      form.reset({
                        businessName: supplier.businessName,
                        branchId: supplier.branchIds[0] ?? "",
                        phone: supplier.phone ?? "",
                        email: supplier.email ?? "",
                        address: supplier.address ?? "",
                        paymentTermsDays: supplier.paymentTermsDays,
                        bankName: "",
                        accountName: "",
                        accountNumber: "",
                      });
                      setOpen(true);
                    }}>Edit</button>
                    <button type="button" className="text-primary" onClick={() => setStatementId(supplier.id)}>Statement</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      <Modal open={open} title={editing ? "Edit supplier" : "Add supplier"} onOpenChange={setOpen}>
        <form className="space-y-3" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
          <label className="block text-sm">Name<Input className="mt-1" {...form.register("businessName")} /></label>
          <label className="block text-sm">Branch
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" disabled={Boolean(editing)} {...form.register("branchId")}>
              <option value="">Select a branch</option>
              {(branches.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Phone<Input className="mt-1" {...form.register("phone")} /></label>
          <label className="block text-sm">Email<Input className="mt-1" {...form.register("email")} /></label>
          <label className="block text-sm">Address<Input className="mt-1" {...form.register("address")} /></label>
          <label className="block text-sm">Payment terms (days)<Input className="mt-1" type="number" {...form.register("paymentTermsDays")} /></label>
          <label className="block text-sm">Bank name<Input className="mt-1" {...form.register("bankName")} /></label>
          <label className="block text-sm">Account name<Input className="mt-1" {...form.register("accountName")} /></label>
          <label className="block text-sm">Account number<Input className="mt-1" {...form.register("accountNumber")} /></label>
          {editing?.bankAccountMask ? <p className="text-xs text-muted">Stored account ends {editing.bankAccountMask}. Enter a new number only to replace it.</p> : null}
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          {form.formState.errors.businessName ? <p className="text-sm text-rose-600">{form.formState.errors.businessName.message}</p> : null}
          <Button type="submit" disabled={save.isPending}>Save supplier</Button>
        </form>
      </Modal>
      <Modal open={Boolean(statementId)} title="Supplier statement" onOpenChange={(next) => { if (!next) setStatementId(null); }}>
        {statement.data ? (
          <div className="space-y-3 text-sm">
            <p>Outstanding <MoneyValue amount={statement.data.outstandingBalance} /></p>
            <p>Overdue <MoneyValue amount={statement.data.overdueBalance} /></p>
            <p>Accounts payable <MoneyValue amount={statement.data.accountsPayable} /></p>
            <p>Bank {statement.data.bankAccountMask ?? "—"}</p>
            {statement.data.bills.length === 0 ? <p>No posted bills.</p> : statement.data.bills.map((bill) => (
              <p key={bill.id}>{bill.billNumber} · {bill.supplierInvoiceNumber} · open <MoneyValue amount={bill.openBalance} /></p>
            ))}
          </div>
        ) : <PageLoader label="Loading statement…" className="border-0 py-10 shadow-none" />}
      </Modal>
    </div>
  );
}
