"use server";

import { z } from "zod";
import { db, hasDatabase } from "@/lib/db";
import { computeQuote, type Frequency } from "@/lib/quote";
import { priceFromRateCard, type MoneyBreakdown } from "@/lib/money";
import { serviceBySlug } from "@/config/services";
import { ROOM_KEYS, RATE_CARD_VERSION, type RoomKey } from "@/lib/pricing/rate-card";
import { parseClientCsv } from "@/lib/csv";
import { requireRole, currentAdminActor } from "@/lib/auth";

const OPS_ROLES = ["owner", "admin", "supervisor"] as const;

// ---------- Admin-created booking (§6.15) ----------

const adminBookingSchema = z.object({
  serviceSlug: z.string().min(1),
  postcode: z.string().trim().min(2).max(12),
  rooms: z.record(z.string(), z.coerce.number().int().min(0).max(20)),
  condition: z.enum(["standard", "heavily_soiled"]).default("standard"),
  frequency: z.enum(["one_off", "weekly", "fortnightly", "monthly"]).default("one_off"),
  slotStartISO: z.string().datetime().optional().or(z.literal("")),
  // No cash (§12.5): no dispute record, reconciliation cost, and it sits awkwardly
  // with the completion-record defence — the guardrail applies on the admin path too.
  paymentMethod: z.enum(["payment_link", "invoice"]).default("payment_link"),
  source: z.enum(["phone", "admin", "partner"]).default("phone"),
  contact: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  }),
  notes: z.string().max(1000).optional().or(z.literal("")),
  // Conversion (A): the Lead this booking is being created from, if any.
  leadId: z.string().max(40).optional().or(z.literal("")),
  // Manual price override (§9.7): a bespoke, hand-set gross (pence) + a required
  // reason. Used for escalated jobs the engine won't price, or to override the
  // engine price. When set, the Quote is marked manualOverride.
  overridePricePence: z.coerce.number().int().min(0).max(100_000_00).optional(),
  overrideReason: z.string().trim().max(1000).optional().or(z.literal("")),
  // On-site minutes for a bespoke job (the engine gives none when it escalates).
  overrideDurationMinutes: z.coerce.number().int().min(0).max(1440).optional(),
});

export type AdminBookingResult =
  | { status: "success"; reference: string; message: string; paymentUrl?: string | null }
  | { status: "error"; message: string };

