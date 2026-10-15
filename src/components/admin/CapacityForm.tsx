"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setCapacity } from "@/app/actions/admin";

/**
 * Setting the daily cap, or overriding it (§7.4).
 *
 * The date is optional: blank means "every day by default", which is the case
 * §7.4 is really about — early operation with a small roster. A date is for the
 * exception, which is why both live on one form rather than two screens.
 */
export function CapacityForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [dailyCap, setDailyCap] = useState("");
  const [overrideCap, setOverrideCap] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    start(async () => {
      const res = await setCapacity({
        date: date || undefined,
        dailyCap: dailyCap === "" ? undefined : Number(dailyCap),
        overrideCap,
        reason,
      });
      setMsg(res.message);
      if (res.ok) {
        setReason("");
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-lg border border-line p-4">
      <div>
        <label htmlFor="capacity-date" className="block text-xs font-semibold text-ink-soft">
          Date (blank = every day)
        </label>
        <input
          id="capacity-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="capacity-cap" className="block text-xs font-semibold text-ink-soft">
          Daily cap (blank = none)
        </label>
        <input
          id="capacity-cap"
          type="number"
          min={0}
          max={100}
          value={dailyCap}
          onChange={(e) => setDailyCap(e.target.value)}
          className="mt-1 w-32 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="capacity-reason" className="block text-xs font-semibold text-ink-soft">
          Reason
        </label>
        <input
          id="capacity-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. one crew on leave"
          className="mt-1 w-56 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={overrideCap} onChange={(e) => setOverrideCap(e.target.checked)} />
        Override the cap
      </label>
      <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      {msg && (
        <p className="w-full text-sm text-ink-soft" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
