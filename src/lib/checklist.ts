/**
 * Quality checklists (§9.6, PRD §16.3 → L8).
 *
 * §9.6 is blunt about what this is for: *"This is how quality stays consistent
 * across crews and how you defend against disputes."* For end of tenancy it goes
 * further — the checklist mirrors what an inventory clerk assesses, and is "your
 * evidence in a deposit dispute".
 *
 * Two consequences run through this module:
 *
 *  1. **It is a snapshot, not a reference.** When a job is scheduled, the
 *     template's items are copied onto it. A checklist that reflects whatever
 *     the template says today is not evidence of what was agreed and done on the
 *     day — and templates will be edited, because that is what they are for.
 *  2. **The photo rule travels with the item.** Whether a given item needed a
 *     photograph is part of what was agreed, so it is stored on the item and
 *     enforced from there.
 *
 * The decisions are pure and live here; the database work is a thin wrapper.
 */

import type { ChecklistItem } from "@/config/checklists";

export interface SnapshotItem {
  templateItemRef: string;
  label: string;
  groupLabel: string | null;
  sortOrder: number;
  requiresPhoto: boolean;
}

/**
 * Turn a template's items into the rows to write onto a job.
 *
 * The reference is `group/label`, which is stable across template edits that
 * reorder items — so a completed item can still be traced back to what it came
 * from even after the template moves on.
 */
export function snapshotItems(items: ChecklistItem[]): SnapshotItem[] {
  return items.map((item, index) => ({
    templateItemRef: `${item.group ?? "general"}/${item.label}`,
    label: item.label,
    groupLabel: item.group ?? null,
    sortOrder: item.order ?? index + 1,
    requiresPhoto: item.requiresPhoto,
  }));
}

export interface CompletableItem {
  completed: boolean;
  requiresPhoto: boolean;
  mediaId: string | null;
}

export interface CompletionVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * May this item be ticked?
 *
 * The acceptance criterion of the stage, and the one rule here that someone will
 * be tempted to relax: **an item that requires a photograph cannot be ticked
 * without one.** The whole value of a photo-required item is the photograph —
 * an oven ticked clean with no picture is worth nothing in the dispute the
 * checklist exists for.
 *
 * `mediaAvailable` says whether the system can accept a photo at all. While
 * media exchange is unbuilt the honest answer is "not yet", and the refusal says
 * so rather than implying the crew did something wrong.
 */
export function canCompleteItem(
  item: CompletableItem,
  options: { mediaAvailable: boolean } = { mediaAvailable: true },
): CompletionVerdict {
  if (!item.requiresPhoto) return { ok: true };
  if (item.mediaId) return { ok: true };
  if (!options.mediaAvailable) {
    return {
      ok: false,
      reason:
        "This one needs a photo, and photo upload isn't switched on yet. Leave it for now and tell the office.",
    };
  }
  return { ok: false, reason: "Take a photo for this one before ticking it." };
}

export interface ProgressSummary {
  total: number;
  completed: number;
  /** Items that cannot be completed yet because they need a photo. */
  blocked: number;
  /** Every item that can be done is done. */
  finished: boolean;
}

/** Where a job's checklist stands, for a crew and for a supervisor. */
export function progressOf(
  items: CompletableItem[],
  options: { mediaAvailable: boolean } = { mediaAvailable: true },
): ProgressSummary {
  const completed = items.filter((item) => item.completed).length;
  const blocked = items.filter(
    (item) => !item.completed && !canCompleteItem(item, options).ok,
  ).length;
  return {
    total: items.length,
    completed,
    blocked,
    finished: items.length > 0 && completed + blocked === items.length && blocked === 0,
  };
}

/** Group items for display, preserving each group's first appearance. */
export function groupItems<T extends { groupLabel: string | null; sortOrder: number }>(
  items: T[],
): { group: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const key = item.groupLabel ?? "General";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([group, groupedItems]) => ({ group, items: groupedItems }));
}
