import Link from "next/link";
import type { Metadata } from "next";
import { site } from "@/config/site";
import { serviceBySlug } from "@/config/services";
import { buildMetadata } from "@/lib/seo/metadata";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section } from "@/components/marketing/Section";
import { LeadForm } from "@/components/marketing/LeadForm";

export const metadata: Metadata = buildMetadata({
  title: "Contact us",
  description:
    "Get in touch for a cleaning quote, a commercial enquiry, or any question. Call us or send a message and we'll come back to you quickly.",
  path: "/contact",
});

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ enquiry?: string }>;
}) {
  const { enquiry } = await searchParams;
  const service = enquiry ? serviceBySlug(enquiry) : undefined;
  const isCommercial = service?.channel === "rfq";

  const heading = isCommercial
    ? `Request a quote for ${service!.name.toLowerCase()}`
    : "Get in touch";
  const intro = isCommercial
    ? "Tell us about your site and we'll arrange a survey, then send a proposal you can review and accept online."
    : "Have a question, or want a quote for something the online booking doesn't cover? Send us a message.";

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title={heading}
        intro={intro}
        crumbs={[{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }]}
      />

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-xl font-bold">Talk to us</h2>
            <dl className="mt-4 space-y-4 text-ink-soft">
              <div>
                <dt className="text-sm font-semibold text-ink">Phone</dt>
                <dd>
                  <a href={`tel:${site.contact.phone}`} className="text-brand-strong underline">
                    {site.contact.phoneDisplay}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-ink">Email</dt>
                <dd>
                  <a href={`mailto:${site.contact.email}`} className="text-brand-strong underline">
                    {site.contact.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-ink">Hours</dt>
                <dd>Mon–Fri 8am–6pm · Sat 9am–4pm</dd>
              </div>
            </dl>
            <p className="mt-6 rounded-lg bg-brand-tint p-4 text-sm text-brand-ink">
              For a domestic, deep or end of tenancy clean, the fastest route is an{" "}
              <Link href="/book" className="underline font-semibold">instant online price</Link>.
            </p>
          </div>

          <div>
            <LeadForm
              enquiry={enquiry || "general"}
              submitLabel={isCommercial ? "Request commercial quote" : "Send message"}
            />
          </div>
        </div>
      </Section>
    </>
  );
}
