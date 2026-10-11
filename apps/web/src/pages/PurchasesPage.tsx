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
import { fetchBranches } from "@/features/organization/api";
import {
  approveOrder,
  createBill,
  createOrder,
  createPayment,
  createReceipt,
  createRequisition,
  downloadPurchasePdf,
  fetchOrders,
  fetchRequisitions,
  fetchSuppliers,
  fetchWarehouses,
  postPayment,
  previewBill,
  previewOrder,
  submitOrder,
  type BillPreview,
  type OrderTotals,
  type PurchaseOrderRecord,
} from "@/features/procurement/api";
import { fetchProducts } from "@/features/sales/api";

interface DraftLine {
  productId: string;
  quantity: string;
  unitCost: string;
}

const emptyLine = (): DraftLine => ({ productId: "", quantity: "1.0000", unitCost: "" });

export function PurchasesPage() {
  const [section, setSection] = useState<"orders" | "requisitions" | "receipts" | "bills" | "payments">("orders");
  const [open, setOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [mode, setMode] = useState<"branch" | "central">("branch");
  const [expectedDate, setExpectedDate] = useState("2026-04-20");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [preview, setPreview] = useState<OrderTotals | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderRecord | null>(null);
  const [accepted, setAccepted] = useState("1.0000");
  const [rejected, setRejected] = useState("0.0000");
  const [serials, setSerials] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceCost, setInvoiceCost] = useState("");
  const [billPreview, setBillPreview] = useState<BillPreview | null>(null);
  const [paymentTotal, setPaymentTotal] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer">("bank_transfer");
  const queryClient = useQueryClient();
  const orders = useQuery({ queryKey: ["purchase-orders"], queryFn: fetchOrders });
  const requisitions = useQuery({ queryKey: ["requisitions"], queryFn: fetchRequisitions });
  const suppliers = useQuery({ queryKey: ["suppliers", "purchase-form"], queryFn: () => fetchSuppliers("") });
  const branches = useQuery({ queryKey: ["branches", "purchase-form"], queryFn: () => fetchBranches("") });
  const warehouses = useQuery({ queryKey: ["warehouses", branchId], queryFn: () => fetchWarehouses(branchId), enabled: Boolean(branchId) });
  const products = useQuery({ queryKey: ["products", branchId], queryFn: () => fetchProducts(branchId), enabled: Boolean(branchId) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["requisitions"] });
  };
  const orderBody = () => ({
    branchId,
    warehouseId,
    supplierId,
    procurementMode: mode,
    expectedDeliveryDate: expectedDate,
    lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCost: line.unitCost, taxRate: "0" })),
  });
  const previewMutation = useMutation({
    mutationFn: () => previewOrder(orderBody()),
    onSuccess: (totals) => { setPreview(totals); setFormError(null); },
    onError: (error: Error) => setFormError(error.message),
  });
  const save = useMutation({
    mutationFn: () => createOrder(orderBody()),
    onSuccess: async () => { setOpen(false); setPreview(null); await refresh(); },
    onError: (error: Error) => setFormError(error.message),
  });
  const submit = useMutation({ mutationFn: submitOrder, onSuccess: refresh, onError: (error: Error) => setFormError(error.message) });
  const approve = useMutation({ mutationFn: approveOrder, onSuccess: refresh, onError: (error: Error) => setFormError(error.message) });
  const saveRequisition = useMutation({
    mutationFn: () => createRequisition({
      branchId,
      purpose: "Branch stock replenishment",
      requiredDate: expectedDate,
      lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, estimatedUnitCost: line.unitCost })),
    }),
    onSuccess: async () => { setOpen(false); await refresh(); },
    onError: (error: Error) => setFormError(error.message),
  });
  const receive = useMutation({
    mutationFn: () => createReceipt({
      purchaseOrderId: selectedOrder?.id,
      receiptDate: expectedDate,
      lines: selectedOrder ? [{
        purchaseOrderLineId: selectedOrder.lines[0]?.id,
        acceptedQuantity: accepted,
        rejectedQuantity: rejected,
        serialNumbers: serials.split(",").map((value) => value.trim()).filter(Boolean),
      }] : [],
    }),
    onSuccess: async () => { setReceiptOpen(false); await refresh(); },
    onError: (error: Error) => setFormError(error.message),
  });
  const match = useMutation({
    mutationFn: () => previewBill(billBody()),
    onSuccess: (result) => { setBillPreview(result); setFormError(null); },
    onError: (error: Error) => setFormError(error.message),
  });
  const postBill = useMutation({
    mutationFn: () => createBill(billBody()),
    onSuccess: async () => { setBillOpen(false); setBillPreview(null); await refresh(); },
    onError: (error: Error) => setFormError(error.message),
  });
  const draftPayment = useMutation({
    mutationFn: () => createPayment({
      branchId: selectedOrder?.branchId,
      supplierId: selectedOrder?.supplierId,
      paymentDate: expectedDate,
      method: paymentMethod,
      total: paymentTotal,
      allocations: [],
    }),
    onSuccess: async (payment) => {
      await postPayment(payment.id);
      setPaymentOpen(false);
      await refresh();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  function billBody() {
    return {
      purchaseOrderId: selectedOrder?.id,
      supplierInvoiceNumber: invoiceNumber,
      invoiceDate: expectedDate,
      attachmentName: `${invoiceNumber}.pdf`,
      lines: selectedOrder ? [{
        purchaseOrderLineId: selectedOrder.lines[0]?.id,
        quantity: accepted,
        unitCost: invoiceCost || selectedOrder.lines[0]?.unitCost,
        taxRate: "0",
      }] : [],
    };
  }

  const rows = section === "requisitions" ? (requisitions.data?.data ?? []) : (orders.data?.data ?? []);
  const loadingError = orders.isError || requisitions.isError;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Purchases" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Purchases</h1>
        <Button onClick={() => { setFormError(null); setPreview(null); setOpen(true); }}>+ New {section === "requisitions" ? "requisition" : "order"}</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["orders", "requisitions", "receipts", "bills", "payments"] as const).map((item) => (
          <Button key={item} type="button" variant={section === item ? "primary" : "secondary"} onClick={() => setSection(item)}>{item}</Button>
        ))}
      </div>
      {formError && !open && !receiptOpen && !billOpen ? <p className="text-sm text-rose-600">{formError}</p> : null}
      {loadingError ? <ErrorState message="Purchases could not be loaded." onRetry={() => void orders.refetch()} /> : null}
      {rows.length === 0 && (section === "orders" || section === "requisitions") ? (
        <Card><EmptyState title={`No ${section}`} description="Save a draft, preview the API totals, then submit it for approval." /></Card>
      ) : null}
      {section === "orders" && (orders.data?.data.length ?? 0) > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.data?.data.map((order) => (
                <tr key={order.id} className="border-t border-line">
                  <td className="px-4 py-3">{order.purchaseOrderNumber}</td>
                  <td className="px-4 py-3">{order.supplierName}</td>
                  <td className="px-4 py-3 capitalize">{order.status.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={order.grandTotal} /></td>
                  <td className="px-4 py-3">
                    {order.status === "draft" ? <button type="button" className="mr-3 text-primary" onClick={() => submit.mutate(order.id)}>Submit</button> : null}
                    {order.status === "pending_approval" ? <button type="button" className="mr-3 text-primary" onClick={() => approve.mutate(order.id)}>Approve</button> : null}
                    {["approved", "partially_received"].includes(order.status) ? <button type="button" className="mr-3 text-primary" onClick={() => { setSelectedOrder(order); setFormError(null); setReceiptOpen(true); }}>Receive</button> : null}
                    {["approved", "partially_received", "received"].includes(order.status) ? <button type="button" className="mr-3 text-primary" onClick={() => { setSelectedOrder(order); setBillPreview(null); setFormError(null); setBillOpen(true); }}>Bill</button> : null}
                    {["approved", "partially_received", "received"].includes(order.status) ? <button type="button" className="mr-3 text-primary" onClick={() => { setSelectedOrder(order); setFormError(null); setPaymentOpen(true); }}>Pay</button> : null}
                    <button type="button" className="text-primary" onClick={() => void downloadPurchasePdf(`/purchases/orders/${order.id}/pdf`, `${order.purchaseOrderNumber}.pdf`)}>PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      {section === "requisitions" && (requisitions.data?.data.length ?? 0) > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted"><tr><th className="px-4 py-3 font-medium">Number</th><th className="px-4 py-3 font-medium">Purpose</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Estimate</th></tr></thead>
            <tbody>
              {requisitions.data?.data.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3">{row.requisitionNumber}</td>
                  <td className="px-4 py-3">{row.purpose}</td>
                  <td className="px-4 py-3 capitalize">{row.status.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={row.estimatedCost} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      {section === "receipts" || section === "bills" || section === "payments" ? (
        <Card><EmptyState title={section} description="Choose an approved order and use Receive, Bill, or record a supplier payment from the order list." /></Card>
      ) : null}
      <Modal open={open} title={section === "requisitions" ? "New requisition" : "New purchase order"} onOpenChange={setOpen}>
        <div className="space-y-3">
          <label className="block text-sm">Delivery branch
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={branchId} aria-label="Delivery branch" onChange={(event) => { setBranchId(event.target.value); setWarehouseId(""); setPreview(null); }}>
              <option value="">Select a branch</option>
              {(branches.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          {section !== "requisitions" ? (
            <>
              <label className="block text-sm">Supplier
                <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={supplierId} aria-label="Purchase supplier" onChange={(event) => { setSupplierId(event.target.value); setPreview(null); }}>
                  <option value="">Select a supplier</option>
                  {(suppliers.data?.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.businessName}</option>)}
                </select>
              </label>
              <label className="block text-sm">Warehouse
                <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={warehouseId} aria-label="Receiving warehouse" onChange={(event) => { setWarehouseId(event.target.value); setPreview(null); }}>
                  <option value="">Select a warehouse</option>
                  {(warehouses.data ?? []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
              </label>
              <label className="block text-sm">Procurement
                <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={mode} onChange={(event) => setMode(event.target.value as "branch" | "central")}>
                  <option value="branch">Branch</option>
                  <option value="central">Central</option>
                </select>
              </label>
            </>
          ) : null}
          <label className="block text-sm">Date<Input className="mt-1" type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></label>
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">Product
                <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={line.productId} aria-label="Purchase product" onChange={(event) => {
                  setPreview(null);
                  setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productId: event.target.value } : item));
                }}>
                  <option value="">Select a product</option>
                  {(products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              <label className="block text-sm">Quantity<Input className="mt-1" value={line.quantity} onChange={(event) => { setPreview(null); setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item)); }} /></label>
              <label className="block text-sm">Unit cost<Input className="mt-1" value={line.unitCost} onChange={(event) => { setPreview(null); setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitCost: event.target.value } : item)); }} /></label>
            </div>
          ))}
          {preview ? (
            <div className="rounded-lg bg-canvas p-3 text-sm" data-testid="purchase-preview">
              <p>Subtotal <MoneyValue amount={preview.subtotal} /></p>
              <p>Tax <MoneyValue amount={preview.taxTotal} /></p>
              <p>Grand total <MoneyValue amount={preview.grandTotal} /></p>
            </div>
          ) : null}
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          {section === "requisitions" ? (
            <Button type="button" onClick={() => saveRequisition.mutate()} disabled={saveRequisition.isPending}>Save requisition</Button>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>Preview</Button>
              <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || !preview}>Save draft</Button>
            </div>
          )}
        </div>
      </Modal>
      <Modal open={receiptOpen} title="Goods receipt" onOpenChange={setReceiptOpen}>
        <div className="space-y-3">
          <p className="text-sm">{selectedOrder?.purchaseOrderNumber} · {selectedOrder?.lines[0]?.description}</p>
          <label className="block text-sm">Accepted<Input className="mt-1" value={accepted} onChange={(event) => setAccepted(event.target.value)} /></label>
          <label className="block text-sm">Rejected<Input className="mt-1" value={rejected} onChange={(event) => setRejected(event.target.value)} /></label>
          <label className="block text-sm">Serial numbers<Input className="mt-1" value={serials} onChange={(event) => setSerials(event.target.value)} placeholder="Comma separated" /></label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <Button type="button" onClick={() => receive.mutate()} disabled={receive.isPending}>Record receipt</Button>
        </div>
      </Modal>
      <Modal open={billOpen} title="Supplier bill" onOpenChange={setBillOpen}>
        <div className="space-y-3">
          <label className="block text-sm">Supplier invoice number<Input className="mt-1" value={invoiceNumber} onChange={(event) => { setInvoiceNumber(event.target.value); setBillPreview(null); }} /></label>
          <label className="block text-sm">Invoice unit cost<Input className="mt-1" value={invoiceCost} onChange={(event) => { setInvoiceCost(event.target.value); setBillPreview(null); }} /></label>
          {billPreview ? (
            <div className="rounded-lg bg-canvas p-3 text-sm" data-testid="bill-match">
              <p>Quantity difference: {billPreview.flags.quantityDifference ? "yes" : "no"}</p>
              <p>Price difference: {billPreview.flags.priceDifference ? "yes" : "no"}</p>
              <p>Missing receipt: {billPreview.flags.missingReceipt ? "yes" : "no"}</p>
              <p>Unapproved order: {billPreview.flags.unapprovedOrder ? "yes" : "no"}</p>
              <p>Variance <MoneyValue amount={billPreview.varianceTotal} /></p>
              <p>Payable <MoneyValue amount={billPreview.grandTotal} /></p>
            </div>
          ) : null}
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => match.mutate()} disabled={match.isPending}>Check match</Button>
            <Button type="button" onClick={() => postBill.mutate()} disabled={postBill.isPending || !billPreview}>Post bill</Button>
          </div>
        </div>
      </Modal>
      <Modal open={paymentOpen} title="Supplier payment" onOpenChange={setPaymentOpen}>
        <div className="space-y-3">
          <label className="block text-sm">Amount<Input className="mt-1" value={paymentTotal} onChange={(event) => setPaymentTotal(event.target.value)} /></label>
          <label className="block text-sm">Method
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "cash" | "bank_transfer")}>
              <option value="bank_transfer">Bank</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <Button type="button" onClick={() => draftPayment.mutate()} disabled={draftPayment.isPending}>Post payment</Button>
        </div>
      </Modal>
    </div>
  );
}
