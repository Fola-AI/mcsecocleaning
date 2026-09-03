import type { AreaReview } from "@/config/areas";

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} className="text-sun">
      {"★".repeat(Math.round(rating))}
      <span className="text-line">{"★".repeat(5 - Math.round(rating))}</span>
    </span>
  );
}

/**
 * On-site review display (§6.13). Deliberately NOT marked up as AggregateRating
 * to avoid self-serving review markup penalties (§5.2).
 */
export function Reviews({ reviews, title = "What customers say" }: { reviews: AreaReview[]; title?: string }) {
  if (!reviews.length) return null;
  return (
    <div>
      <h2 className="text-2xl font-bold md:text-3xl">{title}</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((r, i) => (
          <figure key={i} className="card p-5">
            <Stars rating={r.rating} />
            <blockquote className="mt-3 text-ink-soft">“{r.body}”</blockquote>
            <figcaption className="mt-3 text-sm font-semibold">{r.author}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
