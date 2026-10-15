import Link from "next/link";
import { site } from "@/config/site";

export function CtaBanner({
  title = "Ready for a cleaner, greener home?",
  subtitle = "Get a fixed online price in under two minutes — or call and we'll book you in.",
  primaryHref = "/book",
  primaryLabel = "Get a price",
  // When set, a second button is shown alongside the primary — used for the
  // homepage closing CTA that repeats both dual-CTA paths (§12.1.12). Both paths
  // land in the same Lead/Quote records; the instant path escalates in the engine.
  secondaryHref,
  secondaryLabel,
}: {
  title?: string;
  subtitle?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="py-14 md:py-20">
      <div className="container-page">
        <div className="rounded-2xl bg-brand px-6 py-12 text-center text-white md:px-12">
          {/*
            `text-white` is repeated on the heading even though the band sets it:
            the base layer in globals.css colours every h1–h4 `--color-ink`, and
            that element-level rule beats the colour inherited from the band. The
            result was the deep-green heading on brand green at 2.57:1 — below the
            3:1 large-text threshold — which the axe pass in
            e2e/accessibility.spec.ts now guards (§13.3 WCAG 2.2 AA).
          */}
          <h2 className="text-3xl font-bold text-white md:text-4xl">{title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">{subtitle}</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={primaryHref} className="btn bg-white text-brand-strong hover:bg-white/90">
              {primaryLabel}
            </Link>
            {secondaryHref && secondaryLabel ? (
              <Link href={secondaryHref} className="btn btn-outline border-white/70 text-white">
                {secondaryLabel}
              </Link>
            ) : (
              <a href={`tel:${site.contact.phone}`} className="btn btn-outline border-white/70 text-white">
                📞 {site.contact.phoneDisplay}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
