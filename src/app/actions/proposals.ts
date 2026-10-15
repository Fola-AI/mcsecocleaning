"use server";

import { db, hasDatabase } from "@/lib/db";
import { createSubscriptionForBooking } from "@/lib/subscriptions";
import { recurrenceRuleFor } from "@/lib/subscription-rule";
import { localDateString } from "@/lib/timezone";

/**
 * Accepting a commercial proposal (§7.6, PRD §16.3 → L11).
 *
 * This is the step that turns an enquiry into revenue, and it is deliberately
 * the **same** code path a domestic recurring booking uses:
 * `createSubscriptionForBooking` makes the `Subscription`, and the materialiser
 * generates the visits. A second implementation of "recurring work" would be a
 * second place for the L2 gap-1 defect to come back — a plan that exists on
 * paper and generates no cleans.
 *
 * ## Why this is a public action
 *
 * The customer accepting has no account: a managing agent clicks the link in the
 * proposal email. So the proposal id **is** the credential, and the action is
 * written accordingly — it accepts only a proposal that has been *sent*, accepts
 * it only once, and changes nothing else. It cannot read or alter anything the
 * holder of that link was not already sent.
 */
export async function acceptProposal(
  proposalId: string,
  startDateISO: string,
): Promise<{ ok: boolean; message: string }> {
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const start = new Date(startDateISO);
  if (Number.isNaN(start.getTime())) return { ok: false, message: "Choose a start date." };
  if (start.getTime() < Date.now()) return { ok: false, message: "Choose a date in the future." };

  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: { lead: true },
  });
  if (!proposal) return { ok: false, message: "We can't find that proposal." };
  if (proposal.status === "accepted") {
    return { ok: false, message: "This proposal has already been accepted — thank you." };
  }
  if (proposal.status !== "sent") {
    // A draft is not an offer. Accepting one would commit us to a price nobody
    // has checked.
    return { ok: false, message: "That proposal isn't ready to accept yet. Please get in touch." };
  }

  const lead = proposal.lead;
  if (!lead?.email) return { ok: false, message: "That proposal has no contact on file — please get in touch." };

  // The service the proposal is for. A commercial lead records what it wants in
  // `requirements`; failing that, communal-area cleaning is the commercial
  // default. Commercial work is quoted by a person, so the price comes from the
  // proposal rather than the rate card either way.
  const requirements = (lead.requirements ?? {}) as { serviceSlug?: string; addressLine1?: string };
  const serviceType = await db.serviceType.findFirst({
    where: { slug: requirements.serviceSlug ?? "communal-area-cleaning" },
  });
  if (!serviceType) return { ok: false, message: "We can't match that service — please get in touch." };

  const customer = await db.user.upsert({
    where: { email: lead.email },
    update: { name: lead.name ?? undefined, phone: lead.phone ?? undefined },
    create: { email: lead.email, name: lead.name, phone: lead.phone, role: "customer" },
  });

  const property = await db.property.create({
    data: {
      customerId: customer.id,
      addressLine1: requirements.addressLine1 ?? "Site address to confirm",
      postcode: lead.postcode ?? "",
      roomCounts: {},
      accessNotes: typeof proposal.scope === "object" && proposal.scope
        ? String((proposal.scope as { description?: string }).description ?? "")
        : null,
    },
  });

  // The same function the wizard uses. Per-visit money is the proposal's price,
  // and there is no first-clean surcharge on a commercial contract — the scope
  // was surveyed and priced as a whole.
  const subscriptionId = await createSubscriptionForBooking({
    frequency: proposal.frequency,
    scheduledStart: start,
    customerId: customer.id,
    propertyId: property.id,
    serviceTypeId: serviceType.id,
    perVisitGross: proposal.pricePerVisit,
    firstVisitGross: proposal.pricePerVisit,
  });

  if (!subscriptionId) {
    return { ok: false, message: "We couldn't set the schedule up — please get in touch and we'll do it for you." };
  }

  const rule = recurrenceRuleFor(proposal.frequency as "weekly" | "fortnightly" | "monthly", start);
  await db.$transaction(async (tx) => {
    // The first visit, so the contract starts with a date in the diary rather
    // than a plan that materialises overnight.
    const job = await tx.job.create({
      data: {
        customerId: customer.id,
        propertyId: property.id,
        serviceTypeId: serviceType.id,
        subscriptionId,
        status: "booked",
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 2 * 60 * 60 * 1000),
        estimatedDurationMinutes: 240,
        net: proposal.pricePerVisit,
        vatRate: 0,
        vatAmount: 0,
        gross: proposal.pricePerVisit,
        paymentStatus: "pending",
        source: "web",
        notes: `Commercial contract from proposal ${proposal.id}. Invoiced, not card — ${proposal.frequency}.`,
      },
    });
    await tx.jobStatusEvent.create({
      data: {
        jobId: job.id,
        toStatus: "booked",
        note: `Proposal accepted online on ${localDateString(new Date())}${rule ? ` (${rule})` : ""}.`,
      },
    });
    await tx.proposal.update({
      where: { id: proposal.id },
      data: { status: "accepted", acceptedAt: new Date(), subscriptionId },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { status: "converted" } });
  });

  return {
    ok: true,
    message: "Accepted — thank you. Your first clean is booked and we'll be in touch to confirm the details.",
  };
}
