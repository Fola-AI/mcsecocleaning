"use client";

import { useState, useTransition } from "react";
import { jobPaymentLink, reissueJobPaymentLink } from "@/app/actions/payments";

/**
 * Payment-link recovery on the jobs row (PRD §16.3 → L2, deferred from Phase 2).
 *
 * Phase 2 created an admin booking's payment link, emailed it, and then had no
 * way to get it back — so a customer who lost the email meant a new booking or a
 * phone call. "Get link" reads the Checkout Session Stripe actually holds (the
 * session id has been stored on the Payment row all along, for cancellations) and
 * either hands back the live URL or says it has expired. "Reissue" then mints a
 * fresh one through the same re-charge core the customer self-pay path uses, so
 * the old rows are superseded in place and a job can never end up with two live
 * links for the same money.
 *
 * Stripe is only asked when the admin asks: a session lookup per row on page load
 * would make the jobs list slow and rate-limited for information nobody wanted.
 */
export function JobPaymentLinkControl({ jobId, outstanding }: { jobId: string; outstanding: boolean }) {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [canReissue, setCanReissue] = useState(false);
  const [copied, setCopied] = useState(false);

  // Nothing owed → no link to send. The server action refuses too; this just keeps
  // the row quiet.
  if (!outstanding) return <span className="text-xs text-ink-soft">—</span>;

  const getLink = () =>
    start(async () => {
      const res = await jobPaymentLink(jobId);
      setUrl(res.url ?? null);
      setMsg(res.message);
      setCanReissue(res.action === "reissue");
      setCopied(false);
    });

  const reissue = () =>
    start(async () => {
      const res = await reissueJobPaymentLink(jobId);
      setUrl(res.url ?? null);
      setMsg(res.message);
      setCanReissue(!res.ok);
      setCopied(false);
    });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused (permissions, insecure context). The URL
      // is on screen and selectable, so say so rather than failing silently.
      setCopied(false);
      setMsg("Couldn't copy automatically — select the link below and copy it.");
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost text-xs" disabled={pending} onClick={getLink}>
          {pending ? "Checking…" : "Get payment link"}
        </button>
        {url && (
          <button type="button" className="btn btn-ghost text-xs" onClick={copy}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        )}
        {canReissue && (
          <button type="button" className="btn btn-primary text-xs" disabled={pending} onClick={reissue}>
            {pending ? "Reissuing…" : "Reissue"}
          </button>
        )}
      </div>
      {msg && (
        <p className="max-w-xs text-xs text-ink-soft" role="status">
          {msg}
        </p>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block max-w-xs truncate text-xs text-brand-ink underline"
        >
          {url}
        </a>
      )}
    </div>
  );
}
