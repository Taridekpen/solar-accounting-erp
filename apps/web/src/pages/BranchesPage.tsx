import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ActionButton, ActionTextButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useActionSuccess, useKeyedActionSuccess } from "@/hooks/use-action-success";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/page-loader";
import { fetchBranchSettings } from "@/features/admin/api";
import { createBranch, fetchBranches, fetchEmployees, updateBranch, updateBranchStatus, type BranchRecord } from "@/features/organization/api";
import { useUi } from "@/stores/ui-context";

const branchSchema = z.object({
  branchCode: z.string().trim().min(2, "Enter a branch code").max(20),
  name: z.string().trim().min(2, "Enter a branch name"),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  isHeadOffice: z.boolean().optional(),
  managerId: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).optional(),
});

type BranchForm = z.infer<typeof branchSchema>;

export function BranchesPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BranchRecord | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { selectedBranchIds, setSelectedBranchIds } = useUi();
  const branches = useQuery({
    queryKey: ["branches", search],
    queryFn: () => fetchBranches(search),
  });
  const employees = useQuery({ queryKey: ["employees-for-managers"], queryFn: () => fetchEmployees("") });
  const settings = useQuery({
    queryKey: ["branch-settings", settingsId],
    queryFn: () => fetchBranchSettings(settingsId!),
    enabled: Boolean(settingsId),
  });
  const form = useForm<BranchForm>({
    resolver: zodResolver(branchSchema),
    defaultValues: { branchCode: "", name: "", city: "", state: "", address: "", phone: "", email: "", isHeadOffice: false, managerId: "", status: "active" },
  });
  const save = useMutation({
    mutationFn: (values: BranchForm) => {
      const body = {
        name: values.name,
        city: values.city || undefined,
        state: values.state || undefined,
        address: values.address || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        isHeadOffice: values.isHeadOffice || undefined,
        managerId: values.managerId || undefined,
        ...(editing ? { status: values.status || undefined } : {}),
      };
      return editing ? updateBranch(editing.id, body) : createBranch({ ...body, branchCode: values.branchCode });
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const statusChange = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "inactive" }) => updateBranchStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
  });
  const saveOk = useActionSuccess(save);
  const statusFx = useKeyedActionSuccess(statusChange, (vars) => vars.id);

  const rows = (branches.data?.data ?? []).filter((branch) => selectedBranchIds.length === 0 || selectedBranchIds.includes(branch.id));

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Branches" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Branches</h1>
        <Button onClick={() => { setFormError(null); setEditing(null); form.reset(); setOpen(true); }}>+ Add Branch</Button>
      </div>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search branches" aria-label="Search branches" />
      {branches.isError ? <ErrorState message="Branches could not be loaded." onRetry={() => void branches.refetch()} /> : null}
      {branches.isLoading ? <PageLoader label="Loading branches…" /> : null}
      {!branches.isLoading && branches.data && rows.length === 0 ? (
        <Card>
          <EmptyState title="No branches" description="Add a branch to start recording activity for a location." />
        </Card>
      ) : null}
      {!branches.isLoading && rows.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Manager</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((branch) => (
                <BranchRow
                  key={branch.id}
                  branch={branch}
                  onEdit={() => {
                  setFormError(null);
                  setEditing(branch);
                  form.reset({
                    branchCode: branch.branchCode,
                    name: branch.name,
                    city: branch.city ?? "",
                    state: branch.state ?? "",
                    address: branch.address ?? "",
                    phone: branch.phone ?? "",
                    email: branch.email ?? "",
                    isHeadOffice: branch.isHeadOffice,
                    managerId: branch.managerId ?? "",
                    status: branch.status,
                  });
                  setOpen(true);
                }}
                onSettings={() => setSettingsId(branch.id)}
                onToggle={() =>
                  statusChange.mutate({
                    id: branch.id,
                    status: branch.status === "active" ? "inactive" : "active",
                  })
                }
                togglePending={statusFx.isPendingFor(branch.id)}
                toggleSuccess={statusFx.isSuccessFor(branch.id)}
                />
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-sm text-muted">
            Showing {rows.length} of {branches.data?.total ?? rows.length}
          </p>
        </Card>
      ) : null}
      <Modal open={open} onOpenChange={setOpen} title={editing ? "Edit branch" : "Add branch"} description="Branch codes are unique within the company.">
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((values) => {
            setFormError(null);
            save.mutate(values);
          })}
        >
          <Field label="Branch code" error={form.formState.errors.branchCode?.message}>
            <Input {...form.register("branchCode")} disabled={Boolean(editing)} />
          </Field>
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="City">
              <Input {...form.register("city")} />
            </Field>
            <Field label="State">
              <Input {...form.register("state")} />
            </Field>
          </div>
          <Field label="Address">
            <Input {...form.register("address")} />
          </Field>
          <Field label="Manager">
            <select className="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm" {...form.register("managerId")}>
              <option value="">No manager</option>
              {(employees.data?.data ?? []).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName} ({employee.employeeNumber})
                </option>
              ))}
            </select>
          </Field>
          {editing ? (
            <Field label="Operating status">
              <select className="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm" {...form.register("status")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("isHeadOffice")} />
            Head office
          </label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <ActionButton type="submit" pending={save.isPending} success={saveOk}>Save branch</ActionButton>
          </div>
        </form>
      </Modal>
      <Modal open={Boolean(settingsId)} onOpenChange={(next) => !next && setSettingsId(null)} title="Branch settings" description="Warehouses, bank accounts, and expense policy ceilings for this branch.">
        {settings.isError ? <ErrorState message="Branch settings could not be loaded." onRetry={() => void settings.refetch()} /> : null}
        {settings.data ? (
          <div className="space-y-3 text-sm">
            <p>Manager: {settings.data.manager?.name ?? "—"}</p>
            <div>
              <h3 className="font-medium">Warehouses</h3>
              <ul className="mt-1 space-y-1">
                {settings.data.warehouses.map((warehouse) => (
                  <li key={warehouse.id}>{warehouse.name} ({warehouse.warehouseCode}) — {warehouse.warehouseType}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">Bank accounts</h3>
              <ul className="mt-1 space-y-1">
                {settings.data.bankAccounts.length === 0 ? <li className="text-muted">None linked</li> : null}
                {settings.data.bankAccounts.map((account) => (
                  <li key={account.id}>{account.bankName} · {account.accountName} · {account.maskedAccountNumber}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">Expense policies</h3>
              <ul className="mt-1 space-y-1">
                {settings.data.expensePolicies.length === 0 ? <li className="text-muted">No branch-specific policies</li> : null}
                {settings.data.expensePolicies.map((policy) => (
                  <li key={policy.id}>Level {policy.level}: {policy.minAmount} to {policy.maxAmount}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <PageLoader label="Loading branch settings…" className="border-0 py-10 shadow-none" />
        )}
      </Modal>
      <p className="text-sm text-muted">
        Selected in the header: {selectedBranchIds.length === 0 ? "all branches" : selectedBranchIds.length === 1 ? "one branch" : `${selectedBranchIds.length} branches`}.{" "}
        <button type="button" className="text-primary" onClick={() => setSelectedBranchIds([])}>
          Clear selection
        </button>
      </p>
    </div>
  );
}

function BranchRow({
  branch,
  onEdit,
  onSettings,
  onToggle,
  togglePending,
  toggleSuccess,
}: {
  branch: BranchRecord;
  onEdit: () => void;
  onSettings: () => void;
  onToggle: () => void;
  togglePending?: boolean;
  toggleSuccess?: boolean;
}) {
  const location = [branch.city, branch.state].filter(Boolean).join(", ") || "—";
  return (
    <tr className="border-t border-line">
      <td className="px-4 py-3 font-medium">
        {branch.name}
        {branch.isHeadOffice ? <span className="ml-2 text-xs text-muted">Head office</span> : null}
      </td>
      <td className="px-4 py-3">{branch.branchCode}</td>
      <td className="px-4 py-3">{location}</td>
      <td className="px-4 py-3">{branch.managerName ?? "—"}</td>
      <td className="px-4 py-3">
        <span className={branch.status === "active" ? "rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"}>
          {branch.status === "active" ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3">
        <button type="button" className="mr-3 text-primary" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="mr-3 text-primary" onClick={onSettings}>
          Settings
        </button>
        <ActionTextButton className="mr-0" pending={togglePending} success={toggleSuccess} onClick={onToggle}>
          {branch.status === "active" ? "Deactivate" : "Activate"}
        </ActionTextButton>
      </td>
    </tr>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-rose-600">{error}</span> : null}
    </label>
  );
}
