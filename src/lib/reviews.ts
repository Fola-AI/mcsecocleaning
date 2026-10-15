/**
 * Reviews (§10.1, DMCC 2024, PRD §16.3 → L12).
 *
 * The Digital Markets, Competition and Consumers Act 2024 made two things
 * unlawful that used to be ordinary marketing practice, and both of them are
 * easy to reintroduce by accident:
 *
 *  1. **Review gating** — asking only the customers you expect to be happy, or
 *     routing unhappy ones to a private form *instead of* a public review.
 *  2. **Undisclosed incentives** — displaying a review that was given in
 *     exchange for something, without saying so.
 *
 * This module makes both structural rather than a matter of care. `whoToAsk`
 * takes no rating, no sentiment and no history, so there is nothing to filter
 * on even if someone wanted to; and `canDisplay` refuses an incentivised review
 * whose incentive is not disclosed, whatever else is true about it.
 */

export interface ReviewCandidate {
  jobId: string;
  customerId: string;
  /** Marketing consent — the review request is marketing (§10.3). */
  marketingConsent: boolean;
  /** When the visit finished. */
  completedAt: Date;
  /** Already asked? */
  requestedAt: Date | null;
  /** Already nudged? */
  nudgedAt: Date | null;
  /** Has this customer already left a review for this job? */
  hasReview: boolean;
}

export const REQUEST_AFTER_HOURS = 24;
export const NUDGE_AFTER_DAYS = 4;

export type ReviewAction = "ask" | "nudge" | "nothing";

/**
 * What to do about one completed job.
 *
 * **Note what this function cannot see**: there is no rating, no sentiment, no
 * complaint history and no "would they say something nice" in its input. That
 * is the point. Review gating is unlawful, and the most robust way to not do it
 * is to make the filtering impossible rather than to decide, each time, not to.
 *
 * It stops after one nudge. A third message is not persuasion, it is nagging,
 * and the customer who ignored two will not be won by a third.
 */
export function reviewAction(candidate: ReviewCandidate, now: Date = new Date()): ReviewAction {
  // A review already exists — nothing more to ask for. This is the acceptance
  // criterion: the nudge is suppressed once a review exists.
  if (candidate.hasReview) return "nothing";

  // The request is marketing, so PECR applies (§10.3).
  if (!candidate.marketingConsent) return "nothing";

  const hoursSince = (now.getTime() - candidate.completedAt.getTime()) / 3_600_000;

  if (!candidate.requestedAt) {
    return hoursSince >= REQUEST_AFTER_HOURS ? "ask" : "nothing";
  }

  if (!candidate.nudgedAt) {
    const daysSinceRequest = (now.getTime() - candidate.requestedAt.getTime()) / 86_400_000;
    return daysSinceRequest >= NUDGE_AFTER_DAYS ? "nudge" : "nothing";
  }

  // Asked and nudged. Stop.
  return "nothing";
}

export interface DisplayableReview {
  rating: number;
  submittedAt: Date | null;
  displayOnSite: boolean;
  wasIncentivised: boolean;
  incentiveDisclosed: boolean;
}

export interface DisplayVerdict {
  display: boolean;
  /** The disclosure that MUST accompany it, when it is shown. */
  disclosure?: string;
  reason?: string;
}

/**
 * May this review be shown, and with what label?
 *
 * The rule that matters: an incentivised review with no disclosure is **never**
 * displayed. Not "displayed without the label" — not displayed. Under the DMCC
 * the offence is publishing it, and a missing label is not a cosmetic problem
 * that can be fixed later while the review is live.
 */
export function canDisplay(review: DisplayableReview): DisplayVerdict {
  if (!review.submittedAt) return { display: false, reason: "Not submitted" };
  if (!review.displayOnSite) return { display: false, reason: "Not approved for display" };

  if (review.wasIncentivised && !review.incentiveDisclosed) {
    return {
      display: false,
      reason:
        "Incentivised and the incentive is not disclosed. Under the DMCC 2024 this cannot be published — " +
        "record the disclosure, or do not show it.",
    };
  }

  return {
    display: true,
    disclosure: review.wasIncentivised
      ? "This customer received a discount or a free visit in exchange for a review."
      : undefined,
  };
}

/** Minimum review counts before a surface may appear (§10.1, §12.4). */
export const DISPLAY_THRESHOLDS = {
  /** The on-site social-proof strip. */
  onSiteStrip: 10,
  /** A Trustpilot widget. */
  trustpilot: 20,
} as const;

/** May a review-count-dependent surface be rendered at all? */
export function meetsThreshold(surface: keyof typeof DISPLAY_THRESHOLDS, reviewCount: number): boolean {
  return reviewCount >= DISPLAY_THRESHOLDS[surface];
}
