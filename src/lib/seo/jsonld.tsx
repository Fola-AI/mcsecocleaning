/**
 * Structured data (§5.2).
 * Schemas: LocalBusiness (+CleaningService), Service, FAQPage, BreadcrumbList,
 * Organization.
 *
 * ⚠️ We deliberately DO NOT emit `AggregateRating` on LocalBusiness/Organization.
 * Google restricts self-serving review markup; marking up reviews we collected
 * about our own business can trigger a manual action (§5.2). Reviews are shown
 * to users on-page, but not marked up as ratings.
 */
import { site, formatAddress } from "@/config/site";
import type { Service } from "@/config/services";

/** Renders a JSON-LD script tag. Safe in server components. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // Content is our own trusted data, not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

const postalAddress = (a: {
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country?: string;
}) => ({
  "@type": "PostalAddress",
  streetAddress: [a.line1, a.line2].filter(Boolean).join(", "),
  addressLocality: a.city,
  postalCode: a.postcode,
  addressCountry: "GB",
});

export function localBusinessLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "CleaningService"],
    "@id": `${site.url}/#business`,
    name: site.name,
    legalName: site.company.registeredName,
    description: site.description,
    url: site.url,
    telephone: site.contact.phone,
    email: site.contact.email,
    image: `${site.url}/opengraph-image`,
    address: postalAddress(site.contact.address),
    geo: {
      "@type": "GeoCoordinates",
      latitude: site.contact.geo.latitude,
      longitude: site.contact.geo.longitude,
    },
    openingHoursSpecification: site.contact.openingHours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.days,
      opens: h.opens,
      closes: h.closes,
    })),
    priceRange: "££",
    areaServed: { "@type": "AdministrativeArea", name: "Greater London" }, // TODO(§16.1)
    // No aggregateRating — see file header.
  };
}

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site.url}/#organization`,
    name: site.company.registeredName,
    url: site.url,
    logo: `${site.url}/opengraph-image`,
    email: site.contact.email,
    telephone: site.contact.phone,
    address: postalAddress(site.company.registeredAddress),
    sameAs: Object.values(site.social).filter(Boolean),
  };
}

export function serviceLd(service: Service, opts?: { areaName?: string; url?: string }) {
  const name = opts?.areaName ? `${service.name} in ${opts.areaName}` : service.name;
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: service.name,
    name,
    description: service.summary,
    url: opts?.url ?? `${site.url}/${service.slug}`,
    provider: { "@id": `${site.url}/#business` },
    areaServed: opts?.areaName
      ? { "@type": "Place", name: opts.areaName }
      : { "@type": "AdministrativeArea", name: "Greater London" },
    ...(service.fromPricePence
      ? {
          offers: {
            "@type": "Offer",
            priceCurrency: "GBP",
            price: (service.fromPricePence / 100).toFixed(2),
            priceSpecification: {
              "@type": "PriceSpecification",
              priceCurrency: "GBP",
              price: (service.fromPricePence / 100).toFixed(2),
              valueAddedTaxIncluded: true,
            },
          },
        }
      : {}),
  };
}

export function faqLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbLd(crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${site.url}${c.path}`,
    })),
  };
}

/** Convenience: the full postal address as a display string. */
export const displayAddress = () => formatAddress(site.contact.address);
