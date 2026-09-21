import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { db, hasDatabase } from "@/lib/db";
import { serviceBySlug } from "@/config/services";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminBookingForm, type AdminBookingPrefill } from "@/components/admin/AdminBookingForm";

export const metadata: Metadata = { title: "New booking", robots: { index: false, follow: false } };

/** Pull a prefill out of a Lead's stored requirements (the escalation handoff, §7.2). */
async function prefillFromLead(leadId: string): Promise<AdminBookingPrefill | null> {
  if (!hasDatabase) return null;
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  const req = (lead.requirements ?? {}) as {
    enquiry?: string;
    message?: string;
    job?: { rooms?: Record<string, number>; condition?: string; reason?: string };
  };
  const svc = req.enquiry ? serviceBySlug(req.enquiry) : undefined;
  const notes = [req.job?.reason, req.message].filter(Boolean).join(" — ");
  return {
    serviceSlug: svc?.channel === "self-serve" ? svc.slug : undefined,
    postcode: lead.postcode ?? undefined,
    rooms: req.job?.rooms,
    condition: req.job?.condition === "heavily_soiled" ? "heavily_soiled" : "standard",
    name: lead.name ?? undefined,
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
    notes: notes || undefined,
  };
}

export default async function AdminNewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  await requireAdmin();
  const { leadId } = await searchParams;
  const prefill = leadId ? await prefillFromLead(leadId) : null;

  return (
    <AdminShell title={leadId ? "Convert lead to booking" : "Create a booking"}>
      <AdminBookingForm prefill={prefill ?? undefined} leadId={leadId} />
    </AdminShell>
  );
}
