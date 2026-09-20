import Link from "next/link";
import type { Metadata } from "next";
import { site } from "@/config/site";
import { orderedServices } from "@/config/services";
import { areas, publishedLocationPages } from "@/config/areas";
import { QuoteWidget } from "@/components/marketing/QuoteWidget";
import { TrustBar } from "@/components/ui/TrustBar";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { ServiceCard } from "@/components/marketing/ServiceCard";
import { PriceAccordion } from "@/components/marketing/PriceAccordion";
import { Reviews } from "@/components/marketing/Reviews";
import { Faq } from "@/components/marketing/Faq";
import { CtaBanner } from "@/components/marketing/CtaBanner";
import { JsonLd, faqLd } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: `Eco-friendly cleaning with fixed online prices`,
  description: site.description,
  path: "/",
});

// Trust badges inline (§12.1.4).
const TRUST_BADGES = ["Fully insured", "DBS-checked", "Eco products", "Re-clean guarantee"];

const differentiators = [
  {
    icon: "£",
    title: "Published, fixed prices",
    body: "See a fixed price online in minutes. No phone tag, no vague quotes — most UK cleaners still make you call.",
  },
  {
    icon: "📸",
    title: "Photographic proof",
    body: "Before and after photos of every completed job, so you can see exactly what was done.",
  },
  {
    icon: "♻️",
    title: "Genuinely eco",
    body: "Non-toxic, pet- and allergy-safe products as standard — better for your home and the people in it.",
  },
  {
    icon: "↩️",
    title: "Re-clean guarantee",
    body: "Not right? We come back and put it right — 72 hours for end of tenancy, 48 for everything else.",
  },
];

const steps = [
  { n: 1, title: "Book or get a quote", body: "Instant fixed price for a standard job, or ask for a tailored quote on a larger one." },
  { n: 2, title: "We arrive equipped", body: "An insured, DBS-checked crew arrives with non-toxic products and everything the job needs." },
  { n: 3, title: "Inspection-ready", body: "We clean to a checklist and send before/after photos — proof the job was done right." },
];

const homeFaqs = [
  {
    q: "How quickly can you clean my home?",
    a: "For domestic and deep cleans we can often attend within a few days; end of tenancy slots in peak season (June–September) book up faster, so book early. Enter your postcode for live availability.",
  },
  {
    q: "Are your prices really fixed?",
    a: "Yes. You get a fixed, VAT-inclusive price online based on your actual rooms. The only changes are ones you ask for — extra rooms or add-ons found on the day — and we agree those with you first.",
  },
  {
    q: "Are you insured and vetted?",
    a: `Yes — ${site.trust.publicLiabilityCover} public liability cover and DBS-checked crews. We treat your home and your keys with the seriousness they deserve.`,
  },
  {
    q: "Do you cover my area?",
    a: "We're launching in selected London areas and expanding. Enter your postcode on any page — if we're not there yet, join the waitlist and we'll tell you when we are.",
  },
];

