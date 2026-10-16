import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { useAuth } from "@/features/auth/auth-context";
import { fetchBranches } from "@/features/organization/api";
import { fetchWarehouses } from "@/features/procurement/api";
import {
  activateProject,
  addMilestone,
  approveMaterial,
  createMaterialRequest,
  createProject,
  fetchProject,
  fetchProjects,
  issueMaterial,
  recognizeMilestone,
  type ProjectDetail,
  type ProjectMilestoneRow,
} from "@/features/projects/api";
import { fetchCustomers, fetchProducts } from "@/features/sales/api";

const PROJECT_TYPES = [
  ["residential", "Residential installation"],
  ["commercial", "Commercial installation"],
  ["industrial", "Industrial installation"],
  ["maintenance", "Maintenance"],
  ["repairs", "Repairs"],
  ["system_upgrade", "System upgrade"],
] as const;

export function ProjectsPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const canCreate = session?.permissions.includes("projects.create") ?? false;
  const canApprove = session?.permissions.includes("projects.approve") ?? false;
  const canIssue = session?.permissions.includes("projects.issue") ?? false;

  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState<(typeof PROJECT_TYPES)[number][0]>("residential");
  const [location, setLocation] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [startDate, setStartDate] = useState("2026-11-02");
  const [expectedCompletionDate, setExpectedCompletionDate] = useState("2026-11-30");
  const [startAsActive, setStartAsActive] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [materialQty, setMaterialQty] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneAmount, setMilestoneAmount] = useState("");
  const [milestoneSequence, setMilestoneSequence] = useState("1");
  const [recognizeDate, setRecognizeDate] = useState(() => new Date().toISOString().slice(0, 10));

  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const customers = useQuery({ queryKey: ["customers", "projects"], queryFn: () => fetchCustomers("") });
  const branches = useQuery({ queryKey: ["branches", "projects"], queryFn: () => fetchBranches("") });
  const detail = useQuery({
    queryKey: ["projects", detailId],
    queryFn: () => fetchProject(detailId!),
    enabled: Boolean(detailId),
  });
  const products = useQuery({
    queryKey: ["products", "projects", detail.data?.branchId],
    queryFn: () => fetchProducts(detail.data!.branchId),
    enabled: Boolean(detail.data?.branchId) && canIssue,
  });
  const warehouses = useQuery({
    queryKey: ["warehouses", "projects", detail.data?.branchId],
    queryFn: () => fetchWarehouses(detail.data!.branchId),
    enabled: Boolean(detail.data?.branchId) && canIssue,
  });

  const refreshList = async () => {
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
  };
  const refreshDetail = async () => {
    if (detailId) await queryClient.invalidateQueries({ queryKey: ["projects", detailId] });
    await refreshList();
  };

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
      status: startAsActive ? "active" : "draft",
    }),
    onSuccess: async () => {
      setOpen(false);
      setFormError(null);
      setStartAsActive(false);
      await refreshList();
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const saveOk = useActionSuccess(save);

  const activate = useMutation({
    mutationFn: (id: string) => activateProject(id),
    onSuccess: async () => {
      setDetailError(null);
      await refreshDetail();
    },
    onError: (error: Error & { status?: number }) => {
      const message = error.message;
      if (error.status === 404 || /404|Cannot POST|not found/i.test(message)) {
        setDetailError(
          "Activate is not available on the API yet. Redeploy the API service (commit with POST /projects/:id/activate), or create the project with “Start as active”.",
        );
        return;
      }
      setDetailError(message);
    },
  });
  const activateOk = useActionSuccess(activate);

  const requestMaterial = useMutation({
    mutationFn: () => createMaterialRequest(detailId!, { productId, warehouseId, quantity: materialQty }),
    onSuccess: async () => {
      setDetailError(null);
      setProductId("");
      setWarehouseId("");
      setMaterialQty("");
      await refreshDetail();
    },
    onError: (error: Error) => setDetailError(error.message),
  });
  const requestMaterialOk = useActionSuccess(requestMaterial);

  const approveMat = useMutation({
    mutationFn: (requestId: string) => approveMaterial(detailId!, requestId),
    onSuccess: async () => {
      setDetailError(null);
      await refreshDetail();
    },
    onError: (error: Error) => setDetailError(error.message),
  });
  const approveMatFx = useKeyedActionSuccess(approveMat);

  const issueMat = useMutation({
    mutationFn: (requestId: string) => issueMaterial(detailId!, requestId, issueDate),
    onSuccess: async () => {
      setDetailError(null);
      await refreshDetail();
    },
    onError: (error: Error) => setDetailError(error.message),
  });
  const issueMatFx = useKeyedActionSuccess(issueMat);

  const mergeMilestoneIntoDetail = (created: ProjectMilestoneRow) => {
    if (!detailId) return;
    queryClient.setQueryData<ProjectDetail>(["projects", detailId], (current) => {
      if (!current) return current;
      const existing = current.milestones ?? [];
      if (existing.some((row) => row.id === created.id)) {
        return { ...current, milestones: existing };
      }
      const row: ProjectMilestoneRow = {
        id: created.id,
        name: created.name,
        amount: created.amount,
        sequence: created.sequence ?? (Number(milestoneSequence) || existing.length + 1),
        status: created.status ?? "pending",
        createdByUserId: created.createdByUserId ?? userId ?? "",
      };
      return {
        ...current,
        milestones: [...existing, row].sort((a, b) => a.sequence - b.sequence),
      };
    });
  };

  const createMile = useMutation({
    mutationFn: () => addMilestone(detailId!, {
      name: milestoneName,
      amount: milestoneAmount,
      sequence: Number(milestoneSequence),
    }),
    onSuccess: async (created) => {
      setDetailError(null);
      setMilestoneName("");
      setMilestoneAmount("");
      const nextSeq = String((created.sequence ?? Number(milestoneSequence) ?? 0) + 1);
      setMilestoneSequence(nextSeq);
      mergeMilestoneIntoDetail(created);
      await refreshDetail();
      // Older APIs omit milestones on GET — keep the created row visible after refetch.
      mergeMilestoneIntoDetail(created);
    },
    onError: (error: Error) => setDetailError(error.message),
  });
  const createMileOk = useActionSuccess(createMile);

  const recognize = useMutation({
    mutationFn: (milestoneId: string) => recognizeMilestone(detailId!, milestoneId, recognizeDate),
    onSuccess: async () => {
      setDetailError(null);
      await refreshDetail();
    },
    onError: (error: Error) => setDetailError(error.message),
  });
  const recognizeFx = useKeyedActionSuccess(recognize);

  return (
    <section className="space-y-4">
      <Breadcrumbs items={[{ label: "Projects" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Installation projects</h1>
          <p className="text-sm text-muted">Contract, budget, actual cost, and gross profit come from the ledger.</p>
        </div>
        {canCreate ? (
          <Button onClick={() => { setFormError(null); setOpen(true); }}>New project</Button>
        ) : null}
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
                <th className="px-4 py-3 font-medium">Actions</th>
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
                  <td className="px-4 py-3">
                    <ActionTextButton
                      onClick={() => {
                        setDetailError(null);
                        setDetailId(row.id);
                      }}
                    >
                      Open
                    </ActionTextButton>
                  </td>
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={startAsActive}
              onChange={(event) => setStartAsActive(event.target.checked)}
              aria-label="Start as active"
            />
            Start as active
          </label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <ActionButton onClick={() => save.mutate()} pending={save.isPending} success={saveOk}>
            {startAsActive ? "Create active project" : "Save draft"}
          </ActionButton>
        </div>
      </Modal>

      <Modal
        open={Boolean(detailId)}
        title={detail.data ? `${detail.data.projectNumber} · ${detail.data.name}` : "Project"}
        description={detail.data ? `${detail.data.customerName} · ${detail.data.status.replaceAll("_", " ")}` : undefined}
        onOpenChange={(next) => {
          if (!next) {
            setDetailId(null);
            setDetailError(null);
            setProductId("");
            setWarehouseId("");
            setMaterialQty("");
            setMilestoneName("");
            setMilestoneAmount("");
          }
        }}
      >
        {detail.isLoading ? <PageLoader label="Loading project…" /> : null}
        {detail.isError ? <ErrorState message="Project detail could not be loaded." /> : null}
        {detail.data ? (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted">
                Contract <MoneyValue amount={detail.data.contractValue} /> · Actual{" "}
                <MoneyValue amount={detail.data.actualCost} /> · GP{" "}
                <MoneyValue amount={detail.data.grossProfit} />
              </div>
              {detail.data.status === "draft" && canCreate ? (
                <ActionButton
                  onClick={() => {
                    setDetailError(null);
                    activate.mutate(detail.data.id);
                  }}
                  pending={activate.isPending}
                  success={activateOk}
                >
                  Activate
                </ActionButton>
              ) : null}
            </div>
            {detailError ? <p className="text-sm text-rose-600">{detailError}</p> : null}

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Materials</h2>
              {detail.data.status === "active" && canIssue ? (
                <div className="space-y-2 rounded-lg border border-line p-3">
                  <label className="block text-sm">Product
                    <select
                      className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3"
                      aria-label="Material product"
                      value={productId}
                      onChange={(event) => setProductId(event.target.value)}
                    >
                      <option value="">Select a product</option>
                      {(products.data ?? []).map((product) => (
                        <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">Warehouse
                    <select
                      className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3"
                      aria-label="Material warehouse"
                      value={warehouseId}
                      onChange={(event) => setWarehouseId(event.target.value)}
                    >
                      <option value="">Select a warehouse</option>
                      {(warehouses.data ?? []).map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">Quantity
                    <Input
                      className="mt-1"
                      aria-label="Material quantity"
                      value={materialQty}
                      onChange={(event) => setMaterialQty(event.target.value)}
                    />
                  </label>
                  <ActionButton
                    onClick={() => requestMaterial.mutate()}
                    pending={requestMaterial.isPending}
                    success={requestMaterialOk}
                    disabled={!productId || !warehouseId || !materialQty || requestMaterial.isPending}
                  >
                    Request materials
                  </ActionButton>
                </div>
              ) : null}
              {(detail.data.materials?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted">No material requests yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-muted">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Item</th>
                        <th className="py-2 pr-3 font-medium">Warehouse</th>
                        <th className="py-2 pr-3 text-right font-medium">Qty</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.data.materials ?? []).map((row) => {
                        const isRequester = Boolean(userId && row.createdByUserId === userId);
                        return (
                          <tr key={row.id} className="border-t border-line">
                            <td className="py-2 pr-3">{row.sku} · {row.productName}</td>
                            <td className="py-2 pr-3">{row.warehouseName}</td>
                            <td className="py-2 pr-3 text-right">{row.quantity}</td>
                            <td className="py-2 pr-3 capitalize">{row.status.replaceAll("_", " ")}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap items-center gap-3">
                                {row.status === "reserved" && canApprove && !isRequester ? (
                                  <ActionTextButton
                                    pending={approveMatFx.isPendingFor(row.id)}
                                    success={approveMatFx.isSuccessFor(row.id)}
                                    onClick={() => {
                                      setDetailError(null);
                                      approveMat.mutate(row.id);
                                    }}
                                  >
                                    Approve
                                  </ActionTextButton>
                                ) : null}
                                {row.status === "approved" && canIssue ? (
                                  <>
                                    <Input
                                      className="h-8 w-36"
                                      type="date"
                                      aria-label={`Issue date for ${row.sku}`}
                                      value={issueDate}
                                      onChange={(event) => setIssueDate(event.target.value)}
                                    />
                                    <ActionTextButton
                                      pending={issueMatFx.isPendingFor(row.id)}
                                      success={issueMatFx.isSuccessFor(row.id)}
                                      onClick={() => {
                                        setDetailError(null);
                                        issueMat.mutate(row.id);
                                      }}
                                    >
                                      Issue
                                    </ActionTextButton>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Milestones</h2>
              {canCreate ? (
                <div className="space-y-2 rounded-lg border border-line p-3">
                  <label className="block text-sm">Name
                    <Input
                      className="mt-1"
                      aria-label="Milestone name"
                      value={milestoneName}
                      onChange={(event) => setMilestoneName(event.target.value)}
                    />
                  </label>
                  <label className="block text-sm">Amount
                    <Input
                      className="mt-1"
                      aria-label="Milestone amount"
                      value={milestoneAmount}
                      onChange={(event) => setMilestoneAmount(event.target.value)}
                    />
                  </label>
                  <label className="block text-sm">Sequence
                    <Input
                      className="mt-1"
                      aria-label="Milestone sequence"
                      value={milestoneSequence}
                      onChange={(event) => setMilestoneSequence(event.target.value)}
                    />
                  </label>
                  <ActionButton
                    onClick={() => createMile.mutate()}
                    pending={createMile.isPending}
                    success={createMileOk}
                    disabled={!milestoneName || !milestoneAmount || !milestoneSequence || createMile.isPending}
                  >
                    Add milestone
                  </ActionButton>
                </div>
              ) : null}
              {(detail.data.milestones?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted">No milestones yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-muted">
                      <tr>
                        <th className="py-2 pr-3 font-medium">#</th>
                        <th className="py-2 pr-3 font-medium">Name</th>
                        <th className="py-2 pr-3 text-right font-medium">Amount</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.data.milestones ?? []).map((row) => {
                        const isRequester = Boolean(userId && row.createdByUserId === userId);
                        return (
                          <tr key={row.id} className="border-t border-line">
                            <td className="py-2 pr-3">{row.sequence}</td>
                            <td className="py-2 pr-3">{row.name}</td>
                            <td className="py-2 pr-3 text-right"><MoneyValue amount={row.amount} /></td>
                            <td className="py-2 pr-3 capitalize">{row.status.replaceAll("_", " ")}</td>
                            <td className="py-2">
                              {row.status === "pending" && canApprove && !isRequester && detail.data.status === "active" ? (
                                <div className="flex flex-wrap items-center gap-3">
                                  <Input
                                    className="h-8 w-36"
                                    type="date"
                                    aria-label={`Recognize date for ${row.name}`}
                                    value={recognizeDate}
                                    onChange={(event) => setRecognizeDate(event.target.value)}
                                  />
                                  <ActionTextButton
                                    pending={recognizeFx.isPendingFor(row.id)}
                                    success={recognizeFx.isSuccessFor(row.id)}
                                    onClick={() => {
                                      setDetailError(null);
                                      recognize.mutate(row.id);
                                    }}
                                  >
                                    Recognize
                                  </ActionTextButton>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
