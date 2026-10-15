"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobStatus } from "@prisma/client";

import { clockIn, clockOut, crewSetStatus, reportIssue } from "@/app/actions/crew";

/**
 * The buttons a crew member actually presses (§9.2).
 *
 * Clock in and clock out are the primary action and take the full width, because
 * they are pressed with a thumb, outdoors, usually in a hurry. Everything else
 * is secondary.
 *
 * **GPS never blocks.** The browser is asked for a location with a short timeout
 * and, if it refuses or times out, the clock-in happens anyway without
 * coordinates. A crew member who has denied location permission must still be
 * able to work; the absence is recorded honestly rather than the app pretending
 * to know where they were.
 */
export function CrewJobControls({
  jobId,
  status,
  clockedInAt,
}: {
  jobId: string;
  status: JobStatus;
  clockedInAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueType, setIssueType] = useState<"damage_claim" | "access_problem" | "additional_work">("access_problem");
  const [issueText, setIssueText] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.message);
      if (res.ok) router.refresh();
    });

  /**
   * Ask the phone where it is, briefly, and never let the answer hold anyone up.
   * Resolves to `{}` on refusal, error or timeout.
   */
  async function position(): Promise<{ lat?: number; lng?: number }> {
    if (typeof navigator === "undefined" || !navigator.geolocation) return {};
    return new Promise((resolve) => {
      const done = (value: { lat?: number; lng?: number }) => resolve(value);
      const timer = setTimeout(() => done({}), 5000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          done({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          clearTimeout(timer);
          done({});
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
      );
    });
  }

  const isDone = ["completed", "awaiting_feedback", "closed", "cancelled"].includes(status);

  return (
    <div className="mt-6 space-y-3">
      {!isDone && !clockedInAt && (
        <button
          type="button"
          className="btn btn-primary w-full py-4 text-base"
          disabled={pending}
          onClick={() => run(async () => clockIn(jobId, await position()))}
        >
          {pending ? "…" : "Clock in"}
        </button>
      )}

      {!isDone && clockedInAt && (
        <>
          <p className="text-center text-sm text-ink-soft">
            On site since {new Date(clockedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}
          </p>
          <button
            type="button"
            className="btn btn-primary w-full py-4 text-base"
            disabled={pending}
            onClick={() => run(async () => clockOut(jobId, await position()))}
          >
            {pending ? "…" : "Clock out"}
          </button>
        </>
      )}

      {!isDone && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="btn btn-outline py-3"
            disabled={pending}
            onClick={() => run(() => crewSetStatus(jobId, "completed"))}
          >
            Finished
          </button>
          <button
            type="button"
            className="btn btn-outline py-3"
            disabled={pending}
            onClick={() => run(() => crewSetStatus(jobId, "no_access"))}
          >
            Can&apos;t get in
          </button>
        </div>
      )}

      {isDone && <p className="text-center text-sm text-ink-soft">This job is {status.replaceAll("_", " ")}.</p>}

      <button type="button" className="w-full py-2 text-sm underline" onClick={() => setIssueOpen((v) => !v)}>
        {issueOpen ? "Never mind" : "Report a problem"}
      </button>

      {issueOpen && (
        <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
          <div>
            <label htmlFor="issue-type" className="block text-sm font-semibold">
              What sort?
            </label>
            <select
              id="issue-type"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-3 text-base"
              value={issueType}
              onChange={(e) => setIssueType(e.target.value as typeof issueType)}
            >
              <option value="access_problem">Couldn&apos;t get in</option>
              <option value="damage_claim">Something is damaged</option>
              <option value="additional_work">Needs more work than quoted</option>
            </select>
          </div>
          <div>
            <label htmlFor="issue-text" className="block text-sm font-semibold">
              What happened?
            </label>
            <textarea
              id="issue-text"
              rows={3}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-base"
              value={issueText}
              onChange={(e) => setIssueText(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary w-full py-3"
            disabled={pending || issueText.trim().length < 3}
            onClick={() =>
              run(async () => {
                const res = await reportIssue(jobId, { type: issueType, message: issueText });
                if (res.ok) {
                  setIssueText("");
                  setIssueOpen(false);
                }
                return res;
              })
            }
          >
            {pending ? "Sending…" : "Send to the office"}
          </button>
        </div>
      )}

      {msg && (
        <p className="rounded-lg bg-brand-tint/50 px-3 py-2 text-center text-sm text-brand-ink" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
