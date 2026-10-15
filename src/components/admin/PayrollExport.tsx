"use client";

import { useState, useTransition } from "react";

import { payrollCsvForPeriod } from "@/app/actions/admin";

/**
 * Download the period as CSV (§9.8: "a format your accountant or payroll
 * software can consume").
 *
 * The CSV is generated on the **server** and handed back as text, rather than
 * rebuilt in the browser from the rendered table. Two reasons: the table rounds
 * for display and the export must not inherit that, and a second implementation
 * of payroll arithmetic is a second thing to get wrong.
 */
export function PayrollExport({ from, to }: { from: string; to: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const download = () =>
    start(async () => {
      const result = await payrollCsvForPeriod(from, to);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payroll-${from}-to-${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });

  return (
    <div className="mt-4">
      <button type="button" className="btn btn-outline text-sm" disabled={pending} onClick={download}>
        {pending ? "Preparing…" : "Download CSV"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
