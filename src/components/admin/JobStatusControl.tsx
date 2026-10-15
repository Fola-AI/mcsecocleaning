"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobStatus } from "@prisma/client";

import { setJobStatus } from "@/app/actions/admin";
import { allowedNextStatuses, label } from "@/lib/job-status";

/**
 * Move a job along the §9.1 pipeline.
 *
 * It offers only the transitions that are legal from the job's current status,
 * read from the same map the server action re-checks — so the dropdown cannot
 * suggest something the server will refuse, and the server does not trust the
 * dropdown. A note is optional except where the transition costs the customer
 * money, where it is asked for: `no_access` triggers the §8 lockout fee, and
 * "the crew says nobody was in" is the whole evidence for charging it.
 */
export function JobStatusControl({ jobId, status }: { jobId: string; status: JobStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [next, setNext] = useState<JobStatus | "">("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const options = allowedNextStatuses(status);
  if (options.length === 0) {
    return <span className="text-xs text-ink-soft">{label(status)} — final</span>;
  }

  const needsNote = next === "no_access" || next === "on_hold" || next === "cancelled";

  const apply = () =>
    start(async () => {
      if (!next) return;
      const res = await setJobStatus(jobId, next, note || undefined);
      setMsg(res.message);
      if (res.ok) {
        setNext("");
        setNote("");
        router.refresh();
      }
    });

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`status-${jobId}`}>
          Move {label(status)} to
        </label>
        <select
          id={`status-${jobId}`}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
          value={next}
          onChange={(e) => setNext(e.target.value as JobStatus)}
        >
          <option value="">Move to…</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {label(option)}
            </option>
          ))}
        </select>
        {needsNote && (
          <input
            className="w-48 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
            placeholder={next === "no_access" ? "What happened? (required)" : "Reason (required)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Reason for this status change"
          />
        )}
        <button
          type="button"
          className="btn btn-outline text-xs"
          disabled={pending || !next || (needsNote && note.trim().length === 0)}
          onClick={apply}
        >
          {pending ? "Saving…" : "Move"}
        </button>
      </div>
      {msg && (
        <p className="max-w-md text-xs text-ink-soft" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
