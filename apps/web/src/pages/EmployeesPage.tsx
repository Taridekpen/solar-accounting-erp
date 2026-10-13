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
import { PageLoader } from "@/components/ui/page-loader";
import { createEmployee, fetchBranches, fetchDepartments, fetchEmployees, updateEmployee } from "@/features/organization/api";

const schema = z.object({
  employeeNumber: z.string().trim().min(2, "Enter an employee number"),
  firstName: z.string().trim().min(1, "Enter a first name"),
  lastName: z.string().trim().min(1, "Enter a last name"),
  branchId: z.string().uuid("Choose a branch"),
  departmentId: z.string().optional(),
  jobTitle: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  employmentStatus: z.enum(["active", "inactive", "terminated"]),
});

type EmployeeForm = z.infer<typeof schema>;

export function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [status, setStatus] = useState("active");
  const [userId, setUserId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const employees = useQuery({ queryKey: ["employees", search], queryFn: () => fetchEmployees(search) });
  const branches = useQuery({ queryKey: ["branches", "options"], queryFn: () => fetchBranches() });
  const departments = useQuery({ queryKey: ["departments", "options"], queryFn: () => fetchDepartments() });
  const form = useForm<EmployeeForm>({
    resolver: zodResolver(schema),
    defaultValues: { employeeNumber: "", firstName: "", lastName: "", branchId: "", departmentId: "", jobTitle: "", email: "", employmentStatus: "active" },
  });
  const create = useMutation({
    mutationFn: (values: EmployeeForm) =>
      createEmployee({
        employeeNumber: values.employeeNumber,
        firstName: values.firstName,
        lastName: values.lastName,
        branchId: values.branchId,
        departmentId: values.departmentId || undefined,
        jobTitle: values.jobTitle || undefined,
        email: values.email || undefined,
      }),
    onSuccess: async () => {
      setOpen(false);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const update = useMutation({
    mutationFn: () => updateEmployee(editId!, { employmentStatus: status, userId: userId.trim() || null }),
    onSuccess: async () => {
      setEditId(null);
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const rows = employees.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Settings", to: "/settings" }, { label: "Employees" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <Button onClick={() => { setFormError(null); setOpen(true); }}>+ Add Employee</Button>
      </div>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees" aria-label="Search employees" />
      {employees.isError ? <ErrorState message="Employees could not be loaded." onRetry={() => void employees.refetch()} /> : null}
      {employees.isLoading ? <PageLoader label="Loading employees…" /> : null}
      {!employees.isLoading && employees.data && rows.length === 0 ? (
        <Card><EmptyState title="No employees" description="Employee records identify branch staff. Payroll amounts are not stored here." /></Card>
      ) : null}
      {!employees.isLoading && rows.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sign-in</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((employee) => (
                <tr key={employee.id} className="border-t border-line">
                  <td className="px-4 py-3">{employee.employeeNumber}</td>
                  <td className="px-4 py-3 font-medium">{employee.firstName} {employee.lastName}</td>
                  <td className="px-4 py-3">{employee.branchName ?? "—"}</td>
                  <td className="px-4 py-3">{employee.departmentName ?? "—"}</td>
                  <td className="px-4 py-3">{employee.employmentStatus}</td>
                  <td className="px-4 py-3">{employee.userEmail ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setFormError(null);
                        setEditId(employee.id);
                        setStatus(employee.employmentStatus);
                        setUserId(employee.userId ?? "");
                      }}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      <Modal open={open} onOpenChange={setOpen} title="Add employee" description="The employee belongs to one branch. Payroll amounts are not stored here.">
        <form className="space-y-3" onSubmit={form.handleSubmit((values) => { setFormError(null); create.mutate(values); })}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Employee number</span>
            <Input {...form.register("employeeNumber")} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">First name</span>
              <Input {...form.register("firstName")} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Last name</span>
              <Input {...form.register("lastName")} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Branch</span>
            <select className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" {...form.register("branchId")}>
              <option value="">Select a branch</option>
              {(branches.data?.data ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            {form.formState.errors.branchId ? <span className="text-sm text-rose-600">{form.formState.errors.branchId.message}</span> : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Department</span>
            <select className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" {...form.register("departmentId")}>
              <option value="">None</option>
              {(departments.data?.data ?? []).map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Job title</span>
            <Input {...form.register("jobTitle")} />
          </label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>Save employee</Button>
          </div>
        </form>
      </Modal>
      <Modal open={Boolean(editId)} onOpenChange={(value) => { if (!value) setEditId(null); }} title="Edit employee" description="Update employment status or the linked sign-in. Payroll amounts are not stored here.">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setFormError(null);
            update.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Employment status</span>
            <select className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="terminated">terminated</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Linked user id</span>
            <Input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Leave blank to clear" />
          </label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditId(null)}>Cancel</Button>
            <Button type="submit" disabled={update.isPending}>Save changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
