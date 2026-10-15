import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useKeyedActionSuccess } from "@/hooks/use-action-success";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { PageLoader } from "@/components/ui/page-loader";
import {
  IMPORT_TYPE_OPTIONS,
  approveImport,
  commitImport,
  importReport,
  listImportBatches,
  parseImport,
  previewImport,
  uploadImport,
  validateImport,
  type ImportBatchRow,
  type ImportType,
} from "@/features/imports/api";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function ImportsPage() {
  const queryClient = useQueryClient();
  const batches = useQuery({ queryKey: ["imports"], queryFn: listImportBatches });
  const [importType, setImportType] = useState<ImportType>("customers");
  const [selected, setSelected] = useState<ImportBatchRow | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewImport>> | null>(null);
  const [report, setReport] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await fileToBase64(file);
      return uploadImport({ importType, fileName: file.name, contentBase64 });
    },
    onSuccess: async (batch) => {
      setSelected(batch);
      setPreview(null);
      setReport(null);
      setMessage("File uploaded.");
      await queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: () => setMessage("The file could not be uploaded."),
  });

  const runStep = useMutation({
    mutationFn: async (step: "parse" | "validate" | "preview" | "approve" | "commit" | "report") => {
      if (!selected) throw new Error("Select a batch");
      if (step === "parse") return parseImport(selected.id);
      if (step === "validate") return validateImport(selected.id);
      if (step === "preview") return previewImport(selected.id);
      if (step === "approve") return approveImport(selected.id);
      if (step === "commit") return commitImport(selected.id);
      return importReport(selected.id);
    },
    onSuccess: async (result, step) => {
      if (step === "preview") {
        setPreview(result as Awaited<ReturnType<typeof previewImport>>);
        setSelected((current) => (current ? { ...current, status: "previewed" } : current));
      } else if (step === "report") {
        setReport((result as { report: unknown }).report);
      } else {
        const batch = result as ImportBatchRow;
        setSelected(batch);
        if ("report" in batch) setReport((batch as ImportBatchRow & { report: unknown }).report);
      }
      setMessage(`Step ${step} completed.`);
      await queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: (_error, step) => setMessage(`Step ${step} was rejected.`),
  });
  const stepFx = useKeyedActionSuccess(runStep);

  return (
    <section className="space-y-4">
      <Breadcrumbs items={[{ label: "Data Import" }]} />
      <div>
        <h1 className="text-xl font-semibold">Data import</h1>
        <p className="text-sm text-muted">
          Upload a CSV, then parse, validate, preview, approve, and commit. Opening financial rows must balance before approval.
        </p>
      </div>
      {batches.isError ? <ErrorState message="Import batches could not be loaded." /> : null}
      {batches.isLoading ? <PageLoader label="Loading import batches…" /> : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <Card className="space-y-3 p-4">
        <label className="block text-sm">
          Import type
          <select
            className="mt-1 w-full rounded border border-line bg-surface px-3 py-2"
            value={importType}
            onChange={(event) => setImportType(event.target.value as ImportType)}
          >
            {IMPORT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          CSV file
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
        </label>
        {upload.isPending ? <p className="text-sm text-muted">Uploading…</p> : null}
        {selected ? (
          <div className="flex flex-wrap gap-2">
            {(["parse", "validate", "preview", "approve", "commit", "report"] as const).map((step) => (
              <ActionButton
                key={step}
                type="button"
                variant={step === "report" ? "secondary" : "primary"}
                pending={stepFx.isPendingFor(step)}
                success={stepFx.isSuccessFor(step)}
                onClick={() => runStep.mutate(step)}
              >
                {step === "parse"
                  ? "Parse"
                  : step === "validate"
                    ? "Validate"
                    : step === "preview"
                      ? "Preview"
                      : step === "approve"
                        ? "Approve"
                        : step === "commit"
                          ? "Commit"
                          : "Report"}
              </ActionButton>
            ))}
          </div>
        ) : null}
        {selected ? (
          <p className="text-sm">
            Selected {selected.fileName} · {selected.importType} · status {selected.status} · rows {selected.rowCount} ·
            ok {selected.okCount} · errors {selected.errorCount} · duplicates {selected.duplicateCount}
          </p>
        ) : null}
      </Card>

      {preview ? (
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">Preview</h2>
          <pre className="overflow-x-auto text-xs">{JSON.stringify(preview.reconciliation, null, 2)}</pre>
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-2 py-2">Row</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Messages</th>
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((row) => (
                <tr key={row.rowNumber} className="border-t border-line">
                  <td className="px-2 py-2">{row.rowNumber}</td>
                  <td className="px-2 py-2">{row.status}</td>
                  <td className="px-2 py-2">{JSON.stringify(row.messages)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {report ? (
        <Card className="space-y-2 p-4">
          <h2 className="font-medium">Import report</h2>
          <pre className="overflow-x-auto text-xs">{JSON.stringify(report, null, 2)}</pre>
        </Card>
      ) : null}

      {!batches.isLoading && batches.data ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Rows</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {batches.data.map((batch) => (
                <tr key={batch.id} className="border-t border-line">
                  <td className="px-4 py-3">{batch.fileName}</td>
                  <td className="px-4 py-3">{batch.importType}</td>
                  <td className="px-4 py-3">{batch.status}</td>
                  <td className="px-4 py-3">{batch.rowCount}</td>
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setSelected(batch);
                        setPreview(null);
                        setReport(null);
                      }}
                    >
                      Select
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </section>
  );
}
