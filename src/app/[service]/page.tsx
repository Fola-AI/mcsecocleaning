import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { services, serviceBySlug, addOns } from "@/config/services";
import { areas, canPublishLocationPage } from "@/config/areas";
import { formatPounds } from "@/lib/money";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  JsonLd,
  serviceLd,
  faqLd,
  breadcrumbLd,
} from "@/lib/seo/jsonld";
import { TrustBar } from "@/components/ui/TrustBar";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { Faq } from "@/components/marketing/Faq";
import { Reviews } from "@/components/marketing/Reviews";
import { CtaBanner } from "@/components/marketing/CtaBanner";

// Only the known service slugs are valid; anything else 404s (§5.4).
export const dynamicParams = false;

export function generateStaticParams() {
  return services.map((s) => ({ service: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>;
}): Promise<Metadata> {
  const { service: slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) return {};
  return buildMetadata({
    title: `${service.name} — ${service.tagline}`,
    description: service.summary,
    path: `/${service.slug}`,
  });
}

export default async function ServiceHubPage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service: slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) notFound();

  const price =
    service.fromPricePence != null
      ? `From ${formatPounds(service.fromPricePence)}${service.fromUnit ? ` ${service.fromUnit}` : ""}`
      : "Priced after a quick survey";

  const serviceAddOns = addOns.filter((a) => a.appliesTo.includes(service.slug));

  // Areas with a published (gate-passing) page for this service.
  const coveredAreas = areas.filter(
    (a) => a.active && canPublishLocationPage(a, service.slug).ok
  );

  // Reviews mentioning this service.
  const serviceReviews = areas
    .flatMap((a) => a.reviews ?? [])
    .filter((r) => r.serviceSlug === service.slug)
    .slice(0, 3);

  const isCommercial = service.channel === "rfq";
  const ctaHref = isCommercial
    ? `/contact?enquiry=${service.slug}`
    : `/book?service=${service.slug}`;
  const ctaLabel = isCommercial ? "Request a commercial quote" : "Get my fixed price";

  return (
    <>
      <JsonLd
        data={[
          serviceLd(service),
          faqLd(service.faqs),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: service.name, path: `/${service.slug}` },
          ]),
        ]}
      />

      {/* Hero */}
      <section className="py-12 md:py-16">
        <div className="container-page">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
            <Link href="/" className="hover:underline">Home</Link>
            <span aria-hidden> / </span>
            <span className="text-ink">{service.name}</span>
          </nav>
          <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
            <div>
              <p className="eyebrow">{service.shortName} cleaning</p>
              <h1 className="mt-2 text-4xl font-bold md:text-5xl">{service.name}</h1>
              <p className="mt-4 max-w-2xl text-lg text-ink-soft">{service.summary}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href={ctaHref} className="btn btn-primary">
                  {ctaLabel}
                </Link>
                <span className="text-lg font-semibold text-brand-strong">{price}</span>
              </div>
              {service.remedyWindowHours >= 72 && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent-strong">
                  ↩️ {service.remedyWindowHours}-hour re-clean guarantee
                </p>
              )}
            </div>
            <div className="card p-6">
              <h2 className="text-lg font-bold">What&apos;s included</h2>
              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                {service.includes.map((inc) => (
                  <li key={inc} className="flex gap-2">
                    <span aria-hidden className="text-brand-strong">✓</span>
                    <span>{inc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <TrustBar />

      {/* Who it's for */}
      <Section>
        <SectionHeading eyebrow="Who it's for" title={`Is ${service.name.toLowerCase()} right for you?`} />
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">{service.whoFor}</p>
      </Section>

      {/* Add-ons */}
      {serviceAddOns.length > 0 && (
        <Section muted>
          <SectionHeading eyebrow="Optional extras" title="Add-ons, each with a clear price" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {serviceAddOns.map((a) => (
              <div key={a.slug} className="card flex items-center justify-between p-4">
                <span className="font-semibold">{a.name}</span>
                <span className="text-sm font-semibold text-brand-strong">
                  {a.fromPricePence != null
                    ? `From ${formatPounds(a.fromPricePence)}${a.unit && a.unit !== "each" ? ` ${a.unit}` : ""}`
                    : "Quoted"}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Areas */}
      {coveredAreas.length > 0 && (
        <Section>
          <SectionHeading eyebrow="Where we clean" title={`${service.name} near you`} />
          <div className="mt-6 flex flex-wrap gap-3">
            {coveredAreas.map((a) => (
              <Link
                key={a.slug}
                href={`/${service.slug}/${a.slug}`}
                className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-brand hover:text-brand-strong"
              >
                {service.shortName} cleaning in {a.name}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {serviceReviews.length > 0 && (
        <Section muted>
          <Reviews reviews={serviceReviews} />
        </Section>
      )}

      {/* FAQ */}
      <Section>
        <Faq faqs={service.faqs} />
      </Section>

      <CtaBanner
        title={isCommercial ? "Need a commercial cleaning quote?" : `Ready to book your ${service.name.toLowerCase()}?`}
        subtitle={
          isCommercial
            ? "Tell us about your site and we'll arrange a survey and a proposal you can accept online."
            : "Get a fixed, VAT-inclusive price online in under two minutes."
        }
        primaryHref={ctaHref}
        primaryLabel={ctaLabel}
      />
    </>
  );
}
