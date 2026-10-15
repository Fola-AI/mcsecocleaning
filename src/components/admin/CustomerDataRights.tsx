"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { eraseCustomer, subjectAccessExport } from "@/app/actions/data-rights";

/**
 * Subject access and erasure, per customer (§14.3).
 *
 * Erasure asks twice and says what will be **kept**, because that is the part
 * people are surprised by: the invoices stay. Telling them afterwards is how a
 * data-rights request turns into a complaint about the data-rights request.
 */
export function CustomerDataRights({ customerId, name }: { customerId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [retained, setRetained] = useState<string[]>([]);

  const exportData = () =>
    start(async () => {
      const res = await subjectAccessExport(customerId);
      if (!res.ok || !res.json) {
        setMsg(res.message);
        return;
      }
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `subject-access-${customerId}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMsg("Downloaded. Send it to them by a route you are confident is theirs.");
    });

  const erase = () =>
    start(async () => {
      const res = await eraseCustomer(customerId);
      setMsg(res.message);
      setRetained(res.summary?.retained ?? []);
      setConfirming(false);
      // Deliberately NO refresh on success. An erased customer leaves a filtered
      // list, and refreshing would take this message — and the list of what was
      // KEPT — with it. That list is the part the admin needs to read, and the
      // part they will be asked about. The row they are looking at is stale
      // either way, and says so.
      if (!res.ok) router.refresh();
    });

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" className="underline" disabled={pending} onClick={exportData}>
          {pending ? "…" : "Download their data"}
        </button>
        {!confirming ? (
          <button type="button" className="text-error underline" onClick={() => setConfirming(true)}>
            Erase them
          </button>
        ) : (
          <>
            <span className="text-ink-soft">
              Erase {name}? Their details go; the invoices and payments stay, because the law requires it.
            </span>
            <button type="button" className="btn btn-primary text-xs" disabled={pending} onClick={erase}>
              {pending ? "Erasing…" : "Yes, erase"}
            </button>
            <button type="button" className="underline" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        )}
      </div>

      {msg && (
        <p className="text-xs text-ink-soft" role="status">
          {msg}
        </p>
      )}
      {retained.length > 0 && (
        <>
          <p className="text-xs font-semibold text-ink-soft">Kept, and why:</p>
          <ul className="list-disc pl-5 text-xs text-ink-soft">
            {retained.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-xs text-ink-soft">
            This row is now out of date — reload the page to see the anonymised record.
          </p>
        </>
      )}
    </div>
  );
}
