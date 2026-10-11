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
import { createDepartment, fetchBranches, fetchDepartments } from "@/features/organization/api";

const schema = z.object({
  code: z.string().trim().min(2, "Enter a code"),
  name: z.string().trim().min(2, "Enter a name"),
  branchId: z.string().optional(),
});

type DepartmentForm = z.infer<typeof schema>;

export function DepartmentsPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const departments = useQuery({ queryKey: ["departments", search], queryFn: () => fetchDepartments(search) });
  const branches = useQuery({ queryKey: ["branches", "options"], queryFn: () => fetchBranches() });
  const form = useForm<DepartmentForm>({ resolver: zodResolver(schema), defaultValues: { code: "", name: "", branchId: "" } });
  const create = useMutation({
    mutationFn: (values: DepartmentForm) =>
      createDepartment({ code: values.code, name: values.name, branchId: values.branchId || undefined }),
    onSuccess: async () => {
      setOpen(false);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const rows = departments.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Settings", to: "/settings" }, { label: "Departments" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Departments</h1>
        <Button onClick={() => { setFormError(null); setOpen(true); }}>+ Add Department</Button>
      </div>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search departments" aria-label="Search departments" />
      {departments.isError ? <ErrorState message="Departments could not be loaded." onRetry={() => void departments.refetch()} /> : null}
      {departments.data && rows.length === 0 ? (
        <Card><EmptyState title="No departments" description="Departments can be company-wide or limited to one branch." /></Card>
      ) : null}
      {rows.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((department) => (
                <tr key={department.id} className="border-t border-line">
                  <td className="px-4 py-3">{department.code}</td>
                  <td className="px-4 py-3 font-medium">{department.name}</td>
                  <td className="px-4 py-3">{department.branchName ?? "Company-wide"}</td>
                  <td className="px-4 py-3">{department.status === "active" ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      <Modal open={open} onOpenChange={setOpen} title="Add department" description="Leave the branch blank for a company-wide department.">
        <form className="space-y-3" onSubmit={form.handleSubmit((values) => { setFormError(null); create.mutate(values); })}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Code</span>
            <Input {...form.register("code")} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Name</span>
            <Input {...form.register("name")} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Branch</span>
            <select className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" {...form.register("branchId")}>
              <option value="">Company-wide</option>
              {(branches.data?.data ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>Save department</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
