import { site } from "@/config/site";

/** Trust bar (§8): insurance, DBS, guarantee, eco, published prices. */
const items = [
  { icon: "🛡️", label: `${site.trust.publicLiabilityCover} public liability` },
  { icon: "✅", label: "DBS-checked crews" },
  { icon: "♻️", label: "Non-toxic eco products" },
  { icon: "📸", label: "Before/after photos" },
  { icon: "↩️", label: "Re-clean guarantee" },
  { icon: "£", label: "Fixed prices online" },
];

export function TrustBar() {
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
