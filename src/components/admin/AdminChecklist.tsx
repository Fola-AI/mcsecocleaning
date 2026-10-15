"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { backfillChecklist, setChecklistItemPhotoRequired } from "@/app/actions/admin";
import type { ProgressSummary } from "@/lib/checklist";

export interface AdminChecklistRow {
  id: string;
  label: string;
  groupLabel: string | null;
  sortOrder: number;
  requiresPhoto: boolean;
  completed: boolean;
  hasPhoto: boolean;
  completedBy: string | null;
  completedAt: string | null;
}

/**
 * The supervisor's view of a job's checklist (§9.6).
 *
 * It shows **who ticked what and when**, because that is what the checklist is
 * for: in a deposit dispute the useful sentence is "the oven was photographed
 * clean by this person at this time", not "the list was completed".
 *
 * The photo-required toggle changes **this job's** item, not the template — the
 * template is the default for future jobs; a job's checklist is the record of
 * what was agreed for that job.
 */
export function AdminChecklist({
  jobId,
  groups,
  progress,
}: {
  jobId: string;
  groups: { group: string; items: AdminChecklistRow[] }[];
  progress: ProgressSummary;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.message);
      if (res.ok) router.refresh();
    });

  return (
    <section className="rounded-lg border border-line p-4">
      <h2 className="flex items-baseline justify-between font-bold">
        <span>Checklist</span>
        <span className="text-sm font-normal text-ink-soft">
          {progress.completed} of {progress.total}
          {progress.blocked > 0 && ` · ${progress.blocked} waiting on a photo`}
        </span>
      </h2>

      {progress.total === 0 && (
        <div className="mt-2 text-sm text-ink-soft">
          <p>No checklist on this job — it was scheduled before checklists existed.</p>
          <button
            type="button"
            className="btn btn-outline mt-2 text-sm"
            disabled={pending}
            onClick={() => run(() => backfillChecklist(jobId))}
          >
            {pending ? "Adding…" : "Add the checklist for this service"}
          </button>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.group} className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{group.group}</h3>
          <ul className="mt-1 divide-y divide-line">
            {group.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2 text-sm">
                <span aria-hidden>{item.completed ? "✓" : "☐"}</span>
                <span className={item.completed ? "" : "text-ink-soft"}>{item.label}</span>
                {item.completed && item.completedBy && (
                  <span className="text-xs text-ink-soft">
                    — {item.completedBy}
                    {item.completedAt ? `, ${item.completedAt}` : ""}
                  </span>
                )}
                {item.requiresPhoto && (
                  <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px]">
                    {item.hasPhoto ? "photo attached" : "photo required"}
                  </span>
                )}
                <button
                  type="button"
                  className="ml-auto text-xs underline"
                  disabled={pending}
                  onClick={() => run(() => setChecklistItemPhotoRequired(item.id, !item.requiresPhoto))}
                >
                  {item.requiresPhoto ? "photo not needed" : "require a photo"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {msg && (
        <p className="mt-3 text-sm text-ink-soft" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
