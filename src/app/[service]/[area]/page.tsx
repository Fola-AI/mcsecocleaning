import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { serviceBySlug } from "@/config/services";
import {
  areaBySlug,
  canPublishLocationPage,
  publishedLocationPages,
} from "@/config/areas";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd, serviceLd, faqLd, breadcrumbLd } from "@/lib/seo/jsonld";
import { site } from "@/config/site";
import { Section } from "@/components/marketing/Section";
import { Faq } from "@/components/marketing/Faq";
import { Reviews } from "@/components/marketing/Reviews";
import { CtaBanner } from "@/components/marketing/CtaBanner";

// Only gate-passing service×area pairs exist as pages (§5.3).
export const dynamicParams = false;

export function generateStaticParams() {
  return publishedLocationPages().map(({ area, serviceSlug }) => ({
    service: serviceSlug,
    area: area.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string; area: string }>;
}): Promise<Metadata> {
  const { service: sSlug, area: aSlug } = await params;
  const service = serviceBySlug(sSlug);
  const area = areaBySlug(aSlug);
  if (!service || !area) return {};
  const sc = area.serviceContent.find((c) => c.serviceSlug === service.slug);
  return buildMetadata({
    title: `${service.name} in ${area.name}`,
    description:
      sc?.intro?.slice(0, 155) ??
      `${service.name} in ${area.name} — ${service.tagline}.`,
    path: `/${service.slug}/${area.slug}`,
  });
}

export default async function LocationPage({
  params,
}: {
  params: Promise<{ service: string; area: string }>;
}) {
  const { service: sSlug, area: aSlug } = await params;
  const service = serviceBySlug(sSlug);
  const area = areaBySlug(aSlug);
  if (!service || !area) notFound();
  // Enforce the gate at render too, not just at param generation.
  if (!canPublishLocationPage(area, service.slug).ok) notFound();

  const sc = area.serviceContent.find((c) => c.serviceSlug === service.slug)!;
  const localReviews = area.reviews.filter((r) => r.fromArea);
  const url = `${site.url}/${service.slug}/${area.slug}`;

  return (
    <>
      <JsonLd
        data={[
          serviceLd(service, { areaName: area.name, url }),
          faqLd(service.faqs),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: service.name, path: `/${service.slug}` },
            { name: area.name, path: `/${service.slug}/${area.slug}` },
          ]),
        ]}
      />

      <section className="py-12 md:py-16">
        <div className="container-page">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
            <Link href="/" className="hover:underline">Home</Link>
            <span aria-hidden> / </span>
            <Link href={`/${service.slug}`} className="hover:underline">{service.name}</Link>
            <span aria-hidden> / </span>
            <span className="text-ink">{area.name}</span>
          </nav>

          <h1 className="mt-6 max-w-3xl text-4xl font-bold md:text-5xl">
            {service.name} in {area.name}
          </h1>

          <div className="mt-4 flex flex-wrap gap-2 text-sm text-ink-soft">
            {area.postcodeDistricts.map((d) => (
              <span key={d} className="rounded-full border border-line bg-surface px-3 py-1">
                {d}
              </span>
            ))}
          </div>

          <div className="mt-8 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
            <div className="prose-local">
              <p className="text-lg text-ink">{sc.intro}</p>
              {area.overview.map((p, i) => (
                <p key={i}>{p}</p>
              ))}

              <h2>Property &amp; local notes</h2>
              <p>{area.propertyStock}</p>
              <h3>Parking &amp; access</h3>
              <p>{area.parking}</p>

              <h2>Pricing in {area.name}</h2>
              <p>{sc.pricingNote}</p>
              <ul>
                {sc.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>

              {area.landmarks.length > 0 && (
                <p className="text-sm text-ink-soft">
                  Serving homes near {area.landmarks.join(", ")}.
                </p>
              )}
            </div>

            <aside className="lg:sticky lg:top-24 h-fit card p-6">
              <h2 className="text-lg font-bold">Book {service.shortName.toLowerCase()} in {area.name}</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Fixed, VAT-inclusive price online in minutes.
              </p>
              <Link
                href={
                  service.channel === "rfq"
                    ? `/contact?enquiry=${service.slug}`
                    : `/book?service=${service.slug}&postcode=${area.postcodeDistricts[0]}`
                }
                className="btn btn-primary mt-4 w-full"
              >
                {service.channel === "rfq" ? "Request a quote" : "Get my price"}
              </Link>
              <a href={`tel:${site.contact.phone}`} className="btn btn-outline mt-2 w-full">
                📞 {site.contact.phoneDisplay}
              </a>
            </aside>
          </div>
        </div>
      </section>

      {localReviews.length > 0 && (
        <Section muted>
          <Reviews reviews={localReviews} title={`Reviews from ${area.name}`} />
        </Section>
      )}

      <Section>
        <Faq faqs={service.faqs} />
      </Section>

      <CtaBanner
        title={`Book your ${service.name.toLowerCase()} in ${area.name}`}
        primaryHref={
          service.channel === "rfq"
            ? `/contact?enquiry=${service.slug}`
            : `/book?service=${service.slug}&postcode=${area.postcodeDistricts[0]}`
        }
        primaryLabel={service.channel === "rfq" ? "Request a quote" : "Get my price"}
      />
    </>
  );
}
