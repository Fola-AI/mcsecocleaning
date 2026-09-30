import type { Metadata } from "next";
import { serviceBySlug } from "@/config/services";
import { site } from "@/config/site";
import { buildMetadata } from "@/lib/seo/metadata";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section } from "@/components/marketing/Section";
import { BookingWizard } from "@/components/booking/BookingWizard";

// The booking wizard is noindex (§5.1).
export const metadata: Metadata = buildMetadata({
  title: "Get your cleaning price & book",
  description: "Get a fixed price and book your clean online.",
  path: "/book",
  noindex: true,
});

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; postcode?: string; propertyType?: string; condition?: string; rooms?: string }>;
}) {
  const { service: serviceSlug, postcode, propertyType, condition, rooms } = await searchParams;
  const service = serviceSlug ? serviceBySlug(serviceSlug) : undefined;
  const initialService = service && service.channel === "self-serve" ? service.slug : undefined;

  // Rebook prefill (from /account) — the property only; the wizard recomputes price.
  const initialPropertyType = propertyType === "house" ? "house" : propertyType === "flat" ? "flat" : undefined;
  const initialCondition = condition === "heavily_soiled" ? "heavily_soiled" : condition === "standard" ? "standard" : undefined;
  let initialRooms: Record<string, number> | undefined;
  if (rooms) {
    try {
      const parsed = JSON.parse(rooms) as Record<string, unknown>;
      initialRooms = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, v as number])
      );
    } catch {
      initialRooms = undefined;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Get a price & book"
        title="Book your clean in under two minutes"
        intro="A fixed, VAT-inclusive price on your actual rooms — no phone call, no card needed to see it."
      />
      <Section>
        <BookingWizard
          initialService={initialService}
          initialPostcode={postcode}
          initialPropertyType={initialPropertyType}
          initialCondition={initialCondition}
          initialRooms={initialRooms}
        />
        <p className="mt-8 text-center text-sm text-ink-soft">
          Prefer to talk? Call us on{" "}
          <a href={`tel:${site.contact.phone}`} className="font-semibold text-brand-strong underline">
            {site.contact.phoneDisplay}
          </a>
          .
        </p>
      </Section>
    </>
  );
}
