"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { markInvoicePaid } from "@/app/actions/admin";

/**
 * Mark an invoice paid.
 *
 * A fact somebody asserts rather than one the system derives: money arriving in
 * a bank account is not something this application can see, and guessing would
 * be worse than asking.
 */
export function InvoicePaidButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (msg) return <span className="text-xs text-ink-soft">{msg}</span>;

  return (
    <button
      type="button"
      className="text-xs underline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await markInvoicePaid(invoiceId);
          setMsg(res.message);
          if (res.ok) router.refresh();
        })
      }
    >
      {pending ? "…" : "mark paid"}
    </button>
  );
}