export default function HomePage() {
  const homeReviews = areas.flatMap((a) => a.reviews ?? []).slice(0, 3);

  // Coverage (§12.1.10): active districts, linked to a published location page
  // where the §6 gate allows one, otherwise to the coverage hub (never a
  // doorway page that isn't published).
  const publishedByArea = new Map(publishedLocationPages().map((p) => [p.area.slug, p.serviceSlug]));
  const coverage = areas
    .filter((a) => a.active)
    .map((a) => ({
      name: a.name,
      href: publishedByArea.has(a.slug) ? `/${publishedByArea.get(a.slug)}/${a.slug}` : "/areas-we-cover",
    }));

  return (
    <>
      <JsonLd data={[faqLd(homeFaqs)]} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="container-page grid items-center gap-10 py-12 md:py-16 lg:grid-cols-2">
          <div>
            {/* §12.1.1 social-proof strip (rating + count) lands here once ≥10 real,
                verified reviews exist — render <SocialProofStrip reviews={…} />.
                Until then (§12.4) the trust badges below fill the slot; we do NOT
                ship an aggregate on invented or trivially small numbers. */}
            <p className="eyebrow">Eco cleaning · London &amp; nearby</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">
              A cleaner home, a lighter footprint —{" "}
              <span className="text-brand">priced online in minutes</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ink-soft">
              Domestic, end of tenancy, deep and commercial cleaning with non-toxic products,
              before/after photos of every job, and a re-clean guarantee. No phone call needed.
            </p>

            {/* Dual CTA (§12.1.3, §12.2), resolved against §12's "quote widget above
                the fold": the QuoteWidget (right) IS the instant path, so the hero
                carries only the second intent — "Get a quote" for the tailored
                route — rather than a redundant button to the same /book. Both paths
                land in the same Lead/Quote records; the instant path escalates
                inside the engine. The closing CTA repeats both as buttons. */}
            <div className="mt-6">
              <Link href="/contact" className="btn btn-outline">Get a tailored quote</Link>
              <span className="ml-3 text-sm text-ink-soft">for larger or complex jobs</span>
            </div>

            {/* Trust badges inline (§12.1.4) — also the §12.4 filler for the
                social-proof slot until real numbers earn their place. */}
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-brand-ink">
              {TRUST_BADGES.map((b) => (
                <li key={b}>✓ {b}</li>
              ))}
            </ul>
          </div>

          {/* Above-the-fold quote widget (§12) — the instant "book" mechanism. */}
          <div className="lg:justify-self-end">
            <QuoteWidget />
          </div>
        </div>
      </section>

      <TrustBar />

      {/* Services (§12.1.5) */}
      <Section>
        <SectionHeading
          eyebrow="What we clean"
          title="One team, every kind of clean"
          intro="We employ and train our own crews — not a marketplace. Book domestic work online, or request a quote for commercial contracts."
        />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {orderedServices.map((s) => (
            <ServiceCard key={s.slug} service={s} />
          ))}
        </div>
      </Section>

      {/* How it works (§12.1.6) */}
      <Section muted>
        <SectionHeading eyebrow="How it works" title="Booked in three simple steps" />
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="card p-6">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-lg font-bold text-white">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Price accordion (§12.1.7) — reads the single price source, links to the full list */}
      <Section>
        <SectionHeading
          eyebrow="Transparent pricing"
          title="Real prices, before you book"
          intro="Every service shows a fixed 'from' price on the same rate card the booking uses — no call, no surprise on the day."
        />
        <div className="mt-8 max-w-2xl">
          <PriceAccordion />
        </div>
      </Section>

      {/* Why choose us (§12.1.8) */}
      <Section muted>
        <SectionHeading
          eyebrow="Why mcsecocleaning"
          title="Cleaning you can actually see the proof of"
          center
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {differentiators.map((d) => (
            <div key={d.title} className="card p-6">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-brand-tint text-xl text-brand-strong">
                {d.icon}
              </div>
              <h3 className="mt-4 text-lg font-bold">{d.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{d.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Eco teaser — brand-critical positioning, kept alongside the §12.1 spine. */}
      <Section>
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="The eco in mcsecocleaning"
              title="Non-toxic products, fully transparent"
            />
            <p className="mt-4 text-ink-soft">
              We publish exactly what we use, its certifications, and what we don&apos;t use and why.
              Set fragrance-free, pet-safe or allergy-sensitive preferences and we store them against
              your home for every visit.
            </p>
            <Link href="/eco-cleaning" className="btn btn-outline mt-6">
              See our eco approach
            </Link>
          </div>
          <div className="card p-8">
            <ul className="space-y-3 text-ink-soft">
              <li>♻️ Plant-based, non-toxic cleaning products</li>
              <li>🐾 Pet-safe and allergy-friendly options</li>
              <li>🌿 Reduced single-use plastic and refillable systems</li>
              <li>📋 Documented practice for commercial ESG requirements</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Reviews (§12.1.9) — renders only on real reviews. No placeholder or
          sample data (§12.4, DMCC §10.1); we style against the empty state. */}
      {homeReviews.length > 0 && (
        <Section muted>
          <Reviews reviews={homeReviews} title="Rated by real customers" />
          <div className="mt-6">
            <Link href="/reviews" className="font-semibold text-brand-strong underline">
              Read more reviews →
            </Link>
          </div>
        </Section>
      )}

      {/* Coverage (§12.1.10) */}
      {coverage.length > 0 && (
        <Section>
          <SectionHeading
            eyebrow="Where we clean"
            title="Areas we cover"
            intro="Launching across selected London districts and expanding. Not listed yet? Enter your postcode to join the waitlist."
          />
          <ul className="mt-6 flex flex-wrap gap-2">
            {coverage.map((c) => (
              <li key={c.name}>
                <Link href={c.href} className="inline-block rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-brand">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/areas-we-cover" className="mt-5 inline-block font-semibold text-brand-strong underline">
            See all areas &amp; check your postcode →
          </Link>
        </Section>
      )}

      {/* FAQ (§12.1.11) — marked up as FAQPage via the JsonLd above. */}
      <Section muted>
        <Faq faqs={homeFaqs} />
      </Section>

      {/* Closing CTA (§12.1.12) — repeats both dual-CTA paths. */}
      <CtaBanner
        primaryHref="/book"
        primaryLabel="Book instantly"
        secondaryHref="/contact"
        secondaryLabel="Get a quote"
      />
    </>
  );
}
