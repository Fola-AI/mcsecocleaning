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
  const allReviews = areas.flatMap((a) => a.reviews);

  return (
    <>
      <PageHeader
        eyebrow="Reviews"
        title="What our customers say"
        intro="We ask every customer for honest feedback — and we answer every review. Here's a selection."
        crumbs={[{ name: "Home", path: "/" }, { name: "Reviews", path: "/reviews" }]}
      />

      <Section>
        {/* On-site display only — deliberately not marked up as AggregateRating (§5.2). */}
        <Reviews reviews={allReviews} title="Recent reviews" />
        <p className="mt-8 text-sm text-ink-soft">
          {/* TODO(§6.13): wire live Google/Trustpilot reviews and the automated review request. */}
          Verified reviews are also published on our Google Business Profile and Trustpilot.
        </p>
      </Section>

      <CtaBanner title="Join our happy customers" subtitle="Get a fixed online price in under two minutes." />
    </>
  );
}
