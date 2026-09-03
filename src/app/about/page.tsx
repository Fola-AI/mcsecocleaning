import type { Metadata } from "next";
import { site } from "@/config/site";
import { buildMetadata } from "@/lib/seo/metadata";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { CtaBanner } from "@/components/marketing/CtaBanner";

export const metadata: Metadata = buildMetadata({
  title: "About us",
  description:
    "We're an eco-friendly cleaning company that employs and trains its own crews — not a marketplace. Insured, DBS-checked, and transparent about pricing and results.",
  path: "/about",
});

const values = [
  { icon: "👥", title: "Our own crews", body: "We employ and train our cleaners — not a marketplace of strangers. Consistent people, consistent standards." },
  { icon: "🛡️", title: "Insured & vetted", body: `${site.trust.publicLiabilityCover} public liability and DBS-checked staff. We take being trusted in your home seriously.` },
  { icon: "♻️", title: "Greener by default", body: "Non-toxic products as standard, because a clean home shouldn't cost you clean air." },
  { icon: "📸", title: "Proof, not promises", body: "Before/after photos of every job and a re-clean guarantee. You see exactly what was done." },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About mcsecocleaning"
        title="Cleaning done properly — and proven"
        intro="We started mcsecocleaning to fix what frustrates people about hiring a cleaner: no clear price, no idea who's turning up, and no proof of what was done."
        crumbs={[{ name: "Home", path: "/" }, { name: "About", path: "/about" }]}
      />

      <Section>
        <div className="prose-local">
          <h2>Why we exist</h2>
          <p>
            Most UK cleaning companies still make you phone for a quote, send whoever&apos;s free, and
            leave you to take the results on trust. We do the opposite: a fixed price online, our own
            trained crews, eco-friendly products, and before/after photos of every job.
          </p>
          <p>
            {/* TODO(business-input §16): replace with the real founding story, location and team. */}
            We&apos;re building something we&apos;d want to hire ourselves — reliable, transparent and
            genuinely kinder to the homes and buildings we clean.
          </p>
        </div>
      </Section>

      <Section muted>
        <SectionHeading eyebrow="What we stand for" title="The standards behind every clean" center />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v) => (
            <div key={v.title} className="card p-6">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-brand-tint text-xl">
                {v.icon}
              </div>
              <h3 className="mt-4 text-lg font-bold">{v.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{v.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <CtaBanner />
    </>
  );
}
