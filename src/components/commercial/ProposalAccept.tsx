"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { acceptProposal } from "@/app/actions/proposals";

/**
 * Accepting a proposal (§7.6).
 *
 * The customer chooses the start date rather than accepting one we picked: a
 * managing agent knows when the outgoing contractor's notice ends and we do not.
 * Accepting without a date would mean a contract with no first visit, which is
 * how a signed agreement sits unnoticed for a month.
 */
export function ProposalAccept({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="card mt-6 p-6">
      <h2 className="text-lg font-bold">Accept this proposal</h2>
      <p className="mt-1 text-sm text-ink-soft">Choose when you would like the first visit.</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="start-date" className="block text-sm font-semibold">
            First visit
          </label>
          <input
            id="start-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 rounded-lg border border-line bg-surface px-3 py-2.5"
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !date}
          onClick={() =>
            start(async () => {
              const res = await acceptProposal(proposalId, `${date}T09:00:00.000Z`);
              setMsg(res.message);
              if (res.ok) router.refresh();
            })
          }
        >
          {pending ? "Accepting…" : "Accept and book the first visit"}
        </button>
      </div>

      {msg && (
        <p className="mt-3 rounded-lg bg-brand-tint/50 px-3 py-2 text-sm text-brand-ink" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
