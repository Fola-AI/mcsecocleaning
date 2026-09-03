import Link from "next/link";
import type { Metadata } from "next";
import { orderedServices, addOns } from "@/config/services";
import { formatPounds } from "@/lib/money";
import { VAT_REGISTERED } from "@/lib/money";
import { buildMetadata } from "@/lib/seo/metadata";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { Faq } from "@/components/marketing/Faq";
import { CtaBanner } from "@/components/marketing/CtaBanner";

export const metadata: Metadata = buildMetadata({
  title: "Cleaning prices",
  description:
    "Transparent, published cleaning prices. See 'from' prices for domestic, end of tenancy and deep cleaning — VAT-inclusive, no phone call needed.",
  path: "/prices",
});

export default function PricesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Transparent pricing"
        title="Our prices, published upfront"
        intro="Most UK cleaners make you phone for a quote. We don't. Here's what things cost — and you can get an exact fixed price online in minutes."
        crumbs={[{ name: "Home", path: "/" }, { name: "Prices", path: "/prices" }]}
      />

      <Section>
        <SectionHeading eyebrow="From prices" title="Starting prices by service" />
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-sm text-ink-soft">
                <th className="py-3 pr-4 font-semibold">Service</th>
                <th className="py-3 pr-4 font-semibold">From</th>
                <th className="py-3 font-semibold">How it&apos;s priced</th>
              </tr>
            </thead>
            <tbody>
              {orderedServices.map((s) => (
                <tr key={s.slug} className="border-b border-line">
                  <td className="py-4 pr-4">
                    <Link href={`/${s.slug}`} className="font-semibold text-brand-strong hover:underline">
                      {s.name}
                    </Link>
                    <span className="block text-sm text-ink-soft">{s.tagline}</span>
                  </td>
                  <td className="py-4 pr-4 font-semibold">
                    {s.fromPricePence != null
                      ? `${formatPounds(s.fromPricePence)}${s.fromUnit ? ` ${s.fromUnit}` : ""}`
                      : "Quoted"}
                  </td>
                  <td className="py-4 text-sm text-ink-soft">
                    {s.pricingModel === "room" && "Priced on your actual rooms & condition"}
                    {s.pricingModel === "quoted" && "Quoted after a short survey"}
                    {s.pricingModel === "hourly" && "Hourly rate × minimum hours"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          All consumer prices shown are {VAT_REGISTERED ? "VAT-inclusive" : "VAT-inclusive (we are not currently VAT registered)"}.
          Commercial quotes are provided net + VAT.
        </p>
      </Section>

      <Section muted>
        <SectionHeading eyebrow="Optional extras" title="Add-on prices" intro="Add any of these at booking. Each shows its own price and the time it adds." />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {addOns.map((a) => (
            <div key={a.slug} className="card flex items-center justify-between p-4">
              <span className="font-semibold">{a.name}</span>
              <span className="text-sm font-semibold text-brand-strong">
                {a.fromPricePence != null
                  ? `From ${formatPounds(a.fromPricePence)}${a.unit && a.unit !== "each" ? ` ${a.unit}` : ""}`
                  : "Quoted"}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="How pricing works" title="Rooms, not guesswork" />
            <div className="prose-local mt-4">
              <p>
                We price on the actual rooms in your home — kitchens and bathrooms take the most time,
                so a two-bed with three bathrooms costs more than a two-bed with one. That&apos;s fairer
                than pricing on bedroom count or floor area.
              </p>
              <ul>
                <li><strong>Frequency discount</strong> — weekly and fortnightly visits cost less per visit than one-offs.</li>
                <li><strong>First-clean charge</strong> — a new home&apos;s first visit takes longer; it&apos;s shown separately.</li>
                <li><strong>Condition</strong> — heavily soiled properties take more time and are priced accordingly.</li>
                <li><strong>No surprises</strong> — the price you&apos;re quoted is the price you pay, unless you ask for extra work.</li>
              </ul>
            </div>
          </div>
          <div className="card p-8">
            <h3 className="text-lg font-bold">Commercial &amp; communal areas</h3>
            <p className="mt-2 text-ink-soft">
              Office and communal area cleaning is priced per visit or per hour after a short site
              survey — every site is different. We&apos;ll send a proposal you can accept online.
            </p>
            <Link href="/contact?enquiry=office-cleaning" className="btn btn-primary mt-5">
              Request a commercial quote
            </Link>
          </div>
        </div>
      </Section>

      <Section muted>
        <Faq
          faqs={[
            {
              q: "Are these prices really fixed?",
              a: "Yes. The online quote gives a fixed, VAT-inclusive price on your actual rooms. The only changes are extra rooms or add-ons you ask for, which we agree with you first.",
            },
            {
              q: "Why is end of tenancy more expensive than a regular clean?",
              a: "It's an exhaustive, one-off job cleaned to inventory check-out standards with a re-clean guarantee, so it carries a minimum job value. A regular maintenance visit is quicker and cheaper.",
            },
            {
              q: "Do you charge for cancellations?",
              a: "A late-cancellation or no-access fee may apply, tiered by how much notice you give and always disclosed before you pay. See our cancellation policy for the detail.",
            },
          ]}
        />
      </Section>

      <CtaBanner />
    </>
  );
}
