/**
 * Job-board filters (§9.7 "job board with filters and reassignment").
 *
 * Pure, because a filter that silently drops rows is indistinguishable from an
 * empty day — and on an operations screen those two mean very different things.
 * Parsing lives here so the page can hand it raw `searchParams` and get back
 * either a valid filter or the reason it refused, and so the defaults are
 * tested rather than implied.
 */

import type { JobStatus, Prisma } from "@prisma/client";

import { DONE_STATUSES, UPCOMING_STATUSES } from "@/lib/job-status";

/** The shortcuts an admin actually wants, named as they would say them. */
export const VIEWS = {
  upcoming: { label: "Upcoming", statuses: UPCOMING_STATUSES },
  today: { label: "Today", statuses: UPCOMING_STATUSES },
  done: { label: "Completed", statuses: DONE_STATUSES },
  attention: { label: "Needs attention", statuses: ["on_hold", "no_access"] as const },
  all: { label: "All", statuses: null },
} as const;

export type ViewKey = keyof typeof VIEWS;

export interface JobFilter {
  view: ViewKey;
  /** A single status, which overrides the view's set when given. */
  status: JobStatus | null;
  /** Only jobs with nobody assigned. */
  unassignedOnly: boolean;
  /** A crew's user id. */
  crewId: string | null;
  /** Postcode district prefix, e.g. "SW4" or "BR1" — the §4 patch question. */
  district: string | null;
  /** Free text across customer name, email and postcode. */
  query: string | null;
}

const ALL_STATUSES: JobStatus[] = [
  "draft", "booked", "payment_authorised", "scheduled", "in_progress",
  "completed", "awaiting_feedback", "closed", "cancelled", "on_hold", "no_access",
];

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Read a filter out of URL params.
 *
 * Anything unrecognised falls back to the default rather than erroring: an
 * admin who hand-edits the URL, or a stale bookmark after a status is renamed,
 * should get a usable board, not a crash. The one thing it will not do is
 * silently accept an unknown status as a filter — that would show an empty
 * board and look like a quiet day.
 */
export function parseJobFilter(params: Record<string, string | string[] | undefined>): JobFilter {
  const viewParam = first(params.view);
  const view: ViewKey = viewParam && viewParam in VIEWS ? (viewParam as ViewKey) : "upcoming";

  const statusParam = first(params.status);
  const status = statusParam && ALL_STATUSES.includes(statusParam as JobStatus) ? (statusParam as JobStatus) : null;

  return {
    view,
    status,
    unassignedOnly: first(params.unassigned) === "1",
    crewId: first(params.crew),
    district: first(params.district)?.toUpperCase() ?? null,
    query: first(params.q),
  };
}

/**
 * Turn a filter into a Prisma `where`.
 *
 * `today` is handled by the caller, which has the London day boundaries; this
 * builds everything else. The district match is a `startsWith` on the property
 * postcode, which is how UK outward codes work and is what makes "show me
 * Bromley" answerable (§4: Bromley is a separate patch and must be visible as
 * one).
 */
export function jobWhere(filter: JobFilter, today?: { gte: Date; lte: Date }): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {};

  if (filter.status) {
    where.status = filter.status;
  } else {
    const statuses = VIEWS[filter.view].statuses;
    if (statuses) where.status = { in: [...statuses] };
  }

  if (filter.view === "today" && today) where.scheduledStart = today;
  if (filter.unassignedOnly) where.assignments = { none: {} };
  if (filter.crewId) where.assignments = { some: { crewId: filter.crewId } };
  if (filter.district) where.property = { postcode: { startsWith: filter.district } };

  if (filter.query) {
    where.OR = [
      { customer: { name: { contains: filter.query, mode: "insensitive" } } },
      { customer: { email: { contains: filter.query, mode: "insensitive" } } },
      { property: { postcode: { contains: filter.query, mode: "insensitive" } } },
    ];
  }

  return where;
}

/** Is this filter showing everything? Used for the honest empty state. */
export function isUnfiltered(filter: JobFilter): boolean {
  return (
    filter.view === "all" &&
    !filter.status &&
    !filter.unassignedOnly &&
    !filter.crewId &&
    !filter.district &&
    !filter.query
  );
}

/** Describe the active filter in words, for the empty state. */
export function describeFilter(filter: JobFilter): string {
  const parts: string[] = [];
  if (filter.status) parts.push(`status ${filter.status}`);
  else if (VIEWS[filter.view].statuses) parts.push(VIEWS[filter.view].label.toLowerCase());
  if (filter.view === "today") parts.push("scheduled today");
  if (filter.unassignedOnly) parts.push("unassigned");
  if (filter.crewId) parts.push("for that crew");
  if (filter.district) parts.push(`in ${filter.district}`);
  if (filter.query) parts.push(`matching "${filter.query}"`);
  return parts.length > 0 ? parts.join(", ") : "all jobs";
}
