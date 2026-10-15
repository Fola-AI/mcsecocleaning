import Link from "next/link";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd, faqLd, breadcrumbLd } from "@/lib/seo/jsonld";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { Faq } from "@/components/marketing/Faq";
import { CtaBanner } from "@/components/marketing/CtaBanner";

export const metadata: Metadata = buildMetadata({
  title: "Eco-friendly, non-toxic cleaning",
  description:
    "Green cleaning done properly: non-toxic, pet-safe and allergy-friendly products, full transparency on what we use, and documented practice for commercial ESG requirements.",
  path: "/eco-cleaning",
});

const faqs = [
  {
    q: "What makes your cleaning eco-friendly?",
    a: "We use plant-based, non-toxic products with recognised environmental certifications, cut single-use plastic with refillable systems, and avoid the harsh chemicals found in conventional cleaning. We publish exactly what we use so you can check.",
  },
  {
    q: "Are your products safe for pets and children?",
    a: "Yes. Our standard products are non-toxic and we offer pet-safe, fragrance-free and allergy-sensitive product sets. Set your preference and we store it against your home for every visit.",
  },
  {
    q: "Is eco cleaning as effective as conventional cleaning?",
    a: "Yes — modern plant-based products clean to the same standard for everyday and deep cleaning. Where a specific job genuinely needs a specialist product, we'll tell you and use the least harmful effective option.",
  },
  {
    q: "Can you meet our company's ESG or tender requirements?",
    a: "Our green practice is documented — products, certifications and what we don't use — which supports ESG criteria and the environmental questions increasingly built into commercial cleaning tenders.",
  },
];

export default function EcoCleaningPage() {
  return (
    <>
      <JsonLd
        data={[
          faqLd(faqs),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Eco cleaning", path: "/eco-cleaning" },
          ]),
        ]}
      />
      <PageHeader
        eyebrow="The eco in mcsecocleaning"
        title="Genuinely green cleaning — and we prove it"
        intro="Eco isn't a tagline for us, it's how we clean. Non-toxic, pet- and allergy-safe products, less plastic, and full transparency about what goes into your home."
        crumbs={[{ name: "Home", path: "/" }, { name: "Eco cleaning", path: "/eco-cleaning" }]}
      />

      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="prose-local">
            <h2>Non-toxic by default</h2>
            <p>
              Conventional cleaning products can carry harsh solvents, chlorine bleach and synthetic
              fragrances — fine on a label, less fine in a home with children, pets or anyone with
              allergies or asthma. Our standard kit is plant-based and non-toxic, chosen to clean to
              a professional standard without that trade-off.
            </p>
            <h2>Pet-safe &amp; allergy-friendly options</h2>
            <p>
              Tell us once and we remember: fragrance-free, pet-safe or allergy-sensitive product
              sets are stored against your property and shared with your cleaner, so every visit
              respects them.
            </p>
            <h2>Less waste</h2>
            <p>
              We reduce single-use plastic with concentrated refills and reusable cloths and, where
              we can, microfibre systems that clean effectively with less product and water.
            </p>
          </div>
          <div>
            <div className="card p-6">
              <h2 className="text-lg font-bold">What we use — and don&apos;t</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Full product transparency (§5.6). Replace the placeholders below with your actual
                product list and certifications.
              </p>
              <div className="mt-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-brand">We use</h3>
                <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                  <li>✓ Plant-based multi-surface cleaners {/* TODO(products): name + cert */}</li>
                  <li>✓ Non-toxic bathroom &amp; limescale products</li>
                  <li>✓ Microfibre &amp; reusable cloths, colour-coded</li>
                  <li>✓ Refillable, concentrated formats</li>
                </ul>
              </div>
              <div className="mt-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-accent-strong">We avoid</h3>
                <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                  <li>✕ Chlorine bleach as a default</li>
                  <li>✕ Synthetic fragrance where fragrance-free is requested</li>
                  <li>✕ Unnecessary single-use plastics</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section muted>
        <div className="grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <SectionHeading eyebrow="For businesses" title="Green cleaning that wins contracts" />
            <p className="mt-4 text-ink-soft">
              UK commercial cleaning tenders increasingly carry ESG and environmental requirements.
              Documented green practice lets you bid for work competitors can&apos;t — and it&apos;s
              genuinely better for the people in the building.
            </p>
            <Link href="/contact?enquiry=office-cleaning" className="btn btn-primary mt-6">
              Request a commercial quote
            </Link>
          </div>
          <div className="card p-6 text-sm text-ink-soft">
            <p className="font-semibold text-ink">Set your eco preferences at booking</p>
            <p className="mt-2">
              Choose fragrance-free, allergy-sensitive or pet-safe product sets in the booking wizard.
              Your choice is stored as a property preference and surfaced to your crew on every visit.
            </p>
          </div>
        </div>
      </Section>

      <Section>
        <Faq faqs={faqs} />
      </Section>

      <CtaBanner
        title="A cleaner home, a lighter footprint"
        subtitle="Get a fixed online price with your eco preferences built in."
      />
    </>
  );
}
