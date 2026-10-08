import { confirmedTrustBadges } from "@/lib/trust";

/**
 * Trust bar (§8, §12.4). Renders only the claims Fola has confirmed in
 * `src/config/site.ts` — insurance and DBS stay out until then. Never hardcode
 * a claim here; see `src/lib/trust.ts`.
 */
export function TrustBar() {
  const items = confirmedTrustBadges();
  if (items.length === 0) return null;

  return (
    <div className="border-y border-line bg-brand-tint">
      <ul className="container-page flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-3 text-sm font-medium text-brand-ink">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2">
            <span aria-hidden>{it.icon}</span>
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
