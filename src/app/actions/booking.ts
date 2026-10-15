"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { db, hasDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { computeQuote, type Frequency, type QuotePriced } from "@/lib/quote";
import { serviceBySlug } from "@/config/services";
import { site, formatAddress } from "@/config/site";
import { CCR_CONSENT } from "@/config/legal";
import { requiresDeposit, depositSplit, depositTerms, DEPOSIT_REFUND_NOTE } from "@/config/payments";
import { ensureStripeCustomer } from "@/lib/payments";
import { checkServiceArea } from "@/lib/serviceArea";
import { formatPence } from "@/lib/money";
import { computeSlots, slotsByDate } from "@/lib/capacity";
import { defaultRoster, availabilityConfig } from "@/config/availability";
import { ROOM_KEYS } from "@/lib/pricing/rate-card";
import { resolveAndApply } from "@/lib/discounts";
import { createSubscriptionForBooking } from "@/lib/subscriptions";
import { cardOnFileEnabled, collectionModeFor } from "@/lib/collection";
import { isRecurringFrequency } from "@/lib/subscription-rule";
import { fromGross, fromNet, isVatRegistered, type MoneyBreakdown } from "@/lib/money";

/**
 * Booking wizard back-end (§6.1, §6.5, §10.2). Prices are ALWAYS recomputed
 * server-side — the client price is display-only. CCR consent is stored with the
 * wording version. Persists to the DB when configured; always emails the
 * customer the pre-contract information (durable medium) and notifies the team.
 */

// ---------- Slot availability ----------

export async function getSlots(durationMinutes: number, postcode?: string): Promise<Record<string, string[]>> {
  // No database: fall back to the config roster through the same engine, so the
  // wizard still works in a DB-less environment (and so this action has one code
  // path to reason about rather than two).
  if (!hasDatabase) {
    const now = new Date();
    const to = new Date(now.getTime() + availabilityConfig.bookingHorizonDays * 24 * 60 * 60 * 1000);
    return slotsByDate(
      computeSlots({
        from: now,
        to,
        durationMinutes,
        crews: defaultRoster,
        travelBufferMinutes: availabilityConfig.travelBufferMinutes,
        slotGranularityMinutes: availabilityConfig.slotGranularityMinutes,
        leadTimeHours: availabilityConfig.leadTimeHours,
        now,
        dailyCap: availabilityConfig.dailyCap,
      }),
    );
  }

  try {
    // The SlotAvailability service (§7.4) is the only source of bookable slots:
    // real roster, real time off, real diary, §7.5 travel buffers and the §4
    // patch rule. The postcode is what lets the last two apply.
    const { slotAvailability } = await import("@/lib/slot-availability");
    const availability = await slotAvailability({ durationMinutes, postcode });
    return availability.byDate;
  } catch (e) {
    // A failure here must not take the wizard down — but it must not invent
    // availability either. An empty calendar sends the customer to the contact
    // route, which is recoverable; a made-up slot is a crew who never turns up.
    console.error("[booking] slot availability failed; offering none", e);
    return {};
  }
}

// ---------- Create booking ----------

const bookingSchema = z.object({
  serviceSlug: z.string().min(1),
  postcode: z.string().trim().min(2).max(12),
  rooms: z.record(z.string(), z.number().int().min(0).max(20)),
  condition: z.enum(["standard", "heavily_soiled"]).default("standard"),
  propertyType: z.enum(["flat", "house"]).default("flat"),
  frequency: z.enum(["one_off", "weekly", "fortnightly", "monthly"]).default("one_off"),
  addOnSlugs: z.array(z.string()).default([]),
  slotStartISO: z.string().datetime().optional(),
  access: z
    .object({
      entryMethod: z.string().max(60).optional(),
      parking: z.string().max(500).optional(),
      pets: z.string().max(500).optional(),
      productPreference: z.string().max(200).optional(),
      instructions: z.string().max(1000).optional(),
    })
    .optional(),
  contact: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  }),
  ccrConsent: z.literal(true, { message: "You must accept the start-before-14-days statement to book." }),
  marketingConsent: z.boolean().default(false),
  discountCode: z.string().trim().max(40).optional().or(z.literal("")),
});

