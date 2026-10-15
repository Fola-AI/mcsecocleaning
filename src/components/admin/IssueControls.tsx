"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { resolveIssue, scheduleReclean, setIssueUrgency } from "@/app/actions/issues";

/**
 * The three resolution paths §9.5 names, plus manual urgency.
 *
 * A re-clean is one button because it is the one we want used: it is the
 * guarantee, it costs a visit rather than a refund, and it ends with a clean
 * house instead of an argument. A refund and an explanation both ask for a
 * reason before they will go through.
 */
export function IssueControls({ issueId, jobId }: { issueId: string; jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.message);
      if (res.ok) router.refresh();
    });

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary text-xs"
          disabled={pending}
          onClick={() => run(() => scheduleReclean(jobId, { issueId, note: reason || undefined }))}
        >
          {pending ? "…" : "Book a free re-clean"}
        </button>
        <input
          className="w-64 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
          placeholder="Reason / what you told them"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason for the resolution"
        />
        <button
          type="button"
          className="btn btn-outline text-xs"
          disabled={pending || reason.trim().length < 3}
          onClick={() => run(() => resolveIssue({ issueId, resolution: "partial_refund", reason }))}
        >
          Partial refund
        </button>
        <button
          type="button"
          className="btn btn-outline text-xs"
          disabled={pending || reason.trim().length < 3}
          onClick={() => run(() => resolveIssue({ issueId, resolution: "explanation", reason }))}
        >
          Explained
        </button>
        <button
          type="button"
          className="text-xs underline"
          disabled={pending}
          onClick={() => run(() => setIssueUrgency(issueId, "high"))}
        >
          mark urgent
        </button>
      </div>
      {msg && (
        <p className="text-xs text-ink-soft" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
