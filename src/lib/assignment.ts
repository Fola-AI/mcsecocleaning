/**
 * Crew assignment, in both modes (SETUP **D2**, PRD §14.6, §16.3 → L4).
 *
 * D2 is unanswered — "build both, choose before launch" — because the choice is
 * not a UI preference. It follows from whether crews are employees or genuinely
 * self-employed:
 *
 *  - **`assign`** — the business assigns work and the crew does it. Appropriate
 *    for employees, and simpler to operate.
 *  - **`offer`** — a crew is *offered* work and may decline. For genuinely
 *    self-employed contractors this is not a nicety: the right to turn work down
 *    is one of the things that distinguishes the relationship, and "we offered it
 *    and they declined" is the record that evidences it. Hence `offeredAt`,
 *    `acceptedAt` and `declinedAt` are all stored — the outcome alone would lose
 *    the fact that a choice was given.
 *
 * The rules are pure so both modes are tested without a database, and so the
 * production mode can be flipped in one config value rather than a rewrite.
 */

/** The mode in force. `src/config/availability.ts` holds the production value. */
export type AssignmentMode = "assign" | "offer";

export interface AssignmentRow {
  crewId: string;
  isLead: boolean;
  offeredAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
}

/** What an assignment row means right now, for the admin board. */
export type AssignmentState = "assigned" | "offered" | "accepted" | "declined";

export function assignmentState(row: AssignmentRow): AssignmentState {
  // Order matters: a declined offer that was later accepted is an acceptance,
  // and an accepted offer is not merely "offered".
  if (row.acceptedAt) return "accepted";
  if (row.declinedAt) return "declined";
  if (row.offeredAt) return "offered";
  return "assigned";
}

/**
 * Is this crew actually going?
 *
 * In `assign` mode an assignment is a commitment. In `offer` mode it is not one
 * until accepted — which is the whole point, and the reason capacity must not
 * count an unanswered offer as cover. A job whose only assignment is an
 * unanswered offer is still unassigned as far as the day is concerned.
 */
export function isCommitted(row: AssignmentRow, mode: AssignmentMode): boolean {
  if (row.declinedAt) return false;
  if (mode === "assign") return true;
  return Boolean(row.acceptedAt);
}

/** The crews actually covering a job. */
export function committedCrew(rows: AssignmentRow[], mode: AssignmentMode): AssignmentRow[] {
  return rows.filter((row) => isCommitted(row, mode));
}

/**
 * Is the job covered?
 *
 * In `offer` mode a job with three outstanding offers and no acceptance is NOT
 * covered, and the Today view must show it as unassigned — the failure this
 * guards against is a quiet morning where nobody turns up because everyone
 * assumed an offer was an answer.
 */
export function isCovered(rows: AssignmentRow[], mode: AssignmentMode): boolean {
  return committedCrew(rows, mode).length > 0;
}

export interface AssignVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * May this crew be added to this job?
 *
 * Refusals are about what would be wrong to record, not about tidiness:
 * assigning someone twice, or re-offering work to someone who has already said
 * no (which is how an "offer" becomes pressure).
 */
export function checkAssign(
  existing: AssignmentRow[],
  crewId: string,
  mode: AssignmentMode,
): AssignVerdict {
  const already = existing.find((row) => row.crewId === crewId);
  if (!already) return { ok: true };

  const state = assignmentState(already);
  if (state === "declined") {
    return {
      ok: false,
      reason:
        mode === "offer"
          ? "They have already declined this job. Offer it to someone else, or ask them directly and record a fresh offer."
          : "They declined this job. Remove the declined assignment before assigning it to them again.",
    };
  }
  return { ok: false, reason: `They are already ${state} on this job.` };
}

/**
 * Exactly one lead (§9.2). Promoting a crew demotes whoever held it, rather
 * than leaving two people each assuming the other is answerable for the job.
 */
export function applyLead(rows: AssignmentRow[], leadCrewId: string): AssignmentRow[] {
  return rows.map((row) => ({ ...row, isLead: row.crewId === leadCrewId }));
}

/** The lead, if the job has one. */
export function leadOf(rows: AssignmentRow[]): AssignmentRow | null {
  return rows.find((row) => row.isLead) ?? null;
}