export type BookingInput = z.input<typeof bookingSchema>;

/** A payment the client must confirm. A large job returns two (deposit + balance);
 *  every other job returns one (full). The Elements UI confirms each in turn. */
export interface BookingPaymentIntent {
  /**
   * "setup" is a SetupIntent, not a charge: it saves the card for a later
   * off-session charge and takes nothing now (SETUP D7 = A, §16.1 gap 2). The
   * client confirms it with `stripe.confirmSetup` rather than `confirmPayment`.
   */
  kind: "full" | "deposit" | "balance" | "setup";
  clientSecret: string | null;
  amountPence: number;
}

export type BookingResult =
  | { status: "success"; reference: string; message: string; requiresPayment: boolean; paymentIntents?: BookingPaymentIntent[] }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export async function createBooking(input: BookingInput): Promise<BookingResult> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Please check your details and try again.", fieldErrors };
  }
  const data = parsed.data;

  const service = serviceBySlug(data.serviceSlug);
  if (!service) return { status: "error", message: "Unknown service." };
  if (service.channel !== "self-serve") {
    return { status: "error", message: "This service is quoted via a commercial enquiry, not online booking." };
  }

  const area = checkServiceArea(data.postcode);
  if (!area.valid) return { status: "error", message: "Please enter a valid postcode.", fieldErrors: { postcode: "Invalid postcode" } };
  if (!area.inArea) return { status: "error", message: "We don't cover that postcode yet — please join the waitlist." };

  // Authoritative server-side re-quote (never trust the client price).
  const rooms = Object.fromEntries(
    ROOM_KEYS.map((k) => [k, Number(data.rooms[k] ?? 0)])
  ) as Record<(typeof ROOM_KEYS)[number], number>;

  const quote = computeQuote({
    serviceSlug: data.serviceSlug,
    propertyType: data.propertyType,
    rooms,
    condition: data.condition,
    frequency: data.frequency as Frequency,
    addOnSlugs: data.addOnSlugs,
  });
  if (quote.escalate) {
    // 5+ bed / heavily-soiled EOT etc. have no instant price — route to a quote.
    return { status: "error", message: `${quote.reason} Please request a quote and we'll come straight back.` };
  }

  // Discount code (§6.14) — resolved and applied server-side to the charge-now amount.
  let discountAmount = 0;
  let discountCode: string | undefined;
  if (data.discountCode) {
    const outcome = await resolveAndApply(data.discountCode, {
      serviceSlug: data.serviceSlug,
      amountGross: quote.chargeNow.gross,
      frequency: data.frequency,
    });
    if (outcome.ok) {
      discountAmount = outcome.discountAmount;
      discountCode = outcome.code;
    }
  }
  const chargeGross = quote.chargeNow.gross - discountAmount;
  const charge: MoneyBreakdown = isVatRegistered() ? fromGross(chargeGross) : fromNet(chargeGross);

  // CCR consent record (§10.2).
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for")?.split(",")[0] ?? hdrs.get("x-real-ip") ?? "unknown").trim();
  const ccr = { givenAt: new Date().toISOString(), ip, wordingVersion: CCR_CONSENT.version };

  const reference = `MCS-${Date.now().toString(36).toUpperCase()}`;
  let jobId: string | undefined;
  let userId: string | undefined;

  // Persist when a DB is configured.
  if (hasDatabase) {
    try {
      ({ jobId, userId } = await persistBooking({ data, quote, ccr, reference, charge, discountAmount, discountCode }));
    } catch (e) {
      console.error("[booking] persistence failed; continuing with notifications", e);
    }
  }

  // Authorise payment (§6.5: authorise now, capture on completion).
  //
  // Orphan-proof ordering: the Payment row is created FIRST (status pending), so an
  // authorised card can never exist without a Payment row. Then we authorise (the
  // Payment id rides in Stripe metadata), then stamp the intent id + 'authorised'.
  // If that final stamp is lost, the webhook reconciles by metadata.paymentId
  // (payment_intent.amount_capturable_updated). If the authorise call itself fails,
  // the Payment stays 'pending' — no orphaned auth, retryable — and the booking is
  // still confirmed by email.
  //
  // Large jobs (§6.5): CAPTURE a 25% deposit at booking + a second Payment for the
  // balance, authorised now and captured on completion. Small jobs authorise the
  // full amount. Every Payment row is created FIRST (pending) so an authorised or
  // captured card can never exist without a Payment row (webhook reconciles by
  // metadata.paymentId; idempotency keys stop a retried submit double-charging).
  //
  // Every intent belongs to the user's Stripe Customer. The deposit saves the card
  // to it, which is what lets the browser authorise the balance on the same card —
  // Stripe refuses to reuse a card that isn't saved to a Customer. If the Customer
  // can't be had, the catch below takes the no-card path like any Stripe failure.
  //
  // Collection mode (SETUP D7 = A, §16.1 gap 2). A hold lasts about seven days,
  // but a slot can be 21 days out and a recurring series runs for months — so for
  // those bookings the card is SAVED at booking and charged off-session on
  // completion, instead of placing an authorisation that will have lapsed by the
  // time the clean happens. While the card-on-file consent wording is unapproved
  // (Q-14) the mode is always "authorise_now" and this changes nothing.
  let requiresPayment = false;
  const paymentIntents: BookingPaymentIntent[] = [];
  const collectionMode = collectionModeFor({
    scheduledStart: data.slotStartISO ? new Date(data.slotStartISO) : null,
    isRecurring: isRecurringFrequency(data.frequency),
    cardOnFileEnabled: cardOnFileEnabled(),
  });
  const cardOnFile = collectionMode === "card_on_file";
  if (jobId && userId && hasDatabase) {
    try {
      const { stripeConfigured, authoriseBookingPayment, captureBookingDeposit, saveCardForLater } =
        await import("@/lib/stripe");
      if (stripeConfigured()) {
        const jid = jobId;
        const customerId = await ensureStripeCustomer(userId);
        if (!customerId) throw new Error("Stripe Customer unavailable");
        const breakdown = (p: number): MoneyBreakdown => (isVatRegistered() ? fromGross(p) : fromNet(p));

        // Create a pending Payment row, then run the Stripe call, then stamp it.
        const openPayment = async (amountPence: number) => {
          const b = breakdown(amountPence);
          return db.payment.create({
            data: { jobId: jid, type: "charge", net: b.net, vatAmount: b.vatAmount, gross: amountPence, status: "pending" },
          });
        };

        if (requiresDeposit(charge.gross, quote.elapsedMinutes)) {
          const { depositPence, balancePence } = depositSplit(charge.gross);

          // Deposit — captured at booking. Stays 'pending' until the client confirms
          // (payment_intent.succeeded → 'captured' via the webhook).
          const dep = await openPayment(depositPence);
          const depRes = await captureBookingDeposit({
            amountPence: depositPence, customerId, jobId: jid, paymentId: dep.id,
            idempotencyKey: `${reference}-deposit`, customerEmail: data.contact.email,
            description: `${service.name} deposit ${reference}`,
            // Off-session when the balance will be charged later: Stripe needs the
            // stronger mandate recorded at the moment the customer authorises, and
            // it cannot be upgraded afterwards.
            saveCardFor: cardOnFile ? "off_session" : "on_session",
          });
          if (depRes?.paymentIntentId) {
            await db.payment.update({ where: { id: dep.id }, data: { stripePaymentIntentId: depRes.paymentIntentId } });
            paymentIntents.push({ kind: "deposit", clientSecret: depRes.clientSecret, amountPence: depositPence });
          }

          // Balance. With the card on file it is NOT authorised now — the hold
          // would expire before the clean. The Payment row is created pending and
          // the deposit's saved card is charged off-session at completion, so the
          // row is the record of what is still owed either way.
          const bal = await openPayment(balancePence);
          if (cardOnFile) {
            await db.jobStatusEvent.create({
              data: {
                jobId: jid,
                toStatus: "booked",
                note: `Balance ${formatPence(balancePence)} to be charged on completion from the card saved at booking (card on file, D7=A).`,
              },
            });
          } else {
            const balRes = await authoriseBookingPayment({
              kind: "balance", amountPence: balancePence, customerId, jobId: jid, paymentId: bal.id,
              idempotencyKey: `${reference}-balance`, customerEmail: data.contact.email,
              description: `${service.name} balance ${reference}`,
            });
            if (balRes?.paymentIntentId) {
              // Stays 'pending' — the intent is only CREATED here; the card is
              // authorised when the client confirms, and the webhook
              // (amount_capturable_updated) is the sole authority that flips it to
              // 'authorised'. Pre-stamping would read as held funds before any exist.
              await db.payment.update({ where: { id: bal.id }, data: { stripePaymentIntentId: balRes.paymentIntentId } });
              paymentIntents.push({ kind: "balance", clientSecret: balRes.clientSecret, amountPence: balancePence });
            }
          }
        } else if (cardOnFile) {
          // No deposit on this job, so nothing is taken at booking and there is no
          // PaymentIntent to save the card on: a SetupIntent does it instead. The
          // customer confirms it now, while they are present, so any 3-D Secure
          // challenge happens here rather than failing an off-session charge later.
          const payment = await openPayment(charge.gross);
          const setup = await saveCardForLater({
            customerId, jobId: jid, customerEmail: data.contact.email,
            idempotencyKey: `${reference}-setup`,
          });
          if (setup?.clientSecret) {
            paymentIntents.push({ kind: "setup", clientSecret: setup.clientSecret, amountPence: charge.gross });
            await db.jobStatusEvent.create({
              data: {
                jobId: jid,
                toStatus: "booked",
                note: `${formatPence(charge.gross)} to be charged on completion from the card saved at booking (card on file, D7=A). Payment row ${payment.id}.`,
              },
            });
          }
        } else {
          // Authorise the full amount.
          const payment = await openPayment(charge.gross);
          const res = await authoriseBookingPayment({
            kind: "full", amountPence: charge.gross, customerId, jobId: jid, paymentId: payment.id,
            idempotencyKey: reference, customerEmail: data.contact.email,
            description: `${service.name} booking ${reference}`,
          });
          if (res?.paymentIntentId) {
            // Stays 'pending' until the client confirms — webhook flips it (see above).
            await db.payment.update({ where: { id: payment.id }, data: { stripePaymentIntentId: res.paymentIntentId } });
            paymentIntents.push({ kind: "full", clientSecret: res.clientSecret, amountPence: charge.gross });
          }
        }
        requiresPayment = paymentIntents.length > 0;
      }
    } catch (e) {
      console.error("[booking] stripe authorise / payment persistence failed", e);
    }
  }

  // Pre-contract information in a durable medium (§10.2).
  await sendPreContractEmail({ data, service: service.name, quote, reference, charge, discountAmount, discountCode });
  await notifyTeam({ data, service: service.name, charge, reference, area: area.areaName, quote });

  return {
    status: "success",
    reference,
    requiresPayment,
    paymentIntents,
    message: requiresPayment
      ? "Your booking is reserved — complete payment to confirm."
      : "Thanks — your booking request is in. We'll confirm your slot and price shortly.",
  };
}

