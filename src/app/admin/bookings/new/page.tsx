import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminBookingForm } from "@/components/admin/AdminBookingForm";

export const metadata: Metadata = { title: "New booking", robots: { index: false, follow: false } };

export default async function AdminNewBookingPage() {
  await requireAdmin();
  return (
    <AdminShell title="Create a booking">
      <AdminBookingForm />
    </AdminShell>
  );
}
