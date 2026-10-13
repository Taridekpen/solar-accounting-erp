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
import { fetchBranches } from "@/features/organization/api";
import { createProject, fetchProjects } from "@/features/projects/api";
import { fetchCustomers } from "@/features/sales/api";

const PROJECT_TYPES = [
  ["residential", "Residential installation"],
  ["commercial", "Commercial installation"],
  ["industrial", "Industrial installation"],
  ["maintenance", "Maintenance"],
  ["repairs", "Repairs"],
  ["system_upgrade", "System upgrade"],
] as const;

export function ProjectsPage() {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState<(typeof PROJECT_TYPES)[number][0]>("residential");
  const [location, setLocation] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [startDate, setStartDate] = useState("2026-11-02");
  const [expectedCompletionDate, setExpectedCompletionDate] = useState("2026-11-30");
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const customers = useQuery({ queryKey: ["customers", "projects"], queryFn: () => fetchCustomers("") });
  const branches = useQuery({ queryKey: ["branches", "projects"], queryFn: () => fetchBranches("") });
  const save = useMutation({
    mutationFn: () => createProject({
      customerId,
      branchId,
      name,
      projectType,
      location,
      contractValue,
      estimatedCost,
      startDate,
      expectedCompletionDate,
      status: "draft",
    }),
    onSuccess: async () => {
      setOpen(false);
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });

  return (
    <section className="space-y-4">
      <Breadcrumbs items={[{ label: "Projects" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Installation projects</h1>
          <p className="text-sm text-muted">Contract, budget, actual cost, and gross profit come from the ledger.</p>
        </div>
        <Button onClick={() => { setFormError(null); setOpen(true); }}>New project</Button>
      </div>
      {projects.isError ? <ErrorState message="Projects could not be loaded." /> : null}
      {projects.isLoading ? <PageLoader label="Loading projects…" /> : null}
      {(projects.data?.length ?? 0) === 0 && !projects.isLoading ? (
        <Card><EmptyState title="No projects" description="A draft stores the contract. Materials, deposits, and milestones post only after they are approved." /></Card>
      ) : null}
      {!projects.isLoading && (projects.data?.length ?? 0) > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Contract</th>
                <th className="px-4 py-3 text-right font-medium">Budget</th>
                <th className="px-4 py-3 text-right font-medium">Actual cost</th>
                <th className="px-4 py-3 text-right font-medium">Gross profit</th>
              </tr>
            </thead>
            <tbody>
              {projects.data?.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3">{row.projectNumber}</td>
                  <td className="px-4 py-3">{row.name}<div className="text-xs text-muted">{row.customerName}</div></td>
                  <td className="px-4 py-3 capitalize">{row.status.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.contractValue} /></td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.budget} /></td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.actualCost} /></td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.grossProfit} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      <Modal open={open} title="New project" onOpenChange={setOpen}>
        <div className="space-y-3">
          <label className="block text-sm">Customer
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" aria-label="Project customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Select a customer</option>
              {(customers.data?.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Branch
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" aria-label="Project branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Select a branch</option>
              {(branches.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Name<Input className="mt-1" aria-label="Project name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="block text-sm">Type
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" aria-label="Project type" value={projectType} onChange={(event) => setProjectType(event.target.value as (typeof PROJECT_TYPES)[number][0])}>
              {PROJECT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block text-sm">Location<Input className="mt-1" aria-label="Project location" value={location} onChange={(event) => setLocation(event.target.value)} /></label>
          <label className="block text-sm">Contract value<Input className="mt-1" aria-label="Contract value" value={contractValue} onChange={(event) => setContractValue(event.target.value)} /></label>
          <label className="block text-sm">Estimated cost<Input className="mt-1" aria-label="Estimated cost" value={estimatedCost} onChange={(event) => setEstimatedCost(event.target.value)} /></label>
          <label className="block text-sm">Start<Input className="mt-1" aria-label="Project start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="block text-sm">Expected completion<Input className="mt-1" aria-label="Expected completion" type="date" value={expectedCompletionDate} onChange={(event) => setExpectedCompletionDate(event.target.value)} /></label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <Button onClick={() => save.mutate()}>Save draft</Button>
        </div>
      </Modal>
    </section>
  );
}