// ---------- helpers ----------

async function persistBooking({
  data,
  quote,
  ccr,
  reference,
  charge,
  discountAmount,
  discountCode,
}: {
  data: z.infer<typeof bookingSchema>;
  quote: QuotePriced;
  ccr: { givenAt: string; ip: string; wordingVersion: string };
  reference: string;
  charge: MoneyBreakdown;
  discountAmount: number;
  discountCode?: string;
}): Promise<{ jobId: string; userId: string }> {
  const service = serviceBySlug(data.serviceSlug)!;
  const st = await db.serviceType.findUnique({ where: { slug: data.serviceSlug } });
  if (!st) throw new Error("ServiceType not seeded — run npm run db:seed");

  const user = await db.user.upsert({
    where: { email: data.contact.email },
    update: {
      name: data.contact.name,
      phone: data.contact.phone || undefined,
      marketingConsent: data.marketingConsent,
      consentUpdatedAt: new Date(),
    },
    create: {
      email: data.contact.email,
      name: data.contact.name,
      phone: data.contact.phone || null,
      role: "customer",
      marketingConsent: data.marketingConsent,
      consentUpdatedAt: new Date(),
    },
  });

  const property = await db.property.create({
    data: {
      customerId: user.id,
      addressLine1: data.contact.addressLine1 || "TBC",
      postcode: data.postcode.toUpperCase(),
      propertyType: data.propertyType || null,
      roomCounts: data.rooms,
      entryMethod: data.access?.entryMethod || null,
      parkingNotes: data.access?.parking || null,
      pets: data.access?.pets ? { notes: data.access.pets } : undefined,
      productPreferences: data.access?.productPreference ? { preference: data.access.productPreference } : undefined,
      accessNotes: data.access?.instructions || null,
    },
  });

  const quoteRow = await db.quote.create({
    data: {
      customerId: user.id,
      propertySnapshot: data.rooms,
      serviceTypeId: st.id,
      frequency: data.frequency,
      addons: data.addOnSlugs,
      pricingVersion: quote.pricingVersion,
      net: charge.net,
      vatRate: charge.vatRate,
      vatAmount: charge.vatAmount,
      gross: charge.gross,
      estimatedDurationMinutes: quote.crewMinutes,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const scheduledStart = data.slotStartISO ? new Date(data.slotStartISO) : null;
  const scheduledEnd = scheduledStart
    ? new Date(scheduledStart.getTime() + quote.elapsedMinutes * 60 * 1000)
    : null;

  // Recurring booking → a Subscription, and the booked slot becomes its FIRST job
  // (§6.2, PRD §16.1 gap 1). Until this existed, choosing "weekly" wrote the word
  // "weekly" into Job.notes and nothing else: no Subscription row, so the daily
  // materialiser had nothing to generate from and pause / resume / cancel in the
  // customer account had nothing to act on. A customer who asked for weekly got
  // exactly one clean.
  const subscriptionId = await createSubscriptionForBooking({
    frequency: data.frequency,
    scheduledStart,
    customerId: user.id,
    propertyId: property.id,
    serviceTypeId: st.id,
    perVisitGross: quote.perVisitGross,
    firstVisitGross: quote.firstVisitGross,
  });

  const job = await db.job.create({
    data: {
      customerId: user.id,
      propertyId: property.id,
      serviceTypeId: st.id,
      quoteId: quoteRow.id,
      subscriptionId,
      status: "booked",
      scheduledStart,
      scheduledEnd,
      estimatedDurationMinutes: quote.crewMinutes,
      net: charge.net,
      vatRate: charge.vatRate,
      vatAmount: charge.vatAmount,
      gross: charge.gross,
      addons: data.addOnSlugs,
      discountCode: discountCode ?? null,
      discountAmount,
      ccrConsent: ccr,
      paymentStatus: "pending",
      source: "web",
      notes: subscriptionId
        ? `Ref ${reference}. ${service.name}. ${data.frequency} — first visit of the series.`
        : `Ref ${reference}. ${service.name}. ${data.frequency}.`,
    },
  });

  await db.jobStatusEvent.create({
    data: { jobId: job.id, toStatus: "booked", note: `Booked online (${reference})` },
  });

  return { jobId: job.id, userId: user.id };
}

async function sendPreContractEmail({
  data,
  service,
  quote,
  reference,
  charge,
  discountAmount,
  discountCode,
}: {
  data: z.infer<typeof bookingSchema>;
  service: string;
  quote: QuotePriced;
  reference: string;
  charge: MoneyBreakdown;
  discountAmount: number;
  discountCode?: string;
}) {
  const priceLine = quote.isRecurring
    ? `First visit ${formatPence(charge.gross)}, then ${formatPence(quote.perVisitGross)} per visit (inc. VAT where applicable)`
    : `${formatPence(charge.gross)} (inc. VAT where applicable)`;
  const discountLine =
    discountAmount > 0
      ? `<li><strong>Discount applied:</strong> ${discountCode} (−${formatPence(discountAmount)})</li>`
      : "";
  // §6.5/§10.2: on large jobs the payment is split — disclose the deposit taken
  // now and the balance on completion BEFORE payment, and that the deposit stays
  // refundable within the 14-day cancellation period before the clean happens.
  const depositLine = requiresDeposit(charge.gross, quote.elapsedMinutes)
    ? `<li><strong>Payment split:</strong> ${depositTerms(charge.gross, formatPence).sentence} ${DEPOSIT_REFUND_NOTE} If the balance authorisation isn't completed at booking, your deposit is still held and we'll contact you to finish it.</li>`
    : "";

  await sendEmail({
    to: data.contact.email,
    subject: `Your ${service} booking — ${reference}`,
    html: `
      <h2>Thanks for booking with ${site.name}</h2>
      <p>Reference: <strong>${reference}</strong></p>
      <h3>Pre-contract information</h3>
      <ul>
        <li><strong>Service:</strong> ${service}</li>
        <li><strong>Total price:</strong> ${priceLine}</li>
        ${depositLine}
        ${discountLine}
        <li><strong>Estimated duration:</strong> ${quote.elapsedMinutes} minutes on site</li>
        <li><strong>Cancellation:</strong> see ${site.url}/cancellation-policy — a late-cancellation or no-access fee may apply, disclosed before payment.</li>
        <li><strong>Complaints & guarantee:</strong> our re-clean guarantee applies (${site.url}/guarantee); contact ${site.contact.email}.</li>
      </ul>
      <p style="font-size:12px;color:#555">${site.company.registeredName}, company number ${site.company.companyNumber}, registered office ${formatAddress(site.company.registeredAddress)}. This confirms the information provided before your contract, in a durable medium.</p>
    `,
  });
}

async function notifyTeam({
  data,
  service,
  charge,
  reference,
  area,
  quote,
}: {
  data: z.infer<typeof bookingSchema>;
  service: string;
  charge: MoneyBreakdown;
  reference: string;
  area?: string;
  quote: QuotePriced;
}) {
  const inbox = process.env.LEADS_INBOX || site.contact.email;
  await sendEmail({
    to: inbox,
    replyTo: data.contact.email,
    subject: `New booking ${reference}: ${service} — ${area ?? data.postcode}`,
    html: `
      <h2>New booking ${reference}</h2>
      <ul>
        <li>${service} · ${data.frequency}</li>
        <li>${data.contact.name} · ${data.contact.email} · ${data.contact.phone || "—"}</li>
        <li>${data.postcode.toUpperCase()} ${area ? `(${area})` : ""}</li>
        <li>Charge now: ${formatPence(charge.gross)} · on-site ${quote.elapsedMinutes}m</li>
        <li>Slot: ${data.slotStartISO ?? "not selected"}</li>
      </ul>
    `,
  });
}
