import type { Metadata } from "next";
import { site } from "@/config/site";
import { buildMetadata } from "@/lib/seo/metadata";
import { LegalDoc } from "@/components/marketing/LegalDoc";

export const metadata: Metadata = buildMetadata({
  title: "Cancellation policy",
  description:
    "Your 14-day cancellation right, our notice-based cancellation fees, and the no-access fee — set out clearly before you pay.",
  path: "/cancellation-policy",
});

export default function CancellationPolicyPage() {
  return (
    <LegalDoc title="Cancellation policy" updated="September 2026">
      <h2>Your 14-day right to cancel</h2>
      <p>
        Because you book online, your booking is a distance contract and you have a statutory 14-day
        right to cancel under the Consumer Contracts Regulations 2013.
      </p>
      <p>
        If you ask us to start your clean within those 14 days, we&apos;ll ask you to confirm, at the
        payment step, that you request early commencement and understand you lose the right to cancel
        once the service has been fully performed. Up to that point you can still cancel, and if
        we&apos;ve already begun you may owe a proportionate amount for work done.
      </p>

      <h2>Cancellation fees (by notice)</h2>
      <p>
        We ask for as much notice as you can give so we can re-fill the slot. Our fees reflect our
        genuine loss and are disclosed here and before you pay, in line with the Consumer Rights Act
        2015. {/* TODO(business-input): confirm the exact tiers and amounts with the owner. */}
      </p>
      <ul>
        <li><strong>More than 48 hours&apos; notice</strong> — no charge</li>
        <li><strong>24–48 hours&apos; notice</strong> — a partial fee may apply</li>
        <li><strong>Less than 24 hours&apos; notice</strong> — a higher fee may apply, up to the value of the booking for same-day cancellations</li>
      </ul>

      <h2>No-access / lockout fee</h2>
      <p>
        If our crew arrives as booked and can&apos;t get in — no one home, a key or code that
        doesn&apos;t work, or access otherwise unavailable — we may charge a no-access fee to cover
        the wasted visit. You can avoid this by keeping your access details up to date and letting us
        know of any change in good time.
      </p>

      <h2>Changes and rescheduling</h2>
      <p>
        Need to move a visit? Contact us and we&apos;ll do our best to find a new slot. For recurring
        bookings you can skip or move an individual visit without affecting the rest of your schedule.
      </p>

      <h2>If we cancel</h2>
      <p>
        Occasionally we may need to cancel or reschedule — for example in severe weather or a crew
        emergency. If we do, we&apos;ll offer you the earliest alternative and you won&apos;t be
        charged for the cancelled visit.
      </p>

      <p>To cancel or change a booking, contact us at {site.contact.email} or {site.contact.phoneDisplay}.</p>
    </LegalDoc>
  );
}
