"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pauseMySubscription, resumeMySubscription, cancelMySubscription } from "@/app/actions/account";

/**
 * Pause / resume / cancel a plan (§14.3: the route must be easy and clear). Inline
 * two-click confirm — one confirmation, no retention offer, no discount
 * interstitial, no "talk to us first". The confirm state names exactly what
 * happens and is announced via aria-live for screen readers (WCAG 2.2 AA, §12).
 * Resume is a single positive click. A paused plan shows Resume in the same place,
 * so the reversible state is obvious.
 */
export function SubscriptionControls({ subscriptionId, status }: { subscriptionId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | "pause" | "cancel">(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (status === "cancelled") return <span className="text-sm text-ink-soft">Cancelled</span>;

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.message);
      setConfirm(null);
      router.refresh();
    });

  const confirmCopy =
    confirm === "pause"
      ? "Confirm pause — no visits until you resume"
      : "Confirm cancel — this ends the plan";

  return (
    <div className="text-right">
      {confirm ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-soft">{confirmCopy}</span>
          <button
            className="btn btn-primary"
            disabled={pending}
            onClick={() => run(() => (confirm === "pause" ? pauseMySubscription(subscriptionId) : cancelMySubscription(subscriptionId)))}
          >
            {pending ? "Working…" : confirm === "pause" ? "Confirm pause" : "Confirm cancel"}
          </button>
          <button className="btn btn-outline" disabled={pending} onClick={() => setConfirm(null)}>
            Keep plan
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {status === "active" && (
            <button className="btn btn-outline" onClick={() => setConfirm("pause")}>Pause</button>
          )}
          {status === "paused" && (
            <button className="btn btn-outline" disabled={pending} onClick={() => run(() => resumeMySubscription(subscriptionId))}>
              {pending ? "Working…" : "Resume"}
            </button>
          )}
          <button className="btn btn-outline" onClick={() => setConfirm("cancel")}>Cancel</button>
        </div>
      )}
      <p className="mt-1 min-h-5 text-sm text-ink-soft" role="status" aria-live="polite">
        {confirm ? confirmCopy : msg}
      </p>
    </div>
  );
}
