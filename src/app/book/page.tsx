import type { Metadata } from "next";
import { serviceBySlug, selfServeServices } from "@/config/services";
import { buildMetadata } from "@/lib/seo/metadata";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section } from "@/components/marketing/Section";
import { LeadForm } from "@/components/marketing/LeadForm";

// The booking wizard is noindex (§5.1).
export const metadata: Metadata = buildMetadata({
  title: "Get your cleaning price",
  description: "Request your fixed cleaning price.",
  path: "/book",
  noindex: true,
});

/**
 * Phase 1 booking entry point. The full instant-price wizard (§6.1) lands in
 * Phase 2; until then this captures the request as a lead so the business can
 * quote and book by phone from day one (§13 Phase 1).
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; postcode?: string }>;
}) {
  const { service: serviceSlug, postcode } = await searchParams;
  const service = serviceSlug ? serviceBySlug(serviceSlug) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Get a price"
        title={service ? `Book your ${service.name.toLowerCase()}` : "Get your cleaning price"}
        intro="Send us your details and we'll confirm your fixed price and a slot. Instant self-serve booking is coming soon — for now this takes under a minute."
      />

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h2 className="text-xl font-bold">What happens next</h2>
            <ol className="mt-4 space-y-3 text-ink-soft">
              <li><strong className="text-ink">1.</strong> We confirm your fixed, VAT-inclusive price on your rooms.</li>
              <li><strong className="text-ink">2.</strong> We offer you a date and time we can staff.</li>
              <li><strong className="text-ink">3.</strong> An insured, DBS-checked crew cleans and sends before/after photos.</li>
            </ol>
            <div className="mt-6 rounded-lg bg-brand-tint p-4 text-sm text-brand-ink">
              Prefer to talk it through? Call us and we&apos;ll book you in over the phone.
            </div>
            {!service && (
              <div className="mt-6">
                <p className="text-sm font-semibold">Services you can book:</p>
                <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                  {selfServeServices.map((s) => (
                    <li key={s.slug} className="rounded-full border border-line px-3 py-1">
                      {s.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <LeadForm
              enquiry={service ? service.slug : "booking"}
              defaultPostcode={postcode || ""}
              submitLabel="Request my price"
              consentLabel="Email me my quote and occasional offers. Unsubscribe any time."
            />
          </div>
        </div>
      </Section>
    </>
  );
}
