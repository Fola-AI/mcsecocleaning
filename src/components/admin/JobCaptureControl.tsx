"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markJobComplete, retryCapture, rechargeOutstanding, cancelAndRefundBooking } from "@/app/actions/payments";

/**
 * Admin completion control. "Mark complete & capture" completes the job (which
 * stands regardless of billing) then attempts capture; the returned message names
 * exactly what's needed when capture can't succeed (expired auth, never-authorised
 * balance, price above authorisation), so nobody retries a job that can never
 * capture. Retry is shown only for completed-but-unsettled jobs.
 *
 * Cancel & refund (§10.2, §14.3) shows only before the service starts. It is a
 * two-step confirm whose copy names exactly what happens to the money (computed
 * server-side from the Payment rows). Outside the 14-day cooling-off period the
 * button is replaced by the reason it's blocked; the server action enforces the
 * same rules regardless of what the UI shows.
 */
export function JobCaptureControl({
  jobId,
  status,
  paymentStatus,
  quotedGrossPence,
  cancel,
}: {
  jobId: string;
  status: string;
  paymentStatus: string;
  quotedGrossPence: number;
  /** Null when the job's status can't be cancelled from here. */
  cancel: { confirmText: string; blockedReason: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [finalTotal, setFinalTotal] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (status === "cancelled") {
    return (
      <div className="space-y-1">
        <span className="text-sm text-ink-soft">Cancelled</span>
        {msg && <p className="max-w-md text-sm text-ink-soft" role="status">{msg}</p>}
      </div>
    );
  }

  const isComplete = status === "completed";
  const settled = paymentStatus === "captured";

  const run = (fn: () => Promise<string>) =>
    start(async () => {
      const message = await fn();
      setMsg(message);
      router.refresh();
    });

  const doComplete = () =>
    run(async () => {
      const pence = finalTotal ? Math.round(Number(finalTotal) * 100) : undefined;
      const res = await markJobComplete(jobId, pence);
      return res.message;
    });

  const doRetry = () =>
    run(async () => {
      const res = await retryCapture(jobId);
      return res.message;
    });

  const doRecharge = () =>
    run(async () => {
      const res = await rechargeOutstanding(jobId);
      return res.message;
    });

  const doCancel = () =>
    run(async () => {
      setConfirmCancel(false);
      const res = await cancelAndRefundBooking(jobId);
      return res.message;
    });

  return (
    <div className="space-y-2">
      {!isComplete && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder={`Final £ (opt · quoted ${(quotedGrossPence / 100).toFixed(2)})`}
            className="w-48 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
            value={finalTotal}
            onChange={(e) => setFinalTotal(e.target.value)}
          />
          <button className="btn btn-primary" disabled={pending} onClick={doComplete}>
            {pending ? "Working…" : "Mark complete & capture"}
          </button>
        </div>
      )}
      {isComplete && settled && <span className="text-sm text-success">Completed · captured ✓</span>}
      {isComplete && !settled && (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-outline" disabled={pending} onClick={doRetry}>
            {pending ? "Working…" : "Retry capture"}
          </button>
          <button className="btn btn-outline" disabled={pending} onClick={doRecharge}>
            {pending ? "Working…" : "Send payment request"}
          </button>
        </div>
      )}
      {cancel && !isComplete && (
        <div className="flex flex-wrap items-center gap-2">
          {cancel.blockedReason ? (
            <p className="max-w-md text-sm text-ink-soft">{cancel.blockedReason}</p>
          ) : confirmCancel ? (
            <>
              <span className="max-w-md text-sm text-ink-soft">{cancel.confirmText}</span>
              <button className="btn btn-primary" disabled={pending} onClick={doCancel}>
                {pending ? "Working…" : "Confirm cancel & refund"}
              </button>
              <button className="btn btn-outline" disabled={pending} onClick={() => setConfirmCancel(false)}>
                Keep booking
              </button>
            </>
          ) : (
            <button className="btn btn-outline" disabled={pending} onClick={() => setConfirmCancel(true)}>
              Cancel &amp; refund
            </button>
          )}
        </div>
      )}
      <p className="max-w-md min-h-5 text-sm text-ink-soft" role="status" aria-live="polite">
        {msg}
      </p>
    </div>
  );
}
