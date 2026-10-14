"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  parseCustomerCsv,
  customerImportFields,
  MAX_CUSTOMER_IMPORT_BYTES,
  type CustomerImportReport,
} from "@/lib/customer-import";
import { suggestMapping } from "@/lib/csv-import/mapping";
import { ENTITY_SPECS } from "@/lib/csv-import/specs";
import { reviewCustomerImport, saveCustomerImport } from "./customer-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CustomerImportForm() {
  const [csv, setCsv] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<CustomerImportReport | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestLock = useRef(false);
  const fileGeneration = useRef(0);
  const [reading, setReading] = useState(false);
  async function load(file?: File) {
    const generation = ++fileGeneration.current;
    setReading(Boolean(file));
    setError("");
    setReport(null);
    setDone(false);
    setHeaders([]);
    setCsv("");
    if (!file) return;
    try {
      if (file.size > MAX_CUSTOMER_IMPORT_BYTES)
        throw new Error("Choose a CSV smaller than 300 KB.");
      const text = await file.text();
      if (generation !== fileGeneration.current) return;
      const parsed = parseCustomerCsv(text);
      setCsv(text);
      setHeaders(parsed.headers);
      setMapping(suggestMapping(parsed.headers, ENTITY_SPECS.customers));
    } catch (e) {
      if (generation === fileGeneration.current) setError((e as Error).message);
    } finally {
      if (generation === fileGeneration.current) setReading(false);
    }
  }
  async function submit(commit: boolean) {
    if (requestLock.current || reading) return;
    requestLock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await (commit ? saveCustomerImport : reviewCustomerImport)(
        { csv, mapping },
      );
      if (result.success) {
        setReport(result.report);
        setDone(commit);
      } else setError(result.error);
    } catch {
      setError(
        commit
          ? "Connection interrupted. Retry this same file to confirm the import without adding the batch twice."
          : "Connection interrupted. No records were changed. Try again.",
      );
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="customer-csv">1. Choose your customer CSV</Label>
        <p className="text-sm text-muted-foreground my-2">
          Up to 500 rows and 300 KB. First name and phone are required.
        </p>
        <Input
          disabled={busy}
          id="customer-csv"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            void load(event.target.files?.[0]);
          }}
        />
        <a
          className="inline-block mt-3 underline text-sm"
          href="/templates/customers.csv"
          download
        >
          Download a blank CSV template
        </a>
      </div>
      {reading && <p role="status">Reading file…</p>}
      {headers.length > 0 && !done && (
        <fieldset disabled={busy || reading} className="space-y-4">
          <legend className="font-semibold mb-3">2. Match your columns</legend>
          <div className="grid sm:grid-cols-2 gap-4">
            {customerImportFields.map(([key, label, required]) => (
              <div key={key}>
                <Label htmlFor={`map-${key}`}>
                  {label}
                  {required ? " (required)" : ""}
                </Label>
                <select
                  id={`map-${key}`}
                  className="w-full mt-1 border rounded-md p-2 min-h-11 bg-background"
                  value={mapping[key] || ""}
                  onChange={(event) => {
                    setMapping({ ...mapping, [key]: event.target.value });
                    setReport(null);
                  }}
                >
                  <option value="">
                    {required ? "Choose a column" : "Do not import"}
                  </option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <Button
            onClick={() => {
              void submit(false);
            }}
            disabled={busy}
          >
            {busy ? "Checking…" : "Review import"}
          </Button>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {report && (
        <section aria-live="polite" className="border rounded-lg p-5 space-y-3">
          <h2 className="text-lg font-semibold">
            {done
              ? report.alreadyImported
                ? "This file was already imported"
                : "Import complete"
              : "3. Review before importing"}
          </h2>
          <p>
            {report.created} {done ? "added" : "ready to add"} ·{" "}
            {report.duplicates} duplicate{" "}
            {report.duplicates === 1 ? "row" : "rows"} skipped ·{" "}
            {report.invalid} invalid {report.invalid === 1 ? "row" : "rows"}{" "}
            skipped
          </p>
          {report.issues.length > 0 && (
            <details>
              <summary className="cursor-pointer py-2">
                Review {report.issues.length} skipped{" "}
                {report.issues.length === 1 ? "row" : "rows"}
              </summary>
              <ul className="space-y-2 text-sm mt-3 max-h-64 overflow-auto">
                {report.issues.map((issue, index) => (
                  <li key={index}>
                    Row {issue.row}: {issue.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!done && report.created > 0 && (
            <Button
              disabled={busy}
              onClick={() => {
                void submit(true);
              }}
            >
              {busy
                ? "Importing…"
                : `Import ${report.created} customer${report.created === 1 ? "" : "s"}`}
            </Button>
          )}
          {done && (
            <p className="text-sm text-muted-foreground">
              Fixing skipped rows? Put only those rows in a new file. Previously
              imported rows without an email cannot be identified in a changed
              file.
            </p>
          )}
          {done && (
            <div className="flex gap-5">
              <Link className="underline" href="/customers">
                View customers
              </Link>
              <Link className="underline" href="/setup">
                Continue setup
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
