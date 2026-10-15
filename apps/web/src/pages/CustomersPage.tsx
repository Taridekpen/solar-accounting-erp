import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useActionSuccess } from "@/hooks/use-action-success";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MoneyValue } from "@/components/ui/money-value";
import { PageLoader } from "@/components/ui/page-loader";
import { fetchBranches } from "@/features/organization/api";
import { createCustomer, fetchCustomers, fetchStatement, updateCustomer, type CustomerRecord } from "@/features/sales/api";

const schema = z.object({
  customerType: z.enum(["individual", "corporate"]),
  name: z.string().trim().min(2, "Enter the customer name"),
  branchId: z.string().uuid("Select a branch"),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  billingAddress: z.string().trim().optional(),
  creditLimit: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Enter a decimal amount").optional(),
  paymentTermsDays: z.coerce.number().int().min(0),
});

type CustomerForm = z.infer<typeof schema>;

export function CustomersPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const queryClient = useQueryClient();
  const customers = useQuery({ queryKey: ["customers", search], queryFn: () => fetchCustomers(search) });
  const branches = useQuery({ queryKey: ["branches", "customer-form"], queryFn: () => fetchBranches("") });
  const statement = useQuery({
    queryKey: ["customer-statement", statementId],
    queryFn: () => fetchStatement(statementId ?? ""),
    enabled: Boolean(statementId),
  });
  const form = useForm<CustomerForm>({
    resolver: zodResolver(schema),
    defaultValues: { customerType: "individual", name: "", branchId: "", phone: "", email: "", billingAddress: "", creditLimit: "0.0000", paymentTermsDays: 30 },
  });
  const save = useMutation({
    mutationFn: (values: CustomerForm) => {
      const body = {
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        billingAddress: values.billingAddress || undefined,
        creditLimit: values.creditLimit || "0.0000",
        paymentTermsDays: values.paymentTermsDays,
      };
      return editing
        ? updateCustomer(editing.id, body)
        : createCustomer({ ...body, customerType: values.customerType, branchId: values.branchId });
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const saveOk = useActionSuccess(save);
  const rows = customers.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Customers" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <Button onClick={() => { setEditing(null); setFormError(null); form.reset(); setOpen(true); }}>+ Add Customer</Button>
      </div>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers" aria-label="Search customers" />
      {customers.isError ? <ErrorState message="Customers could not be loaded." onRetry={() => void customers.refetch()} /> : null}
      {customers.isLoading ? <PageLoader label="Loading customers…" /> : null}
      {!customers.isLoading && customers.data && rows.length === 0 ? (
        <Card><EmptyState title="No customers" description="Add a customer before creating a quotation or invoice." /></Card>
      ) : null}
      {!customers.isLoading && rows.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 text-right font-medium">Credit limit</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer: CustomerRecord) => (
                <tr key={customer.id} className="border-t border-line">
                  <td className="px-4 py-3">{customer.name}</td>
                  <td className="px-4 py-3">{customer.customerCode}</td>
                  <td className="px-4 py-3 capitalize">{customer.customerType}</td>
                  <td className="px-4 py-3">{customer.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={customer.creditLimit} /></td>
                  <td className="px-4 py-3">
                    <button type="button" className="mr-3 text-primary" onClick={() => {
                      setEditing(customer);
                      setFormError(null);
                      form.reset({
                        customerType: customer.customerType,
                        name: customer.name,
                        branchId: customer.branchIds[0] ?? "",
                        phone: customer.phone ?? "",
                        email: customer.email ?? "",
                        billingAddress: customer.billingAddress ?? "",
                        creditLimit: customer.creditLimit,
                        paymentTermsDays: customer.paymentTermsDays,
                      });
                      setOpen(true);
                    }}>Edit</button>
                    <button type="button" className="text-primary" onClick={() => setStatementId(customer.id)}>Statement</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      <Modal open={open} title={editing ? "Edit customer" : "Add customer"} onOpenChange={setOpen}>
        <form className="space-y-3" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
          <label className="block text-sm">Type
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" disabled={Boolean(editing)} {...form.register("customerType")}>
              <option value="individual">Individual</option>
              <option value="corporate">Corporate</option>
            </select>
          </label>
          <label className="block text-sm">Name
            <Input className="mt-1" {...form.register("name")} />
          </label>
          <label className="block text-sm">Branch
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" disabled={Boolean(editing)} {...form.register("branchId")}>
              <option value="">Select a branch</option>
              {(branches.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Phone<Input className="mt-1" {...form.register("phone")} /></label>
          <label className="block text-sm">Email<Input className="mt-1" {...form.register("email")} /></label>
          <label className="block text-sm">Billing address<Input className="mt-1" {...form.register("billingAddress")} /></label>
          <label className="block text-sm">Credit limit<Input className="mt-1" {...form.register("creditLimit")} /></label>
          <label className="block text-sm">Payment terms (days)<Input className="mt-1" type="number" {...form.register("paymentTermsDays")} /></label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          {form.formState.errors.name ? <p className="text-sm text-rose-600">{form.formState.errors.name.message}</p> : null}
          <ActionButton type="submit" pending={save.isPending} success={saveOk}>Save customer</ActionButton>
        </form>
      </Modal>
      <Modal open={Boolean(statementId)} title="Customer statement" onOpenChange={(next) => { if (!next) setStatementId(null); }}>
        {statement.data ? (
          <div className="space-y-3 text-sm">
            <p>Outstanding <MoneyValue amount={statement.data.outstandingBalance} /></p>
            <p>Overdue <MoneyValue amount={statement.data.overdueBalance} /></p>
            <p>Accounts receivable <MoneyValue amount={statement.data.accountsReceivable} /></p>
            <p>Current {statement.data.aging.current} · 1–30 {statement.data.aging.days1To30} · 31–60 {statement.data.aging.days31To60} · 61–90 {statement.data.aging.days61To90} · Over 90 {statement.data.aging.over90}</p>
            {statement.data.invoices.length === 0 ? <p className="text-muted">No posted invoices.</p> : statement.data.invoices.map((invoice) => (
              <p key={invoice.id}>{invoice.invoiceNumber} · open <MoneyValue amount={invoice.openBalance} /></p>
            ))}
          </div>
        ) : <PageLoader label="Loading statement…" className="border-0 py-10 shadow-none" />}
      </Modal>
    </div>
  );
}
