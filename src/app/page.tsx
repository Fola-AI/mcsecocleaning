import Link from "next/link";
import type { Metadata } from "next";
import { site } from "@/config/site";
import { orderedServices } from "@/config/services";
import { areas } from "@/config/areas";
import { QuoteWidget } from "@/components/marketing/QuoteWidget";
import { TrustBar } from "@/components/ui/TrustBar";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { ServiceCard } from "@/components/marketing/ServiceCard";
import { Reviews } from "@/components/marketing/Reviews";
import { Faq } from "@/components/marketing/Faq";
import { CtaBanner } from "@/components/marketing/CtaBanner";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: `Eco-friendly cleaning with fixed online prices`,
  description: site.description,
  path: "/",
});

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
  { n: 1, title: "Get your price", body: "Enter your postcode and rooms for an instant, fixed, VAT-inclusive price." },
  { n: 2, title: "Pick a slot", body: "Choose a date and time we can actually staff — no phantom availability." },
  { n: 3, title: "We clean & prove it", body: "An insured, DBS-checked crew cleans to a checklist and sends before/after photos." },
];

export default function HomePage() {
  const homeReviews = areas.flatMap((a) => a.reviews).slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="container-page grid items-center gap-10 py-12 md:py-16 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Eco cleaning · London &amp; nearby</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">
              A cleaner home, a lighter footprint —{" "}
              <span className="text-brand">priced online in minutes</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ink-soft">
              Domestic, end of tenancy, deep and commercial cleaning with non-toxic products,
              before/after photos of every job, and a re-clean guarantee. No phone call needed.
            </p>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-brand-ink">
              <li>✓ Fixed prices, no surprises</li>
              <li>✓ Insured &amp; DBS-checked</li>
              <li>✓ 72-hour re-clean guarantee</li>
            </ul>
          </div>
          {/* Above-the-fold quote widget (§8) */}
          <div className="lg:justify-self-end">
            <QuoteWidget />
          </div>
        </div>
      </section>

      <TrustBar />

      {/* Services */}
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

      {/* Differentiators */}
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

      {/* How it works */}
      <Section>
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

      {/* Eco teaser */}
      <Section muted>
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

      {/* Reviews */}
      <Section>
        <Reviews reviews={homeReviews} title="Rated by London households" />
        <div className="mt-6">
          <Link href="/reviews" className="font-semibold text-brand-strong underline">
            Read more reviews →
          </Link>
        </div>
      </Section>

      {/* FAQ */}
      <Section muted>
        <Faq
          faqs={[
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
          ]}
        />
      </Section>

      <CtaBanner />
    </>
  );
}
