"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { answerOffer, assignCrew, unassignCrew } from "@/app/actions/admin";
import { assignmentState, type AssignmentRow } from "@/lib/assignment";

/**
 * Putting crews on a job, in whichever mode is in force (SETUP D2).
 *
 * In `offer` mode the row shows the offer's state and carries the crew's answer,
 * because an offer nobody has answered is not cover — the job still needs
 * someone, and the board has to say so rather than looking staffed.
 */
export function JobCrewControl({
  jobId,
  mode,
  assignments,
  crews,
}: {
  jobId: string;
  mode: "assign" | "offer";
  assignments: (AssignmentRow & { name: string })[];
  crews: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.message);
      if (res.ok) {
        setPick("");
        router.refresh();
      }
    });

  const unpicked = crews.filter((crew) => !assignments.some((a) => a.crewId === crew.id));

  return (
    <div className="space-y-1 text-xs">
      {assignments.length === 0 && <span className="text-accent-strong">unassigned</span>}

      {assignments.map((assignment) => {
        const state = assignmentState(assignment);
        return (
          <div key={assignment.crewId} className="flex flex-wrap items-center gap-1.5">
            <span className={state === "declined" ? "line-through text-ink-soft" : "font-semibold"}>
              {assignment.name}
            </span>
            {assignment.isLead && <span className="rounded-full bg-brand-tint px-1.5 text-[10px] text-brand-ink">lead</span>}
            {mode === "offer" && state !== "assigned" && (
              <span className="rounded-full border border-line px-1.5 text-[10px]">{state}</span>
            )}
            {mode === "offer" && state === "offered" && (
              <>
                <button
                  type="button"
                  className="underline"
                  disabled={pending}
                  onClick={() => run(() => answerOffer(jobId, assignment.crewId, "accept"))}
                >
                  accepted
                </button>
                <button
                  type="button"
                  className="underline"
                  disabled={pending}
                  onClick={() => run(() => answerOffer(jobId, assignment.crewId, "decline"))}
                >
                  declined
                </button>
              </>
            )}
            <button
              type="button"
              className="text-ink-soft underline"
              disabled={pending}
              onClick={() => run(() => unassignCrew(jobId, assignment.crewId))}
            >
              remove
            </button>
          </div>
        );
      })}

      {unpicked.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="sr-only" htmlFor={`crew-${jobId}`}>
            {mode === "offer" ? "Offer to" : "Assign to"}
          </label>
          <select
            id={`crew-${jobId}`}
            className="rounded border border-line bg-surface px-1.5 py-1 text-xs"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">{mode === "offer" ? "Offer to…" : "Assign to…"}</option>
            {unpicked.map((crew) => (
              <option key={crew.id} value={crew.id}>
                {crew.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="underline"
            disabled={pending || !pick}
            onClick={() => run(() => assignCrew(jobId, pick))}
          >
            {pending ? "…" : mode === "offer" ? "Offer" : "Assign"}
          </button>
        </div>
      )}

      {msg && (
        <p className="max-w-xs text-[11px] text-ink-soft" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
