import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { db, hasDatabase } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminDashboard() {
  await requireAdmin();

  let stats: { jobs: number; leads: number; customers: number } | null = null;
  if (hasDatabase) {
    try {
      const [jobs, leads, customers] = await Promise.all([
        db.job.count(),
        db.lead.count(),
        db.user.count({ where: { role: "customer" } }),
      ]);
      stats = { jobs, leads, customers };
    } catch {
      stats = null;
    }
  }

  return (
    <AdminShell title="Dashboard">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — admin actions run but don&apos;t persist. Set <code>DATABASE_URL</code> and run <code>npm run db:seed</code>.
        </p>
      )}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Jobs" value={stats.jobs} />
          <Stat label="Leads" value={stats.leads} />
          <Stat label="Customers" value={stats.customers} />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/admin/bookings/new" className="card p-6 hover:shadow-md">
          <h2 className="text-lg font-bold">Create a booking</h2>
          <p className="mt-1 text-sm text-ink-soft">Take a booking by phone, WhatsApp or referral — payment link, invoice or cash.</p>
        </Link>
        <Link href="/admin/import" className="card p-6 hover:shadow-md">
          <h2 className="text-lg font-bold">Import clients</h2>
          <p className="mt-1 text-sm text-ink-soft">Bulk-import an existing client list from CSV.</p>
        </Link>
      </div>

      <p className="mt-8 text-sm text-ink-soft">
        This admin uses an interim access code. Full role-based access (Auth.js magic-link) lands with the customer dashboard.
      </p>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-5">
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm text-ink-soft">{label}</p>
    </div>
  );
}
