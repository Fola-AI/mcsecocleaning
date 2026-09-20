import type { AreaReview } from "@/config/areas";

/**
 * Social-proof strip (§12.1.1) — rating + review count, above the headline.
 *
 * §12.4 / DMCC 2024 §10.1: a trust-metrics bar with invented or trivially small
 * numbers is worse than none, and a misleading aggregate rating is a banned
 * practice. So this renders ONLY from real, disclosed review data and ONLY once
 * there are enough of them to be honest — below the threshold it returns null and
 * the insurance + guarantee badges fill the slot instead (see the homepage). It
 * shows the true mean, whatever it is (4.6, not a rounded-up 5.0). No placeholder,
 * no sample data, no flag that forces it on — it self-activates when real reviews
 * arrive.
 */
const MIN_REVIEWS_TO_SHOW = 10; // below this, no aggregate is shown (§12.4)

export function SocialProofStrip({ reviews }: { reviews: AreaReview[] }) {
  const count = reviews.length;
  if (count < MIN_REVIEWS_TO_SHOW) return null;

  const mean = reviews.reduce((sum, r) => sum + r.rating, 0) / count;
  const rounded = Math.round(mean * 10) / 10;

  return (
    <div className="flex items-center justify-center gap-2 text-sm font-medium">
      <span aria-hidden className="text-sun">{"★".repeat(Math.round(mean))}</span>
      <span>
        <strong>{rounded.toFixed(1)}</strong> from <strong>{count}</strong> verified reviews
      </span>
    </div>
  );
}
