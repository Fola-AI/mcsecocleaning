import Link from "next/link";
import { orderedServices } from "@/config/services";
import { formatPounds } from "@/lib/money";
import { fromPriceFor } from "@/lib/pricing/from-price";

/**
 * Homepage price accordion (§12.1.7). Collapsed blocks by service with the real
 * "from" figure inside, and "view full price list" beneath.
 *
 * It reads fromPriceFor — the SAME single source every other price surface uses
 * (§12.3) — so it cannot diverge from the homepage cards, the /prices page or the
 * quote. It deliberately does NOT re-render the full bed×bath grid here: that
 * would be a new price surface the build-time parity gate does not cover. The full
 * grid lives on /prices, linked below.
 */
export function PriceAccordion() {
  return (
    <div>
      <div className="divide-y divide-line border-y border-line">
        {orderedServices.map((s) => {
          const from = fromPriceFor(s.slug);
          return (
            <details key={s.slug} className="group py-1">
              <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 font-semibold">
                <span>{s.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-brand-strong">
                    {from.pence != null ? `From ${formatPounds(from.pence)}${from.unit ? ` ${from.unit}` : ""}` : "Quoted"}
                  </span>
                  <span aria-hidden className="text-brand-strong text-xl group-open:hidden">+</span>
                  <span aria-hidden className="hidden text-brand-strong text-xl group-open:inline">–</span>
                </span>
              </summary>
              <div className="pb-4 pr-8 text-sm text-ink-soft">
                <p>{s.tagline}</p>
                <Link href={`/${s.slug}`} className="mt-2 inline-block font-semibold text-brand-strong underline">
                  See what&apos;s included →
                </Link>
              </div>
            </details>
          );
        })}
      </div>
      <Link href="/prices" className="mt-6 inline-block font-semibold text-brand-strong underline">
        View the full price list →
      </Link>
    </div>
  );
}
