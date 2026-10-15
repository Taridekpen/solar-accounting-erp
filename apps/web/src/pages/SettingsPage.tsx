import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ActionButton } from "@/components/ui/action-button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { useActionSuccess, useKeyedActionSuccess } from "@/hooks/use-action-success";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/page-loader";
import {
  fetchAccountMappings,
  fetchAdminTaxCodes,
  fetchAuditEvents,
  fetchDelegations,
  fetchDocumentTemplates,
  fetchDocuments,
  fetchExpensePolicies,
  fetchFiscalPeriods,
  fetchSeparationRules,
  revokeDelegation,
  updateAccountMapping,
  updateDocumentTemplates,
  uploadDocument,
} from "@/features/admin/api";
import { useAuth } from "@/features/auth/auth-context";
import { fetchCompany, updateCompany } from "@/features/organization/api";

const companySchema = z.object({
  legalName: z.string().trim().min(2, "Enter the legal name"),
  tradingName: z.string().trim().optional(),
  registrationNumber: z.string().trim().optional(),
  taxIdentificationNumber: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  country: z.string().trim().min(2, "Enter a country"),
  baseCurrency: z.string().trim().regex(/^[A-Z]{3}$/, "Use a three-letter currency code"),
  timezone: z.string().trim().min(1, "Enter a timezone"),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  purchaseApprovalLimit: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Enter a decimal amount"),
  emailNotificationsEnabled: z.boolean(),
});

type CompanyForm = z.infer<typeof companySchema>;
type Section = "company" | "accounting" | "approvals" | "documents" | "audit";

export function SettingsPage() {
  const { session } = useAuth();
  const permissions = new Set(session?.permissions ?? []);
  const canManage = permissions.has("settings.manage");
  const canAudit = permissions.has("audit.view");
  const canDocs = permissions.has("documents.view");
  const [section, setSection] = useState<Section>("company");
  const queryClient = useQueryClient();
  const company = useQuery({ queryKey: ["company"], queryFn: fetchCompany });
  const form = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      legalName: "",
      tradingName: "",
      registrationNumber: "",
      taxIdentificationNumber: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      country: "Nigeria",
      baseCurrency: "NGN",
      timezone: "Africa/Lagos",
      fiscalYearStartMonth: 1,
      purchaseApprovalLimit: "500000.0000",
      emailNotificationsEnabled: false,
    },
  });
  const save = useMutation({
    mutationFn: updateCompany,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company"] });
    },
  });
  const saveOk = useActionSuccess(save);

  useEffect(() => {
    if (!company.data) return;
    form.reset({
      legalName: company.data.legalName,
      tradingName: company.data.tradingName ?? "",
      registrationNumber: company.data.registrationNumber ?? "",
      taxIdentificationNumber: company.data.taxIdentificationNumber ?? "",
      email: company.data.email ?? "",
      phone: company.data.phone ?? "",
      address: company.data.address ?? "",
      city: company.data.city ?? "",
      state: company.data.state ?? "",
      country: company.data.country,
      baseCurrency: company.data.baseCurrency,
      timezone: company.data.timezone,
      fiscalYearStartMonth: company.data.fiscalYearStartMonth,
      purchaseApprovalLimit: company.data.purchaseApprovalLimit ?? "500000.0000",
      emailNotificationsEnabled: company.data.emailNotificationsEnabled ?? false,
    });
  }, [company.data, form]);

  const tabs: Array<{ id: Section; label: string; show: boolean }> = [
    { id: "company", label: "Company", show: true },
    { id: "accounting", label: "Accounting", show: true },
    { id: "approvals", label: "Approvals", show: true },
    { id: "documents", label: "Documents", show: canDocs || permissions.has("settings.view") },
    { id: "audit", label: "Audit", show: canAudit },
  ];

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Settings" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted">Company administration, accounting defaults, approvals, documents, and audit history.</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link className="text-primary" to="/departments">Departments</Link>
          <Link className="text-primary" to="/employees">Employees</Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.filter((tab) => tab.show).map((tab) => (
          <Button key={tab.id} type="button" variant={section === tab.id ? "primary" : "secondary"} onClick={() => setSection(tab.id)}>
            {tab.label}
          </Button>
        ))}
      </div>

      {section === "company" ? (
        <Card className="p-5">
          {company.isError ? <ErrorState message="The company profile could not be loaded." onRetry={() => void company.refetch()} /> : null}
          {company.isLoading ? <PageLoader label="Loading company…" className="border-0 py-10 shadow-none" /> : null}
          {!company.isLoading ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={form.handleSubmit((values) =>
              save.mutate({
                ...values,
                email: values.email || undefined,
                tradingName: values.tradingName || undefined,
              }),
            )}
          >
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Legal name</span>
              <Input {...form.register("legalName")} disabled={!canManage} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Trading name</span>
              <Input {...form.register("tradingName")} disabled={!canManage} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Purchase approval limit</span>
              <Input {...form.register("purchaseApprovalLimit")} disabled={!canManage} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Country</span>
              <Input {...form.register("country")} disabled={!canManage} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Base currency</span>
              <Input {...form.register("baseCurrency")} disabled={!canManage} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Timezone</span>
              <Input {...form.register("timezone")} disabled={!canManage} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Fiscal year starts</span>
              <Input type="number" min={1} max={12} {...form.register("fiscalYearStartMonth")} disabled={!canManage} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Inventory costing</span>
              <Input value={company.data?.inventoryCostingMethod ?? "weighted_average"} readOnly />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Rounding</span>
              <Input value={company.data?.moneyRoundingMode ?? "half_up"} readOnly />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" {...form.register("emailNotificationsEnabled")} disabled={!canManage} />
              Queue optional email copies of notifications (no mail server)
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Address</span>
              <Input {...form.register("address")} disabled={!canManage} />
            </label>
            {canManage ? (
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">Company logo</span>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file || !company.data) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = String(reader.result ?? "");
                      const contentBase64 = result.includes(",") ? result.split(",")[1]! : result;
                      void uploadDocument({
                        entityType: "company",
                        entityId: company.data.id,
                        documentKind: "logo",
                        fileName: file.name,
                        mimeType: file.type || "image/png",
                        contentBase64,
                      }).then(() => queryClient.invalidateQueries({ queryKey: ["company"] }));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                {company.data?.logoUrl ? <p className="mt-1 text-xs text-muted">Current logo path: {company.data.logoUrl}</p> : null}
              </label>
            ) : null}
            {save.isError ? <p className="text-sm text-rose-600 sm:col-span-2">{(save.error as Error).message}</p> : null}
            {save.isSuccess ? <p className="text-sm text-emerald-700 sm:col-span-2">Company profile saved.</p> : null}
            {canManage ? (
              <div className="sm:col-span-2">
                <ActionButton type="submit" pending={save.isPending || company.isLoading} success={saveOk}>Save company</ActionButton>
              </div>
            ) : null}
          </form>
          ) : null}
          <TemplatesPanel canManage={canManage} />
        </Card>
      ) : null}

      {section === "accounting" ? <AccountingPanel canManage={canManage} /> : null}
      {section === "approvals" ? <ApprovalsPanel canManage={canManage} /> : null}
      {section === "documents" ? <DocumentsPanel /> : null}
      {section === "audit" && canAudit ? <AuditPanel /> : null}
    </div>
  );
}

function TemplatesPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ["document-templates"], queryFn: fetchDocumentTemplates });
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [quotationTerms, setQuotationTerms] = useState("");
  const [paymentAdvice, setPaymentAdvice] = useState("");
  useEffect(() => {
    if (!templates.data) return;
    setInvoiceFooter(templates.data.invoiceFooter);
    setQuotationTerms(templates.data.quotationTerms);
    setPaymentAdvice(templates.data.paymentAdvice);
  }, [templates.data]);
  const save = useMutation({
    mutationFn: () => updateDocumentTemplates({ invoiceFooter, quotationTerms, paymentAdvice }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
    },
  });
  const saveOk = useActionSuccess(save);
  return (
    <div className="mt-6 space-y-3 border-t border-line pt-4">
      <h2 className="text-lg font-medium">Document templates</h2>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Invoice footer</span>
        <Input value={invoiceFooter} onChange={(event) => setInvoiceFooter(event.target.value)} disabled={!canManage} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Quotation terms</span>
        <Input value={quotationTerms} onChange={(event) => setQuotationTerms(event.target.value)} disabled={!canManage} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Payment advice</span>
        <Input value={paymentAdvice} onChange={(event) => setPaymentAdvice(event.target.value)} disabled={!canManage} />
      </label>
      {canManage ? (
        <ActionButton type="button" onClick={() => save.mutate()} pending={save.isPending} success={saveOk}>
          Save templates
        </ActionButton>
      ) : null}
    </div>
  );
}

function AccountingPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const mappings = useQuery({ queryKey: ["account-mappings"], queryFn: fetchAccountMappings });
  const taxCodes = useQuery({ queryKey: ["admin-tax-codes"], queryFn: fetchAdminTaxCodes });
  const periods = useQuery({ queryKey: ["admin-fiscal-periods"], queryFn: fetchFiscalPeriods });
  const [editing, setEditing] = useState<string | null>(null);
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const saveMapping = useMutation({
    mutationFn: () =>
      updateAccountMapping({
        eventCode: editing!,
        debitAccountId,
        creditAccountId,
      }),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["account-mappings"] });
    },
  });
  const saveMappingOk = useActionSuccess(saveMapping);
  return (
    <div className="space-y-4">
      <Card className="overflow-x-auto p-5">
        <h2 className="mb-3 text-lg font-medium">Account mappings</h2>
        {mappings.isError ? <ErrorState message="Mappings could not be loaded." onRetry={() => void mappings.refetch()} /> : null}
        <table className="min-w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">Event</th>
              <th className="py-2 pr-3 font-medium">Debit</th>
              <th className="py-2 pr-3 font-medium">Credit</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(mappings.data ?? []).map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="py-2 pr-3">{row.eventCode}</td>
                <td className="py-2 pr-3">
                  {editing === row.eventCode ? (
                    <Input value={debitAccountId} onChange={(event) => setDebitAccountId(event.target.value)} placeholder="Debit account id" />
                  ) : (
                    `${row.debitAccount.accountCode} ${row.debitAccount.accountName}`
                  )}
                </td>
                <td className="py-2 pr-3">
                  {editing === row.eventCode ? (
                    <Input value={creditAccountId} onChange={(event) => setCreditAccountId(event.target.value)} placeholder="Credit account id" />
                  ) : (
                    `${row.creditAccount.accountCode} ${row.creditAccount.accountName}`
                  )}
                </td>
                <td className="py-2">
                  {canManage ? (
                    editing === row.eventCode ? (
                      <ActionButton type="button" onClick={() => saveMapping.mutate()} pending={saveMapping.isPending} success={saveMappingOk}>Save</ActionButton>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setEditing(row.eventCode);
                          setDebitAccountId(row.debitAccountId);
                          setCreditAccountId(row.creditAccountId);
                        }}
                      >
                        Edit
                      </Button>
                    )
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-medium">Tax codes</h2>
        <ul className="space-y-2 text-sm">
          {(taxCodes.data ?? []).map((code) => (
            <li key={code.id}>{code.code} — {code.name} ({code.rate}) from {code.effectiveFrom}</li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-medium">Fiscal periods</h2>
        <ul className="space-y-2 text-sm">
          {(periods.data ?? []).map((period) => (
            <li key={period.id}>{period.startDate} to {period.endDate} — {period.status}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Period lock and reopen stay on the Closing screen.</p>
      </Card>
    </div>
  );
}

function ApprovalsPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const policies = useQuery({ queryKey: ["expense-policies"], queryFn: fetchExpensePolicies });
  const delegations = useQuery({ queryKey: ["approval-delegations"], queryFn: fetchDelegations });
  const rules = useQuery({ queryKey: ["separation-rules"], queryFn: fetchSeparationRules });
  const revoke = useMutation({
    mutationFn: revokeDelegation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["approval-delegations"] });
    },
  });
  const revokeFx = useKeyedActionSuccess(revoke);
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-medium">Expense approval policies</h2>
        <ul className="space-y-2 text-sm">
          {(policies.data ?? []).map((policy) => (
            <li key={policy.id}>Level {policy.level}: {policy.minAmount} to {policy.maxAmount}{policy.companyWide ? " (company-wide)" : ""}</li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-medium">Approval delegations</h2>
        <ul className="space-y-2 text-sm">
          {(delegations.data ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{row.delegator.email} → {row.delegate.email} ({row.permissionCode})</span>
              {canManage ? (
                <ActionButton
                  type="button"
                  variant="secondary"
                  pending={revokeFx.isPendingFor(row.id)}
                  success={revokeFx.isSuccessFor(row.id)}
                  onClick={() => revoke.mutate(row.id)}
                >
                  Revoke
                </ActionButton>
              ) : null}
            </li>
          ))}
          {(delegations.data ?? []).length === 0 ? <li className="text-muted">No active delegations.</li> : null}
        </ul>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-medium">Separation of duties</h2>
        <ul className="space-y-2 text-sm">
          {(rules.data ?? []).map((rule) => (
            <li key={rule.id}>{rule.action}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function DocumentsPanel() {
  const documents = useQuery({ queryKey: ["documents"], queryFn: () => fetchDocuments() });
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-lg font-medium">Managed documents</h2>
      {documents.isError ? <ErrorState message="Documents could not be loaded." onRetry={() => void documents.refetch()} /> : null}
      <ul className="space-y-2 text-sm">
        {(documents.data ?? []).map((doc) => (
          <li key={doc.id}>{doc.fileName} — {doc.documentKind} ({doc.byteSize} bytes)</li>
        ))}
        {(documents.data ?? []).length === 0 ? <li className="text-muted">No documents uploaded yet.</li> : null}
      </ul>
    </Card>
  );
}

function AuditPanel() {
  const [entityType, setEntityType] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const events = useQuery({
    queryKey: ["audit-events", entityType, q],
    queryFn: () => fetchAuditEvents({ entityType: entityType || undefined, q: q || undefined, take: "100" }),
  });
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-lg font-medium">Audit history</h2>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <Input value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="Entity type" aria-label="Entity type" />
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search action or reason" aria-label="Search audit" />
      </div>
      {events.isError ? <ErrorState message="Audit events could not be loaded." onRetry={() => void events.refetch()} /> : null}
      <ul className="space-y-2 text-sm">
        {(events.data ?? []).map((event) => (
          <li key={event.id} className="rounded-lg border border-line p-3">
            <button type="button" className="w-full text-left" onClick={() => setExpanded(expanded === event.id ? null : event.id)}>
              <div className="font-medium">{event.action}</div>
              <div className="text-muted">{event.occurredAt} · {event.actorEmail ?? "system"} · {event.entityType}</div>
            </button>
            {expanded === event.id ? (
              <pre className="mt-2 overflow-x-auto rounded bg-canvas p-2 text-xs">{JSON.stringify({ previous: event.previousValues, next: event.newValues }, null, 2)}</pre>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
