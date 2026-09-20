"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db, hasDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { site } from "@/config/site";
import { checkServiceArea } from "@/lib/serviceArea";

/**
 * Lead capture (§13 Phase 1 — "lead capture form live; the business can take
 * phone bookings the day this ships"). Also serves commercial RFQ enquiries
 * (§6.6) and out-of-area waitlist capture (§6.1 step 0, §6.14).
 *
 * Persists to the Lead table when a database is configured; always emails the
 * team inbox and logs, so it works before the DB exists.
 */

const leadSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.string().trim().email("Please enter a valid email"),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  postcode: z.string().trim().max(12).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  // "waitlist" | "commercial" | a service slug | "general"
  enquiry: z.string().trim().max(60).optional().or(z.literal("")),
  // Structured job (JSON) carried from an escalated booking, stored on the Lead so
  // the customer never re-types what the engine already had (§7.2 handoff).
  job: z.string().max(4000).optional().or(z.literal("")),
  // Honeypot — bots fill this; humans never see it.
  company: z.string().max(0).optional(),
  // PECR soft opt-in checkbox state (§10.3)
  marketingConsent: z.union([z.literal("on"), z.literal("")]).optional(),
});

export type LeadState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

function classifyType(enquiry?: string): "waitlist" | "commercial" | "communal" {
  if (enquiry === "waitlist") return "waitlist";
  if (enquiry === "communal-area-cleaning") return "communal";
  return "commercial";
}

export async function submitLead(
  _prev: LeadState,
  formData: FormData
): Promise<LeadState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = leadSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Please check the form and try again.", fieldErrors };
  }

  const data = parsed.data;

  // Silently drop honeypot hits.
  if (data.company && data.company.length > 0) {
    return { status: "success", message: "Thanks — we'll be in touch shortly." };
  }

  const leadType = classifyType(data.enquiry);
  const area = data.postcode ? checkServiceArea(data.postcode) : null;

  // Structured job carried from an escalated booking (§7.2). Parsed defensively;
  // a malformed value is dropped, never allowed to break lead capture.
  let carriedJob: Prisma.InputJsonValue | null = null;
  if (data.job) {
    try {
      carriedJob = JSON.parse(data.job) as Prisma.InputJsonValue;
    } catch {
      carriedJob = null;
    }
  }

  // 1) Persist to DB when available.
  if (hasDatabase) {
    try {
      await db.lead.create({
        data: {
          type: leadType,
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          postcode: data.postcode || null,
          requirements: {
            message: data.message || null,
            enquiry: data.enquiry || "general",
            inArea: area?.inArea ?? null,
            marketingConsent: data.marketingConsent === "on",
            // Structured job from an escalated booking, when present (§7.2 handoff).
            job: carriedJob,
          },
          source: "website",
        },
      });
    } catch (e) {
      console.error("[lead] DB write failed, continuing with email", e);
    }
  }

  // 2) Notify the team inbox (always).
  const inbox = process.env.LEADS_INBOX || site.contact.email;
  const subject =
    leadType === "waitlist"
      ? `Waitlist: ${data.postcode || "unknown area"}`
      : `New enquiry: ${data.enquiry || "general"} — ${data.name}`;

  await sendEmail({
    to: inbox,
    replyTo: data.email,
    subject,
    html: `
      <h2>${subject}</h2>
      <ul>
        <li><strong>Name:</strong> ${escapeHtml(data.name)}</li>
        <li><strong>Email:</strong> ${escapeHtml(data.email)}</li>
        <li><strong>Phone:</strong> ${escapeHtml(data.phone || "—")}</li>
        <li><strong>Postcode:</strong> ${escapeHtml(data.postcode || "—")}${
          area ? ` (${area.inArea ? "in area" : "out of area"})` : ""
        }</li>
        <li><strong>Enquiry:</strong> ${escapeHtml(data.enquiry || "general")}</li>
        <li><strong>Marketing consent:</strong> ${data.marketingConsent === "on" ? "yes" : "no"}</li>
      </ul>
      <p><strong>Message:</strong><br/>${escapeHtml(data.message || "—")}</p>
      ${carriedJob ? `<p><strong>Property details (from booking):</strong><br/><code>${escapeHtml(JSON.stringify(carriedJob))}</code></p>` : ""}
    `,
  });

  const message =
    leadType === "waitlist"
      ? "You're on the waitlist — we'll email you the moment we cover your area."
      : "Thanks — we've got your enquiry and will be in touch shortly.";

  return { status: "success", message };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
