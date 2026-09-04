"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { db, hasDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { computeQuote, type Frequency } from "@/lib/quote";
import { serviceBySlug } from "@/config/services";
import { site, formatAddress } from "@/config/site";
import { CCR_CONSENT } from "@/config/legal";
import { checkServiceArea } from "@/lib/serviceArea";
import { formatPence } from "@/lib/money";
import { computeSlots, slotsByDate } from "@/lib/capacity";
import { defaultRoster, availabilityConfig } from "@/config/availability";
import { ROOM_KEYS } from "@/config/pricing";

/**
 * Booking wizard back-end (§6.1, §6.5, §10.2). Prices are ALWAYS recomputed
 * server-side — the client price is display-only. CCR consent is stored with the
 * wording version. Persists to the DB when configured; always emails the
 * customer the pre-contract information (durable medium) and notifies the team.
 */

// ---------- Slot availability ----------

export async function getSlots(durationMinutes: number): Promise<Record<string, string[]>> {
  const now = new Date();
  const to = new Date(now.getTime() + availabilityConfig.bookingHorizonDays * 24 * 60 * 60 * 1000);

  // Existing bookings reduce capacity when a DB is present.
  let existingJobs: { crewId: string; start: Date; end: Date }[] = [];
  if (hasDatabase) {
    try {
      const jobs = await db.job.findMany({
        where: { scheduledStart: { gte: now, lte: to }, status: { in: ["scheduled", "in_progress", "booked", "payment_authorised"] } },
        select: { scheduledStart: true, scheduledEnd: true, assignments: { select: { crewId: true } } },
      });
      existingJobs = jobs.flatMap((j) =>
        j.scheduledStart && j.scheduledEnd
          ? j.assignments.map((a) => ({ crewId: a.crewId, start: j.scheduledStart!, end: j.scheduledEnd! }))
          : []
      );
    } catch (e) {
      console.error("[booking] slot query failed; using empty existing jobs", e);
    }
  }

  const slots = computeSlots({
    from: now,
    to,
    durationMinutes,
    crews: defaultRoster,
    existingJobs,
    travelBufferMinutes: availabilityConfig.travelBufferMinutes,
    slotGranularityMinutes: availabilityConfig.slotGranularityMinutes,
    leadTimeHours: availabilityConfig.leadTimeHours,
    now,
    dailyCap: availabilityConfig.dailyCap,
  });
  return slotsByDate(slots);
}

// ---------- Create booking ----------

const bookingSchema = z.object({
  serviceSlug: z.string().min(1),
  postcode: z.string().trim().min(2).max(12),
  rooms: z.record(z.string(), z.number().int().min(0).max(20)),
  condition: z.enum(["standard", "heavily_soiled"]).default("standard"),
  propertyType: z.string().max(60).optional(),
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
});

export type BookingInput = z.input<typeof bookingSchema>;

export type BookingResult =
  | { status: "success"; reference: string; message: string; requiresPayment: boolean; clientSecret?: string | null }
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
    rooms,
    condition: data.condition,
    frequency: data.frequency as Frequency,
    addOnSlugs: data.addOnSlugs,
    regionKey: "london",
  });

  // CCR consent record (§10.2).
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for")?.split(",")[0] ?? hdrs.get("x-real-ip") ?? "unknown").trim();
  const ccr = { givenAt: new Date().toISOString(), ip, wordingVersion: CCR_CONSENT.version };

  const reference = `MCS-${Date.now().toString(36).toUpperCase()}`;
  let jobId: string | undefined;

  // Persist when a DB is configured.
  if (hasDatabase) {
    try {
      jobId = await persistBooking({ data, quote, ccr, reference });
    } catch (e) {
      console.error("[booking] persistence failed; continuing with notifications", e);
    }
  }

  // Authorise payment when Stripe is configured (authorise now, capture on completion).
  let requiresPayment = false;
  let clientSecret: string | null | undefined;
  try {
    const { stripeConfigured, authoriseBookingPayment } = await import("@/lib/stripe");
    if (stripeConfigured()) {
      requiresPayment = true;
      const res = await authoriseBookingPayment({
        amountPence: quote.chargeNow.gross,
        jobId,
        customerEmail: data.contact.email,
        description: `${service.name} booking ${reference}`,
      });
      clientSecret = res?.clientSecret;
    }
  } catch (e) {
    console.error("[booking] stripe authorise failed", e);
  }

  // Pre-contract information in a durable medium (§10.2).
  await sendPreContractEmail({ data, service: service.name, quote, reference });
  await notifyTeam({ data, service: service.name, quote, reference, area: area.areaName });

  return {
    status: "success",
    reference,
    requiresPayment,
    clientSecret,
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
}: {
  data: z.infer<typeof bookingSchema>;
  quote: ReturnType<typeof computeQuote>;
  ccr: { givenAt: string; ip: string; wordingVersion: string };
  reference: string;
}): Promise<string> {
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
      net: quote.chargeNow.net,
      vatRate: quote.chargeNow.vatRate,
      vatAmount: quote.chargeNow.vatAmount,
      gross: quote.chargeNow.gross,
      estimatedDurationMinutes: quote.durationMinutes,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const scheduledStart = data.slotStartISO ? new Date(data.slotStartISO) : null;
  const scheduledEnd = scheduledStart
    ? new Date(scheduledStart.getTime() + quote.durationMinutes * 60 * 1000)
    : null;

  const job = await db.job.create({
    data: {
      customerId: user.id,
      propertyId: property.id,
      serviceTypeId: st.id,
      quoteId: quoteRow.id,
      status: "booked",
      scheduledStart,
      scheduledEnd,
      estimatedDurationMinutes: quote.durationMinutes,
      net: quote.chargeNow.net,
      vatRate: quote.chargeNow.vatRate,
      vatAmount: quote.chargeNow.vatAmount,
      gross: quote.chargeNow.gross,
      addons: data.addOnSlugs,
      ccrConsent: ccr,
      paymentStatus: "pending",
      source: "web",
      notes: `Ref ${reference}. ${service.name}. ${data.frequency}.`,
    },
  });

  await db.jobStatusEvent.create({
    data: { jobId: job.id, toStatus: "booked", note: `Booked online (${reference})` },
  });

  return job.id;
}

async function sendPreContractEmail({
  data,
  service,
  quote,
  reference,
}: {
  data: z.infer<typeof bookingSchema>;
  service: string;
  quote: ReturnType<typeof computeQuote>;
  reference: string;
}) {
  const priceLine = quote.isRecurring
    ? `First visit ${formatPence(quote.firstVisitGross)}, then ${formatPence(quote.perVisitGross)} per visit (inc. VAT where applicable)`
    : `${formatPence(quote.oneOffGross)} (inc. VAT where applicable)`;

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
        <li><strong>Estimated duration:</strong> ${quote.durationMinutes} minutes</li>
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
  quote,
  reference,
  area,
}: {
  data: z.infer<typeof bookingSchema>;
  service: string;
  quote: ReturnType<typeof computeQuote>;
  reference: string;
  area?: string;
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
        <li>Charge now: ${formatPence(quote.chargeNow.gross)} · duration ${quote.durationMinutes}m</li>
        <li>Slot: ${data.slotStartISO ?? "not selected"}</li>
      </ul>
    `,
  });
}
