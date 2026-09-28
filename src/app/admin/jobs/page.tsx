import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { db, hasDatabase } from "@/lib/db";
import { formatPence } from "@/lib/money";
import { localDateString } from "@/lib/timezone";
import { AdminShell } from "@/components/admin/AdminShell";
import { JobCaptureControl } from "@/components/admin/JobCaptureControl";

export const metadata: Metadata = { title: "Jobs", robots: { index: false, follow: false } };

export default async function AdminJobsPage() {
  await requireAdmin();

  const jobs = hasDatabase
    ? await db.job.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { customer: true, serviceType: true },
      })
    : [];

  return (
    <AdminShell title="Jobs">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — jobs aren&apos;t persisted yet.
        </p>
      )}
      {hasDatabase && jobs.length === 0 && <p className="text-ink-soft">No jobs yet.</p>}

      {jobs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="py-2 pr-4">Job</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Complete &amp; capture</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-line align-top">
                  <td className="py-3 pr-4">
                    <span className="font-semibold">{j.serviceType?.name ?? "Clean"}</span>
                    <span className="block text-xs text-ink-soft">{j.customer?.name ?? j.customer?.email ?? "—"}</span>
                    {j.scheduledStart && (
                      <span className="block text-xs text-ink-soft">{localDateString(j.scheduledStart)}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">{j.status}</td>
                  <td className="py-3 pr-4">{j.paymentStatus}</td>
                  <td className="py-3 pr-4">{formatPence(j.gross)}</td>
                  <td className="py-3 pr-4">
                    <JobCaptureControl
                      jobId={j.id}
                      status={j.status}
                      paymentStatus={j.paymentStatus}
                      quotedGrossPence={j.gross}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
