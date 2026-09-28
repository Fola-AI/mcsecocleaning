"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markJobComplete, retryCapture, rechargeOutstanding } from "@/app/actions/payments";

/**
 * Admin completion control. "Mark complete & capture" completes the job (which
 * stands regardless of billing) then attempts capture; the returned message names
 * exactly what's needed when capture can't succeed (expired auth, never-authorised
 * balance, price above authorisation), so nobody retries a job that can never
 * capture. Retry is shown only for completed-but-unsettled jobs.
 */
export function JobCaptureControl({
  jobId,
  status,
  paymentStatus,
  quotedGrossPence,
}: {
  jobId: string;
  status: string;
  paymentStatus: string;
  quotedGrossPence: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [finalTotal, setFinalTotal] = useState("");

  if (status === "cancelled") return <span className="text-sm text-ink-soft">Cancelled</span>;

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
      {msg && <p className="max-w-md text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
