import Papa from "papaparse";
import { z } from "zod";
import {
  createCustomerSchema,
  type CreateCustomerInput,
} from "@/lib/validations/customer";

export const MAX_CUSTOMER_IMPORT_BYTES = 300_000;
export const MAX_CUSTOMER_IMPORT_ROWS = 500;
export const customerImportFields = [
  ["firstName", "First name", true],
  ["lastName", "Last name", false],
  ["companyName", "Company", false],
  ["email", "Email", false],
  ["phone", "Phone", true],
  ["addressLine1", "Address", false],
  ["addressLine2", "Address line 2", false],
  ["city", "City", false],
  ["state", "State", false],
  ["postalCode", "Postal code", false],
  ["notes", "Notes", false],
] as const;
export type CustomerImportInput = {
  csv: string;
  mapping: Record<string, string>;
};
export type CustomerImportReport = {
  total: number;
  created: number;
  duplicates: number;
  invalid: number;
  issues: { row: number; message: string }[];
  alreadyImported?: boolean;
};
const inputSchema = z.object({
  csv: z.string().min(1).max(MAX_CUSTOMER_IMPORT_BYTES),
  mapping: z
    .record(z.string().max(100))
    .refine((v) => Object.keys(v).length <= 11),
});

export function parseCustomerCsv(csv: string) {
  if (new TextEncoder().encode(csv).length > MAX_CUSTOMER_IMPORT_BYTES)
    throw new Error("Choose a CSV smaller than 300 KB.");
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length)
    throw new Error(
      "The CSV contains an unfinished quote or invalid row. Check the file and try again.",
    );
  const [rawHeaders, ...rows] = parsed.data;
  const headers = rawHeaders?.map((value) => value.trim()) ?? [];
  if (!headers.length || !rows.length)
    throw new Error("Include a header row and at least one customer.");
  if (
    headers.length > 40 ||
    headers.some((h) => !h || h.length > 100) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("Use unique, nonempty column headings (up to 40 columns).");
  if (rows.length > MAX_CUSTOMER_IMPORT_ROWS)
    throw new Error(
      "Import up to 500 customers at a time. Split larger files into smaller batches.",
    );
  if (rows.some((row) => row.length !== headers.length))
    throw new Error(
      "Every row must have the same number of columns as the header.",
    );
  return { headers, rows };
}

export function prepareCustomerImport(input: CustomerImportInput) {
  const checked = inputSchema.safeParse(input);
  if (!checked.success)
    throw new Error(
      "The import is invalid or too large. Choose a CSV under 300 KB with up to 500 rows.",
    );
  const { headers, rows } = parseCustomerCsv(checked.data.csv);
  const mapping = checked.data.mapping;
  const selected = Object.values(mapping).filter(Boolean);
  if (new Set(selected).size !== selected.length)
    throw new Error("Map each source column to only one customer field.");
  for (const [key, label, required] of customerImportFields) {
    if (required && !mapping[key])
      throw new Error(`Choose a column for ${label.toLowerCase()}.`);
    if (mapping[key] && !headers.includes(mapping[key]))
      throw new Error(`The selected ${label.toLowerCase()} column is missing.`);
  }
  const valid: { row: number; data: CreateCustomerInput }[] = [];
  const issues: CustomerImportReport["issues"] = [];
  rows.forEach((row, index) => {
    const raw = Object.fromEntries(
      customerImportFields.map(([key]) => [
        key,
        mapping[key] ? row[headers.indexOf(mapping[key])].trim() : "",
      ]),
    );
    raw.email = raw.email.toLowerCase();
    const parsed = createCustomerSchema.safeParse(raw);
    if (parsed.success) valid.push({ row: index + 2, data: parsed.data });
    else
      issues.push({
        row: index + 2,
        message: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
  });
  return { total: rows.length, valid, issues };
}

export function partitionCustomerImport(
  prepared: ReturnType<typeof prepareCustomerImport>,
  existing: { email: string | null }[],
) {
  const emails = new Set(
    existing.map((c) => c.email?.trim().toLowerCase()).filter(Boolean),
  );
  const creates: typeof prepared.valid = [];
  const issues = [...prepared.issues];
  let duplicates = 0;
  for (const entry of prepared.valid) {
    if (entry.data.email && emails.has(entry.data.email)) {
      duplicates++;
      issues.push({
        row: entry.row,
        message:
          "An existing customer or earlier row has this email. Skipped without changing the existing record.",
      });
    } else {
      creates.push(entry);
      if (entry.data.email) emails.add(entry.data.email);
    }
  }
  return {
    creates,
    report: {
      total: prepared.total,
      created: creates.length,
      duplicates,
      invalid: prepared.issues.length,
      issues,
    } satisfies CustomerImportReport,
  };
}
