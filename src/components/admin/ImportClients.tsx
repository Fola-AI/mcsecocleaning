"use client";

import { useMemo, useState, useTransition } from "react";
import { parseClientCsv } from "@/lib/csv";
import { importClients, type ImportResult } from "@/app/actions/admin";

const EXAMPLE = `name,email,phone,postcode,bedrooms,bathrooms,kitchens,notes
Jane Doe,jane@example.com,07123456789,SW4 7AA,2,1,1,Prefers fragrance-free`;

export function ImportClients() {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  const preview = useMemo(() => (csv.trim() ? parseClientCsv(csv) : null), [csv]);

  const run = () => start(async () => setResult(await importClients(csv)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Paste a CSV with a header row. Recognised columns: name, email, phone, address, postcode,
        property type, kitchens, bathrooms, receptions, bedrooms, notes.
      </p>
      <textarea
        className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm"
        rows={10}
        placeholder={EXAMPLE}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />
      {preview && (
        <div className="rounded-lg bg-brand-tint/40 px-4 py-3 text-sm">
          <p><strong>{preview.records.length}</strong> valid rows · <strong>{preview.errors.length}</strong> errors</p>
          {preview.errors.slice(0, 5).map((e) => (
            <p key={e.row} className="text-error">Row {e.row}: {e.message}</p>
          ))}
        </div>
      )}
      <button className="btn btn-primary" onClick={run} disabled={pending || !preview?.records.length}>
        {pending ? "Importing…" : `Import ${preview?.records.length ?? 0} clients`}
      </button>
      {result && (
        <p className="rounded-lg bg-brand-tint px-4 py-3 text-sm text-brand-ink" role="status">
          Imported {result.imported}, skipped {result.skipped}, {result.errors.length} row errors.
        </p>
      )}
    </div>
  );
}
