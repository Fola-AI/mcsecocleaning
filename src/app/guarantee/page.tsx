import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd, faqLd, breadcrumbLd } from "@/lib/seo/jsonld";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { Faq } from "@/components/marketing/Faq";
import { CtaBanner } from "@/components/marketing/CtaBanner";

export const metadata: Metadata = buildMetadata({
  title: "Our re-clean guarantee",
  description:
    "Not happy? We come back and put it right. 72-hour re-clean guarantee on end of tenancy, 48 hours on everything else — with photographic proof of every job.",
  path: "/guarantee",
});

const faqs = [
  {
    q: "How do I make a claim under the guarantee?",
    a: "Get in touch within the guarantee window — 72 hours for end of tenancy, 48 hours for other cleans — with a quick note and, ideally, a photo. We'll arrange a free re-clean, usually within 24–48 hours.",
  },
  {
    q: "What if my issue is after the window closes?",
    a: "You can always still contact us. The guarantee window is our promise of a fast, free remedy — it isn't a cut-off for getting help. After it closes your message becomes a normal support request and we'll always respond.",
  },
  {
    q: "What if something was damaged?",
    a: "Damage is handled separately from a cleaning complaint. Tell us as soon as you can with photos; we're fully insured and will guide you through it properly.",
  },
];

const steps = [
  { n: 1, title: "Tell us", body: "Message us within the window with a short note and a photo if you can." },
  { n: 2, title: "We check", body: "We compare against the before/after photos and checklist from your job." },
  { n: 3, title: "We put it right", body: "A free re-clean, usually within 24–48 hours — or another fair resolution." },
];

export default function GuaranteePage() {
  return (
    <>
      <JsonLd
        data={[
          faqLd(faqs),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Guarantee", path: "/guarantee" },
          ]),
        ]}
      />
      <PageHeader
        eyebrow="Our promise"
        title="The re-clean guarantee"
        intro="Cleaning is a judgement call, and occasionally we'll miss the mark. When we do, we fix it — fast and free."
        crumbs={[{ name: "Home", path: "/" }, { name: "Guarantee", path: "/guarantee" }]}
      />

      <Section>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="card p-8">
            <p className="text-4xl font-bold text-brand">72h</p>
            <h2 className="mt-2 text-lg font-bold">End of tenancy</h2>
            <p className="mt-2 text-ink-soft">
              If your check-out flags cleaning we should have covered, tell us within 72 hours and
              we&apos;ll return free of charge. It&apos;s the UK market standard, and we back it with
              photos and an inventory-aligned checklist.
            </p>
          </div>
          <div className="card p-8">
            <p className="text-4xl font-bold text-brand">48h</p>
            <h2 className="mt-2 text-lg font-bold">Domestic &amp; commercial</h2>
            <p className="mt-2 text-ink-soft">
              For every other clean, you have 48 hours to raise anything you&apos;re not happy with
              and we&apos;ll come back and put it right.
            </p>
          </div>
        </div>
      </Section>

      <Section muted>
        <SectionHeading eyebrow="How it works" title="Three steps to a re-clean" />
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="card p-6">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-lg font-bold text-white">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-2xl text-sm text-ink-soft">
          The guarantee sits alongside your statutory rights under the Consumer Rights Act 2015 — it
          adds to them, it doesn&apos;t replace them.
        </p>
      </Section>

      <Section>
        <Faq faqs={faqs} />
      </Section>

      <CtaBanner
        title="Book with confidence"
        subtitle="Every job photographed, every clean guaranteed."
      />
    </>
  );
}
