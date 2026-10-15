"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteBlackoutDate, upsertBlackoutDate } from "@/app/actions/admin";

/**
 * Adding a blackout date (§6.2).
 *
 * The policy choice is on the form rather than buried in a settings page,
 * because it is the decision being made: "we are closed on the 25th" and "the
 * crew will do that round on the 27th instead" are different instructions to the
 * scheduler, and choosing later means choosing never.
 */
export function BlackoutForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [policy, setPolicy] = useState<"flag" | "shift">("flag");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    start(async () => {
      const res = await upsertBlackoutDate({ date, reason, policy });
      setMsg(res.message);
      if (res.ok) {
        setDate("");
        setReason("");
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-lg border border-line p-4">
      <div>
        <label htmlFor="blackout-date" className="block text-xs font-semibold text-ink-soft">Date</label>
        <input
          id="blackout-date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="blackout-reason" className="block text-xs font-semibold text-ink-soft">Reason</label>
        <input
          id="blackout-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Christmas Day"
          className="mt-1 w-56 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="blackout-policy" className="block text-xs font-semibold text-ink-soft">
          Visits that land on it
        </label>
        <select
          id="blackout-policy"
          value={policy}
          onChange={(e) => setPolicy(e.target.value as "flag" | "shift")}
          className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          <option value="flag">Hold for review</option>
          <option value="shift">Move to the next working day</option>
        </select>
      </div>
      <button type="submit" className="btn btn-primary text-sm" disabled={pending || !date}>
        {pending ? "Saving…" : "Add date"}
      </button>
      {msg && (
        <p className="w-full text-sm text-ink-soft" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}

/**
 * One blackout date.
 *
 * It reports the outcome of a removal **upward** rather than rendering it
 * itself: a confirmation drawn inside the row is destroyed by the refresh that
 * removes the row, so the message flashed and vanished. It matters here because
 * that message is the one that says visits already held or moved stay as they
 * are — the part an admin needs to read.
 */
export function BlackoutRow({
  id,
  date,
  reason,
  policy,
  past,
  onRemoved,
}: {
  id: string;
  date: string;
  reason: string | null;
  policy: "flag" | "shift";
  past?: boolean;
  onRemoved?: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const remove = () =>
    start(async () => {
      const res = await deleteBlackoutDate(id);
      if (res.ok) {
        onRemoved?.(res.message);
        router.refresh();
      } else {
        setMsg(res.message);
      }
    });

  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
      <span className={`font-mono font-semibold ${past ? "text-ink-soft" : ""}`}>{date}</span>
      <span className="text-ink-soft">{reason ?? "No reason given"}</span>
      <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs">
        {policy === "shift" ? "visits move" : "visits held"}
      </span>
      {!past && (
        <button type="button" className="ml-auto text-xs text-brand-strong underline" disabled={pending} onClick={remove}>
          {pending ? "Removing…" : "Remove"}
        </button>
      )}
      {msg && <p className="w-full text-xs text-ink-soft" role="status">{msg}</p>}
    </li>
  );
}

/**
 * The list of blackout dates, plus one place for a message about them.
 *
 * The status area lives here rather than in each row so a confirmation survives
 * the row that caused it being removed — see `BlackoutRow`.
 */
export function BlackoutList({
  rows,
  past,
  emptyMessage,
}: {
  rows: { id: string; date: string; reason: string | null; policy: "flag" | "shift" }[];
  past?: boolean;
  emptyMessage?: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <>
      {msg && (
        <p className="mt-2 rounded-lg bg-brand-tint/40 px-3 py-2 text-sm text-brand-ink" role="status">
          {msg}
        </p>
      )}
      {rows.length === 0 ? (
        emptyMessage ? <p className="mt-2 text-sm text-ink-soft">{emptyMessage}</p> : null
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {rows.map((row) => (
            <BlackoutRow key={row.id} {...row} past={past} onRemoved={setMsg} />
          ))}
        </ul>
      )}
    </>
  );
}
