import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: "Leads", robots: { index: false, follow: false } };

export default async function AdminLeadsPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const leads = hasDatabase
    ? await db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
    : [];

  return (
    <AdminShell title="Leads">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — leads aren&apos;t persisted yet.
        </p>
      )}
      {hasDatabase && leads.length === 0 && <p className="text-ink-soft">No leads yet.</p>}

      {leads.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Contact</th>
                <th className="py-2 pr-4">Postcode</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const req = (l.requirements ?? {}) as { enquiry?: string; job?: unknown };
                const converted = Boolean(l.convertedQuoteId) || l.status === "converted";
                return (
                  <tr key={l.id} className="border-b border-line align-top">
                    <td className="py-3 pr-4">
                      <span className="font-semibold">{l.type}</span>
                      {req.enquiry && req.enquiry !== "general" && <span className="block text-xs text-ink-soft">{req.enquiry}</span>}
                      {req.job != null && <span className="block text-xs text-brand-strong">has property details</span>}
                    </td>
                    <td className="py-3 pr-4">{l.name ?? "—"}</td>
                    <td className="py-3 pr-4">
                      <span className="block">{l.email ?? "—"}</span>
                      {l.phone && <span className="block text-xs text-ink-soft">{l.phone}</span>}
                    </td>
                    <td className="py-3 pr-4">{l.postcode ?? "—"}</td>
                    <td className="py-3 pr-4">{converted ? <span className="text-success">converted</span> : l.status}</td>
                    <td className="py-3 pr-4">
                      {converted ? (
                        <span className="text-xs text-ink-soft">booked</span>
                      ) : (
                        <Link href={`/admin/bookings/new?leadId=${l.id}`} className="whitespace-nowrap font-semibold text-brand-strong underline">
                          Convert to booking →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