export async function adminCreateBooking(input: z.input<typeof adminBookingSchema>): Promise<AdminBookingResult> {
  await requireRole([...OPS_ROLES]);
  const parsed = adminBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const service = serviceBySlug(data.serviceSlug);
  if (!service) return { status: "error", message: "Unknown service." };

  const rooms = Object.fromEntries(ROOM_KEYS.map((k) => [k, Number(data.rooms[k] ?? 0)])) as Record<RoomKey, number>;
  const quote = computeQuote({
    serviceSlug: data.serviceSlug,
    rooms,
    condition: data.condition,
    frequency: data.frequency as Frequency,
  });
  const override = data.overridePricePence != null && data.overridePricePence > 0;

  // Resolve money + duration. A manual override (bespoke or escalated job) is
  // hand-priced with a required reason (§9.7) and marks the Quote manualOverride;
  // otherwise the engine's priced quote is used and must not have escalated.
  let money: MoneyBreakdown;
  let grossPence: number;
  let estCrewMinutes: number;
  let elapsedMinutes: number;
  let pricingVersion: string;

  if (override) {
    if (!data.overrideReason) {
      return { status: "error", message: "A reason is required when you set a manual price (§9.7)." };
    }
    // Duration is REQUIRED — never default to 0. A zero-length slot is one the
    // scheduler rejects or (worse) treats as free and stacks jobs onto.
    if (!data.overrideDurationMinutes || data.overrideDurationMinutes <= 0) {
      return { status: "error", message: "Set the on-site minutes for a manual booking — a bespoke job can't be scheduled with no duration." };
    }
    grossPence = data.overridePricePence!;
    money = priceFromRateCard(grossPence);
    // Admin on-site estimate. Fine for scheduling; NOT a machine-derived crew
    // estimate — a future §5 actual-vs-estimated calibration MUST exclude
    // manualOverride quotes (join Job → quoteId → manualOverride) or these
    // hand-typed numbers would poison the room-model correction.
    estCrewMinutes = data.overrideDurationMinutes;
    elapsedMinutes = data.overrideDurationMinutes;
    pricingVersion = RATE_CARD_VERSION; // card in effect (context); the price itself is manual
  } else {
    if (quote.escalate) {
      return { status: "error", message: `${quote.reason} Set a manual price and reason to book it.` };
    }
    grossPence = quote.chargeNow.gross;
    money = quote.chargeNow;
    estCrewMinutes = quote.crewMinutes;
    elapsedMinutes = quote.elapsedMinutes;
    pricingVersion = quote.pricingVersion;
  }

  const reference = `MCS-A${Date.now().toString(36).toUpperCase()}`;

  if (!hasDatabase) {
    return {
      status: "success",
      reference,
      message: "Recorded (no database configured — connect a DB to persist).",
    };
  }

  const st = await db.serviceType.findUnique({ where: { slug: data.serviceSlug } });
  if (!st) return { status: "error", message: "ServiceType not seeded — run npm run db:seed." };

  const user = await db.user.upsert({
    where: { email: data.contact.email },
    update: { name: data.contact.name, phone: data.contact.phone || undefined },
    create: { email: data.contact.email, name: data.contact.name, phone: data.contact.phone || null, role: "customer" },
  });

  const property = await db.property.create({
    data: {
      customerId: user.id,
      addressLine1: data.contact.addressLine1 || "TBC",
      postcode: data.postcode.toUpperCase(),
      roomCounts: rooms,
    },
  });

  // Every booking now carries a Quote — the priced-offer record with its
  // pricingVersion (§15). Admin bookings previously had none; this closes that
  // gap and gives the Lead conversion something to point at.
  const quoteRow = await db.quote.create({
    data: {
      customerId: user.id,
      propertySnapshot: rooms,
      serviceTypeId: st.id,
      frequency: data.frequency,
      pricingVersion,
      net: money.net,
      vatRate: money.vatRate,
      vatAmount: money.vatAmount,
      gross: grossPence,
      estimatedDurationMinutes: estCrewMinutes,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      manualOverride: override,
      overrideReason: override ? data.overrideReason : null,
      overrideBy: override ? await currentAdminActor() : null,
    },
  });

  const scheduledStart = data.slotStartISO ? new Date(data.slotStartISO) : null;
  const scheduledEnd = scheduledStart ? new Date(scheduledStart.getTime() + elapsedMinutes * 60000) : null;

  const job = await db.job.create({
    data: {
      customerId: user.id,
      propertyId: property.id,
      serviceTypeId: st.id,
      quoteId: quoteRow.id,
      status: "booked",
      scheduledStart,
      scheduledEnd,
      estimatedDurationMinutes: estCrewMinutes,
      net: money.net,
      vatRate: money.vatRate,
      vatAmount: money.vatAmount,
      gross: grossPence,
      paymentStatus: "pending",
      source: data.source,
      notes: `Ref ${reference}. ${service.name}. ${data.frequency}. Payment: ${data.paymentMethod}.${override ? ` Manual price: ${data.overrideReason}.` : ""} ${data.notes ?? ""}`.trim(),
    },
  });

  // Conversion (A): stamp the originating Lead one-way. A bad id must not fail the
  // booking — the Quote/Job already exist — so this is best-effort.
  if (data.leadId) {
    try {
      await db.lead.update({
        where: { id: data.leadId },
        data: { convertedQuoteId: quoteRow.id, status: "converted" },
      });
    } catch (e) {
      console.error("[admin] lead conversion stamp failed", e);
    }
  }

  await db.jobStatusEvent.create({
    data: { jobId: job.id, toStatus: "booked", note: `Admin booking (${reference}, ${data.paymentMethod})` },
  });

  // Optional Stripe payment link when configured and requested.
  let paymentUrl: string | null | undefined;
  if (data.paymentMethod === "payment_link") {
    try {
      const { stripeConfigured, createCheckoutUrl } = await import("@/lib/stripe");
      if (stripeConfigured()) {
        paymentUrl = await createCheckoutUrl({
          amountPence: grossPence,
          description: `${service.name} — ${reference}`,
          customerEmail: data.contact.email,
        });
      }
    } catch (e) {
      console.error("[admin] payment link failed", e);
    }
  }

  return {
    status: "success",
    reference,
    paymentUrl,
    message: paymentUrl ? "Booking created — send the customer the payment link." : "Booking created.",
  };
}

// ---------- CSV client import (§6.15) ----------

export type ImportResult = {
  status: "done";
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

export async function importClients(csvText: string): Promise<ImportResult> {
  await requireRole([...OPS_ROLES]);
  const { records, errors } = parseClientCsv(csvText);

  if (!hasDatabase) {
    return { status: "done", imported: 0, skipped: records.length, errors };
  }

  let imported = 0;
  let skipped = 0;
  for (const rec of records) {
    try {
      const user = await db.user.upsert({
        where: { email: rec.email },
        update: { name: rec.name, phone: rec.phone || undefined },
        create: { email: rec.email, name: rec.name, phone: rec.phone || null, role: "customer" },
      });
      if (rec.postcode || rec.addressLine1) {
        await db.property.create({
          data: {
            customerId: user.id,
            addressLine1: rec.addressLine1 || "TBC",
            postcode: (rec.postcode || "").toUpperCase(),
            propertyType: rec.propertyType || null,
            roomCounts: rec.rooms,
            accessNotes: rec.notes || null,
          },
        });
      }
      imported++;
    } catch (e) {
      console.error("[import] row failed", rec.email, e);
      skipped++;
    }
  }
  return { status: "done", imported, skipped, errors };
}
