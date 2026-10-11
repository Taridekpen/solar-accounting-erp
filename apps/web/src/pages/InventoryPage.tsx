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
import { createCount, createTransfer, fetchReports, fetchStock, lookupSerial, type SerialRecord } from "@/features/inventory/api";
import { fetchBranches } from "@/features/organization/api";
import { fetchWarehouses, type WarehouseRecord } from "@/features/procurement/api";
import { fetchProducts } from "@/features/sales/api";

type Section = "stock" | "transfers" | "counts" | "serials";

export function InventoryPage() {
  const [section, setSection] = useState<Section>("stock");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1.0000");
  const [countedQuantity, setCountedQuantity] = useState("0.0000");
  const [activityDate, setActivityDate] = useState("2026-02-12");
  const [serialQuery, setSerialQuery] = useState("");
  const [serial, setSerial] = useState<SerialRecord | null>(null);
  const queryClient = useQueryClient();
  const stock = useQuery({ queryKey: ["inventory-stock"], queryFn: fetchStock });
  const reports = useQuery({ queryKey: ["inventory-reports"], queryFn: fetchReports });
  const branches = useQuery({ queryKey: ["branches", "inventory"], queryFn: () => fetchBranches("") });
  const sourceWarehouses = useQuery({ queryKey: ["warehouses", sourceBranchId], queryFn: () => fetchWarehouses(sourceBranchId), enabled: Boolean(sourceBranchId) });
  const destinationWarehouses = useQuery({ queryKey: ["warehouses", destinationBranchId], queryFn: () => fetchWarehouses(destinationBranchId), enabled: Boolean(destinationBranchId) });
  const products = useQuery({ queryKey: ["products", sourceBranchId], queryFn: () => fetchProducts(sourceBranchId), enabled: Boolean(sourceBranchId) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
    await queryClient.invalidateQueries({ queryKey: ["inventory-reports"] });
  };
  const saveTransfer = useMutation({
    mutationFn: () => createTransfer({
      sourceBranchId,
      destinationBranchId,
      sourceWarehouseId,
      destinationWarehouseId,
      transferDate: activityDate,
      lines: [{ productId, quantity }],
    }),
    onSuccess: async () => { setOpen(false); setFormError(null); await refresh(); },
    onError: (error: Error) => setFormError(error.message),
  });
  const saveCount = useMutation({
    mutationFn: () => createCount({
      branchId: sourceBranchId,
      warehouseId: sourceWarehouseId,
      countDate: activityDate,
      lines: [{ productId, countedQuantity }],
    }),
    onSuccess: async () => { setOpen(false); setFormError(null); await refresh(); },
    onError: (error: Error) => setFormError(error.message),
  });
  const findSerial = useMutation({
    mutationFn: () => lookupSerial(serialQuery.trim()),
    onSuccess: (row) => { setSerial(row); setFormError(null); },
    onError: (error: Error) => { setSerial(null); setFormError(error.message); },
  });

  return (
    <section className="space-y-4">
      <Breadcrumbs items={[{ label: "Inventory" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted">Warehouse quantities, average cost, transfers, and serials.</p>
        </div>
        {section === "transfers" || section === "counts" ? (
          <Button onClick={() => { setFormError(null); setOpen(true); }}>{section === "transfers" ? "New transfer" : "Record count"}</Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["stock", "transfers", "counts", "serials"] as const).map((item) => (
          <Button key={item} variant={section === item ? "primary" : "secondary"} onClick={() => setSection(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </Button>
        ))}
      </div>
      {stock.isError || reports.isError ? <ErrorState message="Inventory could not be loaded." /> : null}
      {section === "stock" ? (
        (stock.data?.length ?? 0) === 0 ? (
          <Card><EmptyState title="No warehouse stock" description="Receipts and opening balances will appear here by warehouse." /></Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Warehouse</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 text-right font-medium">Quantity</th>
                  <th className="px-4 py-3 text-right font-medium">Available</th>
                  <th className="px-4 py-3 text-right font-medium">Average cost</th>
                  <th className="px-4 py-3 text-right font-medium">Valuation</th>
                </tr>
              </thead>
              <tbody>
                {stock.data?.map((row) => (
                  <tr key={`${row.warehouseId}-${row.productId}`} className="border-t border-line">
                    <td className="px-4 py-3">{row.branchName} · {row.warehouseName}</td>
                    <td className="px-4 py-3">{row.productName}</td>
                    <td className="px-4 py-3 text-right">{row.quantity}</td>
                    <td className="px-4 py-3 text-right">{row.availableQuantity}</td>
                    <td className="px-4 py-3 text-right"><MoneyValue amount={row.averageUnitCost} /></td>
                    <td className="px-4 py-3 text-right"><MoneyValue amount={row.valuation} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : null}
      {section === "transfers" ? (
        <Card className="space-y-3 p-4">
          <p className="text-sm text-muted">Open transfers stay here until they are received. Company inventory value does not change while stock is in transit.</p>
          <p className="text-sm">Valuation <MoneyValue amount={reports.data?.valuation ?? "0.0000"} /></p>
          {(reports.data?.openTransfers.length ?? 0) === 0 ? <EmptyState title="No open transfers" description="A shipped transfer appears here until the destination receives it." /> : (
            <ul className="space-y-2 text-sm">
              {reports.data?.openTransfers.map((transfer) => (
                <li key={transfer.id}>{transfer.transferNumber} · {transfer.status.replaceAll("_", " ")}</li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
      {section === "counts" ? (
        <Card className="space-y-3 p-4">
          <p className="text-sm text-muted">Recording a count stores the book quantity. Posting the variance needs a different user.</p>
          {(reports.data?.lowStock.length ?? 0) === 0 ? <EmptyState title="No low stock" description="Products at or below their reorder level will be listed here." /> : (
            <ul className="space-y-2 text-sm">
              {reports.data?.lowStock.map((row) => <li key={`${row.warehouseId}-${row.productId}`}>{row.productName} · available {row.availableQuantity}</li>)}
            </ul>
          )}
        </Card>
      ) : null}
      {section === "serials" ? (
        <Card className="space-y-3 p-4">
          <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); findSerial.mutate(); }}>
            <Input aria-label="Serial number" value={serialQuery} onChange={(event) => setSerialQuery(event.target.value)} placeholder="Serial number" />
            <Button type="submit">Look up</Button>
          </form>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          {serial ? (
            <div className="text-sm">
              <p>{serial.productName} · {serial.status.replaceAll("_", " ")}</p>
              <p>{serial.branchName ?? "No branch"} · {serial.warehouseName ?? "No warehouse"}</p>
              <p>Warranty {serial.warrantyStart ?? "—"} to {serial.warrantyEnd ?? "—"}</p>
              <p>Customer {serial.customerName ?? "—"}</p>
            </div>
          ) : null}
          {(reports.data?.serials.length ?? 0) > 0 ? (
            <ul className="space-y-2 text-sm">
              {reports.data?.serials.map((row) => <li key={row.serialNumber}>{row.serialNumber} · {row.productName} · {row.status.replaceAll("_", " ")}</li>)}
            </ul>
          ) : <EmptyState title="No serials" description="Serial numbers from goods receipts will appear in the register." />}
        </Card>
      ) : null}
      <Modal open={open} title={section === "counts" ? "Record stock count" : "New transfer"} onOpenChange={setOpen}>
        <div className="space-y-3">
          <label className="block text-sm">{section === "counts" ? "Branch" : "Source branch"}
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" aria-label="Source branch" value={sourceBranchId} onChange={(event) => { setSourceBranchId(event.target.value); setSourceWarehouseId(""); setProductId(""); }}>
              <option value="">Select a branch</option>
              {(branches.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">{section === "counts" ? "Warehouse" : "Source warehouse"}
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" aria-label="Source warehouse" value={sourceWarehouseId} onChange={(event) => setSourceWarehouseId(event.target.value)}>
              <option value="">Select a warehouse</option>
              {stockWarehouses(sourceWarehouses.data).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>
          {section === "transfers" ? (
            <>
              <label className="block text-sm">Destination branch
                <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" aria-label="Destination branch" value={destinationBranchId} onChange={(event) => { setDestinationBranchId(event.target.value); setDestinationWarehouseId(""); }}>
                  <option value="">Select a branch</option>
                  {(branches.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
              <label className="block text-sm">Destination warehouse
                <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" aria-label="Destination warehouse" value={destinationWarehouseId} onChange={(event) => setDestinationWarehouseId(event.target.value)}>
                  <option value="">Select a warehouse</option>
                  {stockWarehouses(destinationWarehouses.data).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
              </label>
            </>
          ) : null}
          <label className="block text-sm">Product
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" aria-label="Inventory product" value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Select a product</option>
              {(products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Date<Input className="mt-1" type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} /></label>
          {section === "counts" ? (
            <label className="block text-sm">Counted quantity<Input className="mt-1" value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value)} /></label>
          ) : (
            <label className="block text-sm">Quantity<Input className="mt-1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          )}
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <Button onClick={() => (section === "counts" ? saveCount.mutate() : saveTransfer.mutate())}>Save draft</Button>
        </div>
      </Modal>
    </section>
  );
}

function stockWarehouses(rows: WarehouseRecord[] | undefined) {
  return (rows ?? []).filter((warehouse) => !warehouse.warehouseCode.endsWith("-TRANSIT"));
}
