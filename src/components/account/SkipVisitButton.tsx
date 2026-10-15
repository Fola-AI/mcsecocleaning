"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { skipMyVisit } from "@/app/actions/account";

/**
 * Skip one visit of a plan (§7.3).
 *
 * The point of this button is to prevent a cancellation. A customer who is away
 * one week and cannot easily say so cancels the whole plan instead — so it is
 * one tap, on the booking itself, and the copy makes the consequence explicit:
 * the plan carries on.
 *
 * It asks once before acting, because unlike unsubscribing this is not
 * reversible from the same screen: the visit is gone and rebooking it means
 * ringing the office.
 */
export function SkipVisitButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (msg) {
    return (
      <p className="text-sm text-ink-soft" role="status">
        {msg}
      </p>
    );
  }

  if (!confirming) {
    return (
      <button type="button" className="btn btn-outline" onClick={() => setConfirming(true)}>
        Skip this visit
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-soft">Skip it? Your plan carries on.</span>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await skipMyVisit(jobId);
            setMsg(res.message);
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? "Skipping…" : "Yes, skip it"}
      </button>
      <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)}>
        Keep it
      </button>
    </div>
  );
}
