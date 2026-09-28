"use client";

import { useState, useTransition } from "react";
import { payMyOutstanding } from "@/app/actions/account";

/** "Pay now" for the customer's own outstanding balance — the action verifies
 *  ownership, prepares the shared Checkout, and returns the URL to redirect to. */
export function PayOutstandingButton({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pay = () =>
    start(async () => {
      setError(null);
      const res = await payMyOutstanding(jobId);
      if (res.ok && res.url) {
        window.location.href = res.url;
        return;
      }
      setError(res.message);
    });

  return (
    <div className="text-right">
      <button className="btn btn-primary" disabled={pending} onClick={pay}>
        {pending ? "Opening…" : "Pay now"}
      </button>
      {error && <p className="mt-1 text-sm text-error" role="alert">{error}</p>}
    </div>
  );
}
