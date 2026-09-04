"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, hasDatabase } from "@/lib/db";
import { computeQuote, type Frequency } from "@/lib/quote";
import { serviceBySlug } from "@/config/services";
import { ROOM_KEYS, type RoomKey } from "@/config/pricing";
import { parseClientCsv } from "@/lib/csv";
import { ADMIN_COOKIE, checkAdminCode, requireAdmin } from "@/lib/admin-auth";

// ---------- Login ----------

export async function loginAdmin(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const code = String(formData.get("code") ?? "");
  if (!checkAdminCode(code)) {
    return { error: "Incorrect access code." };
  }
  const c = await cookies();
  c.set(ADMIN_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
  });
  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
  const c = await cookies();
  c.delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

// ---------- Admin-created booking (§6.15) ----------

const adminBookingSchema = z.object({
  serviceSlug: z.string().min(1),
  postcode: z.string().trim().min(2).max(12),
  rooms: z.record(z.string(), z.coerce.number().int().min(0).max(20)),
  condition: z.enum(["standard", "heavily_soiled"]).default("standard"),
  frequency: z.enum(["one_off", "weekly", "fortnightly", "monthly"]).default("one_off"),
  slotStartISO: z.string().datetime().optional().or(z.literal("")),
  paymentMethod: z.enum(["payment_link", "invoice", "cash"]).default("payment_link"),
  source: z.enum(["phone", "admin", "partner"]).default("phone"),
  contact: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  }),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type AdminBookingResult =
  | { status: "success"; reference: string; message: string; paymentUrl?: string | null }
  | { status: "error"; message: string };

export async function adminCreateBooking(input: z.input<typeof adminBookingSchema>): Promise<AdminBookingResult> {
  await requireAdmin();
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
    regionKey: "london",
  });

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

  const scheduledStart = data.slotStartISO ? new Date(data.slotStartISO) : null;
  const scheduledEnd = scheduledStart ? new Date(scheduledStart.getTime() + quote.durationMinutes * 60000) : null;

  const job = await db.job.create({
    data: {
      customerId: user.id,
      propertyId: property.id,
      serviceTypeId: st.id,
      status: "booked",
      scheduledStart,
      scheduledEnd,
      estimatedDurationMinutes: quote.durationMinutes,
      net: quote.chargeNow.net,
      vatRate: quote.chargeNow.vatRate,
      vatAmount: quote.chargeNow.vatAmount,
      gross: quote.chargeNow.gross,
      paymentStatus: data.paymentMethod === "cash" ? "pending" : "pending",
      source: data.source,
      notes: `Ref ${reference}. ${service.name}. ${data.frequency}. Payment: ${data.paymentMethod}. ${data.notes ?? ""}`.trim(),
    },
  });

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
          amountPence: quote.chargeNow.gross,
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
  await requireAdmin();
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
