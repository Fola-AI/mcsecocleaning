import Link from "next/link";
import type { Metadata } from "next";
import { areas, canPublishLocationPage } from "@/config/areas";
import { services } from "@/config/services";
import { buildMetadata } from "@/lib/seo/metadata";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { LeadForm } from "@/components/marketing/LeadForm";

export const metadata: Metadata = buildMetadata({
  title: "Areas we cover",
  description:
    "The London areas and postcode districts we currently clean. Not on the list yet? Join the waitlist and we'll tell you the moment we reach you.",
  path: "/areas-we-cover",
});

export default async function AreasPage({
  searchParams,
}: {
  searchParams: Promise<{ waitlist?: string; postcode?: string }>;
}) {
  const { waitlist, postcode } = await searchParams;
  const activeAreas = areas.filter((a) => a.active);

  return (
    <>
      <PageHeader
        eyebrow="Where we clean"
        title="Areas we cover"
        intro="We're launching in selected London areas and expanding as coverage grows. Search your postcode anywhere on the site for instant availability."
        crumbs={[{ name: "Home", path: "/" }, { name: "Areas we cover", path: "/areas-we-cover" }]}
      />

      {waitlist && (
        <Section>
          <div className="rounded-xl border border-brand/30 bg-brand-tint p-6">
            <h2 className="text-xl font-bold text-brand-ink">
              We&apos;re not in {postcode || "your area"} just yet
            </h2>
            <p className="mt-1 text-brand-ink/80">
              Join the waitlist and you&apos;ll be first to know when we start cleaning near you.
            </p>
            <div className="mt-5 max-w-lg">
              <LeadForm
                enquiry="waitlist"
                defaultPostcode={postcode || ""}
                showMessage={false}
                submitLabel="Join the waitlist"
                consentLabel="Yes, email me when you cover my area (and occasional offers)."
              />
            </div>
          </div>
        </Section>
      )}

      <Section muted={!waitlist}>
        <SectionHeading eyebrow="Currently serving" title="Our areas" />
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {activeAreas.map((area) => {
            const publishedServices = services.filter(
              (s) => canPublishLocationPage(area, s.slug).ok
            );
            return (
              <div key={area.slug} className="card p-6">
                <h3 className="text-lg font-bold">{area.name}</h3>
                <p className="mt-1 text-sm text-ink-soft">
                  {area.postcodeDistricts.join(" · ")}
                </p>
                {publishedServices.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {publishedServices.map((s) => (
                      <li key={s.slug}>
                        <Link
                          href={`/${s.slug}/${area.slug}`}
                          className="inline-block rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-brand hover:text-brand-strong"
                        >
                          {s.shortName} cleaning
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-ink-soft">
          {/* Content-gate note (§5.3) */}
          Area pages appear here only once they have genuine local content, a local photo and a real
          local review — we don&apos;t publish thin, templated pages.
        </p>
      </Section>

      {!waitlist && (
        <Section>
          <SectionHeading eyebrow="Not covered yet?" title="Join the waitlist" />
          <div className="mt-6 max-w-lg">
            <LeadForm
              enquiry="waitlist"
              showMessage={false}
              submitLabel="Join the waitlist"
              consentLabel="Yes, email me when you cover my area (and occasional offers)."
            />
          </div>
        </Section>
      )}
    </>
  );
}
