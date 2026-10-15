"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setChecklistItem } from "@/app/actions/crew";

export interface ChecklistRow {
  id: string;
  label: string;
  groupLabel: string | null;
  sortOrder: number;
  requiresPhoto: boolean;
  completed: boolean;
  hasPhoto: boolean;
}

/**
 * The checklist on a phone (§9.6).
 *
 * Big tap targets, grouped by room, in the order the work happens. A
 * photo-required item without a photo is shown as **held** rather than hidden:
 * a crew member needs to know the item exists and why they cannot tick it, or
 * they will assume the list is finished.
 */
export function CrewChecklist({
  groups,
  photoUploadAvailable,
}: {
  groups: { group: string; items: ChecklistRow[] }[];
  photoUploadAvailable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const done = groups.reduce((sum, group) => sum + group.items.filter((i) => i.completed).length, 0);

  if (total === 0) return null;

  const toggle = (item: ChecklistRow) =>
    start(async () => {
      const res = await setChecklistItem(item.id, !item.completed);
      setMsg(res.ok ? null : res.message);
      if (res.ok) router.refresh();
    });

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-4">
      <h2 className="flex items-baseline justify-between text-sm font-semibold text-ink-soft">
        <span>Checklist</span>
        <span>
          {done} of {total}
        </span>
      </h2>

      {!photoUploadAvailable && groups.some((g) => g.items.some((i) => i.requiresPhoto && !i.hasPhoto)) && (
        <p className="mt-2 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent-strong">
          Items marked “photo needed” can’t be ticked yet — photo upload isn’t switched on. Do the work and tell the
          office; they can sign those off.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.group} className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{group.group}</h3>
          <ul className="mt-1 space-y-1">
            {group.items.map((item) => {
              const held = item.requiresPhoto && !item.hasPhoto;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={pending || (held && !item.completed)}
                    onClick={() => toggle(item)}
                    className={`flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left text-sm ${
                      item.completed ? "bg-brand-tint/40" : held ? "opacity-70" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border ${
                        item.completed ? "border-brand bg-brand text-white" : "border-line"
                      }`}
                    >
                      {item.completed ? "✓" : ""}
                    </span>
                    <span>
                      {item.label}
                      {item.requiresPhoto && (
                        <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 text-[10px]">
                          {item.hasPhoto ? "photo attached" : "photo needed"}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {msg && (
        <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
