"use client";

import { useEffect, useState, useTransition } from "react";

import { revealAccessCode } from "@/app/actions/crew";

/**
 * Showing an access code on a doorstep (§6.9).
 *
 * The code is fetched **when asked for** and held only in this component's
 * state: it is never part of the page's data, so it is not in the router cache,
 * the browser history entry, or any error report the page generates.
 *
 * It hides itself again after a couple of minutes. Not security theatre — a
 * phone left on a kitchen worktop with an alarm code on screen is a real way
 * for one to leak, and a crew member who needs it again taps once.
 */
export function AccessCodeReveal({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  const [shown, setShown] = useState<{ type: "lockbox" | "alarm"; code: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), 120_000);
    return () => clearTimeout(timer);
  }, [shown]);

  const reveal = (type: "lockbox" | "alarm") =>
    start(async () => {
      setMsg(null);
      const res = await revealAccessCode(jobId, type);
      if (res.ok && res.code) {
        setShown({ type, code: res.code });
        setMsg(res.message);
        return;
      }
      setShown(null);
      setMsg(res.message);
    });

  if (shown) {
    return (
      <div className="mt-3 rounded-lg border border-brand bg-brand-tint/60 p-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">{shown.type} code</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em] text-brand-ink">{shown.code}</p>
        <button type="button" className="mt-3 text-sm underline" onClick={() => setShown(null)}>
          Hide it
        </button>
        <p className="mt-1 text-xs text-ink-soft">Hides itself in two minutes.</p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn btn-outline py-3" disabled={pending} onClick={() => reveal("lockbox")}>
          {pending ? "…" : "Lockbox code"}
        </button>
        <button type="button" className="btn btn-outline py-3" disabled={pending} onClick={() => reveal("alarm")}>
          {pending ? "…" : "Alarm code"}
        </button>
      </div>
      {msg && (
        <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm text-ink-soft" role="status">
          {msg}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-soft">
        Shown only to the crew on this job, and only around the appointment. Every request is logged.
      </p>
    </div>
  );
}
