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

/** Carried-over job from an escalated booking (§7.2 handoff, wired in the wizard). */
interface CarriedJob {
  propertyType?: string;
  condition?: string;
  frequency?: string;
  rooms?: Record<string, number>;
  addOnSlugs?: string[];
  reason?: string;
}

function parseCarriedJob(raw?: string): CarriedJob | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as CarriedJob;
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

/** Human-readable one-liner so the customer sees what was carried over. */
function summariseJob(serviceName: string | undefined, job: CarriedJob): string {
  const parts: string[] = [];
  if (serviceName) parts.push(serviceName);
  if (job.propertyType) parts.push(job.propertyType);
  const beds = job.rooms?.bedrooms;
  const baths = job.rooms?.bathrooms;
  if (typeof beds === "number") parts.push(beds === 0 ? "studio" : `${beds} bed`);
  if (typeof baths === "number") parts.push(`${baths} bath`);
  if (job.condition === "heavily_soiled") parts.push("heavily soiled");
  return parts.join(" · ");
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ enquiry?: string; postcode?: string; job?: string }>;
}) {
  const { enquiry, postcode, job: jobRaw } = await searchParams;
  const service = enquiry ? serviceBySlug(enquiry) : undefined;
  const isCommercial = service?.channel === "rfq";
  const job = parseCarriedJob(jobRaw);
  const jobSummary = job ? summariseJob(service?.name, job) : "";

  const heading = isCommercial
    ? `Request a quote for ${service!.name.toLowerCase()}`
    : job
      ? `Get a tailored quote for your ${service ? service.name.toLowerCase() : "clean"}`
      : "Get in touch";
  const intro = isCommercial
    ? "Tell us about your site and we'll arrange a survey, then send a proposal you can review and accept online."
    : job
      ? "We've carried over the details from your booking — just add your contact details and we'll price it and come back to you."
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
            {jobSummary && (
              <p className="mb-4 rounded-lg border border-brand/40 bg-brand-tint/40 p-3 text-sm text-brand-ink">
                <span className="font-semibold">Carried over from your booking:</span> {jobSummary}
              </p>
            )}
            <LeadForm
              enquiry={enquiry || "general"}
              defaultPostcode={postcode || ""}
              job={jobRaw}
              submitLabel={isCommercial ? "Request commercial quote" : job ? "Get my tailored quote" : "Send message"}
            />
          </div>
        </div>
      </Section>
    </>
  );
}
