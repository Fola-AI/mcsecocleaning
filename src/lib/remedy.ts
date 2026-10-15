/**
 * Remedy windows and issue resolution (§9.5, PRD §16.3 → L13).
 *
 * The PRD puts this in a block quote, which is unusual enough to take literally:
 *
 * > **The window is a guaranteed-remedy window, not a support cut-off.** You
 * > cannot refuse to hear a customer after 48 hours, and UK consumer protection
 * > will not respect that window.
 *
 * So everything here is about what the window *promises*, never about what it
 * forbids. Inside it, a re-clean is guaranteed and free. Outside it, the thread
 * stays open and becomes an ordinary support conversation — because a customer
 * who cannot reach us does not go away, they complain somewhere public.
 */

import { serviceBySlug } from "@/config/services";

/** Fallback when a service has no window of its own. */
export const DEFAULT_REMEDY_HOURS = 48;

/** The guaranteed-remedy window for a service, in hours (§9.5). */
export function remedyWindowHours(serviceSlug: string): number {
  return serviceBySlug(serviceSlug)?.remedyWindowHours ?? DEFAULT_REMEDY_HOURS;
}

/** When the window closes for a job completed at `completedAt`. */
export function remedyWindowExpiry(serviceSlug: string, completedAt: Date): Date {
  return new Date(completedAt.getTime() + remedyWindowHours(serviceSlug) * 3_600_000);
}

export type RemedyStanding =
  /** Inside the window: a re-clean is guaranteed and free. */
  | "guaranteed"
  /** Outside it: still heard, still answered, no automatic entitlement. */
  | "support";

export interface RemedyState {
  standing: RemedyStanding;
  /** Hours left, 0 once elapsed. */
  hoursRemaining: number;
  /** What to tell the customer — never a refusal. */
  message: string;
}

/**
 * Where a job stands.
 *
 * Note that neither branch closes anything. The difference between them is what
 * we *promise*, not whether we listen.
 */
export function remedyState(
  serviceSlug: string,
  completedAt: Date,
  now: Date = new Date(),
): RemedyState {
  const expiry = remedyWindowExpiry(serviceSlug, completedAt);
  const hoursRemaining = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / 3_600_000));

  if (hoursRemaining > 0) {
    return {
      standing: "guaranteed",
      hoursRemaining,
      message: `If anything is not right, tell us within ${hoursRemaining} hours and we will put it right free of charge.`,
    };
  }

  return {
    standing: "support",
    hoursRemaining: 0,
    // Deliberately not "your window has expired". That sentence invites an
    // argument and is, legally, not something we could enforce anyway.
    message:
      "Your re-clean guarantee window has closed, but you can still contact us about this clean and we will help.",
  };
}

export type ResolutionPath = "reclean" | "partial_refund" | "explanation";

export interface ResolutionVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * May this resolution be applied?
 *
 * A **free re-clean** inside the window is an entitlement. Outside it, it is a
 * goodwill decision — allowed, but recorded as a decision rather than as an
 * automatic right, so the business can see what it is giving away.
 *
 * A **partial refund** always needs a reason. "Refunded £20" with no reason is
 * worthless three months later when somebody asks why takings do not match.
 */
export function checkResolution(
  path: ResolutionPath,
  options: { standing: RemedyStanding; reason?: string },
): ResolutionVerdict {
  if (path === "partial_refund" && !options.reason?.trim()) {
    return { ok: false, reason: "A partial refund needs a reason — it has to be explainable later." };
  }
  if (path === "explanation" && !options.reason?.trim()) {
    return { ok: false, reason: "Say what you told the customer, so the thread is a record of it." };
  }
  // Re-cleans are allowed in either standing; the difference is recorded, not
  // refused (§9.5: the window is a promise, not a cut-off).
  return { ok: true };
}

/** When a goodwill or guaranteed re-clean should be scheduled (§9.5: 24–48h). */
export function recleanWindow(now: Date = new Date()): { earliest: Date; latest: Date } {
  return {
    earliest: new Date(now.getTime() + 24 * 3_600_000),
    latest: new Date(now.getTime() + 48 * 3_600_000),
  };
}
