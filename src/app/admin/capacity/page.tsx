import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";
import { CapacityForm } from "@/components/admin/CapacityForm";
import { availabilityConfig } from "@/config/availability";
import { localDateString } from "@/lib/timezone";

export const metadata: Metadata = { title: "Capacity", robots: { index: false, follow: false } };

/**
 * Capacity controls (§7.4).
 *
 * §7.4: *"Admin MUST be able to override capacity manually and to set a simple
 * daily cap as a fallback in early operation when the roster is small."* The cap
 * stops the wizard selling a full day to two crews; the override is for the
 * opposite case, squeezing in urgent work the cap would refuse.
 *
 * Both carry a reason, because a cap someone set on Tuesday for a good reason
 * looks exactly like a bug in availability on Thursday.
 */
export default async function AdminCapacityPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const rows = hasDatabase
    ? await db.capacitySetting.findMany({ orderBy: [{ date: { sort: "asc", nulls: "first" } }] })
    : [];
  const standing = rows.find((row) => row.date === null);
  const dated = rows.filter((row) => row.date !== null);

  return (
    <AdminShell title="Capacity">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — capacity settings can&apos;t be stored.
        </p>
      )}

      <p className="mb-6 max-w-2xl text-sm text-ink-soft">
        The wizard only ever offers slots the roster can staff. A <strong>daily cap</strong> narrows that further while
        the roster is small; an <strong>override</strong> lifts the cap for a day when something urgent has to fit.
        With no setting at all the code default of {availabilityConfig.dailyCap} jobs a day applies.
      </p>

      <CapacityForm />

      <section className="mt-8">
        <h2 className="font-bold">In force</h2>
        <ul className="mt-3 divide-y divide-line">
          <li className="py-2 text-sm">
            <span className="font-semibold">Every day</span>{" "}
            <span className="text-ink-soft">
              {standing
                ? describe(standing.dailyCap, standing.overrideCap)
                : `${availabilityConfig.dailyCap} jobs (code default — no setting saved)`}
            </span>
            {standing?.reason && <span className="block text-xs text-ink-soft">{standing.reason}</span>}
          </li>
          {dated.map((row) => (
            <li key={row.id} className="py-2 text-sm">
              <span className="font-mono font-semibold">{localDateString(row.date!)}</span>{" "}
              <span className="text-ink-soft">{describe(row.dailyCap, row.overrideCap)}</span>
              {row.reason && <span className="block text-xs text-ink-soft">{row.reason}</span>}
            </li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}

function describe(dailyCap: number | null, overrideCap: boolean): string {
  if (overrideCap) return "cap overridden — roster-limited only";
  if (dailyCap == null) return "no cap — roster-limited";
  return `${dailyCap} job${dailyCap === 1 ? "" : "s"} a day`;
}
