import type { Metadata } from "next";
import { areas } from "@/config/areas";
import { buildMetadata } from "@/lib/seo/metadata";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section } from "@/components/marketing/Section";
import { Reviews } from "@/components/marketing/Reviews";
import { CtaBanner } from "@/components/marketing/CtaBanner";

export const metadata: Metadata = buildMetadata({
  title: "Customer reviews",
  description:
    "Real reviews from customers across the areas we clean. Read what people say about our eco-friendly cleaning, reliability and results.",
  path: "/reviews",
});

export default function ReviewsPage() {
  const allReviews = areas.flatMap((a) => a.reviews ?? []);

  return (
    <>
      <PageHeader
        eyebrow="Reviews"
        title="What our customers say"
        intro="We ask every customer for an honest Google review after their clean, and we answer every one."
        crumbs={[{ name: "Home", path: "/" }, { name: "Reviews", path: "/reviews" }]}
      />

      <Section>
        {/* On-site display only — never marked up as AggregateRating (§6). Renders
            only real reviews; no placeholder or sample data (§10.1 DMCC, §12.4). */}
        {allReviews.length > 0 ? (
          <Reviews reviews={allReviews} title="Recent reviews" />
        ) : (
          <div className="rounded-xl border border-line bg-brand-tint/40 p-6">
            <h2 className="text-lg font-bold">We&apos;re gathering our first reviews</h2>
            <p className="mt-2 text-ink-soft">
              We&apos;re a new local team building a review base from real, completed jobs — we
              don&apos;t publish anything else. Reviews will appear here and on our Google Business
              Profile as customers leave them.
            </p>
          </div>
        )}
      </Section>

      <CtaBanner title="Join our happy customers" subtitle="Get a fixed online price in under two minutes." />
    </>
  );
}
