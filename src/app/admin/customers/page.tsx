import Link from "next/link";
import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { formatPence } from "@/lib/money";
import { localDateString } from "@/lib/timezone";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: "Customers", robots: { index: false, follow: false } };

/**
 * Customer records (§9.7).
 *
 * The list answers the question a phone call starts with — "we cleaned for them
 * before, what do we know?" — so it leads with where they are, how many jobs
 * they have had, whether anything is owed and whether they are on a plan.
 * Marketing consent is shown because it decides what we may send them (§10,
 * PECR), and it is the kind of thing that gets assumed rather than checked.
 *
 * `searchParams` is a Promise in Next 16 and is awaited (`AGENTS.md`).
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["owner", "admin", "supervisor"]);

  const params = await searchParams;
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = rawQuery?.trim() || null;

  const customers = hasDatabase
    ? await db.user.findMany({
        where: {
          role: "customer",
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: "insensitive" as const } },
                  { email: { contains: query, mode: "insensitive" as const } },
                  { phone: { contains: query } },
                  { properties: { some: { postcode: { contains: query, mode: "insensitive" as const } } } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          properties: { select: { id: true, addressLine1: true, postcode: true } },
          subscriptions: { select: { id: true, status: true, recurrenceRule: true, gross: true } },
          jobs: {
            select: { id: true, status: true, gross: true, scheduledStart: true, paymentStatus: true },
            orderBy: { scheduledStart: "desc" },
          },
        },
      })
    : [];

  return (
    <AdminShell title="Customers">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — there are no customer records to read.
        </p>
      )}

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="q" className="block text-xs font-semibold text-ink-soft">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query ?? ""}
            placeholder="name, email, phone or postcode"
            className="mt-1 w-64 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className="btn btn-primary text-sm">Search</button>
        {query && (
          <Link href="/admin/customers" className="pb-2 text-sm text-brand-strong underline">
            Clear
          </Link>
        )}
      </form>

      {hasDatabase && customers.length === 0 && (
        <p className="rounded-lg border border-line px-4 py-6 text-center text-ink-soft">
          {query ? `Nobody matches "${query}".` : "No customers yet."}
        </p>
      )}

      <div className="space-y-3">
        {customers.map((customer) => {
          const outstanding = customer.jobs.filter((job) =>
            ["failed", "pending", "part_paid"].includes(job.paymentStatus),
          );
          const activePlans = customer.subscriptions.filter((s) => s.status === "active");
          const lastJob = customer.jobs.find((job) => job.scheduledStart);
          return (
            <article key={customer.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold">{customer.name ?? "—"}</span>
                <span className="text-sm text-ink-soft">{customer.email}</span>
                {customer.phone && <span className="text-sm text-ink-soft">{customer.phone}</span>}
                {activePlans.length > 0 && (
                  <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs text-brand-ink">
                    {activePlans.length === 1 ? "on a plan" : `${activePlans.length} plans`}
                  </span>
                )}
                {/* PECR: what we may send them, not what we assume. */}
                <span className="text-xs text-ink-soft">
                  marketing: {customer.marketingConsent ? "opted in" : "no consent"}
                </span>
                <Link
                  href={`/admin/jobs?q=${encodeURIComponent(customer.email)}&view=all`}
                  className="ml-auto text-sm text-brand-strong underline"
                >
                  {customer.jobs.length} {customer.jobs.length === 1 ? "job" : "jobs"}
                </Link>
              </div>

              <p className="mt-1 text-sm text-ink-soft">
                {customer.properties.map((p) => `${p.addressLine1}, ${p.postcode}`).join(" · ") || "No property on file"}
              </p>

              <p className="mt-1 text-sm">
                {lastJob?.scheduledStart ? `Last visit ${localDateString(lastJob.scheduledStart)}. ` : "No visits yet. "}
                {outstanding.length > 0 ? (
                  <strong className="text-accent-strong">
                    {formatPence(outstanding.reduce((sum, job) => sum + job.gross, 0))} outstanding across{" "}
                    {outstanding.length} {outstanding.length === 1 ? "job" : "jobs"}.
                  </strong>
                ) : (
                  <span className="text-ink-soft">Nothing outstanding.</span>
                )}
              </p>
            </article>
          );
        })}
      </div>
    </AdminShell>
  );
}
