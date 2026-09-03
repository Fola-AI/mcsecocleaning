import type { Metadata } from "next";
import { site, formatAddress } from "@/config/site";
import { buildMetadata } from "@/lib/seo/metadata";
import { LegalDoc } from "@/components/marketing/LegalDoc";

export const metadata: Metadata = buildMetadata({
  title: "Privacy notice",
  description: "How mcsecocleaning collects, uses and protects your personal data under UK GDPR.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalDoc title="Privacy notice" updated="September 2026">
      <h2>Who we are</h2>
      <p>
        {site.company.registeredName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is the data controller for
        the personal data described here. We are registered with the Information Commissioner&apos;s
        Office (registration {site.company.icoRegistration}). Our registered office is{" "}
        {formatAddress(site.company.registeredAddress)}. You can contact us at {site.contact.email}.
      </p>

      <h2>The information we collect</h2>
      <ul>
        <li>Contact details — name, email, phone, address and postcode</li>
        <li>Property information you give us — room counts, access and parking notes, pets, product preferences</li>
        <li>Booking and payment records (we do not store full card numbers — payments are handled by our payment provider)</li>
        <li>Photographs of work before and after cleaning</li>
        <li>Messages you send us, and reviews you leave</li>
        <li>Limited technical data (with your consent) via analytics cookies — see our cookie policy</li>
      </ul>

      <h2>How and why we use it (lawful bases)</h2>
      <ul>
        <li><strong>To provide the service you book</strong> — performance of our contract with you</li>
        <li><strong>To run and improve our business</strong> — our legitimate interests, balanced against your rights</li>
        <li><strong>To meet legal and tax obligations</strong> — legal obligation</li>
        <li><strong>To send marketing</strong> — your consent, or the soft opt-in for existing customers, which you can withdraw at any time</li>
      </ul>

      <h2>Access codes and sensitive operational data</h2>
      <p>
        Where you give us alarm or key-safe codes, we encrypt them at rest, make them available only
        to the crew assigned to your job and only around the time of that job, and log every access.
        We treat this information with the same seriousness as payment data.
      </p>

      <h2>Sharing your data</h2>
      <p>
        We share data only with the processors that help us run the service — for example our
        payment provider, email and SMS providers, hosting and object-storage providers, and error
        monitoring. Each is bound by a data processing agreement. We do not sell your data.
      </p>

      <h2>International transfers</h2>
      <p>
        We host and process personal data in the UK/EU. Where a provider processes data outside the
        UK, we rely on the UK GDPR safeguards (such as the UK Addendum to the Standard Contractual
        Clauses) and assess the transfer first.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Before/after job photos: 12–24 months, as evidence in any dispute or chargeback</li>
        <li>Booking, payment and tax records: as required by law (typically six years)</li>
        <li>Marketing contact data: until you unsubscribe or ask us to erase it</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You have the right to access, correct, erase or restrict your data, to object to certain
        processing, to data portability, and to withdraw consent at any time. To exercise any of
        these, email {site.contact.email}. You can also complain to the ICO at ico.org.uk, though
        we&apos;d appreciate the chance to help first.
      </p>

      <h2>Marketing and unsubscribing</h2>
      <p>
        We only send marketing where you&apos;ve consented or where the soft opt-in applies. Every
        message includes a way to unsubscribe, and you can reply STOP to marketing SMS. We honour
        opt-outs across email and SMS.
      </p>
    </LegalDoc>
  );
}
