import Link from "next/link";
import type { Metadata } from "next";
import { site, formatAddress } from "@/config/site";
import { buildMetadata } from "@/lib/seo/metadata";
import { LegalDoc } from "@/components/marketing/LegalDoc";

export const metadata: Metadata = buildMetadata({
  title: "Terms & conditions",
  description: "The terms on which mcsecocleaning provides cleaning services.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalDoc title="Terms & conditions" updated="September 2026">
      <h2>1. About us</h2>
      <p>
        These terms govern the cleaning services provided by {site.company.registeredName}, a company
        registered in England &amp; Wales (company number {site.company.companyNumber}), registered
        office {formatAddress(site.company.registeredAddress)}. Contact: {site.contact.email},{" "}
        {site.contact.phoneDisplay}.
      </p>

      <h2>2. Booking and quotes</h2>
      <p>
        Prices quoted online are based on the information you give us about your property. If the
        property differs materially on the day — significantly more rooms, or a much heavier
        condition than described — we&apos;ll discuss and agree any change with you before proceeding.
        Consumer prices are shown inclusive of VAT where applicable.
      </p>

      <h2>3. Payment</h2>
      <p>
        For one-off domestic work we authorise your card at booking and capture payment on
        completion. Recurring bookings are charged per visit to your saved payment method. Commercial
        clients may be set up on Direct Debit or invoice terms. Payments are processed securely by our
        payment provider; we do not store full card details.
      </p>

      <h2>4. Your access and our attendance</h2>
      <p>
        You&apos;re responsible for giving us safe, lawful access and accurate access details. If we
        can&apos;t get in as booked, a no-access fee may apply (see our cancellation policy).
      </p>

      <h2>5. Cancellation</h2>
      <p>
        Your statutory 14-day right to cancel and our notice-based fees are set out in our{" "}
        <Link href="/cancellation-policy">cancellation policy</Link>, which forms part of these terms.
      </p>

      <h2>6. Our re-clean guarantee</h2>
      <p>
        We offer a re-clean guarantee — 72 hours for end of tenancy, 48 hours for other cleans — as
        described on our <Link href="/guarantee">guarantee page</Link>. This is in addition to your rights
        under the Consumer Rights Act 2015, under which our services will be provided with reasonable
        care and skill.
      </p>

      <h2>7. Liability and insurance</h2>
      <p>
        We carry public liability and, where relevant, treatment/care-custody-and-control and
        employers&apos; liability insurance. We do not exclude or limit liability where it would be
        unlawful to do so, including for death or personal injury caused by negligence. Please report
        any damage promptly so we can handle it under our insurance.
      </p>

      <h2>8. Complaints</h2>
      <p>
        We aim to resolve any issue quickly. Contact us at {site.contact.email} and we&apos;ll respond
        promptly. Nothing in these terms affects your statutory rights.
      </p>

      <h2>9. Data protection</h2>
      <p>
        We handle your personal data as described in our <Link href="/privacy">privacy notice</Link>.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the law of England &amp; Wales, and disputes are subject to the
        courts of England &amp; Wales.
      </p>
    </LegalDoc>
  );
}
