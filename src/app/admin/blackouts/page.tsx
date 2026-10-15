import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { localDateString } from "@/lib/timezone";
import { AdminShell } from "@/components/admin/AdminShell";
import { BlackoutForm, BlackoutRow } from "@/components/admin/BlackoutControls";

export const metadata: Metadata = { title: "Blackout dates", robots: { index: false, follow: false } };

/**
 * Blackout dates (§6.2, PRD §16.3 → L3).
 *
 * Days nobody works: bank holidays, the Christmas closure, a crew's week off.
 * The recurring materialiser consults them, and the rule the PRD is firm about
 * is that a visit landing on one is **never silently generated** — it is either
 * flagged for a human or shifted on purpose, per the date's own policy.
 *
 * Past dates are kept and shown separately rather than deleted: they explain why
 * last Christmas has a gap in it.
 */
export default async function AdminBlackoutsPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const todayLondon = localDateString(new Date());
  const rows = hasDatabase ? await db.blackoutDate.findMany({ orderBy: { date: "asc" } }) : [];
  const upcoming = rows.filter((row) => localDateString(row.date) >= todayLondon);
  const past = rows.filter((row) => localDateString(row.date) < todayLondon);

  return (
    <AdminShell title="Blackout dates">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — blackout dates can&apos;t be stored.
        </p>
      )}

      <p className="mb-6 max-w-2xl text-sm text-ink-soft">
        Days nobody works. A recurring visit that lands on one is never generated quietly: it is either{" "}
        <strong>held for review</strong> so someone can speak to the customer, or <strong>moved</strong> to the next
        working day — whichever you choose per date.
      </p>

      <BlackoutForm />

      <section className="mt-8">
        <h2 className="font-bold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No blackout dates ahead. Bank holidays are not added automatically.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {upcoming.map((row) => (
              <BlackoutRow
                key={row.id}
                id={row.id}
                date={localDateString(row.date)}
                reason={row.reason}
                policy={row.policy}
              />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="font-bold">Past</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Kept, because they explain the gaps in last year&apos;s schedule.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {past.slice(-20).map((row) => (
              <BlackoutRow
                key={row.id}
                id={row.id}
                date={localDateString(row.date)}
                reason={row.reason}
                policy={row.policy}
                past
              />
            ))}
          </ul>
        </section>
      )}
    </AdminShell>
  );
}
