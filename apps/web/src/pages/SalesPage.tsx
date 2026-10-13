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
import {
  createInvoice,
  createQuotation,
  createReceipt,
  createReturn,
  downloadSalesPdf,
  fetchCustomers,
  fetchInvoices,
  fetchProducts,
  fetchQuotations,
  fetchReceipts,
  fetchReturns,
  finalizeInvoice,
  previewInvoice,
  type InvoicePreview,
} from "@/features/sales/api";

interface DraftLine {
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
}

const emptyLine = (): DraftLine => ({ productId: "", quantity: "1.0000", unitPrice: "", discount: "0.0000", taxRate: "0.0000" });

export function SalesPage() {
  const [section, setSection] = useState<"invoices" | "quotations" | "receipts" | "returns">("invoices");
  const [open, setOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [branchId, setBranchId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentTermsDays, setPaymentTermsDays] = useState("30");
  const [settlement, setSettlement] = useState<"credit" | "cash">("credit");
  const [cashMethod, setCashMethod] = useState<"cash" | "bank_transfer" | "pos">("cash");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const queryClient = useQueryClient();
  const invoices = useQuery({ queryKey: ["sales-invoices"], queryFn: fetchInvoices });
  const quotations = useQuery({ queryKey: ["sales-quotations"], queryFn: fetchQuotations });
  const receipts = useQuery({ queryKey: ["sales-receipts"], queryFn: fetchReceipts });
  const returns = useQuery({ queryKey: ["sales-returns"], queryFn: fetchReturns });
  const customers = useQuery({ queryKey: ["customers", "sales"], queryFn: () => fetchCustomers("") });
  const branches = useQuery({ queryKey: ["branches", "sales"], queryFn: () => fetchBranches("") });
  const products = useQuery({
    queryKey: ["products", branchId],
    queryFn: () => fetchProducts(branchId),
    enabled: Boolean(branchId),
  });
  const body = () => ({
    branchId,
    customerId,
    invoiceDate,
    paymentTermsDays: Number(paymentTermsDays),
    settlement,
    cashMethod: settlement === "cash" ? cashMethod : undefined,
    lines: lines.filter((line) => line.productId).map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice || undefined,
      discount: line.discount || "0",
      taxRate: line.taxRate || "0",
    })),
  });
  const previewMutation = useMutation({
    mutationFn: () => previewInvoice(body()),
    onSuccess: (result) => { setPreview(result); setFormError(null); },
    onError: (error: Error) => setFormError(error.message),
  });
  const save = useMutation({
    mutationFn: () => createInvoice(body()),
    onSuccess: async () => {
      setOpen(false);
      setPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const finalize = useMutation({
    mutationFn: (id: string) => finalizeInvoice(id),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["sales-invoices"] }); },
    onError: (error: Error) => setFormError(error.message),
  });
  const saveQuote = useMutation({
    mutationFn: () => createQuotation({
      branchId,
      customerId,
      validityDate: invoiceDate,
      lines: lines.filter((line) => line.productId).map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice || undefined,
        discount: line.discount || "0",
        taxRate: line.taxRate || "0",
      })),
    }),
    onSuccess: async () => {
      setQuoteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["sales-quotations"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const [receiptAmount, setReceiptAmount] = useState("0.0000");
  const [receiptInvoiceId, setReceiptInvoiceId] = useState("");
  const [receiptMethod, setReceiptMethod] = useState<"cash" | "bank_transfer" | "pos">("cash");
  const saveReceipt = useMutation({
    mutationFn: () => createReceipt({
      branchId,
      customerId,
      receiptDate: invoiceDate,
      methods: [{ method: receiptMethod, amount: receiptAmount }],
      allocations: receiptInvoiceId ? [{ invoiceId: receiptInvoiceId, amount: receiptAmount }] : [],
    }),
    onSuccess: async () => {
      setReceiptOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["sales-receipts"] });
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const [returnInvoiceId, setReturnInvoiceId] = useState("");
  const [returnLineId, setReturnLineId] = useState("");
  const [returnQuantity, setReturnQuantity] = useState("1.0000");
  const saveReturn = useMutation({
    mutationFn: () => createReturn({
      invoiceId: returnInvoiceId,
      settlement: "credit",
      reason: "Customer return",
      lines: [{ invoiceLineId: returnLineId, quantity: returnQuantity }],
    }),
    onSuccess: async () => {
      setReturnOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["sales-returns"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const rows = section === "invoices"
    ? invoices.data?.data ?? []
    : section === "quotations"
      ? quotations.data?.data ?? []
      : section === "receipts"
        ? receipts.data?.data ?? []
        : returns.data?.data ?? [];
  const sectionLoading =
    section === "invoices"
      ? invoices.isLoading
      : section === "quotations"
        ? quotations.isLoading
        : section === "receipts"
          ? receipts.isLoading
          : returns.isLoading;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Sales" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setFormError(null); setQuoteOpen(true); }}>New quotation</Button>
          <Button variant="secondary" onClick={() => { setFormError(null); setReceiptOpen(true); }}>New receipt</Button>
          <Button variant="secondary" onClick={() => { setFormError(null); setReturnOpen(true); }}>New return</Button>
          <Button onClick={() => { setFormError(null); setPreview(null); setOpen(true); }}>+ New invoice</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={section === "invoices" ? "primary" : "secondary"} onClick={() => setSection("invoices")}>Invoices</Button>
        <Button type="button" variant={section === "quotations" ? "primary" : "secondary"} onClick={() => setSection("quotations")}>Quotations</Button>
        <Button type="button" variant={section === "receipts" ? "primary" : "secondary"} onClick={() => setSection("receipts")}>Receipts</Button>
        <Button type="button" variant={section === "returns" ? "primary" : "secondary"} onClick={() => setSection("returns")}>Returns</Button>
      </div>
      {(invoices.isError || quotations.isError) ? <ErrorState message="Sales documents could not be loaded." onRetry={() => void invoices.refetch()} /> : null}
      {sectionLoading ? <PageLoader label="Loading sales…" /> : null}
      {!sectionLoading && rows.length === 0 ? (
        <Card><EmptyState title={`No ${section}`} description="Create a draft, preview the API totals, then finalize when the sale is agreed." /></Card>
      ) : null}
      {!sectionLoading && rows.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {section === "invoices" ? invoices.data?.data.map((invoice) => (
                <tr key={invoice.id} className="border-t border-line">
                  <td className="px-4 py-3">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3">{invoice.customerName}</td>
                  <td className="px-4 py-3 capitalize">{invoice.status}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={invoice.grandTotal} /></td>
                  <td className="px-4 py-3">
                    {invoice.status === "draft" ? <button type="button" className="mr-3 text-primary" onClick={() => finalize.mutate(invoice.id)}>Finalize</button> : null}
                    <button type="button" className="text-primary" onClick={() => void downloadSalesPdf(`/sales/invoices/${invoice.id}/pdf`, `${invoice.invoiceNumber}.pdf`)}>PDF</button>
                  </td>
                </tr>
              )) : null}
              {section === "quotations" ? quotations.data?.data.map((quotation) => (
                <tr key={quotation.id} className="border-t border-line">
                  <td className="px-4 py-3">{quotation.quotationNumber}</td>
                  <td className="px-4 py-3">{quotation.customerName}</td>
                  <td className="px-4 py-3 capitalize">{quotation.status}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={quotation.grandTotal} /></td>
                  <td className="px-4 py-3">
                    <button type="button" className="text-primary" onClick={() => void downloadSalesPdf(`/sales/quotations/${quotation.id}/pdf`, `${quotation.quotationNumber}.pdf`)}>PDF</button>
                  </td>
                </tr>
              )) : null}
              {section === "receipts" ? receipts.data?.data.map((receipt) => (
                <tr key={receipt.id} className="border-t border-line">
                  <td className="px-4 py-3">{receipt.receiptNumber}</td>
                  <td className="px-4 py-3">{receipt.customerName}</td>
                  <td className="px-4 py-3">{receipt.receiptDate}</td>
                  <td className="px-4 py-3 text-right"><MoneyValue amount={receipt.total} /></td>
                  <td className="px-4 py-3 text-muted">Advance <MoneyValue amount={receipt.advanceAmount} /></td>
                </tr>
              )) : null}
              {section === "returns" ? returns.data?.data.map((request) => (
                <tr key={request.id} className="border-t border-line">
                  <td className="px-4 py-3">{request.invoiceNumber}</td>
                  <td className="px-4 py-3">{request.reason}</td>
                  <td className="px-4 py-3 capitalize">{request.status}</td>
                  <td className="px-4 py-3 text-right capitalize">{request.settlement}</td>
                  <td className="px-4 py-3">{request.lines.map((line) => line.productName).join(", ")}</td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </Card>
      ) : null}
      <Modal open={open} title="New invoice" onOpenChange={setOpen}>
        <div className="space-y-3">
          <label className="block text-sm">Branch
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="Invoice branch">
              <option value="">Select a branch</option>
              {(branches.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Customer
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={customerId} onChange={(event) => setCustomerId(event.target.value)} aria-label="Invoice customer">
              <option value="">Select a customer</option>
              {(customers.data?.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Invoice date<Input className="mt-1" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label>
          <label className="block text-sm">Payment terms (days)<Input className="mt-1" value={paymentTermsDays} onChange={(event) => setPaymentTermsDays(event.target.value)} /></label>
          <label className="block text-sm">Settlement
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={settlement} onChange={(event) => setSettlement(event.target.value as "credit" | "cash")}>
              <option value="credit">Credit</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          {settlement === "cash" ? (
            <label className="block text-sm">Method
              <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={cashMethod} onChange={(event) => setCashMethod(event.target.value as "cash")}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="pos">POS</option>
              </select>
            </label>
          ) : null}
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">Product or service
                <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={line.productId} aria-label="Invoice product" onChange={(event) => {
                  const product = products.data?.find((item) => item.id === event.target.value);
                  setLines((current) => current.map((item, itemIndex) => itemIndex === index ? {
                    ...item,
                    productId: event.target.value,
                    unitPrice: product?.sellingPrice ?? item.unitPrice,
                    taxRate: product?.taxRate ?? item.taxRate,
                  } : item));
                }}>
                  <option value="">Select a product</option>
                  {(products.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {product.sellingPrice}{product.availableQuantity ? ` · available ${product.availableQuantity}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">Quantity<Input className="mt-1" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} /></label>
              <label className="block text-sm">Price<Input className="mt-1" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} /></label>
              <label className="block text-sm">Discount<Input className="mt-1" value={line.discount} onChange={(event) => updateLine(index, "discount", event.target.value)} /></label>
              <label className="block text-sm">Tax rate<Input className="mt-1" value={line.taxRate} onChange={(event) => updateLine(index, "taxRate", event.target.value)} /></label>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setLines((current) => [...current, emptyLine()])}>Add line</Button>
          {preview ? (
            <div className="rounded-lg bg-canvas p-3 text-sm" data-testid="invoice-preview">
              <p>Subtotal <MoneyValue amount={preview.subtotal} /></p>
              <p>Discount <MoneyValue amount={preview.discountTotal} /></p>
              <p>Tax <MoneyValue amount={preview.taxTotal} /></p>
              <p>Grand total <MoneyValue amount={preview.grandTotal} /></p>
              {preview.lines.map((line) => (
                <p key={line.productId}>{line.description}: available {line.availableQuantity ?? "service"} · <MoneyValue amount={line.lineTotal} /></p>
              ))}
            </div>
          ) : null}
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>Preview</Button>
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || !preview}>Save draft</Button>
          </div>
          <p className="text-xs text-muted">Preview totals come from the API. Save the draft, then finalize or download the PDF from the list.</p>
        </div>
      </Modal>
      <Modal open={quoteOpen} title="New quotation" onOpenChange={setQuoteOpen}>
        <div className="space-y-3">
          <label className="block text-sm">Branch
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Select a branch</option>
              {(branches.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Customer
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Select a customer</option>
              {(customers.data?.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Valid until<Input className="mt-1" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label>
          {lines.map((line, index) => (
            <label key={index} className="block text-sm">Product
              <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={line.productId} onChange={(event) => {
                const product = products.data?.find((item) => item.id === event.target.value);
                updateLine(index, "productId", event.target.value);
                if (product) updateLine(index, "unitPrice", product.sellingPrice);
              }}>
                <option value="">Select a product</option>
                {(products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sellingPrice}</option>)}
              </select>
            </label>
          ))}
          <Button type="button" onClick={() => saveQuote.mutate()} disabled={saveQuote.isPending}>Save quotation</Button>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
        </div>
      </Modal>
      <Modal open={receiptOpen} title="New receipt" onOpenChange={setReceiptOpen}>
        <div className="space-y-3">
          <label className="block text-sm">Posted invoice
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={receiptInvoiceId} onChange={(event) => {
              const invoice = invoices.data?.data.find((item) => item.id === event.target.value);
              setReceiptInvoiceId(event.target.value);
              if (invoice) {
                setCustomerId(invoice.customerId);
                setBranchId(invoice.branchId);
                setReceiptAmount(invoice.openBalance);
              }
            }}>
              <option value="">Unallocated advance</option>
              {(invoices.data?.data ?? []).filter((invoice) => invoice.status === "posted").map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · open {invoice.openBalance}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">Amount<Input className="mt-1" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} /></label>
          <label className="block text-sm">Method
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={receiptMethod} onChange={(event) => setReceiptMethod(event.target.value as "cash")}>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="pos">POS</option>
            </select>
          </label>
          <Button type="button" onClick={() => saveReceipt.mutate()} disabled={saveReceipt.isPending || !customerId || !branchId}>Save receipt</Button>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
        </div>
      </Modal>
      <Modal open={returnOpen} title="New return" onOpenChange={setReturnOpen}>
        <div className="space-y-3">
          <label className="block text-sm">Invoice
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={returnInvoiceId} onChange={(event) => { setReturnInvoiceId(event.target.value); setReturnLineId(""); }}>
              <option value="">Select an invoice</option>
              {(invoices.data?.data ?? []).filter((invoice) => invoice.status === "posted").map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">Line
            <select className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3" value={returnLineId} onChange={(event) => setReturnLineId(event.target.value)}>
              <option value="">Select a line</option>
              {(invoices.data?.data.find((invoice) => invoice.id === returnInvoiceId)?.lines ?? []).map((line) => (
                <option key={line.id} value={line.id}>{line.description} · {line.quantity}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">Quantity<Input className="mt-1" value={returnQuantity} onChange={(event) => setReturnQuantity(event.target.value)} /></label>
          <Button type="button" onClick={() => saveReturn.mutate()} disabled={saveReturn.isPending || !returnLineId}>Request return</Button>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
        </div>
      </Modal>
    </div>
  );

  function updateLine(index: number, key: keyof DraftLine, value: string) {
    setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
    setPreview(null);
  }
}
